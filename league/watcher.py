"""Fetch and validate Seattle RATS schedules while preserving the last-good snapshot on failure.

v2.5.0 adds a smoke-test-only escape hatch for transient source outages; production behavior
remains fail-closed so reconciliation never accepts unverified league data.
"""
import hashlib
import json
import os
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

SEASONS = ('winter', 'spring', 'summer', 'fall')
SOURCE = 'https://seattlerats.org/standings'
API = 'https://service.rats.team.op-dev.io/'
TZ = ZoneInfo('America/Los_Angeles')
CALENDAR_TRACKING_KEY_VERSION = 'v2'
TEAM_CONFIG = Path('teams.json')
HEADERS = ['Event Type', 'Start Date', 'Start Time', 'End Date', 'End Time',
           'Timezone ID', 'Home or Away', 'Opponent/Event Title', 'Location Name',
           'Shirt Color', 'Opponent Shirt Color', 'Allow RSVPs', 'Send Reminders', 'Notes/Comments']

def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def season_label(season_id):
    name, year = season_id.split('-', 1)
    return f"{name.title()} {year}"


def season_candidates(now=None):
    now = now or datetime.now(TZ)
    # Probe newest plausible seasons first. Include next year so the watcher can
    # roll forward as soon as RATS publishes the next season for both teams.
    candidates = []
    for year in range(now.year + 1, now.year - 2, -1):
        for name in reversed(SEASONS):
            candidates.append(f"{name}-{year}")
    return candidates


def normalize_team_name(name):
    return ' '.join(str(name).strip().split()).casefold()


def configured_teams():
    data = json.loads(TEAM_CONFIG.read_text())
    teams = data.get('teams')
    if not isinstance(teams, list) or not teams or any(not isinstance(name, str) or not name.strip() for name in teams):
        raise ValueError('teams.json must contain a non-empty teams array of names')
    cleaned = [' '.join(name.strip().split()) for name in teams]
    normalized = [normalize_team_name(name) for name in cleaned]
    if len(set(normalized)) != len(normalized):
        raise ValueError('teams.json contains duplicate team names after normalization')
    return cleaned


def team_matches(aggregate, team_name):
    return [
        t for t in aggregate.get('teams', [])
        if normalize_team_name(t.get('name', '')) == normalize_team_name(team_name)
    ]


def event_score(event, side):
    explicit = [
        f'{side}_score', f'{side}Score',
        f'{side}_goals', f'{side}Goals',
        f'score_{side}', f'goals_{side}',
    ]
    for key in explicit:
        if key in event and event[key] not in (None, ''):
            return event[key]

    nested = event.get('score')
    if isinstance(nested, dict):
        for key in (side, f'{side}_score', f'{side}Score'):
            if key in nested and nested[key] not in (None, ''):
                return nested[key]

    for key, value in event.items():
        normalized = ''.join(ch.lower() for ch in str(key) if ch.isalnum())
        if side in normalized and ('score' in normalized or 'goal' in normalized) and value not in (None, ''):
            if isinstance(value, (str, int, float)) and not isinstance(value, bool):
                return value
    return None


def discover_latest_season(preferred=None):
    last_error = None
    candidates = []
    if isinstance(preferred, str) and preferred.strip():
        candidates.append(preferred.strip())
    candidates.extend(season for season in season_candidates() if season not in candidates)
    for season_id in candidates:
        try:
            aggregate = call('get-aggregate', {'season': season_id})
        except Exception as error:
            last_error = error
            continue
        if not isinstance(aggregate, dict):
            continue
        matched = [team_matches(aggregate, name) for name in configured_teams()]
        if all(len(items) == 1 for items in matched):
            return season_id, aggregate
    raise ValueError('No recent RATS season contains all configured teams') from last_error

def edge_signal_aggregate(preferred=None):
    """Use the just-fetched Cloudflare signal when it matches current monitored teams."""
    if str(os.environ.get('EXTERNAL_FALLBACK', '')).lower() == 'true':
        return None
    path = Path('state/edge-signal.json')
    if not path.exists():
        return None
    try:
        signal = json.loads(path.read_text())
    except Exception:
        return None
    season_id = str(signal.get('season') or '').strip()
    if preferred and season_id != preferred:
        return None
    aggregate = {'teams': signal.get('teams'), 'events': signal.get('events')}
    if not isinstance(aggregate['teams'], list) or not isinstance(aggregate['events'], list):
        return None
    matched = [team_matches(aggregate, name) for name in configured_teams()]
    if not all(len(items) == 1 and items[0].get('schedule_key') for items in matched):
        return None
    return season_id, aggregate


def call(action, params):
    for attempt in range(3):
        try:
            req = urllib.request.Request(API + action, data=json.dumps(params).encode(),
                headers={'Content-Type': 'application/json', 'User-Agent': 'rats-league-watcher/1.0'})
            with urllib.request.urlopen(req, timeout=30) as response:
                return json.load(response)
        except Exception:
            if attempt == 2:
                raise
            time.sleep(2 ** attempt)

