/**
 * Manages encrypted standards-based Web Push subscriptions and sends payload-free signals.
 *
 * v3.0.0: VAPID keys and subscriptions live only inside encrypted runtime-state. Push signals
 * carry no payload; the PWA service worker fetches the latest public-safe notification board.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { decryptState, encryptState } from "./state-crypto.mjs";

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
  const endpoint = clean(value?.endpoint, 5000);
  if (!endpoint.startsWith("https://")) throw new Error("Invalid Web Push endpoint.");
  return {
    endpoint,
    expirationTime: value?.expirationTime ?? null,
    keys: {
      p256dh: clean(value?.keys?.p256dh, 500),
      auth: clean(value?.keys?.auth, 500),
    },
  };
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
      const response = await fetchImpl(subscription.endpoint, {
        method: "POST",
        headers: {
          Authorization: buildVapidAuthorization(state, subscription.endpoint, { now }),
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
      console.warn(`Web Push signal failed: ${error?.message || error}`);
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
  } else {
    throw new Error("Usage: node shared/web-push.mjs ensure|apply-event|send");
  }
}
