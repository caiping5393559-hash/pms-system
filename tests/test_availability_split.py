import pathlib
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]


class AvailabilitySplitTests(unittest.TestCase):
    def test_stats_split_past_and_future_open_nights(self):
        source = (ROOT / "static" / "pms_app.js").read_text(encoding="utf-8")
        self.assertIn("day < currentDate && isOpenNight(day)", source)
        self.assertIn("day >= currentDate && isOpenNight(day)", source)
        self.assertIn("!orderDays.has(day) && !lockDays.has(day)", source)
        self.assertIn("owner.table.pastUnbookedNights", source)
        self.assertIn("owner.table.futureAvailableNights", source)
        self.assertNotIn("owner.table.availableNights", source)

    def test_release_identifier_is_consistent(self):
        app_source = (ROOT / "app.py").read_text(encoding="utf-8")
        marker = 'PMS_APP_VERSION = "'
        version = app_source.split(marker, 1)[1].split('"', 1)[0]
        self.assertIn(version, (ROOT / "pms_bootstrap.py").read_text(encoding="utf-8"))
        self.assertIn(version, (ROOT / "static" / "index.html").read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
