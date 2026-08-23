import pathlib
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]


class ChannelCalendarLabelTests(unittest.TestCase):
    def test_calendar_uses_channel_notes_and_stable_colors(self):
        source = (ROOT / "static" / "pms_app.js").read_text(encoding="utf-8")
        self.assertIn("const BOOKING_CHANNEL_TONES", source)
        self.assertIn("function bookingChannelText(b)", source)
        self.assertIn("channel.channel_note", source)
        self.assertIn("bookingCellStyle(checkout,'checkout')", source)
        self.assertIn("bookingCellStyle(checkin,'checkin')", source)
        self.assertIn("split-channel-label checkout", source)
        self.assertIn("split-channel-label checkin", source)
        self.assertIn("备注（显示在日历）", source)


if __name__ == "__main__":
    unittest.main()
