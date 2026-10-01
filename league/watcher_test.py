import copy
import unittest
from unittest.mock import patch
from watcher import normalize, HEADERS

class ScheduleTests(unittest.TestCase):
    def setUp(self):
        self.team_names = ['Team Alpha', 'Team Beta']
        self.config_patch = patch('watcher.configured_teams', return_value=self.team_names)
        self.config_patch.start()
        self.addCleanup(self.config_patch.stop)
        self.aggregate = {'teams': [
            {'name': 'Team Alpha', 'day': 'Monday', 'gender': "Men's", 'division': '3 8v8', 'color_alt': 'Black'},
            {'name': 'Team Beta', 'day': 'Tuesday', 'gender': "Men's", 'division': '2c 8v8', 'color_alt': 'White'}],
            'events': [{'home_team_name': 'Team Alpha', 'away_team_name': 'Opponent',
                'location': 'Field', 'notes': 'Set up goals', 'start_date': '2026-10-05',
                'start_time': '19:15:00', 'home_color': 'White', 'away_color': 'White'}]}
        self.exports = {'Team Alpha': [HEADERS, ['game', '2026-10-05', '19:15:00', '', '', 'US/Pacific', 'Home', 'Opponent', 'Field', 'Black', 'White', 'Yes', 'Yes', 'Set up goals']],
            'Team Beta': [HEADERS, ['bye', '2026-10-06', '', '', '', 'US/Pacific', '', '', '', '', '', 'Yes', 'Yes', '']]}
    def test_exact_team_and_byes(self):
        out = normalize('fall-2026', self.aggregate, self.exports)
        self.assertEqual([t['publishedMatchCount'] for t in out['teams']], [1, 0])
    def test_home_alt_color(self):
        game = normalize('fall-2026', self.aggregate, self.exports)['teams'][0]['matches'][0]
        self.assertEqual(game['jerseyColor'], 'Black')
        self.assertEqual(game['opponentJerseyColor'], 'White')
    def test_estimated_end_and_timezone(self):
        game = normalize('fall-2026', self.aggregate, self.exports)['teams'][0]['matches'][0]
        self.assertEqual(game['start'], '2026-10-05T19:15:00-07:00')
        self.assertEqual(game['end'], '2026-10-05T20:15:00-07:00')
        self.assertTrue(game['endEstimated'])
    def test_published_end(self):
        self.exports['Team Alpha'][1][3:5] = ['2026-10-05', '21:00:00']
        g = normalize('fall-2026', self.aggregate, self.exports)['teams'][0]['matches'][0]
        self.assertFalse(g['endEstimated'])
        self.assertIn('21:00:00', g['end'])
    def test_dynamic_division_is_preserved(self):
        self.aggregate['teams'][0]['division'] = '2 8v8'
        out = normalize('fall-2026', self.aggregate, self.exports)
        self.assertEqual(out['teams'][0]['division'], "Monday Men's D-2 8v8")

    def test_day_is_discovered_from_rats(self):
        self.aggregate['teams'][0]['day'] = 'Wednesday'
        out = normalize('fall-2026', self.aggregate, self.exports)
        self.assertEqual(out['teams'][0]['day'], 'Wednesday')
        self.assertEqual(out['teams'][0]['division'], "Wednesday Men's D-3 8v8")

    def test_team_name_matching_ignores_case_and_spaces(self):
        self.aggregate['teams'][0]['name'] = '  TEAM ALPHA  '
        self.aggregate['events'][0]['home_team_name'] = '  TEAM ALPHA  '
        out = normalize('fall-2026', self.aggregate, self.exports)
        self.assertEqual(out['teams'][0]['name'], '  TEAM ALPHA  ')
        self.assertEqual(out['teams'][0]['matches'][0]['team'], '  TEAM ALPHA  ')

    def test_team_name_matching_collapses_internal_spaces(self):
        self.aggregate['teams'][1]['name'] = 'Team   Beta'
        out = normalize('fall-2026', self.aggregate, self.exports)
        self.assertEqual(out['teams'][1]['name'], 'Team   Beta')

    def test_source_mismatch_rejected(self):
        self.exports['Team Alpha'][1][8] = 'Another field'
        with self.assertRaises(ValueError): normalize('fall-2026', self.aggregate, self.exports)
    def test_schema_failure_rejected(self):
        with self.assertRaises(ValueError): normalize('fall-2026', {}, self.exports)
    def test_duplicate_rejected(self):
        self.aggregate['events'] *= 2
        with self.assertRaises(ValueError): normalize('fall-2026', self.aggregate, self.exports)
    def test_metadata_changes_fingerprint(self):
        before = normalize('fall-2026', self.aggregate, self.exports)['teams'][0]['matches'][0]
        self.aggregate['events'][0]['home_color'] = 'Blue'
        after = normalize('fall-2026', self.aggregate, self.exports)['teams'][0]['matches'][0]
        self.assertEqual(before['key'], after['key'])
        self.assertNotEqual(before['calendarFingerprint'], after['calendarFingerprint'])
    def test_dst(self):
        self.aggregate['events'][0]['start_date'] = '2026-11-02'
        self.exports['Team Alpha'][1][1] = '2026-11-02'
        game = normalize('fall-2026', self.aggregate, self.exports)['teams'][0]['matches'][0]
        self.assertTrue(game['start'].endswith('-08:00'))
if __name__ == '__main__': unittest.main()
