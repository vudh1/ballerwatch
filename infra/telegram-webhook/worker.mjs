/**
 * Routes Telegram webhooks, edge Q&A, runtime-state APIs, health checks, and scheduled edge work.
 *
 * Documentation baseline: v2.3.0. Runtime/private data must never be committed to Git.
 */
import {
  fetchPickupSnapshot,
  fetchLeagueSignal,
  fingerprint,
  kvJsonGet,
  kvJsonPut,
  kvTextGet,
  kvTextPut,
} from "./edge-runtime.mjs";
import { classifyIndexedIntent } from "../../shared/intent-index.mjs";
import { ALL_RUNTIME_FILE_PATHS } from "../../shared/runtime-paths.mjs";

const REPO = "vudh1/ballerwatch";
const CONTEXT_CACHE_SECONDS = 600;
const EDGE_AI_DAILY_LIMIT = 25;
const EDGE_AI_TIMEOUT_MS = 1200;
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "openai/gpt-oss-20b";
const TIME_ZONE = "America/Los_Angeles";

const RUNTIME_FILE_PATHS = new Set(ALL_RUNTIME_FILE_PATHS);

function base64Json(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function cleanText(value, max = 1200) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, max);
}

function b64Bytes(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

function bytesB64(value) {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function stateKey(env) {
  const source = cleanText(env.TRACKER_STATE_KEY || env.TELEGRAM_BOT_TOKEN, 5000);
  if (!source) throw new Error("State decryption key is unavailable.");
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
}

async function encryptState(value, env) {
  const key = await crypto.subtle.importKey(
    "raw",
    await stateKey(env),
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, tagLength: 128 },
    key,
    new TextEncoder().encode(JSON.stringify(value)),
  ));
  const tag = encrypted.slice(encrypted.length - 16);
  const data = encrypted.slice(0, encrypted.length - 16);
  return {
    v: 1,
    iv: bytesB64(iv),
    tag: bytesB64(tag),
    data: bytesB64(data),
  };
}

async function decryptState(payload, env) {
  if (!payload || payload.v !== 1) return null;
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      await stateKey(env),
      { name: "AES-GCM" },
      false,
      ["decrypt"],
    );
    const ciphertext = b64Bytes(payload.data);
    const tag = b64Bytes(payload.tag);
    const combined = new Uint8Array(ciphertext.length + tag.length);
    combined.set(ciphertext, 0);
    combined.set(tag, ciphertext.length);
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: b64Bytes(payload.iv), tagLength: 128 },
      key,
      combined,
    );
    return JSON.parse(new TextDecoder().decode(plain));
  } catch {
    return null;
  }
}

