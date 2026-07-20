import unittest

import app


class ManualCleaningIntegrityTests(unittest.TestCase):
    def normalize(self, rows):
        return app._pms_core_normalize_state(
            {
                "rooms": [
                    {"id": "room1", "name": "房间1", "cleaning_fee": 30},
                    {"id": "room9", "name": "房间H", "cleaning_fee": 25},
                ],
                "manualChanges": rows,
            }
        )["manualChanges"]

    def test_repairs_confirmed_room_h_mobile_record(self):
        row = self.normalize(
            [
                {
                    "id": "manual-mobile-error",
                    "date": "2026-07-20",
                    "target_id": "room1",
                    "target_type": "room",
                    "type": "add",
                    "amount": -25,
                    "reason": "租客续住，分成了两个订单",
                }
            ]
        )[0]
        self.assertEqual(row["target_id"], "room9")
        self.assertEqual(row["type"], "remove")
        self.assertEqual(row["amount"], -25)

    def test_normalizes_amount_sign_to_adjustment_type(self):
        added, removed = self.normalize(
            [
                {"id": "add", "target_id": "room1", "type": "add", "amount": -30},
                {"id": "remove", "target_id": "room9", "type": "remove", "amount": 25},
            ]
        )
        self.assertEqual(added["amount"], 30)
        self.assertEqual(removed["amount"], -25)


if __name__ == "__main__":
    unittest.main()
