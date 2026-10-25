/**
 * Optional v1 accountless calendar profiles. D1 stores encrypted selections
 * and hashed read, manager, recovery and one-use pairing capabilities.
 * No canonical GitHub runtime-state document or RSVP participant name is used.
 * Baseline: v11.7.0; disabled unless a dedicated D1 binding/key are provisioned.
 */
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const CODE = /^[A-Za-z0-9_-]{43}$/;
const ID = /^[A-Za-z0-9_-]{22}$/;
const PAIR_LIFETIME_MS = 5 * 60_000;

function bytesToToken(bytes) {
  let value = "";
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function tokenToBytes(value) {
  if (!CODE.test(String(value || ""))) return null;
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  try {
    const decoded = atob(base64 + "=");
    return Uint8Array.from(decoded, character => character.charCodeAt(0));
  } catch { return null; }
}
function randomToken(length = 32) { return bytesToToken(crypto.getRandomValues(new Uint8Array(length))); }
async function sha256(value) {
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(hash), x => x.toString(16).padStart(2, "0")).join("");
}
function secretKey(env) {
  const bytes = tokenToBytes(env.CALENDAR_SYNC_KEY);
  if (!bytes || bytes.byteLength !== 32) throw new Error("Calendar profile encryption unavailable");
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}
export function normalizeCalendarSelection(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new RangeError("Invalid selection");
  const teams = (value, max) => {
    if (!Array.isArray(value) || value.length > max) throw new RangeError("Too many teams");
    const items = value.map(x => {
      if (typeof x !== "string") throw new RangeError("Invalid team");
      const name = x.trim().replace(/\s+/g, " ");
      if (name.length < 2 || name.length > 120 || /[\x00-\x1f\x7f]/.test(name)) {
        throw new RangeError("Invalid team");
      }
      return name;
    });
    const firstNameByKey = new Map();
    for (const name of items) {
      const key = name.toLocaleLowerCase("en");
      if (!firstNameByKey.has(key)) firstNameByKey.set(key, name);
    }
    return [...firstNameByKey.values()];
  };
  if (typeof body.pickup !== "boolean") throw new RangeError("Invalid pickup");
  return { teams: teams(body.teams, 8), watch: teams(body.watch, 20), pickup: body.pickup };
}
async function encryptPrivate(value, env, id, purpose) {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const key = await secretKey(env);
  const data = await crypto.subtle.encrypt({
    name: "AES-GCM", iv: nonce, additionalData: encoder.encode("calendar-" + purpose + ":v1:" + id),
  }, key, encoder.encode(JSON.stringify(value)));
  return bytesToToken(nonce) + "." + bytesToToken(new Uint8Array(data));
}
async function decryptPrivate(value, env, id, purpose) {
  const [nonceRaw, ciphertextRaw] = String(value || "").split(".");
  const decode = (v) => {
    if (!v || !/^[\w-]+$/.test(v)) throw new Error("Invalid profile envelope");
    const binary = atob(v.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - v.length % 4) % 4));
    return Uint8Array.from(binary, ch => ch.charCodeAt(0));
  };
  const nonce = decode(nonceRaw), data = decode(ciphertextRaw);
  if (nonce.length !== 12) throw new Error("Invalid profile nonce");
  const key = await secretKey(env);
  const clear = await crypto.subtle.decrypt({
    name: "AES-GCM", iv: nonce, additionalData: encoder.encode("calendar-" + purpose + ":v1:" + id),
  }, key, data);
  return JSON.parse(decoder.decode(clear));
}
const encryptSelection = (selection, env, id) => encryptPrivate(selection, env, id, "selection");
const decryptSelection = async (value, env, id) =>
  normalizeCalendarSelection(await decryptPrivate(value, env, id, "selection"));

