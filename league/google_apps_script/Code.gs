/**
 * RATS League Watcher -> Google Calendar bridge.
 *
 * Deploy as a Web app:
 *   Execute as: Me
 *   Who has access: Anyone
 *
 * In Project Settings -> Script Properties add:
 *   WEBHOOK_SECRET = the same random secret stored in GitHub.
 *
 * This script uses the default calendar and stores the private RATS key ->
 * Calendar event ID mapping in Script Properties.
 */

const TZ = 'America/Los_Angeles';
const TRACK_PREFIX = 'rats_event_';

function authorizeCalendar() {
  // Run once from the Apps Script editor to grant Calendar access.
  const calendar = CalendarApp.getDefaultCalendar();
  Logger.log('Authorized default calendar: ' + calendar.getName());
}

function doGet() {
  return json_({ok: true, service: 'rats-calendar-bridge', version: 3});
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const expected = PropertiesService.getScriptProperties().getProperty('WEBHOOK_SECRET');
    if (!expected || body.secret !== expected) {
      return json_({ok: false, error: 'unauthorized'});
    }
    const calendar = CalendarApp.getDefaultCalendar();
    const props = PropertiesService.getScriptProperties();

    if (body.action === 'purge') {
      return json_(purgeManagedEvents_(calendar, props));
    }

    if (body.schemaVersion !== 1 || !Array.isArray(body.updates)) {
      return json_({ok: false, error: 'invalid payload'});
    }

    const results = body.updates.map(item => applyUpdate_(calendar, props, item));
    return json_({ok: results.every(r => r.ok), results: results});
  } catch (err) {
    return json_({ok: false, error: String(err && err.message || err)});
  }
}

function applyUpdate_(calendar, props, item) {
  const match = item && item.match;
  if (!item || !item.key || !match || !match.start || !match.end) {
    return {ok: false, key: item && item.key, error: 'missing match fields'};
  }

  let event = null;
  const propertyKey = TRACK_PREFIX + item.key;
  const oldPropertyKey = item.oldKey ? TRACK_PREFIX + item.oldKey : null;
  const savedId = props.getProperty(propertyKey) ||
    (oldPropertyKey ? props.getProperty(oldPropertyKey) : null);

  if (savedId) {
    try {
      event = calendar.getEventById(savedId);
    } catch (_) {}
  }

  // Migration/reschedule fallback: only reuse an event when exactly one narrow
  // candidate around the match date contains both team and opponent text.
  if (!event) {
    const candidates = narrowCandidates_(calendar, item.previous || match);
    if (candidates.length === 1) {
      event = candidates[0];
    } else if (candidates.length > 1) {
      return {ok: false, key: item.key, error: 'ambiguous calendar match'};
    }
  }

  const title = match.team + ' vs ' + match.opponent +
    (match.jerseyColor ? ' (' + match.jerseyColor + ')' : '');
  const description = [
    'Team: ' + match.team,
    'Opponent: ' + match.opponent,
    'Home/Away: ' + value_(match.homeAway),
    'Jersey: ' + value_(match.jerseyColor),
    'Opponent jersey: ' + value_(match.opponentJerseyColor),
    'Division: ' + value_(match.division),
    'Season: ' + value_(match.season),
    'Field notes: ' + value_(match.fieldNotes),
    'Source: ' + value_(match.sourceUrl),
    'Map: ' + value_(match.mapUrl),
    'RATS tracking key: ' + item.key,
    match.endEstimated
      ? 'End time: estimated one-hour duration; RATS did not publish an end time.'
      : 'End time: published by RATS.'
  ].join('\n');

  const start = new Date(match.start);
  const end = new Date(match.end);
  let action;

  if (event) {
    event.setTitle(title);
    event.setTime(start, end);
    event.setLocation(match.location || '');
    event.setDescription(description);
    action = 'updated';
  } else {
    event = calendar.createEvent(title, start, end, {
      location: match.location || '',
      description: description
    });
    action = 'created';
  }

  event.removeAllReminders();
  event.addPopupReminder(480);

  // Store event ID privately inside Apps Script, never in the public repo.
  props.setProperty(propertyKey, event.getId());
  if (oldPropertyKey && oldPropertyKey !== propertyKey) {
    props.deleteProperty(oldPropertyKey);
  }

  return {ok: true, key: item.key, action: action};
}

function purgeManagedEvents_(calendar, props) {
  const deletedIds = {};
  let deleted = 0;
  let clearedProperties = 0;
  const properties = props.getProperties();

  Object.keys(properties).forEach(key => {
    if (key.indexOf(TRACK_PREFIX) !== 0) return;
    const eventId = properties[key];
    let event = null;
    try {
      event = calendar.getEventById(eventId);
    } catch (_) {}
    if (event) {
      event.deleteEvent();
      deletedIds[eventId] = true;
      deleted += 1;
    }
    props.deleteProperty(key);
    clearedProperties += 1;
  });

  // Safety net for legacy events whose Script Property mapping was lost.
  // Only events carrying BallerWatch's explicit tracking marker are eligible.
  const now = new Date();
  const start = new Date(now.getFullYear() - 5, 0, 1);
  const end = new Date(now.getFullYear() + 6, 0, 1);
  const candidates = calendar.getEvents(start, end, {search: 'RATS tracking key:'});
  candidates.forEach(event => {
    const description = String(event.getDescription() || '');
    if (description.indexOf('RATS tracking key:') === -1) return;
    const eventId = event.getId();
    if (deletedIds[eventId]) return;
    event.deleteEvent();
    deletedIds[eventId] = true;
    deleted += 1;
  });

  return {
    ok: true,
    action: 'purge',
    deleted: deleted,
    clearedProperties: clearedProperties
  };
}

function narrowCandidates_(calendar, match) {
  if (!match || !match.start) return [];
  const center = new Date(match.start);
  const start = new Date(center.getTime() - 24 * 60 * 60 * 1000);
  const end = new Date(center.getTime() + 48 * 60 * 60 * 1000);
  const events = calendar.getEvents(start, end);
  const team = String(match.team || '').toLowerCase();
  const opponent = String(match.opponent || '').toLowerCase();

  return events.filter(event => {
    const text = (event.getTitle() + ' ' + event.getDescription()).toLowerCase();
    return text.includes(team) && text.includes(opponent);
  });
}

function value_(v) {
  return v === null || v === undefined || v === '' ? 'not published' : String(v);
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
