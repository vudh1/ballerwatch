export const LOCAL_NOTIFICATION_READ_KEY = "ballerwatch-notification-read-v1";
export const LOCAL_NOTIFICATION_DELETED_KEY = "ballerwatch-notification-deleted-v1";

export function localNotificationIds(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return new Set(Array.isArray(value) ? value.map(String) : []);
  } catch {
    return new Set();
  }
}

export function saveLocalNotificationIds(key, values) {
  try {
    localStorage.setItem(key, JSON.stringify([...values].slice(-300)));
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
export function readLocalNotificationChannels(storage) {
  try {
    const raw=storage.getItem(LOCAL_NOTIFICATION_CHANNELS_KEY);
    return raw && raw.length <= 512 ? normalizedNotificationChannels(JSON.parse(raw))
      : normalizedNotificationChannels();
  } catch { return normalizedNotificationChannels(); }
}
export function saveLocalNotificationChannels(storage, channels) {
  try {
    storage.setItem(LOCAL_NOTIFICATION_CHANNELS_KEY,
      JSON.stringify(normalizedNotificationChannels(channels)));
    return true;
  } catch { return false; }
}