def normalize(season_id, aggregate, exports):
    if not isinstance(aggregate, dict) or not isinstance(aggregate.get('teams'), list) or not isinstance(aggregate.get('events'), list):
        raise ValueError('Unrecognized aggregate schema')
    result = []
    for team_name in configured_teams():
        matches = team_matches(aggregate, team_name)
        if len(matches) != 1:
            raise ValueError('Configured team missing or ambiguous')
        team = matches[0]
        published_team_name = team.get('name') or team_name
        table = exports[team_name]
        if not isinstance(table, list) or not table or table[0] != HEADERS:
            raise ValueError('Unrecognized team export schema')
        export_games = [dict(zip(HEADERS, row)) for row in table[1:] if isinstance(row, list) and len(row) == len(HEADERS) and row[0].lower() != 'bye']
        if any(not isinstance(row, list) or len(row) != len(HEADERS) for row in table[1:]):
            raise ValueError('Malformed team export row')
        games = []
        for event in aggregate['events']:
            if not isinstance(event, dict):
                raise ValueError('Malformed event')
            event_home = event.get('home_team_name') or ''
            event_away = event.get('away_team_name') or ''
            if normalize_team_name(published_team_name) not in [normalize_team_name(event_home), normalize_team_name(event_away)]:
                continue
            home = normalize_team_name(event_home) == normalize_team_name(published_team_name)
            opponent = event.get('away_team_name' if home else 'home_team_name')
            date, clock = event.get('start_date'), event.get('start_time')
            if not opponent or not date:
                raise ValueError('Missing match identity/date')
            day = datetime.strptime(date, '%Y-%m-%d')
            season_year = int(season_id.rsplit('-', 1)[1])
            if day.year not in (season_year, season_year + 1):
                raise ValueError('Unexpected match year for selected season')
            rows = [r for r in export_games if r['Start Date'] == date and r['Opponent/Event Title'] == opponent and r['Home or Away'].lower() == ('home' if home else 'away')]
            if len(rows) != 1:
                raise ValueError('Aggregate/export match identity mismatch')
            row = rows[0]
            if clock != row['Start Time'] or (event.get('location') or '') != row['Location Name'] or (event.get('notes') or '') != row['Notes/Comments']:
                raise ValueError('Source changed during fetch; retry next refresh')
            division = f"{team.get('day')} {team.get('gender')} D-{team.get('division')}"
            division_teams = {t['name']: t for t in aggregate['teams'] if
                f"{t.get('day')} {t.get('gender')} D-{t.get('division')}" == division}
            home_color = event.get('home_color')
            if home_color == event.get('away_color'):
                home_color = division_teams.get(event['home_team_name'], {}).get('color_alt') or home_color
            own_color = home_color if home else event.get('away_color')
            other_color = event.get('away_color') if home else home_color
            start = datetime.fromisoformat(date + 'T' + clock).replace(tzinfo=TZ) if clock else None
            published_end = row['End Time'] or None
            end_date = row['End Date'] or date
            if published_end and start:
                end = datetime.fromisoformat(end_date + 'T' + published_end).replace(tzinfo=TZ)
                if end <= start:
                    raise ValueError('Invalid published end time')
            else:
                end = start + timedelta(hours=1) if start else None
            home_score = event_score(event, 'home')
            away_score = event_score(event, 'away')
            team_score = home_score if home else away_score
            opponent_score = away_score if home else home_score
            source_id = event.get('id') or event.get('event_id') or None
            identity = f"{season_id}|{division}|{normalize_team_name(published_team_name)}|{opponent}|{'home' if home else 'away'}|{date}"
            raw_key = str(source_id) if source_id else digest(identity)[:24]
            game = {'key': f'{CALENDAR_TRACKING_KEY_VERSION}:{raw_key}',
                'sourceMatchId': str(source_id) if source_id else None,
                'identityBasis': 'source-id' if source_id else 'team-opponent-side-date',
                'team': published_team_name, 'opponent': opponent, 'homeAway': 'home' if home else 'away',
                'date': date, 'startTime': clock or None, 'endTime': published_end,
                'start': start.isoformat() if start else None, 'end': end.isoformat() if end else None,
                'endEstimated': not bool(published_end), 'timezone': str(TZ),
                'location': event.get('location') or None, 'fieldNotes': event.get('notes') or None,
                'jerseyColor': own_color or None, 'opponentJerseyColor': other_color or None,
                'teamScore': team_score, 'opponentScore': opponent_score,
                'division': division, 'season': season_label(season_id), 'sourceUrl': SOURCE,
                'mapUrl': 'https://maps.google.com/?q=' + urllib.parse.quote(event.get('location') or '') if event.get('location') else None,
                'eventType': row['Event Type']}
            game['calendarFingerprint'] = digest(game)
            games.append(game)
        if len(games) != len(export_games):
            raise ValueError('Aggregate/export game count mismatch')
        if len({g['key'] for g in games}) != len(games):
            raise ValueError('Ambiguous duplicate match identities')
        games.sort(key=lambda g: (g['date'], g['startTime'] or '', g['key']))
        result.append({'name': published_team_name, 'day': team.get('day'), 'division': division,
            'publishedMatchCount': len(games), 'regularSeasonDiscoveryComplete': len(games) >= 10,
            'matches': games})
    return {'schemaVersion': 1, 'ok': True, 'season': season_label(season_id), 'seasonId': season_id,
            'timezone': str(TZ), 'sourceUrl': SOURCE, 'teams': result}