async function githubFile(env, path) {
  const response = await fetch(
    `https://api.github.com/repos/${REPO}/contents/${path}?ref=main`,
    {
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${env.GITHUB_DISPATCH_TOKEN}`,
        "user-agent": "ballerwatch-cloudflare-fastpath",
        "x-github-api-version": "2022-11-28",
      },
    },
  );
  if (!response.ok) throw new Error(`GitHub state fetch failed: ${path} HTTP ${response.status}`);
  const data = await response.json();
  if (!data?.content) throw new Error(`GitHub state content missing: ${path}`);
  const text = atob(String(data.content).replace(/\n/g, ""));
  return JSON.parse(text);
}

function runtimeKey(path) {
  if (!RUNTIME_FILE_PATHS.has(path)) throw new Error("Runtime-state path is not allowed.");
  return `file:${path}`;
}

async function runtimeFileGet(env, path) {
  if (!env.BALLERWATCH_STATE || !RUNTIME_FILE_PATHS.has(path)) return null;
  return env.BALLERWATCH_STATE.get(runtimeKey(path));
}

async function syncDerivedRuntimeFile(env, path, raw) {
  let parsed;
  try { parsed = JSON.parse(raw); } catch { return; }

  if (path === "pickup/state/feed.json") {
    const value = await decryptState(parsed, env);
    if (value) await kvJsonPut(env, "snapshot:pickup", value);
  } else if (path === "pickup/state/events.json") {
    const value = await decryptState(parsed, env);
    if (value) await kvJsonPut(env, "snapshot:pickup-private", value);
  } else if (path === "league/state/teams.json") {
    const value = await decryptState(parsed, env);
    if (Array.isArray(value?.teams)) await kvJsonPut(env, "snapshot:teams", value.teams);
  } else if (path === "league/state/schedule.json") {
    const value = await decryptState(parsed, env);
    if (value) await kvJsonPut(env, "snapshot:league", value);
  } else if (path === "league/state/today.json") {
    const value = await decryptState(parsed, env);
    if (value) await kvJsonPut(env, "snapshot:today", value);
  } else if (path === "state/listener.json") {
    const settings = parsed?.settings ? await decryptState(parsed.settings, env) : null;
    if (settings) await kvJsonPut(env, "runtime:listener-settings", settings);
  } else if (path === "requests/unknown.json") {
    if (parsed?.version === 3 && Array.isArray(parsed?.requests)) {
      await kvJsonPut(env, "runtime:feature-summary", parsed);
    }
  }
}

async function runtimeFilePut(env, path, raw) {
  if (!env.BALLERWATCH_STATE) throw new Error("Runtime KV is unavailable.");
  if (!RUNTIME_FILE_PATHS.has(path)) throw new Error("Runtime-state path is not allowed.");
  const text = String(raw || "");
  if (!text || text.length > 500_000) throw new Error("Invalid runtime-state payload.");
  await env.BALLERWATCH_STATE.put(runtimeKey(path), text);
  await syncDerivedRuntimeFile(env, path, text);
}

async function runtimeSettings(env) {
  const cached = await kvJsonGet(env, "runtime:listener-settings");
  if (cached && typeof cached === "object") return cached;
  const raw = await runtimeFileGet(env, "state/listener.json");
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    const settings = parsed?.settings ? await decryptState(parsed.settings, env) : null;
    if (settings) {
      await kvJsonPut(env, "runtime:listener-settings", settings);
      return settings;
    }
  } catch {}
  return {};
}

async function rememberFastReplyInRuntime(env, question, reply, messageId, lastDate) {
  const raw = await runtimeFileGet(env, "state/listener.json");
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    const settings = (parsed?.settings ? await decryptState(parsed.settings, env) : null) || {};
    const id = Number(messageId || 0);
    const recent = Array.isArray(settings.recentBotReplies) ? settings.recentBotReplies : [];
    const nextSettings = {
      ...settings,
      ...(lastDate ? { lastReferencedDate: lastDate } : {}),
      recentBotReplies: id
        ? [
            ...recent.filter(item => Number(item?.messageId) !== id),
            {
              messageId: id,
              question: cleanText(question, 500),
              reply: String(reply || "").slice(0, 1200),
              createdAt: new Date().toISOString(),
            },
          ].slice(-20)
        : recent,
    };
    const next = {
      lastUpdateId: Number(parsed?.lastUpdateId || 0),
      settings: await encryptState(nextSettings, env),
    };
    await runtimeFilePut(env, "state/listener.json", JSON.stringify(next, null, 2) + "\n");
  } catch {}
}

async function loadSnapshot(env) {
  if (!env.BALLERWATCH_STATE) throw new Error("Runtime KV is unavailable.");
  const [pickup, pickupPrivate, league, today, teams, version, settings] = await Promise.all([
    kvJsonGet(env, "snapshot:pickup"),
    kvJsonGet(env, "snapshot:pickup-private"),
    kvJsonGet(env, "snapshot:league"),
    kvJsonGet(env, "snapshot:today"),
    kvJsonGet(env, "snapshot:teams"),
    kvTextGet(env, "snapshot:version"),
    runtimeSettings(env),
  ]);
  if (!pickup || !league || !Array.isArray(teams)) {
    throw new Error("Cloudflare KV soccer snapshot is incomplete.");
  }
  return {
    pickup,
    pickupPrivate: pickupPrivate || { events: {} },
    league,
    today: today || league.today || { games: [] },
    teams,
    settings: settings || {},
    version: version || "unknown",
    loadedAt: new Date().toISOString(),
    source: "cloudflare-kv",
  };
}

async function telegram(env, method, body) {
  return fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function sendTelegram(env, text, extra = {}) {
  const response = await telegram(env, "sendMessage", {
    chat_id: env.TELEGRAM_CHAT_ID,
    text,
    disable_web_page_preview: true,
    ...extra,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok !== true) {
    throw new Error(`Telegram send failed: ${payload.description || response.status}`);
  }
  return payload.result || null;
}

async function dispatchWorkflow(env, workflow, inputs = {}) {
  const response = await fetch(
    `https://api.github.com/repos/${REPO}/actions/workflows/${workflow}/dispatches`,
    {
      method: "POST",
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${env.GITHUB_DISPATCH_TOKEN}`,
        "content-type": "application/json",
        "user-agent": "ballerwatch-telegram-webhook",
        "x-github-api-version": "2022-11-28",
      },
      body: JSON.stringify({
        ref: "main",
        ...(Object.keys(inputs).length ? { inputs } : {}),
      }),
    },
  );
  if (!response.ok) throw new Error(`GitHub dispatch failed for ${workflow}: HTTP ${response.status}`);
}

async function dispatchGitHub(env, update) {
  return dispatchWorkflow(env, "listener.yml", { telegram_update_b64: base64Json(update) });
}

function localDate() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date()).filter(x => x.type !== "literal").map(x => [x.type, x.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function addDays(date, days) {
  const [y,m,d] = date.split("-").map(Number);
  const x = new Date(Date.UTC(y, m - 1, d + days, 12));
  return [x.getUTCFullYear(), String(x.getUTCMonth()+1).padStart(2,"0"), String(x.getUTCDate()).padStart(2,"0")].join("-");
}

function weekday(date) {
  const [y,m,d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US",{weekday:"long",timeZone:"UTC"}).format(new Date(Date.UTC(y,m-1,d,12))).toLowerCase();
}

function formatDate(date) {
  const [y,m,d] = date.split("-").map(Number);
  const wd = new Intl.DateTimeFormat("en-US",{weekday:"short",timeZone:"UTC"}).format(new Date(Date.UTC(y,m-1,d,12)));
  return `${wd} ${m}/${d}`;
}

function clock(value) {
  const text = cleanText(value, 60);
  if (!text) return "";
  const m = text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m) {
    const ms = Date.parse(text);
    if (!Number.isFinite(ms)) return text;
    return new Intl.DateTimeFormat("en-US",{timeZone:TIME_ZONE,hour:"numeric",minute:"2-digit"}).format(new Date(ms));
  }
  const hour = Number(m[1]);
  return `${hour % 12 || 12}:${m[2]} ${hour >= 12 ? "PM" : "AM"}`;
}

function availableDates(snapshot) {
  return (snapshot.pickup?.dates || []).map(x => String(x?.date || "")).filter(Boolean).sort();
}

function resolveDate(text, snapshot, context = {}) {
  const dates = availableDates(snapshot);
  const lower = String(text || "").toLowerCase();
  const iso = lower.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) {
    const d = `${iso[1]}-${String(Number(iso[2])).padStart(2,"0")}-${String(Number(iso[3])).padStart(2,"0")}`;
    if (dates.includes(d)) return d;
  }
  const md = lower.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(20\d{2}))?\b/);
  if (md) {
    const y = md[3] || localDate().slice(0,4);
    const d = `${y}-${String(Number(md[1])).padStart(2,"0")}-${String(Number(md[2])).padStart(2,"0")}`;
    if (dates.includes(d)) return d;
  }
  if (/\btoday\b/.test(lower) && dates.includes(localDate())) return localDate();
  const tomorrow = addDays(localDate(),1);
  if (/\btomorrow\b/.test(lower) && dates.includes(tomorrow)) return tomorrow;
  for (const name of ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"]) {
    if (lower.includes(name)) {
      const d = dates.find(x => x >= localDate() && weekday(x) === name);
      if (d) return d;
    }
  }
  if (context.lastDate && dates.includes(context.lastDate)) return context.lastDate;
  if (snapshot.settings?.lastReferencedDate && dates.includes(snapshot.settings.lastReferencedDate)) return snapshot.settings.lastReferencedDate;
  const future = dates.filter(x => x >= localDate());
  return future.length === 1 ? future[0] : null;
}

function pickupFacts(snapshot, date) {
  const pub = snapshot.pickup?.events?.[date];
  const priv = snapshot.pickupPrivate?.events?.[date] || {};
  if (!pub?.ok) return null;
  const reserved = Number(pub.reserved);
  const capacity = Number(pub.capacity);
  return {
    date,
    reserved: Number.isFinite(reserved) ? reserved : null,
    capacity: Number.isFinite(capacity) ? capacity : null,
    remaining: Number.isFinite(reserved) && Number.isFinite(capacity) ? capacity - reserved : null,
    start: clock(pub.startTime),
    end: clock(pub.endTime),
    field: cleanText(priv.fieldName, 150),
    address: cleanText(priv.address, 200),
    locked: Boolean(priv.locked),
    players: Array.isArray(priv.players) ? priv.players : [],
    waitlist: Array.isArray(priv.waitlist) ? priv.waitlist : [],
  };
}

function pickupStatus(snapshot, date) {
  const f = pickupFacts(snapshot,date);
  if (!f) return `I don't currently have RSVP data for ${formatDate(date)}.`;
  let line = `${formatDate(date)}: `;
  if (f.reserved == null) line += "count unavailable.";
  else if (f.capacity == null) line += `${f.reserved} reserved.`;
  else if (f.remaining <= 0) line += `${f.reserved}/${f.capacity} reserved — full.`;
  else line += `${f.reserved}/${f.capacity} reserved — ${f.remaining} spot${f.remaining === 1 ? "" : "s"} left.`;
  const lines=[line];
  if (f.start || f.end) lines.push(`🕒 ${f.start || "?"}${f.end ? `–${f.end}` : ""}`);
  if (f.field) lines.push(`📍 ${f.field}`);
  if (f.address) lines.push(f.address);
  const owner=cleanText(snapshot.settings?.ownerRsvpName || "",200) || cleanText(snapshot.ownerName || "",200);
  if (owner) {
    const key=owner.toLowerCase();
    const confirmed=f.players.some(p=>cleanText(p?.name,200).toLowerCase()===key);
    const pos=f.waitlist.findIndex(p=>cleanText(p?.name,200).toLowerCase()===key);
    if (confirmed) lines.push("✅ You are confirmed.");
    else if (pos>=0) lines.push(`🎟️ You are on the waitlist — position #${pos+1}.`);
  }
  return lines.join("\n");
}

function todayGames(snapshot) {
  const date=localDate();
  const blocks=[];
  const p=pickupFacts(snapshot,date);
  if (p) {
    const x=["⚽ Pickup"];
    if (p.start || p.end) x.push(`🕒 ${p.start || "?"}${p.end ? `–${p.end}` : ""}`);
    if (p.field) x.push(`📍 ${p.field}`);
    blocks.push(x.join("\n"));
  }
  for (const game of snapshot.today?.games || []) {
    const x=[`🏆 ${game.team} vs ${game.opponent}`];
    const t=clock(game.start || game.startTime);
    if(t) x.push(`🕒 ${t}`);
    if(game.location) x.push(`📍 ${game.location}`);
    blocks.push(x.join("\n"));
  }
  return blocks.length ? `Today's games — ${formatDate(date)}\n\n${blocks.join("\n\n")}` : `No pickup or RATS game is scheduled today (${formatDate(date)}).`;
}

function nextGame(snapshot) {
  const today=localDate();
  const candidates=[];
  for (const d of availableDates(snapshot).filter(x=>x>=today)) {
    const p=pickupFacts(snapshot,d);
    if(p) candidates.push({kind:"pickup",date:d,start:p.start||"",facts:p});
  }
  for (const team of snapshot.league?.teams || []) {
    for (const game of team.matches || []) {
      if(String(game.date||"")>=today) candidates.push({kind:"league",date:String(game.date),start:String(game.startTime||""),game});
    }
  }
  candidates.sort((a,b)=>a.date.localeCompare(b.date)||a.start.localeCompare(b.start));
  const n=candidates[0];
  if(!n) return {reply:"No upcoming game is currently published.",date:null};
  if(n.kind==="pickup") return {reply:pickupStatus(snapshot,n.date),date:n.date};
  const g=n.game;
  const lines=[`${formatDate(n.date)}: ${g.team} vs ${g.opponent}`];
  if(g.startTime) lines.push(`🕒 ${clock(g.startTime)}`);
  if(g.location) lines.push(`📍 ${g.location}`);
  if(g.jerseyColor) lines.push(`👕 ${g.jerseyColor} jersey`);
  return {reply:lines.join("\n"),date:n.date};
}

function directIntent(text) {
  const clean = cleanText(text, 600);
  const lower = clean.toLowerCase();

  // Slash commands stay exact. Natural-language routing then uses the shared
  // static index so common phrasing avoids a network round-trip to Groq.
  if (/^\/?version\b/.test(lower)) return "version";
  if (/^\/?help\b/.test(lower)) return "help";
  return classifyIndexedIntent(clean);
}

function isStateChanging(text) {
  const lower=cleanText(text,600).toLowerCase();
  return (
    /^\/?feature\b/.test(lower) ||
    /\b(snooze|unsnooze|mute|unmute|don'?t watch|stop watching|watch again|re-?enable)\b/.test(lower) ||
    /^(add|remove|delete|rename|change|modify|monitor|watch)\s+league\s+team\b/.test(lower) ||
    /\b(set|change|update|clear|remove|unset).*(owner|rsvp name|endpoint)\b/.test(lower) ||
    lower === "👎" ||
    lower === "thumbs down" ||
    lower === "thumb down"
  );
}

async function contextGet(chatId, env) {
  if (env.BALLERWATCH_STATE) return (await kvJsonGet(env, `context:${chatId}`)) || {};
  const key=new Request(`https://ballerwatch.internal/context/${chatId}`);
  const hit=await caches.default.match(key);
  return hit ? hit.json().catch(()=>({})) : {};
}

async function contextPut(chatId, context, env) {
  if (env.BALLERWATCH_STATE) {
    await kvJsonPut(env, `context:${chatId}`, context, { expirationTtl: CONTEXT_CACHE_SECONDS });
    return;
  }
  const key=new Request(`https://ballerwatch.internal/context/${chatId}`);
  await caches.default.put(key,new Response(JSON.stringify(context),{
    headers:{"cache-control":`public,max-age=${CONTEXT_CACHE_SECONDS}`}
  }));
}

function secondsUntilUtcMidnight() {
  const now=new Date();
  return Math.max(60,Math.floor((Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()+1)-now.getTime())/1000));
}

async function edgeAiBudgetTake(env) {
  const day=new Date().toISOString().slice(0,10);
  if (env.BALLERWATCH_STATE) {
    const key=`ai-budget:${day}`;
    const used=Number(await kvTextGet(env,key)) || 0;
    if(used>=EDGE_AI_DAILY_LIMIT) return false;
    await kvTextPut(env,key,used+1,{expirationTtl:secondsUntilUtcMidnight()});
    return true;
  }
  const key=new Request(`https://ballerwatch.internal/ai-budget/${day}`);
  const cache=caches.default;
  const hit=await cache.match(key);
  const used=hit ? Number(await hit.text()) || 0 : 0;
  if(used>=EDGE_AI_DAILY_LIMIT) return false;
  await cache.put(key,new Response(String(used+1),{headers:{"cache-control":`public,max-age=${secondsUntilUtcMidnight()}`}}));
  return true;
}

async function classifyWithAi(env, question, snapshot, context) {
  if (!env.GROQ_API_KEY || !(await edgeAiBudgetTake(env))) return null;
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),EDGE_AI_TIMEOUT_MS);
  try {
    const compact={
      today:localDate(),
      pickupDates:availableDates(snapshot).slice(0,8),
      leagueTeams:snapshot.teams,
      lastDate:context.lastDate||"",
    };
    const response=await fetch(GROQ_URL,{
      method:"POST",
      signal:controller.signal,
      headers:{"content-type":"application/json",authorization:`Bearer ${env.GROQ_API_KEY}`},
      body:JSON.stringify({
        model:GROQ_MODEL,
        temperature:0,
        max_completion_tokens:120,
        messages:[
          {role:"system",content:'Classify a soccer bot question. Return JSON only: {"intent":"pickup_status|today_games|next_game|league_teams|version|github","date":"optional YYYY-MM-DD"}. Use github for requests that change state, request a new feature, need unavailable data, or do not match a read-only intent.'},
          {role:"user",content:`Context: ${JSON.stringify(compact)}\nQuestion: ${cleanText(question,600)}`}
        ]
      })
    });
    if(!response.ok) return null;
    const payload=await response.json().catch(()=>null);
    const raw=payload?.choices?.[0]?.message?.content||"";
    const match=raw.match(/\{[\s\S]*\}/);
    if(!match) return null;
    const parsed=JSON.parse(match[0]);
    const allowed=new Set(["pickup_status","today_games","next_game","league_teams","version","github"]);
    return allowed.has(parsed.intent) ? {intent:parsed.intent,date:cleanText(parsed.date,20)} : null;
  } catch { return null; }
  finally { clearTimeout(timer); }
}

async function fastReply(env, message) {
  const text=cleanText(message?.text,600);
  if(!text || isStateChanging(text)) return null;

  let snapshot;
  try { snapshot=await loadSnapshot(env); } catch { return null; }
  snapshot.ownerName=cleanText(env.OWNER_RSVP_NAME,200);

  const chatId=String(message.chat.id);
  const context=await contextGet(chatId, env);
  let intent=directIntent(text);
  let ai=null;
  if(!intent) {
    ai=await classifyWithAi(env,text,snapshot,context);
    intent=ai?.intent || null;
  }
  if(!intent || intent==="github") return null;

  let reply="";
  let lastDate=context.lastDate||"";
  if(intent==="version") reply=`BallerWatch v${snapshot.version}`;
  else if(intent==="help") reply=[
    "You can ask:",
    "• what game is today?",
    "• what's my next game?",
    "• what's the count for Thursday?",
    "• what field?",
    "• what time?",
    "• what league teams are you monitoring?",
    "• /feature <request>",
    "• /setup",
    "• /version",
  ].join("\n");
  else if(intent==="league_teams") reply=snapshot.teams.length ? `Monitoring ${snapshot.teams.length} league team${snapshot.teams.length===1?"":"s"}:\n${snapshot.teams.map(x=>`• ${x}`).join("\n")}` : "No league teams are currently configured.";
  else if(intent==="today_games") { reply=todayGames(snapshot); lastDate=localDate(); }
  else if(intent==="next_game") { const x=nextGame(snapshot); reply=x.reply; if(x.date) lastDate=x.date; }
  else if(intent==="pickup_status") {
    const requested=ai?.date && availableDates(snapshot).includes(ai.date) ? ai.date : resolveDate(text,snapshot,context);
    if(!requested) return null;
    reply=pickupStatus(snapshot,requested);
    lastDate=requested;
  }

  if(!reply) return null;
  const sent=await sendTelegram(env,reply);
  await contextPut(chatId,{
    lastDate,
    lastIntent:intent,
    lastQuestion:text,
    lastReply:reply.slice(0,1200),
    lastBotMessageId:Number(sent?.message_id||0),
    updatedAt:new Date().toISOString(),
  }, env);
  await rememberFastReplyInRuntime(env, text, reply, sent?.message_id, lastDate);
  return {reply,messageId:Number(sent?.message_id||0),intent};
}

async function runtimeLeagueBundle(env) {
  try {
    const [teamsRaw,scheduleRaw,todayRaw]=await Promise.all([
      runtimeFileGet(env,"league/state/teams.json"),
      runtimeFileGet(env,"league/state/schedule.json"),
      runtimeFileGet(env,"league/state/today.json"),
    ]);
    if (teamsRaw && scheduleRaw) {
      const [teamsPayload,schedule,today]=await Promise.all([
        decryptState(JSON.parse(teamsRaw),env),
        decryptState(JSON.parse(scheduleRaw),env),
        todayRaw ? decryptState(JSON.parse(todayRaw),env) : null,
      ]);
      const teams=Array.isArray(teamsPayload?.teams)
        ? teamsPayload.teams.map(name=>cleanText(name,200)).filter(Boolean)
        : [];
      if(teams.length && schedule) return {teams,schedule,today:today||{games:[]}};
    }
  } catch {}

  const snap=await loadSnapshot(env);
  return {
    teams:Array.isArray(snap?.teams)?snap.teams:[],
    schedule:snap?.league||null,
    today:snap?.today||null,
  };
}

function ageMinutes(value) {
  const ms=Date.now()-Date.parse(String(value||""));
  return Number.isFinite(ms)?ms/60000:Infinity;
}

async function heartbeat(env,name,force=false) {
  const key=`heartbeat:${name}`;
  const prev=await kvTextGet(env,key);
  if(force || ageMinutes(prev)>=9) await kvTextPut(env,key,new Date().toISOString());
}

async function dispatchProblemOnce(env,component,error) {
  const key=`problem-dispatch:${component}`;
  const last=await kvTextGet(env,key);
  if(ageMinutes(last)<10) return;
  await kvTextPut(env,key,new Date().toISOString(),{expirationTtl:3600});
  console.error(`${component} edge refresh failed`,error);
  await dispatchWorkflow(env,"watchdog.yml").catch(()=>null);
}

async function refreshPickupEdge(env,{dispatch=true,write=true}={}) {
  const settings=await runtimeSettings(env);
  const endpoint=cleanText(settings?.pickupEndpointOverride || env.UPSTREAM_ENDPOINT, 4000);
  const snapshot=await fetchPickupSnapshot(endpoint);
  const fp=await fingerprint(snapshot);
  const old=await kvTextGet(env,"fingerprint:pickup");
  const changed=old!==fp;

  if(write && (changed || !(await kvJsonGet(env,"snapshot:pickup")))) {
    await Promise.all([
      kvJsonPut(env,"snapshot:pickup",snapshot.feed),
      kvJsonPut(env,"snapshot:pickup-private",snapshot.private),
    ]);
  }

  if(changed && dispatch) await dispatchWorkflow(env,"pickup.yml");

  if(write) {
    // Advance the fingerprint only after any required reconciliation dispatch
    // succeeds, so a transient GitHub API failure is retried next edge tick.
    await kvTextPut(env,"fingerprint:pickup",fp);
    await heartbeat(env,"pickup",changed);
  }
  return {ok:true,changed,dateCount:snapshot.feed.dates.length};
}

async function refreshLeagueEdge(env,{dispatch=true,write=true}={}) {
  const bundle=await runtimeLeagueBundle(env);
  const teams=bundle.teams;
  if(!teams.length) throw new Error("No monitored league teams available");
  const seasonId=String(bundle.schedule?.seasonId || bundle.schedule?.season || "").trim();
  if(!seasonId || !/^(winter|spring|summer|fall)-\d{4}$/i.test(seasonId)) {
    throw new Error("Current RATS season id is unavailable");
  }

  const signal=await fetchLeagueSignal(teams,seasonId);
  const fp=await fingerprint(signal);
  const old=await kvTextGet(env,"fingerprint:league");
  const changed=old!==fp;

  if(write) {
    const previous=await kvJsonGet(env,"snapshot:league");
    const githubFingerprint=bundle.schedule ? await fingerprint(bundle.schedule) : "";
    const cachedFingerprint=previous ? await fingerprint(previous) : "";
    const writes=[
      kvJsonPut(env,"snapshot:teams",teams),
    ];
    if(bundle.schedule && githubFingerprint!==cachedFingerprint) {
      writes.push(kvJsonPut(env,"snapshot:league",bundle.schedule));
      writes.push(kvJsonPut(env,"snapshot:today",bundle.today||{games:[]}));
    }
    await Promise.all(writes);
  }

  if(changed && dispatch) await dispatchWorkflow(env,"league.yml");

  if(write) {
    // As with pickup, only acknowledge a source fingerprint after any required
    // reconciliation dispatch has been accepted.
    await kvTextPut(env,"fingerprint:league",fp);
    await heartbeat(env,"league",changed);
  }

  return {
    ok:true,
    changed,
    seasonId,
    teamCount:teams.length,
    eventCount:signal.events.length,
  };
}

async function refreshVersionEdge(env) {
  try {
    const v=await githubFile(env,"features/versions.json");
    if(v?.currentVersion) await kvTextPut(env,"snapshot:version",String(v.currentVersion));
  } catch {}
}

async function edgeWatchdog(env) {
  const [pickup,league,lastDeep]=await Promise.all([
    kvTextGet(env,"heartbeat:pickup"),
    kvTextGet(env,"heartbeat:league"),
    kvTextGet(env,"watchdog:last-deep"),
  ]);
  if(ageMinutes(pickup)>8 || ageMinutes(league)>12) await dispatchProblemOnce(env,"stale-runtime",new Error("Edge source heartbeat is stale"));
  const day=new Date().toISOString().slice(0,10);
  if(lastDeep!==day) {
    await dispatchWorkflow(env,"watchdog.yml");
    await kvTextPut(env,"watchdog:last-deep",day,{expirationTtl:172800});
  }
  await refreshVersionEdge(env);
}

async function runScheduled(cron,env) {
  try {
    if(cron==="*/2 * * * *") return await refreshPickupEdge(env);
    if(cron==="*/5 * * * *") return await refreshLeagueEdge(env);
    if(cron==="*/10 * * * *") return await edgeWatchdog(env);
  } catch(error) {
    const component=cron.startsWith("*/2")?"pickup":cron.startsWith("*/5")?"league":"watchdog";
    await dispatchProblemOnce(env,component,error);
    throw error;
  }
}

export default {
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runScheduled(controller.cron,env));
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      const [pickup,league]=env.BALLERWATCH_STATE ? await Promise.all([
        kvTextGet(env,"heartbeat:pickup"),kvTextGet(env,"heartbeat:league")
      ]) : ["",""];
      return Response.json({
        ok:true,
        service:"ballerwatch-telegram-webhook",
        fastPath:true,
        runtime:"cloudflare-primary-preview",
        kv:Boolean(env.BALLERWATCH_STATE),
        pickupAgeMinutes:pickup?Math.round(ageMinutes(pickup)*10)/10:null,
        leagueAgeMinutes:league?Math.round(ageMinutes(league)*10)/10:null,
      });
    }
    if (request.method === "GET" && url.pathname === "/public/feature-summary") {
      const summary=await kvJsonGet(env,"runtime:feature-summary");
      return Response.json(summary || {version:3,requests:[]},{
        headers:{"cache-control":"public,max-age=60"}
      });
    }
    if (request.method === "POST" && url.pathname === "/admin/runtime-files") {
      const secret=request.headers.get("x-ballerwatch-admin")||"";
      if(!secret || secret!==env.TELEGRAM_WEBHOOK_SECRET) return new Response("Unauthorized",{status:401});
      let body;
      try { body=await request.json(); } catch { return Response.json({ok:false,error:"Invalid JSON"},{status:400}); }

      if(body?.action==="get") {
        const paths=Array.isArray(body.paths)?body.paths.filter(path=>RUNTIME_FILE_PATHS.has(path)).slice(0,50):[];
        const files={};
        for(const path of paths) files[path]=await runtimeFileGet(env,path);
        return Response.json({ok:true,files});
      }

      if(body?.action==="put") {
        const entries=Object.entries(body?.files && typeof body.files==="object" ? body.files : {})
          .filter(([path,raw])=>RUNTIME_FILE_PATHS.has(path) && typeof raw==="string")
          .slice(0,50);
        for(const [path,raw] of entries) await runtimeFilePut(env,path,raw);
        return Response.json({ok:true,count:entries.length});
      }

      return Response.json({ok:false,error:"Unsupported action"},{status:400});
    }
    if (request.method === "POST" && url.pathname === "/admin/purge-runtime") {
      const secret=request.headers.get("x-ballerwatch-admin")||"";
      if(!secret || secret!==env.TELEGRAM_WEBHOOK_SECRET) return new Response("Unauthorized",{status:401});
      const preserved=new Set(["state/listener.json","league/state/teams.json"]);
      for(const path of RUNTIME_FILE_PATHS) {
        if(!preserved.has(path)) await env.BALLERWATCH_STATE.delete(runtimeKey(path));
      }
      for(const key of [
        "snapshot:pickup",
        "snapshot:pickup-private",
        "snapshot:league",
        "snapshot:today",
        "fingerprint:pickup",
        "fingerprint:league",
        "heartbeat:pickup",
        "heartbeat:league",
        "watchdog:last-deep",
        "runtime:feature-summary",
      ]) {
        await env.BALLERWATCH_STATE.delete(key);
      }
      await kvJsonPut(env,"runtime:feature-summary",{version:3,requests:[]});
      return Response.json({ok:true,preserved:["listener-settings","league-teams"]});
    }
    if (request.method === "POST" && url.pathname === "/admin/shadow-refresh") {
      const secret=request.headers.get("x-ballerwatch-admin")||"";
      if(!secret || secret!==env.TELEGRAM_WEBHOOK_SECRET) return new Response("Unauthorized",{status:401});
      const target=url.searchParams.get("target")||"all";
      const write=url.searchParams.get("write")==="1";
      const out={};
      let ok=true;
      if(target==="all"||target==="pickup") {
        try { out.pickup=await refreshPickupEdge(env,{dispatch:false,write}); }
        catch(error) { ok=false; out.pickup={ok:false,error:cleanText(error?.message||"pickup refresh failed",200)}; }
      }
      if(target==="all"||target==="league") {
        try { out.league=await refreshLeagueEdge(env,{dispatch:false,write}); }
        catch(error) { ok=false; out.league={ok:false,error:cleanText(error?.message||"league refresh failed",200)}; }
      }
      return Response.json({ok,...out},{status:ok?200:500});
    }
    if (request.method !== "POST" || url.pathname !== "/telegram") {
      return new Response("Not found", { status: 404 });
    }

    const secret = request.headers.get("x-telegram-bot-api-secret-token") || "";
    if (!secret || secret !== env.TELEGRAM_WEBHOOK_SECRET) return new Response("Unauthorized", { status: 401 });

    let update;
    try { update = await request.json(); } catch { return new Response("Invalid JSON", { status: 400 }); }

    const message=update?.message;
    const chatId=message?.chat?.id;
    if (chatId == null || String(chatId) !== String(env.TELEGRAM_CHAT_ID)) return new Response("Ignored", { status: 200 });

    ctx.waitUntil(telegram(env,"sendChatAction",{chat_id:env.TELEGRAM_CHAT_ID,action:"typing"}).catch(()=>null));

    try {
      const fast=await fastReply(env,message);
      if(fast) return new Response("OK-fast", {status:200});
      await dispatchGitHub(env,update);
      return new Response("OK-github", {status:200});
    } catch (error) {
      console.error(error);
      try {
        await dispatchGitHub(env,update);
        return new Response("OK-fallback", {status:200});
      } catch {
        return new Response("Temporary failure", {status:502});
      }
    }
  },
};
