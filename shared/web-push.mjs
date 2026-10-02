/**
 * Manages encrypted standards-based Web Push subscriptions and sends payload-free signals.
 *
 * v3.0.0: VAPID keys and subscriptions live only inside encrypted runtime-state. Push signals
 * carry no payload; the PWA service worker fetches the latest public-safe notification board.
 */
import crypto from "node:crypto";
import { lookup as dnsLookup } from "node:dns/promises";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { decryptState, encryptState } from "./state-crypto.mjs";
import { normalizeWebPushEndpoint } from "./web-push-endpoint.mjs";

const STATE_PATH = "state/web-push.json";
const MAX_SUBSCRIPTIONS = 8;
const VAPID_SUBJECT = "mailto:ballerwatch@users.noreply.github.com";

function clean(value, max = 1000) {
  return String(value || "").trim().slice(0, max);
}

function base64urlJson(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function publicKeyFromJwk(jwk) {
  if (!jwk?.x || !jwk?.y) throw new Error("Invalid VAPID public JWK.");
  return Buffer.concat([
    Buffer.from([4]),
    Buffer.from(jwk.x, "base64url"),
    Buffer.from(jwk.y, "base64url"),
  ]).toString("base64url");
}

function createState() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
  });
  const publicJwk = publicKey.export({ format: "jwk" });
  const privateJwk = privateKey.export({ format: "jwk" });
  return {
    version: 1,
    vapid: {
      subject: VAPID_SUBJECT,
      publicJwk,
      privateJwk,
      applicationServerKey: publicKeyFromJwk(publicJwk),
      createdAt: new Date().toISOString(),
    },
    subscriptions: [],
  };
}

export function loadWebPushState() {
  try {
    const encrypted = JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
    const value = decryptState(encrypted);
    if (
      value?.version === 1 &&
      value?.vapid?.privateJwk &&
      value?.vapid?.applicationServerKey &&
      Array.isArray(value?.subscriptions)
    ) {
      return value;
    }
  } catch {}
  return null;
}

export function saveWebPushState(state) {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(
    STATE_PATH,
    JSON.stringify(encryptState(state), null, 2) + "\n",
  );
}

export function ensureWebPushState() {
  const current = loadWebPushState();
  if (current) {
    console.log(`Web Push state ready with ${current.subscriptions.length} subscription(s).`);
    return current;
  }
  const created = createState();
  saveWebPushState(created);
  console.log("Created encrypted Web Push VAPID state.");
  return created;
}

function normalizedSubscription(value) {
  return {
    endpoint: normalizeWebPushEndpoint(value?.endpoint),
    expirationTime: value?.expirationTime ?? null,
    keys: {
      p256dh: clean(value?.keys?.p256dh, 500),
      auth: clean(value?.keys?.auth, 500),
    },
  };
}

function ipv4Octets(value) {
  const parts = String(value || "").split(".");
  if (
    parts.length !== 4 ||
    parts.some((part) => !/^\d{1,3}$/.test(part) || Number(part) > 255)
  ) {
    return null;
  }
  return parts.map(Number);
}

function ipv6Words(value) {
  let source = String(value || "").toLowerCase().split("%")[0];
  if (source.startsWith("[") && source.endsWith("]")) source = source.slice(1, -1);
  if (!source.includes(":")) return null;

  const [leftRaw, rightRaw, extra] = source.split("::");
  if (extra !== undefined) return null;
  const expand = (part) => {
    if (!part) return [];
    const words = [];
    for (const token of part.split(":")) {
      if (!token) return null;
      if (token.includes(".")) {
        const ipv4 = ipv4Octets(token);
        if (!ipv4) return null;
        words.push((ipv4[0] << 8) | ipv4[1], (ipv4[2] << 8) | ipv4[3]);
      } else {
        if (!/^[0-9a-f]{1,4}$/.test(token)) return null;
        words.push(Number.parseInt(token, 16));
      }
    }
    return words;
  };

  const left = expand(leftRaw);
  const right = expand(rightRaw);
  if (!left || !right) return null;

  if (source.includes("::")) {
    const zeros = 8 - left.length - right.length;
    if (zeros < 1) return null;
    return [...left, ...Array(zeros).fill(0), ...right];
  }
  return left.length === 8 ? left : null;
}