def write_json(path, value):
    text = json.dumps(value, indent=2, ensure_ascii=False) + '\n'
    path = Path(path)
    if path.exists() and path.read_text() == text:
        return
    path.with_suffix('.tmp').write_text(text)
    path.with_suffix('.tmp').replace(path)


def is_transient_source_error(error):
    current = error
    while current is not None:
        if isinstance(current, urllib.error.HTTPError) and current.code in (429, 502, 503, 504):
            return True
        if isinstance(current, (urllib.error.URLError, TimeoutError)):
            return True
        current = current.__cause__
    return False


def valid_previous_schedule(value):
    return (
        isinstance(value, dict)
        and value.get('ok') is True
        and isinstance(value.get('teams'), list)
    )


def main():
    now = datetime.now(TZ).isoformat()
    try:
        previous = json.loads(Path('schedule.json').read_text()) if Path('schedule.json').exists() else None
        preferred_season = previous.get('seasonId') if isinstance(previous, dict) else None
        edge = edge_signal_aggregate(preferred_season)
        if edge:
            season_id, aggregate = edge
            print('Using fresh Cloudflare RATS signal; skipped duplicate aggregate fetch.')
        else:
            season_id, aggregate = discover_latest_season(preferred_season)

        teams = configured_teams()
        schedule_keys = {}
        for team_name in teams:
            team = next(iter(team_matches(aggregate, team_name)), None)
            if not team or not team.get('schedule_key'):
                raise ValueError('Team schedule key missing')
            schedule_keys[team_name] = team['schedule_key']

        # Team exports are independent API calls. Fetch them concurrently so
        # two monitored teams cost roughly one network round-trip instead of two.
        exports = {}
        with ThreadPoolExecutor(max_workers=min(4, len(schedule_keys))) as pool:
            futures = {
                pool.submit(call, 'get-schedule', {'season': season_id, 'key': key}): team_name
                for team_name, key in schedule_keys.items()
            }
            for future in as_completed(futures):
                exports[futures[future]] = future.result()

        payload = normalize(season_id, aggregate, exports)

        score_updates = []
        if previous and previous.get('seasonId') == payload.get('seasonId'):
            old_matches = {
                match['key']: match
                for team in previous.get('teams', [])
                for match in team.get('matches', [])
            }
            for team in payload.get('teams', []):
                for match in team.get('matches', []):
                    old = old_matches.get(match['key'])
                    if not old:
                        continue
                    # Do not backfill historical scores merely because this code
                    # was first deployed. Notify only after the fields existed.
                    if 'teamScore' not in old and 'opponentScore' not in old:
                        continue
                    before = (old.get('teamScore'), old.get('opponentScore'))
                    after = (match.get('teamScore'), match.get('opponentScore'))
                    if before != after and after != (None, None):
                        score_updates.append({
                            'match': match,
                            'previousTeamScore': before[0],
                            'previousOpponentScore': before[1],
                        })
        write_json('score-changes.json', {'updates': score_updates})
        if previous and previous.get('seasonId') == payload.get('seasonId'):
            counts = {t['name']: t['publishedMatchCount'] for t in previous['teams']}
            if any(t['publishedMatchCount'] < counts.get(t['name'], 0) for t in payload['teams']):
                raise ValueError('Published match count shrank; preserve last good snapshot for review')
        payload['contentHash'] = digest(payload)
        payload['updatedAt'] = now
        today_date = datetime.fromisoformat(now).date().isoformat()
        today_games = [
            match
            for team in payload.get('teams', [])
            for match in team.get('matches', [])
            if match.get('date') == today_date
        ]
        write_json('today.json', {
            'schemaVersion': 1,
            'ok': True,
            'date': today_date,
            'timezone': str(TZ),
            'season': payload.get('season'),
            'seasonId': payload.get('seasonId'),
            'games': today_games,
            'updatedAt': now,
        })
        write_json('schedule.json', payload)
        print('Validated published match counts:', [t['publishedMatchCount'] for t in payload['teams']])
    except Exception as error:
        allow_transient = os.environ.get('SMOKE_ALLOW_TRANSIENT_SOURCE_FAILURE', '').lower() == 'true'
        if allow_transient and valid_previous_schedule(previous) and is_transient_source_error(error):
            print('::warning::RATS source temporarily unavailable; retained last good runtime schedule.')
            return
        raise RuntimeError('RATS refresh failed; retained last good KV snapshot') from error

if __name__ == '__main__':
    main()
