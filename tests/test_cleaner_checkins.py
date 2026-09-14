import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class CleanerCheckinTests(unittest.TestCase):
    def test_cleaner_has_separate_checkin_tab_and_towel_count(self):
        js = (ROOT / "static" / "pms_app.js").read_text(encoding="utf-8")
        self.assertIn("showTab('cleanerCheckins'", js)
        self.assertIn("今日退房", js)
        self.assertIn("今日入住", js)
        self.assertIn("准备 ${count} 条浴巾", js)


if __name__ == "__main__":
    unittest.main()
