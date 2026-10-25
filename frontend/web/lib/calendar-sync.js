/**
 * Accountless opt-in calendar sync client. Only an explicitly approved device
 * holds its own management capability; Vela receives the read-only ICS URL.
 * Local Play/Watch always works without Cloudflare. Baseline: v11.7.0.
 */
import { API_ORIGIN } from "./client.js";

const BETA = typeof window !== "undefined" &&
  /^\/ballerwatch\/beta(?:\/|$)/.test(window.location?.pathname || "");
export const CALENDAR_PROFILE_KEY = BETA
  ? "ballerwatch-beta-calendar-profile-v1" : "ballerwatch-calendar-profile-v1";

export function calendarSelection(teams, watch, pickup) {
  return { teams: [...new Set(teams)].slice(0, 8),
    watch: [...new Set(watch)].slice(0, 20), pickup: pickup === true };
}

export function readCalendarProfile(storage, key = CALENDAR_PROFILE_KEY) {
  try {
    const saved = JSON.parse(storage.getItem(key) || "null");
    if (!saved || saved.schema !== 1 || !/^[\w-]{22}$/.test(saved.id) ||
        !/^[\w-]{43}$/.test(saved.manager)) return null;
    return {
      id: saved.id, manager: saved.manager,
      revision: Number.isSafeInteger(saved.revision) ? saved.revision : 1,
      url: typeof saved.url === "string" && /^https:\/\/[^\s]+\/web\/v1\/calendar-ics\/[\w-]{43}\.ics$/.test(saved.url)
        ? saved.url : "",
      lastSelection: saved.lastSelection || null,
    };
  } catch { return null; }
}
function persist(storage, key, profile) {
  if (profile) storage.setItem(key, JSON.stringify({ schema: 1, ...profile }));
  else storage.removeItem(key);
}
export function createCalendarSync({ storage, request, getSelection, applySelection,
  onState = () => {}, key = CALENDAR_PROFILE_KEY, confirm = () => true }) {
  let profile = readCalendarProfile(storage, key);
  let available = false;
  let pending = Promise.resolve();
  let timer = 0;
  let recoveryCode = "";
  let pairingCode = "";
  const show = (message = "") => onState({
    available, connected: Boolean(profile), url: profile?.url || "",
    recoveryCode, pairingCode, message,
  });
  const call = (path, method = "GET", payload, manager = profile?.manager) => request(path, {
    method, headers: { ...(manager ? { authorization: "Bearer " + manager } : {}) },
    ...(payload !== undefined ? { body: JSON.stringify(payload) } : {}),
    retryNetwork: false, timeoutMs: 8000,
  });
  async function status() {
    try {
      const result = await call("/web/v1/calendar-profiles/status");
      available = result.available === true;
      show(available ? "" : "Cloud calendar sync is not configured. Device settings still work.");
      if (available && profile) await refresh();
    } catch { available = false; show("Cloud sync is offline; device settings are preserved."); }
  }
  async function enable() {
    if (profile) return show("Already connected.");
    if (!available) return show("Calendar sync is unavailable.");
    if (!confirm("Enable encrypted cloud calendar sync for this device? Your chosen teams and pickup inclusion will be stored privately on BallerWatch's Cloudflare service.")) return;
    try {
      const selection = getSelection();
      const result = await call("/web/v1/calendar-profiles", "POST",
        { optIn: true, selection }, "");
      profile = { id: result.id, manager: result.manager, revision: result.revision,
        url: result.url, lastSelection: selection };
      persist(storage, key, profile);
      recoveryCode = result.recoveryCode;
      show("Enabled. Save the one-time recovery code somewhere private.");
    } catch { show("Unable to enable sync. Local preferences are unchanged."); }
  }
  async function refresh() {
    if (!profile) return;
    try {
      const result = await call("/web/v1/calendar-profiles/" + profile.id);
      // If this device edited while offline, do not overwrite local changes.
      const changedLocally = profile.lastSelection &&
        JSON.stringify(getSelection()) !== JSON.stringify(profile.lastSelection);
      if (changedLocally && result.revision !== profile.revision) {
        return show("Another device also changed preferences. Review before resyncing.");
      }
      if (changedLocally) {
        return update();
      }
      if (JSON.stringify(result.selection) !== JSON.stringify(getSelection())) {
        applySelection(result.selection);
      }
      profile.revision = result.revision;
      profile.url = result.url;
      profile.lastSelection = result.selection;
      persist(storage, key, profile);
      show("Calendar selections up to date.");
    } catch { show("Cloud sync unavailable. Your local preferences are safe."); }
  }
  function update() {
    if (!profile || !available) return Promise.resolve();
    const selected = getSelection();
    const work = async () => {
      if (!profile || JSON.stringify(selected) === JSON.stringify(profile.lastSelection)) return;
      try {
        const result = await call("/web/v1/calendar-profiles/" + profile.id + "/selection",
          "PUT", { selection: selected, revision: profile.revision });
        profile.revision = result.revision;
        profile.lastSelection = selected;
        persist(storage, key, profile);
        show("Calendar updated. The saved Vela URL is unchanged.");
      } catch (error) {
        show(error?.status === 409
          ? "Preferences changed elsewhere. Reopen Settings to review; local changes are safe."
          : "Cloud sync pending. Local preferences are safe; retry from Settings.");
      }
    };
    pending = pending.then(work, work);
    return pending;
  }
  function queueUpdate() {
    if (!profile) return;
    clearTimeout(timer);
    timer = setTimeout(() => { void update(); }, 600);
  }
  async function link(code) {
    if (profile) return show("Disconnect this device before linking a different profile.");
    if (!available) return show("Cloud sync is unavailable.");
    if (!confirm("Link this browser to an authorized BallerWatch calendar profile and use its selected teams?")) return;
    try {
      const result = await call("/web/v1/calendar-pairings/redeem", "POST", { code: code.trim() }, "");
      profile = { id: result.id, manager: result.manager, revision: 0,
        url: "", lastSelection: null };
      const remote = await call("/web/v1/calendar-profiles/" + profile.id);
      applySelection(remote.selection);
      profile.revision = remote.revision;
      profile.url = remote.url;
      profile.lastSelection = remote.selection;
      persist(storage, key, profile);
      show("Linked. This device now has its own management credential.");
    } catch { profile = null; show("Pairing code expired or unavailable. Ask the linked device for a new code."); }
  }
  async function recover(code) {
    if (profile) return show("Disconnect this device before recovering a different profile.");
    if (!available || !confirm("Recover the profile using this one-time recovery code?")) return;
    try {
      const result = await call("/web/v1/calendar-profiles/recover", "POST",
        { recoveryCode: code.trim() }, "");
      profile = { id: result.id, manager: result.manager, revision: 0,
        url: "", lastSelection: null };
      const remote = await call("/web/v1/calendar-profiles/" + profile.id);
      applySelection(remote.selection);
      profile.revision = remote.revision; profile.url = remote.url;
      profile.lastSelection = remote.selection;
      persist(storage, key, profile);
      recoveryCode = result.recoveryCode;
      show("Recovered. Your previous recovery code is invalid. Save this new code.");
    } catch { profile = null; show("Recovery unavailable. Your original local selections remain safe."); }
  }
  async function manage(endpoint, method, message) {
    if (!profile || !available) return;
    try {
      const result = await call("/web/v1/calendar-profiles/" + profile.id + endpoint, method);
      if (endpoint === "/pairings") pairingCode = result.code;
      if (endpoint === "/rotate") { profile.url = result.url; persist(storage, key, profile); }
      if (endpoint === "/device" || endpoint === "") {
        profile = null; persist(storage, key, null); recoveryCode = ""; pairingCode = "";
      }
      show(message);
    } catch { show("Unable to update calendar sharing. Try again later."); }
  }
  async function generatePairing() {
    if (!confirm("Allow another device to manage the same followed-team preferences using a one-time code valid for five minutes?")) return;
    await manage("/pairings", "POST", "Use this code on the other device within five minutes.");
  }
  async function rotate() {
    if (confirm("Rotate the read-only calendar URL? Old subscriptions, including Vela, will stop working until their saved link is replaced.")) {
      await manage("/rotate", "POST", "URL rotated. Replace the old link in Vela TV.");
    }
  }
  async function disconnect() {
    if (confirm("Remove this device's access? The calendar will still work on other authorized devices.")) {
      await manage("/device", "DELETE", "This browser is disconnected. Other devices remain linked.");
    }
  }
  async function revokeOthers() {
    if (confirm("Revoke all other device management credentials and outstanding pairing codes?")) {
      await manage("/other-devices", "POST", "All other devices were disconnected.");
    }
  }
  async function remove() {
    if (confirm("Delete this calendar profile and permanently invalidate its subscription link for every device and Vela TV?")) {
      await manage("", "DELETE", "Calendar profile deleted. Local team choices are preserved.");
    }
  }
  async function copy() {
    const url = profile?.url || "";
    if (!url) return false;
    try { await navigator.clipboard.writeText(url); show("Stable calendar URL copied."); return true; }
    catch { window.prompt("Copy your calendar subscription URL:", url); return true; }
  }
  return {
    status, enable, refresh, queueUpdate, update, link, recover, generatePairing,
    rotate, disconnect, revokeOthers, remove, copy, state: () => profile,
    dismissSensitive() { recoveryCode = ""; pairingCode = ""; show(); },
  };
}
