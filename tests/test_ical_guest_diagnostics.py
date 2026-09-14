import unittest

import app


class IcalGuestDiagnosticsTests(unittest.TestCase):
    def test_reports_no_guest_count_for_standard_reserved_event(self):
        text = """BEGIN:VCALENDAR
BEGIN:VEVENT
UID:abc
DTSTART;VALUE=DATE:20260920
DTEND;VALUE=DATE:20260922
SUMMARY:Reserved
DESCRIPTION:Reservation URL: https://example.test/reservations/details/ABC123
END:VEVENT
END:VCALENDAR
"""
        result = app._pms_channel_guest_diagnostic(text, {"id": "one", "channel_note": "test"})
        self.assertEqual(1, result["event_count"])
        self.assertFalse(result["has_guest_count_signal"])
        self.assertEqual([], result["detected_counts"])

    def test_detects_guest_fields_and_description_counts_without_values(self):
        text = """BEGIN:VCALENDAR
BEGIN:VEVENT
UID:def
DTSTART;VALUE=DATE:20260924
DTEND;VALUE=DATE:20260926
SUMMARY:Reserved
X-GUEST-COUNT:3
DESCRIPTION:Guests: 3
END:VEVENT
END:VCALENDAR
"""
        result = app._pms_channel_guest_diagnostic(text, {"id": "two"})
        self.assertTrue(result["has_guest_count_signal"])
        self.assertEqual([3], result["detected_counts"])
        self.assertIn("X-GUEST-COUNT", result["explicit_guest_fields"])
        self.assertIn("DESCRIPTION", result["matched_text_fields"])


if __name__ == "__main__":
    unittest.main()
