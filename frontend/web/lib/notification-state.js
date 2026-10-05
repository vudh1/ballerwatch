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
