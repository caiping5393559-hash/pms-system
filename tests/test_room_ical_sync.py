import unittest

import app


class RoomIcalSyncScopeTests(unittest.TestCase):
    def test_live_booking_replaces_same_archived_copy(self):
        archived = {
            "id": "ical_archived_old",
            "room_id": "room1",
            "channel_listing_id": "channel1",
            "checkin": "2026-08-08",
            "checkout": "2026-08-09",
            "source": "ical",
            "booking_type": "booking",
            "restored_from_archive": True,
        }
        live = dict(archived, id="ical_live", restored_from_archive=False)
        rows = app._pms_channel_dedupe_bookings([archived, live])
        self.assertEqual(1, len(rows))
        self.assertEqual("ical_live", rows[0]["id"])

    def setUp(self):
        self.state = {
            "rooms": [
                {"id": "room_1", "property_id": "property_a"},
                {"id": "room_2", "property_id": "property_a"},
                {"id": "room_3", "property_id": "property_b"},
            ]
        }

    def test_property_sync_returns_all_property_rooms(self):
        self.assertEqual(
            app._pms_channel_sync_room_ids(self.state, {"property_a"}),
            {"room_1", "room_2"},
        )

    def test_room_sync_returns_only_requested_room(self):
        self.assertEqual(
            app._pms_channel_sync_room_ids(self.state, {"property_a"}, "room_2"),
            {"room_2"},
        )

    def test_room_sync_rejects_room_outside_allowed_property(self):
        with self.assertRaisesRegex(RuntimeError, "room permission required"):
            app._pms_channel_sync_room_ids(self.state, {"property_a"}, "room_3")


if __name__ == "__main__":
    unittest.main()
