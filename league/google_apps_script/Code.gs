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

function isAlreadyDeletedEventError_(err) {
  const message = String(err && err.message || err || '').toLowerCase();
  return message.indexOf('does not exist') !== -1 ||
    message.indexOf('already been deleted') !== -1;
}

function purgeManagedEvents_(calendar, props) {
  const deletedIds = {};
  const errors = [];
  let deleted = 0;
  let stale = 0;
  let clearedProperties = 0;
  const properties = props.getProperties();

  Object.keys(properties).forEach(key => {
    if (key.indexOf(TRACK_PREFIX) !== 0) return;
    const eventId = properties[key];
    try {
      const event = calendar.getEventById(eventId);
      if (event) {
        event.deleteEvent();
        deletedIds[eventId] = true;
        deleted += 1;
      }
    } catch (err) {
      if (isAlreadyDeletedEventError_(err)) {
        stale += 1;
      } else {
        errors.push('tracked event delete failed: ' + String(err && err.message || err));
      }
    } finally {
      props.deleteProperty(key);
      clearedProperties += 1;
    }
  });

  // Safety net for legacy events whose Script Property mapping was lost.
  // Search one calendar year at a time to avoid large CalendarApp queries.
  const now = new Date();
  const currentYear = Number(
    Utilities.formatDate(now, TZ, 'yyyy')
  );
  for (let year = currentYear - 5; year <= currentYear + 5; year += 1) {
    let candidates = [];
    try {
      candidates = calendar.getEvents(
        new Date(year, 0, 1),
        new Date(year + 1, 0, 1),
        {search: 'RATS tracking key:'}
      );
    } catch (err) {
      errors.push('legacy marker scan failed: ' + String(err && err.message || err));
      continue;
    }

    candidates.forEach(event => {
      const description = String(event.getDescription() || '');
      if (description.indexOf('RATS tracking key:') === -1) return;
      const eventId = event.getId();
      if (deletedIds[eventId]) return;
      try {
        event.deleteEvent();
        deletedIds[eventId] = true;
        deleted += 1;
      } catch (err) {
        if (isAlreadyDeletedEventError_(err)) {
          stale += 1;
        } else {
          errors.push('legacy event delete failed: ' + String(err && err.message || err));
        }
      }
    });
  }

  return {
    ok: errors.length === 0,
    action: 'purge',
    deleted: deleted,
    stale: stale,
    clearedProperties: clearedProperties,
    errorCount: errors.length,
    error: errors.length ? errors[0] : ''
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
