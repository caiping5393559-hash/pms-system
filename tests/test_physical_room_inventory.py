import pathlib
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]


class PhysicalRoomInventoryTests(unittest.TestCase):
    def test_frontend_groups_duplicate_listing_rooms(self):
        source = (ROOT / "static" / "pms_app.js").read_text(encoding="utf-8")
        self.assertIn("function inferredInventoryGroupId(room)", source)
        self.assertIn("const match = compact.match(/^新(房间[0-9a-z]+)$/i)", source)
        self.assertIn("const byEntity = new Map()", source)
        self.assertIn("roomEntityMatchesPropertyScope", source)
        self.assertIn("物理房间库存", source)
        self.assertIn("同一物理房间的多个上架链接只占一个库存", source)

    def test_backend_accepts_inventory_group_field(self):
        source = (ROOT / "app.py").read_text(encoding="utf-8")
        room_fields = source.split("ROOM_FIELDS = [", 1)[1].split("]", 1)[0]
        self.assertIn('"inventory_group_id"', room_fields)


if __name__ == "__main__":
    unittest.main()
