import unittest
from unittest import mock

import app


class ChannelActionTests(unittest.TestCase):
    def setUp(self):
        self.state = app.normalize_state({
            "properties": [{"id": "property_a", "group_id": "group_a", "name": "A"}],
            "rooms": [{"id": "room_1", "property_id": "property_a", "name": "Room 1"}],
            "channelListings": [{"id": "channel_1", "room_id": "room_1", "platform": "Airbnb", "ical_url": "https://example.com/a.ics"}],
            "bookings": [{"id": "booking_1", "room_id": "room_1", "channel_listing_id": "channel_1", "source": "ical", "checkin": "2026-07-27", "checkout": "2026-07-28"}],
            "sync_errors": [{"room_id": "room_1", "channel_listing_id": "channel_1", "error": "old"}],
            "icalEventArchive": [{"id": "archive_1", "room_id": "room_1", "channel_listing_id": "channel_1", "active": True}],
        })
        self.actor = {"id": "owner_1", "role": "owner", "group_ids": ["group_a"]}

    def test_delete_channel_removes_related_rows(self):
        saved = {}

        def save_state(value):
            saved.clear()
            saved.update(value)
            return value

        with mock.patch.object(app, "load_state", return_value=self.state), mock.patch.object(app, "save_state", side_effect=save_state):
            result, deleted = app.delete_channel_listing("channel_1", actor=self.actor)

        self.assertTrue(deleted)
        self.assertFalse(any(row.get("id") == "channel_1" for row in result["channelListings"]))
        self.assertFalse(any(row.get("channel_listing_id") == "channel_1" for row in result["bookings"]))
        self.assertFalse(any(row.get("channel_listing_id") == "channel_1" for row in result["sync_errors"]))
        archive = next(row for row in result["icalEventArchive"] if row.get("id") == "archive_1")
        self.assertFalse(archive["active"])
        self.assertEqual(archive["last_sync_status"], "channel_deleted")

    def test_delete_unknown_channel_is_idempotent(self):
        with mock.patch.object(app, "load_state", return_value=self.state):
            result, deleted = app.delete_channel_listing("missing", actor=self.actor)
        self.assertFalse(deleted)
        self.assertEqual(result["channelListings"], self.state["channelListings"])


if __name__ == "__main__":
    unittest.main()
