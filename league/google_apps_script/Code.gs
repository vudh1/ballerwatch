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
 * The target calendar is paired privately and stored only in Script Properties.
 * RATS key -> Calendar event ID mappings also remain private there.
 */

const TZ = 'America/Los_Angeles';
const TRACK_PREFIX = 'rats_event_';
const TARGET_CALENDAR_KEY = 'rats_target_calendar_id';

function authorizeCalendar() {
  // Run once from the Apps Script editor to grant Calendar access.
  const calendar = CalendarApp.getDefaultCalendar();
  Logger.log('Authorized default calendar: ' + calendar.getName());
}

function doGet() {
  const props = PropertiesService.getScriptProperties();
  return json_({
    ok: true,
    service: 'rats-calendar-bridge',
    version: 5,
    calendarPaired: Boolean(props.getProperty(TARGET_CALENDAR_KEY))
  });
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const expected = PropertiesService.getScriptProperties().getProperty('WEBHOOK_SECRET');
    if (!expected || body.secret !== expected) {
      return json_({ok: false, error: 'unauthorized'});
    }
    const props = PropertiesService.getScriptProperties();

    if (body.action === 'pair-calendar') {
      return json_(pairCalendar_(props, body.marker));
    }

    const calendar = targetCalendar_(props);
    if (!calendar) {
      return json_({ok: false, error: 'calendar target is not paired'});
    }

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

function targetCalendar_(props) {
  const calendarId = String(props.getProperty(TARGET_CALENDAR_KEY) || '').trim();
  if (!calendarId) return null;
  try {
    return CalendarApp.getCalendarById(calendarId);
  } catch (_) {
    return null;
  }
}

function pairCalendar_(props, marker) {
  const token = String(marker || '').trim();
  if (!/^bw-pair-[a-z0-9-]{6,64}$/i.test(token)) {
    return {ok: false, action: 'pair-calendar', error: 'invalid pairing marker'};
  }

  const now = new Date();
  const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const end = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const matches = [];

  // Pairing must not depend on Calendar's full-text search index because a
  // newly created marker may not be searchable immediately. Scan the bounded
  // 21-day event window directly instead, checking the default Calendar first.
  const defaultCalendar = CalendarApp.getDefaultCalendar();
  const calendars = [defaultCalendar];
  const defaultId = defaultCalendar.getId();
  CalendarApp.getAllCalendars().forEach(calendar => {
    if (calendar.getId() !== defaultId) calendars.push(calendar);
  });

  calendars.forEach(calendar => {
    let events = [];
    try {
      events = calendar.getEvents(start, end);
    } catch (_) {
      return;
    }
    events.forEach(event => {
      const title = String(event.getTitle() || '');
      const description = String(event.getDescription() || '');
      if (title.indexOf(token) !== -1 || description.indexOf(token) !== -1) {
        matches.push({calendar: calendar, event: event});
      }
    });
  });

  if (matches.length === 0) {
    return {
      ok: false,
      action: 'pair-calendar',
      error: 'target calendar marker is not visible to the Apps Script account'
    };
  }
  if (matches.length !== 1) {
    return {
      ok: false,
      action: 'pair-calendar',
      error: 'target calendar marker is ambiguous'
    };
  }

  // Before switching targets, remove any BallerWatch events created in the
  // previous paired/default calendar. This prevents orphaned wrong-calendar events.
  const previousCalendar = targetCalendar_(props) || CalendarApp.getDefaultCalendar();
  const previousCleanup = purgeManagedEvents_(previousCalendar, props);
  if (!previousCleanup.ok) {
    return {
      ok: false,
      action: 'pair-calendar',
      error: previousCleanup.error || 'previous calendar cleanup failed'
    };
  }

  const match = matches[0];
  props.setProperty(TARGET_CALENDAR_KEY, match.calendar.getId());

  let markerDeleted = true;
  try {
    match.event.deleteEvent();
  } catch (err) {
    markerDeleted = isAlreadyDeletedEventError_(err);
  }

  return {
    ok: markerDeleted,
    action: 'pair-calendar',
    paired: true,
    markerDeleted: markerDeleted,
    previousDeleted: previousCleanup.deleted || 0,
    previousStale: previousCleanup.stale || 0,
    error: markerDeleted ? '' : 'paired calendar but marker cleanup failed'
  };
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