function unsafeIpv4(value) {
  const octets = ipv4Octets(value);
  if (!octets) return true;
  const [a, b, c] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function mappedIpv4(words) {
  if (!Array.isArray(words) || words.length !== 8) return null;
  const mapped =
    words.slice(0, 5).every((word) => word === 0) &&
    words[5] === 0xffff;
  const nat64 =
    words[0] === 0x0064 &&
    words[1] === 0xff9b &&
    words[2] === 0 &&
    words[3] === 0 &&
    words[4] === 0 &&
    words[5] === 0;
  if (!mapped && !nat64) return null;
  return [
    words[6] >> 8,
    words[6] & 0xff,
    words[7] >> 8,
    words[7] & 0xff,
  ].join(".");
}

function unsafeIpv6(value) {
  const words = ipv6Words(value);
  if (!words) return true;
  if (words.every((word) => word === 0)) return true;
  if (words.slice(0, 7).every((word) => word === 0) && words[7] === 1) return true;
  if ((words[0] & 0xfe00) === 0xfc00) return true;
  if ((words[0] & 0xffc0) === 0xfe80) return true;
  if ((words[0] & 0xff00) === 0xff00) return true;
  if (words[0] === 0x2001 && words[1] === 0x0db8) return true;
  const mapped = mappedIpv4(words);
  return mapped ? unsafeIpv4(mapped) : false;
}

export function isUnsafeWebPushAddress(value) {
  const address = String(value || "").trim();
  const family = net.isIP(address);
  if (family === 4) return unsafeIpv4(address);
  if (family === 6) return unsafeIpv6(address);
  return true;
}

export async function validateWebPushDestination(
  endpoint,
  { resolveHost = dnsLookup } = {},
) {
  const normalized = normalizeWebPushEndpoint(endpoint);
  const hostname = new URL(normalized).hostname;
  const resolved = await resolveHost(hostname, { all: true, verbatim: true });
  const addresses = Array.isArray(resolved) ? resolved : [resolved];
  if (!addresses.length) throw new Error("Web Push service did not resolve.");
  for (const item of addresses) {
    const address = typeof item === "string" ? item : item?.address;
    if (!address || isUnsafeWebPushAddress(address)) {
      throw new Error("Web Push service resolved to a non-public address.");
    }
  }
  return normalized;
}

export function applyRegistrationEvent(event) {
  const state = ensureWebPushState();
  const action = clean(event?.action, 30);
  const subscription = normalizedSubscription(event?.subscription);
  const now = new Date().toISOString();

  if (action === "subscribe") {
    const existing = state.subscriptions.filter(
      (item) => item.endpoint !== subscription.endpoint,
    );
    state.subscriptions = [
      ...existing,
      {
        ...subscription,
        createdAt:
          state.subscriptions.find((item) => item.endpoint === subscription.endpoint)
            ?.createdAt || now,
        updatedAt: now,
      },
    ].slice(-MAX_SUBSCRIPTIONS);
  } else if (action === "unsubscribe") {
    state.subscriptions = state.subscriptions.filter(
      (item) => item.endpoint !== subscription.endpoint,
    );
  } else {
    throw new Error("Unsupported Web Push registration action.");
  }

  saveWebPushState(state);
  console.log(`Applied Web Push ${action}; ${state.subscriptions.length} subscription(s) active.`);
  return state;
}

export function applyEncryptedRegistrationEventB64(encoded) {
  const raw = Buffer.from(String(encoded || ""), "base64").toString("utf8");
  const envelope = JSON.parse(raw);
  const event = decryptState(envelope);
  if (!event) throw new Error("Web Push registration event could not be decrypted.");
  return applyRegistrationEvent(event);
}

export function buildVapidAuthorization(state, endpoint, { now = new Date() } = {}) {
  const audience = new URL(endpoint).origin;
  const header = base64urlJson({ typ: "JWT", alg: "ES256" });
  const payload = base64urlJson({
    aud: audience,
    exp: Math.floor(now.getTime() / 1000) + 12 * 60 * 60,
    sub: state.vapid.subject || VAPID_SUBJECT,
  });
  const signingInput = `${header}.${payload}`;
  const privateKey = crypto.createPrivateKey({
    key: state.vapid.privateJwk,
    format: "jwk",
  });
  const signature = crypto.sign(
    "sha256",
    Buffer.from(signingInput),
    { key: privateKey, dsaEncoding: "ieee-p1363" },
  ).toString("base64url");
  return `vapid t=${signingInput}.${signature}, k=${state.vapid.applicationServerKey}`;
}

export async function sendWebPushSignals({
  fetchImpl = globalThis.fetch,
  resolveHost = dnsLookup,
  now = new Date(),
} = {}) {
  const state = loadWebPushState();
  if (!state?.subscriptions?.length) {
    console.log("No Web Push subscriptions; signal skipped.");
    return { sent: 0, stale: 0, failed: 0 };
  }

  let sent = 0;
  let failed = 0;
  const staleEndpoints = new Set();

  for (const subscription of state.subscriptions) {
    try {
      const endpoint = await validateWebPushDestination(subscription.endpoint, { resolveHost });
      const response = await fetchImpl(endpoint, {
        method: "POST",
        redirect: "error",
        headers: {
          Authorization: buildVapidAuthorization(state, endpoint, { now }),
          TTL: "60",
          Urgency: "normal",
        },
        signal: AbortSignal.timeout(15_000),
      });
      if (response.status === 404 || response.status === 410) {
        staleEndpoints.add(subscription.endpoint);
      } else if (response.ok || response.status === 201 || response.status === 202) {
        sent += 1;
      } else {
        failed += 1;
        console.warn(`Web Push endpoint returned HTTP ${response.status}.`);
      }
    } catch (error) {
      failed += 1;
      staleEndpoints.add(subscription.endpoint);
      console.warn(`Web Push signal rejected or failed: ${error?.message || error}`);
    }
  }

  if (staleEndpoints.size) {
    state.subscriptions = state.subscriptions.filter(
      (item) => !staleEndpoints.has(item.endpoint),
    );
    saveWebPushState(state);
  }

  console.log(
    `Web Push signals complete: sent=${sent} stale=${staleEndpoints.size} failed=${failed}`,
  );
  return { sent, stale: staleEndpoints.size, failed };
}

export async function sendPendingWebPushSignals(options = {}) {
  if (!fs.existsSync(".runtime/web-push-pending")) {
    console.log("No new web notification; push signal skipped.");
    return { sent: 0, stale: 0, failed: 0, skipped: true };
  }
  try {
    const result = await sendWebPushSignals(options);
    return { ...result, skipped: false };
  } finally {
    fs.rmSync(".runtime/web-push-pending", { force: true });
  }
}

export function publicWebPushConfig() {
  const state = loadWebPushState();
  return state
    ? {
        ready: true,
        applicationServerKey: state.vapid.applicationServerKey,
        subscriptionCount: state.subscriptions.length,
      }
    : { ready: false, applicationServerKey: "", subscriptionCount: 0 };
}

const isCli =
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isCli) {
  const command = process.argv[2] || "";
  if (command === "ensure") ensureWebPushState();
  else if (command === "apply-event") {
    applyEncryptedRegistrationEventB64(process.env.WEB_PUSH_EVENT_B64 || "");
  } else if (command === "send") {
    await sendWebPushSignals();
  } else if (command === "send-pending") {
    await sendPendingWebPushSignals();
  } else {
    throw new Error("Usage: node shared/web-push.mjs ensure|apply-event|send|send-pending");
  }
}
