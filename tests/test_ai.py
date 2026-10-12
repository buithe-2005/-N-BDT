"""
Kiểm thử đơn vị cho module AI tư vấn giày (ai-service/app.py)
"""
import unittest
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "ai-service"))

from app import parse_slots, parse_money, merge_slots, score, policy_answer


class TestAIService(unittest.TestCase):
    def test_parse_slots_purpose(self):
        s = parse_slots("Tìm giày chạy bộ cho nam")
        self.assertEqual(s.get("purpose"), "Chạy bộ")
        self.assertEqual(s.get("gender"), "nam")

        s2 = parse_slots("Giày bóng rổ cổ cao")
        self.assertEqual(s2.get("purpose"), "Bóng rổ")

        s3 = parse_slots("Giày đi bộ thoải mái êm chân")
        self.assertEqual(s3.get("purpose"), "Đi bộ")

    def test_parse_money(self):
        # Dưới 2.5 triệu
        res = parse_money("giá dưới 2.5 triệu")
        self.assertIsNotNone(res)
        self.assertEqual(res[0], 2500000)
        self.assertEqual(res[1], "max")

        # Tầm 2tr
        res2 = parse_money("ngân sách tầm 2tr")
        self.assertIsNotNone(res2)
        self.assertEqual(res2[0], 2000000)
        self.assertEqual(res2[1], "around")

        # Dưới 1500k
        res3 = parse_money("dưới 1500k")
        self.assertIsNotNone(res3)
        self.assertEqual(res3[0], 1500000)
        self.assertEqual(res3[1], "max")

    def test_parse_size(self):
        s = parse_slots("Mình đi size 42")
        self.assertEqual(s.get("size"), 42.0)

        s2 = parse_slots("có sz 39.5 không")
        self.assertEqual(s2.get("size"), 39.5)

    def test_merge_slots_multiturn(self):
        history = [
            {"role": "user", "content": "Tìm giày chạy bộ"},
            {"role": "assistant", "content": "Gợi ý..."},
        ]
        message = "Ngân sách dưới 2.5 triệu, size 41"
        merged = merge_slots(history, message)
        self.assertEqual(merged.get("purpose"), "Chạy bộ")
        self.assertEqual(merged.get("budget"), 2500000)
        self.assertEqual(merged.get("size"), 41.0)

    def test_scoring_strict_purpose(self):
        mock_product_run = {
            "name": "Velo Run",
            "category": "Chạy bộ",
            "gender": "unisex",
            "effectivePrice": 2290000,
            "colors": ["Trắng"],
            "inStock": True,
            "variants": [{"size": 41, "stock": 5}],
        }
        mock_product_hike = {
            "name": "Trail Ridge",
            "category": "Dã ngoại",
            "gender": "nam",
            "effectivePrice": 2390000,
            "colors": ["Đen"],
            "inStock": True,
            "variants": [{"size": 41, "stock": 5}],
        }

        # Tìm chạy bộ
        slots = {"purpose": "Chạy bộ", "size": 41.0, "budget": 2500000, "budget_kind": "max"}
        res_run = score(mock_product_run, slots)
        self.assertIsNotNone(res_run)
        self.assertGreater(res_run[0], 0)

        res_hike = score(mock_product_hike, slots)
        self.assertIsNone(res_hike, "Sản phẩm không thuộc danh mục chạy bộ phải bị loại")

    def test_policy_qa(self):
        catalog = {
            "shipping": {"fee": 30000, "freeThreshold": 2000000},
            "coupons": [{"code": "WELCOME10", "percent": 10, "min_order": 1000000}],
        }
        ans = policy_answer("Phí ship tính thế nào?", catalog)
        self.assertIsNotNone(ans)
        self.assertIn("30.000đ", ans)
        self.assertIn("2.000.000đ", ans)

        ans_coupon = policy_answer("Có mã giảm giá không?", catalog)
        self.assertIsNotNone(ans_coupon)
        self.assertIn("WELCOME10", ans_coupon)


if __name__ == "__main__":
    unittest.main()
