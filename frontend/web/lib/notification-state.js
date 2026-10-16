import { readDeviceLease, writeDeviceLease } from "./device-lease.js";
export const LOCAL_NOTIFICATION_READ_KEY = "ballerwatch-notification-read-v1";
export const LOCAL_NOTIFICATION_DELETED_KEY = "ballerwatch-notification-deleted-v1";

export function localNotificationIds(key, storage = localStorage) {
  try {
    const value = readDeviceLease(storage, key + "-24h")?.ids;
    storage.removeItem(key); // purge legacy unexpiring notification state
    return new Set(Array.isArray(value) ? value.map(String) : []);
  } catch {
    return new Set();
  }
}

export function saveLocalNotificationIds(key, values, storage = localStorage) {
  try {
    writeDeviceLease(storage, key + "-24h",
      { ids: [...values].slice(-300) });
  } catch {}
}

export function localNotificationProfile() {
  return {
    readIds: [...localNotificationIds(LOCAL_NOTIFICATION_READ_KEY)],
    deletedIds: [...localNotificationIds(LOCAL_NOTIFICATION_DELETED_KEY)],
  };
}

export function clearLocalNotificationProfile() {
  try {
    localStorage.removeItem(LOCAL_NOTIFICATION_READ_KEY);
    localStorage.removeItem(LOCAL_NOTIFICATION_DELETED_KEY);
    localStorage.removeItem(LOCAL_NOTIFICATION_READ_KEY + "-24h");
    localStorage.removeItem(LOCAL_NOTIFICATION_DELETED_KEY + "-24h");
  } catch {}
}

export function normalizedNotificationChannels(value = {}) {
  return {
    pickup: value?.pickup !== false,
    league: value?.league !== false,
    version: value?.version !== false,
  };
}

export function normalizedNotificationProfile(value = {}) {
  const unique = (items) => [...new Set(
    (Array.isArray(items) ? items : [])
      .map((item) => String(item || "").trim())
      .filter(Boolean),
  )].slice(-300);

  return {
    readIds: unique(value?.readIds),
    deletedIds: unique(value?.deletedIds),
    channels: normalizedNotificationChannels(value?.channels),
    updatedAt: String(value?.updatedAt || ""),
  };
}

export const LOCAL_NOTIFICATION_CHANNELS_KEY = "ballerwatch-notification-channels-v1";
export const DEVICE_NOTIFICATION_CHANNELS_KEY = "ballerwatch-notification-channels-v2";
export function readLocalNotificationChannels(storage) {
  try {
    const existing=storage.getItem(DEVICE_NOTIFICATION_CHANNELS_KEY);
    if (existing && existing.length <= 2_048) {
      const parsed=JSON.parse(existing);
      if (parsed?.schema===2 && parsed.channels) {
        return normalizedNotificationChannels(parsed.channels);
      }
    }
    // The previous build incorrectly gave category choices a 24h expiry.
    // Preserve those choices during upgrade if the original record survived.
    for (const key of [LOCAL_NOTIFICATION_CHANNELS_KEY+"-24h",
      LOCAL_NOTIFICATION_CHANNELS_KEY]) {
      const value=storage.getItem(key);
      if (!value || value.length > 2_048) continue;
      let decoded;
      try { decoded=JSON.parse(value); } catch {continue;}
      const channels=decoded?.data?.channels || decoded?.channels || decoded;
      if (!channels || typeof channels!=="object" || Array.isArray(channels)) continue;
      const normalized=normalizedNotificationChannels(channels);
      if (saveLocalNotificationChannels(storage,normalized)) {
        storage.removeItem(key);
      }
      return normalized;
    }
  } catch {}
  return normalizedNotificationChannels();
}
export function saveLocalNotificationChannels(storage, channels) {
  try {
    storage.setItem(DEVICE_NOTIFICATION_CHANNELS_KEY,JSON.stringify({
      schema:2,channels:normalizedNotificationChannels(channels),
    }));
    return true;
  } catch {return false;}
}
