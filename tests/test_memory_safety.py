import os
import threading
import time
import unittest
from unittest import mock

import app


class MemorySafetyTests(unittest.TestCase):
    def tearDown(self):
        app._pms_ui_state_cache_clear()

    def test_disabled_ui_cache_does_not_retain_state_copy(self):
        state = app.default_state()
        state["properties"] = [{"id": "property_a", "name": "A"}]
        with mock.patch.dict(os.environ, {"PMS_STATE_UI_CACHE_SECONDS": "0"}):
            app._pms_ui_state_cache_store(state)
        self.assertIsNone(app._PMS_UI_STATE_CACHE["state"])

    def test_feed_cache_is_not_persisted(self):
        state = app.default_state()
        state["icalFeedCache"] = [{"feed_id": "room1", "ics": "large" * 1000}]
        refreshed = app._pms_channel_refresh_feed_cache(state)
        self.assertEqual([], refreshed["icalFeedCache"])

    def test_ical_history_keeps_only_compact_summaries(self):
        state = app.default_state()
        state["rooms"] = [{"id": "room1", "property_id": "property1", "name": "Room 1"}]
        state["icalSyncHistory"] = [{"id": str(index)} for index in range(45)]
        listing = {"id": "channel1", "room_id": "room1", "platform": "Airbnb", "ical_url": "https://example.com/feed.ics"}
        app._pms_channel_append_ical_history(
            state,
            listing,
            "2026-08-11T00:00:00",
            "ok",
            events=[{"booking_type": "booking"}, {"booking_type": "lock", "is_locked": True}],
        )
        self.assertEqual(40, len(state["icalSyncHistory"]))
        latest = state["icalSyncHistory"][-1]
        self.assertEqual(2, latest["event_count"])
        self.assertEqual(1, latest["booking_count"])
        self.assertEqual(1, latest["lock_count"])
        self.assertNotIn("events", latest)

    def test_manual_sync_rejects_duplicate_background_job(self):
        started = threading.Event()
        release = threading.Event()
        original = app.sync_icals

        def fake_sync(**_kwargs):
            started.set()
            release.wait(2)
            return {}

        app.sync_icals = fake_sync
        try:
            self.assertEqual("queued", app._pms_queue_manual_ical_sync(room_id="room1"))
            self.assertTrue(started.wait(1))
            self.assertEqual("already_running", app._pms_queue_manual_ical_sync(room_id="room1"))
        finally:
            release.set()
            app.sync_icals = original
            deadline = time.time() + 2
            while app._pms_ical_sync_lock.locked() and time.time() < deadline:
                time.sleep(0.01)


if __name__ == "__main__":
    unittest.main()
