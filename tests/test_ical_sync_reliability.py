import os
import unittest
from datetime import datetime, timezone
from unittest import mock

import app


class IcalSyncReliabilityTests(unittest.TestCase):
    def tearDown(self):
        app._pms_ui_state_cache_clear()

    def test_stale_detection_uses_utc_last_sync(self):
        now = datetime(2026, 8, 22, 4, 30, tzinfo=timezone.utc)
        self.assertFalse(app._pms_ical_sync_is_stale({"last_sync": "2026-08-22T04:16:05"}, 1200, now=now))
        self.assertTrue(app._pms_ical_sync_is_stale({"last_sync": "2026-08-22T04:00:00"}, 1200, now=now))
        self.assertTrue(app._pms_ical_sync_is_stale({}, 1200, now=now))

    def test_scheduled_sync_reports_only_after_save(self):
        saved = {
            "last_sync": "2026-08-22T04:16:05",
            "sync_errors": [],
            "channelListings": [{"id": "one", "ical_url": "https://example.com/one.ics"}],
        }
        with mock.patch.object(app, "sync_icals", return_value=saved) as sync:
            result = app._pms_run_scheduled_ical_sync(wait_timeout=0)
        sync.assert_called_once_with()
        self.assertEqual("completed", result["status"])
        self.assertEqual("2026-08-22T04:16:05", result["last_sync"])
        self.assertEqual(1, result["channel_count"])

    def test_channel_error_fails_scheduled_sync(self):
        saved = {
            "last_sync": "2026-08-22T04:16:05",
            "sync_errors": [{"error": "iCal fetch HTTP 403"}],
            "channelListings": [{"id": "one", "ical_url": "https://example.com/one.ics"}],
        }
        with mock.patch.object(app, "sync_icals", return_value=saved):
            with self.assertRaisesRegex(RuntimeError, "1 channel error"):
                app._pms_run_scheduled_ical_sync(wait_timeout=0)

    def test_state_refresh_skips_when_calendar_is_fresh(self):
        state = {"last_sync": datetime.now(timezone.utc).isoformat(), "properties": [{"id": "property_default"}]}
        with mock.patch.object(app, "_pms_run_scheduled_ical_sync") as sync:
            returned = app._pms_refresh_stale_ical_state(state)
        self.assertIs(state, returned)
        sync.assert_not_called()


if __name__ == "__main__":
    unittest.main()