function enabled(env) { return Boolean(env.CALENDAR_PROFILES && env.CALENDAR_SYNC_KEY); }
function response(request, value, status = 200, extras = {}) {
  const origin = request.headers.get("Origin");
  const allowed = origin === "https://vudh1.github.io" ||
    /^http:\/\/localhost(?::\d+)?$/.test(origin || "");
  const headers = new Headers({
    "content-type": "application/json; charset=utf-8", "cache-control": "no-store",
    "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
    "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", "vary": "Origin",
    ...(allowed ? { "access-control-allow-origin": origin } : {}),
    ...extras,
  });
  return new Response(JSON.stringify(value), { status, headers });
}
function requiresPwaOrigin(request) {
  const origin = request.headers.get("Origin");
  return origin === "https://vudh1.github.io" || /^http:\/\/localhost(?::\d+)?$/.test(origin || "");
}
async function readBody(request) {
  const limit = Number(request.headers.get("content-length") || 0);
  if (limit > 4096 || !/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") || "")) {
    throw new RangeError("Invalid payload");
  }
  const raw = await request.text();
  if (raw.length > 4096) throw new RangeError("Payload too large");
  try { return JSON.parse(raw); } catch { throw new RangeError("Invalid JSON"); }
}
function managerToken(request) {
  const header = request.headers.get("authorization") || "";
  return /^Bearer [A-Za-z0-9_-]{43}$/.test(header) ? header.slice(7) : "";
}
async function ownerProfile(db, request, id) {
  const token = managerToken(request);
  if (!token || !ID.test(id)) return null;
  const hash = await sha256("manager:" + token);
  return db.prepare(`SELECT p.id, p.revision, p.read_hash, p.selection_cipher, p.read_cipher,
      m.manager_hash FROM calendar_profiles p
      JOIN calendar_managers m ON m.profile_id = p.id
      WHERE p.id = ? AND m.manager_hash = ?`).bind(id, hash).first();
}
async function throttle(db, request, env) {
  // Coarse accountless abuse budget; WAF rate limits are also required for rollout.
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const hour = Math.floor(Date.now() / 3_600_000);
  const salt = String(env.CALENDAR_SYNC_KEY);
  const bucket = await sha256(salt + ":calendar:" + ip + ":" + hour);
  const row = await db.prepare(`INSERT INTO calendar_rate (bucket, hits, until_ms)
    VALUES (?, 1, ?) ON CONFLICT(bucket) DO UPDATE SET hits = hits + 1
    WHERE hits < 160 RETURNING hits`).bind(bucket, (hour + 1) * 3_600_000).first();
  return Boolean(row);
}
async function issueManager(db, profileId, now) {
  const credential = randomToken();
  const hash = await sha256("manager:" + credential);
  await db.prepare("INSERT INTO calendar_managers (manager_hash, profile_id, created_ms) VALUES (?, ?, ?)")
    .bind(hash, profileId, now).run();
  return credential;
}
function urlForToken(request, token) {
  return new URL("/web/v1/calendar-ics/" + token + ".ics", request.url).toString();
}
async function changeSelection(db, env, row, value, expectedRevision) {
  const selection = normalizeCalendarSelection(value);
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision <= 0) {
    throw new RangeError("Invalid revision");
  }
  if (expectedRevision !== row.revision) return { conflict: true };
  const cipher = await encryptSelection(selection, env, row.id);
  const updated = await db.prepare(`UPDATE calendar_profiles
    SET selection_cipher = ?, revision = revision + 1, updated_ms = ?
    WHERE id = ? AND revision = ? RETURNING revision`)
    .bind(cipher, Date.now(), row.id, row.revision).first();
  return updated ? { revision: updated.revision } : { conflict: true };
}
export async function handleCalendarProfileRequest(request, env, renderIcs) {
  const path = new URL(request.url).pathname;
  if (!path.startsWith("/web/v1/calendar-")) return null;
  const db = env.CALENDAR_PROFILES;
  const active = enabled(env);
  if (request.method === "OPTIONS") {
    const origin = request.headers.get("Origin");
    return new Response(null, { status: 204, headers: {
      "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
      "access-control-allow-headers": "content-type,authorization",
      "access-control-max-age": "600",
      ...(requiresPwaOrigin(request) ? { "access-control-allow-origin": origin } : {}),
      vary: "Origin",
    } });
  }
  if (path === "/web/v1/calendar-profiles/status" && request.method === "GET") {
    return response(request, { ok: true, available: active });
  }
  if (!active) return response(request, { ok: false, error: "Calendar sync is unavailable." }, 503);
  try {
    // Public subscription consumes only a read capability. No owner credential is accepted.
    const feed = path.match(/^\/web\/v1\/calendar-ics\/([\w-]{43})\.ics$/);
    if (feed && request.method === "GET") {
      const hash = await sha256("read:" + feed[1]);
      const row = await db.prepare(`SELECT id, selection_cipher, revision
        FROM calendar_profiles WHERE read_hash = ?`).bind(hash).first();
      if (!row) return response(request, { ok: false, error: "Calendar not found." }, 404);
      const selection = await decryptSelection(row.selection_cipher, env, row.id);
      const body = await renderIcs(selection);
      return new Response(body, { headers: {
        "content-type": "text/calendar; charset=utf-8", "cache-control": "no-store",
        "content-disposition": 'inline; filename="ballerwatch.ics"',
        "referrer-policy": "no-referrer", "x-content-type-options": "nosniff",
      } });
    }
    if (!requiresPwaOrigin(request)) return response(request, { ok: false, error: "Forbidden." }, 403);
    if (!await throttle(db, request, env)) return response(request, { ok: false, error: "Too many requests." }, 429);
    if (path === "/web/v1/calendar-profiles" && request.method === "POST") {
      const data = await readBody(request);
      if (data.optIn !== true) throw new RangeError("Explicit opt-in required");
      const selection = normalizeCalendarSelection(data.selection);
      const id = randomToken(16), readToken = randomToken();
      const recoveryToken = randomToken();
      const readHash = await sha256("read:" + readToken);
      const recoveryHash = await sha256("recovery:" + recoveryToken);
      const now = Date.now();
      const cipher = await encryptSelection(selection, env, id);
      const readCipher = await encryptPrivate(readToken, env, id, "read");
      await db.prepare(`INSERT INTO calendar_profiles
        (id, read_hash, recovery_hash, selection_cipher, read_cipher, revision, created_ms, updated_ms)
        VALUES (?, ?, ?, ?, ?, 1, ?, ?)`).bind(id, readHash, recoveryHash, cipher, readCipher, now, now).run();
      const manager = await issueManager(db, id, now);
      return response(request, { ok: true, id, manager, recoveryCode: recoveryToken,
        url: urlForToken(request, readToken), revision: 1 }, 201);
    }
    if (path === "/web/v1/calendar-pairings/redeem" && request.method === "POST") {
      const { code } = await readBody(request);
      if (!CODE.test(code)) return response(request, { ok: false, error: "Pairing code invalid." }, 404);
      const hash = await sha256("pair:" + code);
      const row = await db.prepare(`DELETE FROM calendar_pairings
        WHERE ticket_hash = ? AND expires_ms > ? RETURNING profile_id`)
        .bind(hash, Date.now()).first();
      if (!row) return response(request, { ok: false, error: "Pairing code invalid." }, 404);
      const profile = await db.prepare("SELECT id FROM calendar_profiles WHERE id = ?")
        .bind(row.profile_id).first();
      if (!profile) return response(request, { ok: false, error: "Pairing code invalid." }, 404);
      const manager = await issueManager(db, row.profile_id, Date.now());
      return response(request, { ok: true, id: row.profile_id, manager });
    }
    if (path === "/web/v1/calendar-profiles/recover" && request.method === "POST") {
      const { recoveryCode } = await readBody(request);
      if (!CODE.test(recoveryCode)) return response(request, { ok: false, error: "Recovery code invalid." }, 404);
      const hash = await sha256("recovery:" + recoveryCode);
      const row = await db.prepare("SELECT id FROM calendar_profiles WHERE recovery_hash = ?")
        .bind(hash).first();
      if (!row) return response(request, { ok: false, error: "Recovery code invalid." }, 404);
      const nextCode = randomToken(), nextHash = await sha256("recovery:" + nextCode);
      const changed = await db.prepare(`UPDATE calendar_profiles SET recovery_hash = ?
        WHERE id = ? AND recovery_hash = ? RETURNING id`).bind(nextHash, row.id, hash).first();
      if (!changed) return response(request, { ok: false, error: "Recovery code invalid." }, 404);
      const manager = await issueManager(db, row.id, Date.now());
      return response(request, { ok: true, id: row.id, manager, recoveryCode: nextCode });
    }
    const match = path.match(/^\/web\/v1\/calendar-profiles\/([\w-]{22})(?:\/(selection|rotate|pairings|device|other-devices))?$/);
    if (!match) return response(request, { ok: false, error: "Not found." }, 404);
    const [, id, action = ""] = match;
    const row = await ownerProfile(db, request, id);
    if (!row) return response(request, { ok: false, error: "Not found." }, 404);
    if (request.method === "GET" && !action) {
      return response(request, { ok: true, id, revision: row.revision,
        selection: await decryptSelection(row.selection_cipher, env, id),
        url: urlForToken(request, await decryptPrivate(row.read_cipher, env, id, "read")) });
    }
    if (request.method === "PUT" && action === "selection") {
      const data = await readBody(request);
      const changed = await changeSelection(db, env, row, data.selection, data.revision);
      return changed.conflict
        ? response(request, { ok: false, error: "Selection changed on another device." }, 409)
        : response(request, { ok: true, revision: changed.revision });
    }
    if (request.method === "POST" && action === "rotate") {
      const readToken = randomToken();
      const hash = await sha256("read:" + readToken);
      const cipher = await encryptPrivate(readToken, env, id, "read");
      await db.prepare("UPDATE calendar_profiles SET read_hash = ?, read_cipher = ?, updated_ms = ? WHERE id = ?")
        .bind(hash, cipher, Date.now(), id).run();
      return response(request, { ok: true, url: urlForToken(request, readToken) });
    }
    if (request.method === "POST" && action === "pairings") {
      const code = randomToken(), hash = await sha256("pair:" + code);
      const expiresAt = Date.now() + PAIR_LIFETIME_MS;
      await db.prepare(`INSERT INTO calendar_pairings (ticket_hash, profile_id, expires_ms)
        VALUES (?, ?, ?)`).bind(hash, id, expiresAt).run();
      return response(request, { ok: true, code, expiresAt });
    }
    if (request.method === "DELETE" && action === "device") {
      await db.prepare("DELETE FROM calendar_managers WHERE manager_hash = ?")
        .bind(row.manager_hash).run();
      return response(request, { ok: true });
    }
    if (request.method === "POST" && action === "other-devices") {
      await db.prepare("DELETE FROM calendar_managers WHERE profile_id = ? AND manager_hash != ?")
        .bind(id, row.manager_hash).run();
      await db.prepare("DELETE FROM calendar_pairings WHERE profile_id = ?").bind(id).run();
      return response(request, { ok: true });
    }
    if (request.method === "DELETE" && !action) {
      await db.batch([
        db.prepare("DELETE FROM calendar_pairings WHERE profile_id = ?").bind(id),
        db.prepare("DELETE FROM calendar_managers WHERE profile_id = ?").bind(id),
        db.prepare("DELETE FROM calendar_profiles WHERE id = ?").bind(id),
      ]);
      return response(request, { ok: true });
    }
    return response(request, { ok: false, error: "Method not allowed." }, 405);
  } catch (error) {
    if (error instanceof RangeError) {
      return response(request, { ok: false, error: error.message }, 400);
    }
    // Do not disclose tokens, selectors, D1 internals, or ciphertext in errors.
    return response(request, { ok: false, error: "Calendar sync is temporarily unavailable." }, 503);
  }
}
