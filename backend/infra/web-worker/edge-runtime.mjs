/**
 * Contains Cloudflare edge source adapters, normalization, KV helpers, and lightweight change detection.
 *
 * Documentation baseline: v2.3.0. Runtime/private data must never be committed to Git.
 */
const RATS_API = "https://service.rats.team.op-dev.io/";
const TIME_ZONE = "America/Los_Angeles";
const HEADERS = ["Event Type","Start Date","Start Time","End Date","End Time","Timezone ID","Home or Away","Opponent/Event Title","Location Name","Shirt Color","Opponent Shirt Color","Allow RSVPs","Send Reminders","Notes/Comments"];
const SEASONS = ["winter","spring","summer","fall"];

export function cleanName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizeName(value) {
  return cleanName(value).toLowerCase();
}

function localDate(now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now).filter(x=>x.type!=="literal").map(x=>[x.type,x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

function seasonCandidates(now = new Date()) {
  const y = Number(localDate(now).slice(0,4));
  const out=[];
  // Edge change detection prefers the current year first so a missing future
  // season cannot add several network timeouts to every check. The full
  // GitHub watcher still performs deeper season rollover discovery.
  for(const year of [y, y + 1, y - 1, y - 2]) {
    for(const name of [...SEASONS].reverse()) out.push(`${name}-${year}`);
  }
  return out;
}

async function jsonFetch(url, options={}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(20_000) });
  if(!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function ratsCall(action, body) {
  return jsonFetch(RATS_API + action, {
    method:"POST",
    headers:{"content-type":"application/json","user-agent":"ballerwatch-edge/2.0"},
    body:JSON.stringify(body),
  });
}

function teamMatches(aggregate, name) {
  return (aggregate?.teams || []).filter(t=>normalizeName(t?.name)===normalizeName(name));
}

async function discoverSeason(teams, preferred="") {
  const candidates = preferred
    ? [preferred, ...seasonCandidates().filter(x=>x!==preferred)]
    : seasonCandidates();
  for(const season of candidates) {
    try {
      const aggregate=await ratsCall("get-aggregate",{season});
      if(aggregate && teams.every(name=>teamMatches(aggregate,name).length===1)) return {season,aggregate};
    } catch {}
  }
  throw new Error("No recent RATS season contains all configured teams");
}

export function eventScore(event, side) {
  for(const key of [`${side}_score`,`${side}Score`,`${side}_goals`,`${side}Goals`,`score_${side}`,`goals_${side}`]) {
    if(event?.[key] !== undefined && event[key] !== null && event[key] !== "") return event[key];
  }
  const nested=event?.score;
  if(typeof nested==="string") {
    const match=nested.match(/^\s*(\d+)\s*[-–—:]\s*(\d+)\s*$/);
    if(match) return Number(match[side==="home"?1:2]);
  }
  if(nested && typeof nested==="object") {
    for(const key of [side,`${side}_score`,`${side}Score`]) if(nested[key]!==undefined && nested[key]!==null && nested[key]!=="") return nested[key];
  }
  return null;
}

function normalizeLeague(teams, season, aggregate, exportsByTeam) {
  const result=[];
  for(const requested of teams) {
    const matches=teamMatches(aggregate,requested);
    if(matches.length!==1) throw new Error("Configured team missing or ambiguous");
    const team=matches[0];
    const name=cleanName(team.name || requested);
    const table=exportsByTeam[requested];
    if(!Array.isArray(table) || !Array.isArray(table[0]) || JSON.stringify(table[0])!==JSON.stringify(HEADERS)) {
      throw new Error("Unrecognized RATS export schema");
    }
    const rows=table.slice(1).filter(r=>Array.isArray(r)&&r.length===HEADERS.length&&String(r[0]).toLowerCase()!=="bye")
      .map(r=>Object.fromEntries(HEADERS.map((h,i)=>[h,r[i]])));
    const games=[];
    for(const event of aggregate.events || []) {
      const homeName=cleanName(event?.home_team_name);
      const awayName=cleanName(event?.away_team_name);
      if(![normalizeName(homeName),normalizeName(awayName)].includes(normalizeName(name))) continue;
      const home=normalizeName(homeName)===normalizeName(name);
      const opponent=home ? awayName : homeName;
      const date=String(event?.start_date || "");
      const startTime=String(event?.start_time || "");
      const row=rows.find(r=>r["Start Date"]===date && cleanName(r["Opponent/Event Title"])===opponent && String(r["Home or Away"]).toLowerCase()===(home?"home":"away"));
      if(!row) throw new Error("RATS aggregate/export mismatch");
      const division=`${team.day} ${team.gender} D-${team.division}`;
      const ownScore=eventScore(event,home?"home":"away");
      const opponentScore=eventScore(event,home?"away":"home");
      const ownColor=home ? event.home_color : event.away_color;
      games.push({
        key:String(event.id || event.event_id || `${name}|${opponent}|${date}|${home?"home":"away"}`),
        team:name, opponent, homeAway:home?"home":"away", date,
        startTime:startTime||null, endTime:row["End Time"]||null,
        location:event.location||null, fieldNotes:event.notes||null,
        jerseyColor:ownColor||row["Shirt Color"]||null,
        opponentJerseyColor:(home?event.away_color:event.home_color)||row["Opponent Shirt Color"]||null,
        teamScore:ownScore, opponentScore,
        division,
      });
    }
    games.sort((a,b)=>a.date.localeCompare(b.date)||String(a.startTime||"").localeCompare(String(b.startTime||"")));
    result.push({name,day:team.day,division,publishedMatchCount:games.length,matches:games});
  }
  const today=localDate();
  return {
    schemaVersion:2, ok:true, season, seasonId:season, timezone:TIME_ZONE,
    teams:result,
    today:{schemaVersion:2,ok:true,date:today,timezone:TIME_ZONE,games:result.flatMap(t=>t.matches).filter(g=>g.date===today)},
  };
}

function parseJsonp(text, callbackName) {
  const trimmed=String(text||"").trim();
  const prefix=`${callbackName}(`;
  if(!trimmed.startsWith(prefix)||!trimmed.endsWith(");")) throw new Error("Unexpected pickup response");
  return JSON.parse(trimmed.slice(prefix.length,-2));
}

async function pickupCall(endpoint, params) {
  const callbackName="ballerwatchEdge";
  const u=new URL(endpoint);
  u.searchParams.set("callback",callbackName);
  for(const [k,v] of Object.entries(params)) u.searchParams.set(k,String(v));
  const r=await fetch(u.toString(),{headers:{"user-agent":"ballerwatch-edge/2.0","cache-control":"no-cache"},signal:AbortSignal.timeout(20_000)});
  if(!r.ok) throw new Error(`Pickup HTTP ${r.status}`);
  const payload=parseJsonp(await r.text(),callbackName);
  if(!payload?.ok) throw new Error(payload?.error || "Pickup request failed");
  return payload;
}

export async function fetchPickupSnapshot(endpoint) {
  if(!endpoint) throw new Error("UPSTREAM_ENDPOINT is missing");
  const datesResult=await pickupCall(endpoint,{action:"listPlayDates"});
  const dates=[...new Set((datesResult.dates||[]).map(String).filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(x)))].sort();
  const details=new Map((datesResult.dateDetails||[]).map(d=>[String(d?.date||""),d||{}]));
  const events={};
  const privateEvents={};
  for(const date of dates) {
    const tally=(await pickupCall(endpoint,{action:"list",playDate:date})).tally || {};
    const detail=details.get(date)||{};
    events[date]={
      ok:true,timezone:TIME_ZONE,date,
      reserved:Number(tally.totalCount||0),
      capacity:detail.capacity==null||detail.capacity===""?null:Number(detail.capacity),
      startTime:String(detail.startTime||""),endTime:String(detail.endTime||""),
    };
    privateEvents[date]={
      date,fieldName:cleanName(detail.fieldName),address:cleanName(detail.address),
      locked:Boolean(tally.locked),
      waitlistCount:Number(tally.waitlistCount||0),
      players:(tally.players||[]).map(p=>({name:cleanName(p?.name),participantCount:Math.max(1,Number(p?.participantCount||1)),withdrawRequested:Boolean(p?.withdrawRequested)})).filter(p=>p.name),
      waitlist:(tally.waitlist||[]).map(p=>({name:cleanName(p?.name),participantCount:Math.max(1,Number(p?.participantCount||1)),withdrawRequested:Boolean(p?.withdrawRequested)})).filter(p=>p.name),
    };
  }
  return {
    feed:{ok:true,timezone:TIME_ZONE,dates:dates.map(date=>({date,path:`dates/${date}.json`})),events},
    private:{events:privateEvents},
  };
}

export async function fetchLeagueSignal(teams, season) {
  const cleaned=(teams||[]).map(cleanName).filter(Boolean);
  if(!cleaned.length) throw new Error("No league teams configured");

  let seasonId=String(season||"").trim();
  let aggregate=null;
  if(seasonId) {
    try {
      aggregate=await ratsCall("get-aggregate",{season:seasonId});
      const complete=
        aggregate &&
        Array.isArray(aggregate.teams) &&
        Array.isArray(aggregate.events) &&
        cleaned.every(team=>teamMatches(aggregate,team).length===1);
      if(!complete) aggregate=null;
    } catch {
      aggregate=null;
    }
  }

  if(!aggregate) {
    const discovered=await discoverSeason(cleaned,"");
    seasonId=discovered.season;
    aggregate=discovered.aggregate;
  }

  if(!aggregate || !Array.isArray(aggregate.teams) || !Array.isArray(aggregate.events)) {
    throw new Error("Unrecognized RATS aggregate schema");
  }
  const names=new Set(cleaned.map(normalizeName));
  const teamsSignal=aggregate.teams
    .filter(t=>names.has(normalizeName(t?.name)))
    .map(t=>({
      name:cleanName(t?.name),
      day:t?.day ?? null,
      gender:t?.gender ?? null,
      division:t?.division ?? null,
      color:t?.color ?? null,
      color_alt:t?.color_alt ?? null,
      schedule_key:t?.schedule_key ?? null,
    }))
    .sort((a,b)=>a.name.localeCompare(b.name));

  const eventsSignal=aggregate.events
    .filter(event =>
      names.has(normalizeName(event?.home_team_name)) ||
      names.has(normalizeName(event?.away_team_name))
    )
    .map(event=>({
      id:String(event?.id || event?.event_id || ""),
      home_team_name:cleanName(event?.home_team_name),
      away_team_name:cleanName(event?.away_team_name),
      start_date:String(event?.start_date || ""),
      start_time:String(event?.start_time || ""),
      location:String(event?.location || ""),
      notes:String(event?.notes || ""),
      home_color:event?.home_color ?? null,
      away_color:event?.away_color ?? null,
      home_score:eventScore(event,"home"),
      away_score:eventScore(event,"away"),
    }))
    .sort((a,b)=>
      a.start_date.localeCompare(b.start_date) ||
      a.start_time.localeCompare(b.start_time) ||
      a.home_team_name.localeCompare(b.home_team_name) ||
      a.away_team_name.localeCompare(b.away_team_name)
    );

  return {season:seasonId,teams:teamsSignal,events:eventsSignal};
}

export async function fetchLeagueSnapshot(teams, preferredSeason="") {
  const cleaned=(teams||[]).map(cleanName).filter(Boolean);
  if(!cleaned.length) throw new Error("No league teams configured");
  const {season,aggregate}=await discoverSeason(cleaned,preferredSeason);
  const exportsByTeam={};
  for(const teamName of cleaned) {
    const team=teamMatches(aggregate,teamName)[0];
    if(!team?.schedule_key) throw new Error("Team schedule key missing");
    exportsByTeam[teamName]=await ratsCall("get-schedule",{season,key:team.schedule_key});
  }
  return normalizeLeague(cleaned,season,aggregate,exportsByTeam);
}

function sortObject(value) {
  if(Array.isArray(value)) return value.map(sortObject);
  if(value && typeof value==="object") return Object.fromEntries(Object.keys(value).sort().map(k=>[k,sortObject(value[k])]));
  return value;
}

export async function fingerprint(value) {
  const bytes=new TextEncoder().encode(JSON.stringify(sortObject(value)));
  const digest=await crypto.subtle.digest("SHA-256",bytes);
  return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,"0")).join("");
}

export async function kvJsonGet(env,key) {
  if(!env.BALLERWATCH_STATE) return null;
  return env.BALLERWATCH_STATE.get(key,{type:"json"});
}

export async function kvJsonPut(env,key,value,options={}) {
  if(!env.BALLERWATCH_STATE) return;
  await env.BALLERWATCH_STATE.put(key,JSON.stringify(value),options);
}

export async function kvTextGet(env,key) {
  return env.BALLERWATCH_STATE ? env.BALLERWATCH_STATE.get(key) : null;
}

export async function kvTextPut(env,key,value,options={}) {
  if(env.BALLERWATCH_STATE) await env.BALLERWATCH_STATE.put(key,String(value),options);
}
