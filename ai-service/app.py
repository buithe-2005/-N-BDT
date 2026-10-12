"""
Dịch vụ AI tư vấn giày (Python, chỉ dùng thư viện chuẩn).

Vai trò:
  - Hiểu yêu cầu tiếng Việt (mục đích, ngân sách, size, màu, giới tính).
  - Lấy danh mục SẢN PHẨM THẬT từ backend Node qua kênh nội bộ có khóa.
  - Lọc theo tồn kho, xếp hạng và trả về danh sách mã sản phẩm + lời tư vấn.

Dịch vụ KHÔNG gọi mô hình ngôn ngữ bên ngoài và không cần API key: đây là bộ tư vấn
dựa trên luật + chấm điểm. Backend Node sẽ kiểm chứng lại mọi sản phẩm trước khi hiển thị.
"""
import json
import os
import re
import sys
import unicodedata
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# Console Windows mặc định không phải UTF-8: ép UTF-8 để in tiếng Việt không lỗi.
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:  # noqa: BLE001
        pass

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))


def load_env():
    path = os.path.join(ROOT, ".env")
    if not os.path.exists(path):
        return
    with open(path, encoding="utf-8") as f:
        for raw in f:
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip("\"'"))


load_env()
BACKEND_URL = os.environ.get("BACKEND_URL", "http://127.0.0.1:" + os.environ.get("PORT", "3000"))
INTERNAL_TOKEN = os.environ.get("INTERNAL_TOKEN", "dev-internal-token-change-me")
AI_PORT = int(os.environ.get("AI_PORT", "8001"))


def norm(text):
    text = unicodedata.normalize("NFD", str(text).lower())
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    return text.replace("đ", "d")


# --------------------------------------------------------------------------- NLU
PURPOSES = {
    "Chạy bộ": ["chay bo", "chay", "running", "marathon", "tap gym", "tap luyen", "the thao"],
    "Bóng rổ": ["bong ro", "basketball", "choi bong"],
    "Đi bộ": ["di bo", "di lam", "van phong", "di ca ngay", "dung nhieu", "em chan", "thoai mai"],
    "Dã ngoại": ["da ngoai", "trail", "leo nui", "duong mon", "trekking", "di phuot", "duong dai"],
    "Lifestyle": ["di hoc", "dao pho", "thoi trang", "street", "phoi do", "hang ngay", "sneaker"],
}
COLORS = {
    "Đen": ["den", "black"], "Trắng": ["trang", "white"], "Xám": ["xam", "ghi", "gray", "grey"],
    "Hồng": ["hong", "pink"], "Xanh dương": ["xanh duong", "xanh", "blue"], "Đỏ": ["do ", "red"],
}
GENDERS = {"nam": ["nam", "men", "dan ong", "con trai"], "nu": ["nu", "women", "phu nu", "con gai", "chi em"]}


def parse_money(text):
    """Trả về (giá_trị, kiểu) với kiểu 'max' | 'around' | None."""
    t = norm(text)
    best = None
    for m in re.finditer(r"(duoi|toi da|khong qua|nho hon|khoang|tam|xap xi)?\s*(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)\s*(trieu|tr|m|k|nghin|ngan|d|dong|vnd)?", t):
        prefix, num, unit = m.group(1), m.group(2), m.group(3)
        raw = num
        if unit in ("trieu", "tr", "m"):
            val = float(raw.replace(",", ".")) * 1_000_000
        elif unit in ("k", "nghin", "ngan"):
            val = float(raw.replace(",", ".")) * 1_000
        else:
            digits = re.sub(r"[.,]", "", raw)
            val = float(digits)
            if val < 10_000:  # số trần nhỏ (vd. size 42) không phải tiền
                continue
        if val < 100_000:
            continue
        kind = "max" if prefix in ("duoi", "toi da", "khong qua", "nho hon") else "around"
        best = (int(val), kind)
    return best


def parse_slots(text):
    t = " " + norm(text) + " "
    slots = {}
    for label, keys in PURPOSES.items():
        if any((" " + k + " ") in t or k in t for k in keys):
            slots["purpose"] = label
            break
    for label, keys in COLORS.items():
        if any((" " + k.strip() + " ") in t for k in keys):
            slots["color"] = label
            break
    for g, keys in GENDERS.items():
        if any((" " + k + " ") in t for k in keys):
            slots["gender"] = g
            break
    m = re.search(r"(?:size|co|sz)\s*(\d{2}(?:[.,]5)?)", t)
    if m:
        slots["size"] = float(m.group(1).replace(",", "."))
    money = parse_money(text)
    if money:
        slots["budget"], slots["budget_kind"] = money
    return slots


def merge_slots(history, message):
    """Gộp thông tin từ các lượt hỏi trước của người dùng; lượt mới ghi đè."""
    slots = {}
    for h in history:
        if h.get("role") == "user":
            slots.update(parse_slots(h.get("content", "")))
    slots.update(parse_slots(message))
    return slots


# --------------------------------------------------------------------------- Catalog
def fetch_catalog():
    req = urllib.request.Request(BACKEND_URL + "/api/internal/catalog", headers={"X-Internal-Token": INTERNAL_TOKEN})
    with urllib.request.urlopen(req, timeout=5) as r:
        return json.loads(r.read().decode("utf-8"))


def fmt_vnd(n):
    return f"{int(n):,}".replace(",", ".") + "đ"


def score(product, slots):
    """Chấm điểm sản phẩm; trả về (điểm, danh sách lý do) hoặc None nếu loại."""
    if not product.get("inStock"):
        return None
    reasons, pts = [], 0.0
    size = slots.get("size")
    if size is not None:
        if not any(v["size"] == size and v["stock"] > 0 for v in product["variants"]):
            return None
        reasons.append(f"còn size {int(size) if size == int(size) else size}")
        pts += 2
    g = slots.get("gender")
    if g:
        if product["gender"] == g:
            pts += 2
            reasons.append("đúng nhu cầu " + ("nam" if g == "nam" else "nữ"))
        elif product["gender"] == "unisex":
            pts += 1
            reasons.append("kiểu unisex")
        else:
            return None
    p = slots.get("purpose")
    if p:
        if product["category"] == p:
            pts += 4
            reasons.append("phù hợp " + p.lower())
        else:
            return None
    c = slots.get("color")
    if c:
        if c in product["colors"]:
            pts += 2
            reasons.append("màu " + c.lower())
        else:
            pts -= 0.5
    b = slots.get("budget")
    price = product["effectivePrice"]
    if b:
        kind = slots.get("budget_kind")
        if price <= b:
            pts += 2 if kind == "max" else max(0.5, 2 - abs(b - price) / b * 3)
            reasons.append(f"giá {fmt_vnd(price)} trong ngân sách")
        elif kind == "max":
            return None
        elif price <= b * 1.15:
            pts += 0.3
            reasons.append(f"giá {fmt_vnd(price)}, nhỉnh hơn ngân sách một chút")
        else:
            return None
    if product.get("salePrice"):
        pts += 0.3
    return pts, reasons


POLICY_TRIGGERS = ["van chuyen", "ship", "giao hang", "phi giao", "mien phi", "doi tra", "bao hanh", "hoan tien", "khuyen mai", "giam gia", "ma giam", "voucher", "coupon", "thanh toan"]


def policy_answer(message, catalog):
    t = norm(message)
    if not any(k in t for k in POLICY_TRIGGERS):
        return None
    parts = []
    ship = catalog.get("shipping") or {}
    if any(k in t for k in ["van chuyen", "ship", "giao hang", "phi giao", "mien phi"]):
        parts.append(f"Phí giao hàng hiện tại là {fmt_vnd(ship.get('fee', 0))}; đơn từ {fmt_vnd(ship.get('freeThreshold', 0))} (sau giảm giá) được miễn phí giao hàng.")
    if any(k in t for k in ["khuyen mai", "giam gia", "ma giam", "voucher", "coupon"]):
        cps = catalog.get("coupons") or []
        if cps:
            parts.append("Mã đang áp dụng: " + "; ".join(f"{c['code']} giảm {c['percent']}% cho đơn từ {fmt_vnd(c['min_order'])}" for c in cps) + ".")
        else:
            parts.append("Hiện chưa có mã giảm giá công khai.")
    if any(k in t for k in ["doi tra", "bao hanh", "hoan tien"]):
        parts.append("Mình chưa có nội dung chính sách đổi trả/bảo hành đã được cửa hàng xác nhận nên không dám trả lời sai. Bạn vui lòng liên hệ cửa hàng để được hỗ trợ.")
    if "thanh toan" in t:
        parts.append("Hiện có hai hình thức: thanh toán khi nhận hàng (COD) hoặc chuyển khoản (cửa hàng xác nhận thủ công sau khi nhận được tiền).")
    return " ".join(parts) if parts else None


GREETINGS = ["xin chao", "chao", "hello", "hi ", "alo"]


def chat(message, history):
    catalog = fetch_catalog()
    policy = policy_answer(message, catalog)
    if policy:
        return {"reply": policy, "productIds": []}

    slots = merge_slots(history, message)
    useful = [k for k in ("purpose", "budget", "size", "color", "gender") if k in slots]
    t = norm(message).strip()
    if not useful:
        if any(t.startswith(g.strip()) for g in GREETINGS) or len(t) < 4:
            reply = "Chào bạn! Mình có thể gợi ý giày từ danh mục đang bán. Bạn dự định dùng giày để làm gì (chạy bộ, đi làm, bóng rổ, dã ngoại…), ngân sách khoảng bao nhiêu và size mấy?"
        else:
            reply = "Mình chưa xác định được nhu cầu của bạn. Bạn cho mình biết mục đích sử dụng (chạy bộ, bóng rổ, đi bộ, dã ngoại, thời trang), ngân sách và size nhé?"
        return {"reply": reply, "productIds": []}

    scored = []
    for p in catalog["products"]:
        r = score(p, slots)
        if r:
            scored.append((r[0], r[1], p))
    scored.sort(key=lambda x: (-x[0], x[2]["effectivePrice"]))
    top = scored[:3]

    if not top:
        reply = "Rất tiếc, mình không tìm thấy sản phẩm đang còn hàng khớp với yêu cầu hiện tại"
        hints = []
        if "budget" in slots: hints.append("tăng ngân sách")
        if "size" in slots: hints.append("thử size khác")
        if "color" in slots or "purpose" in slots: hints.append("đổi màu hoặc mục đích sử dụng")
        reply += ". Bạn có thể " + ", ".join(hints) + " để mình tìm lại." if hints else "."
        return {"reply": reply, "productIds": []}

    lines = [f"Mình gợi ý {len(top)} mẫu đang còn hàng phù hợp với bạn:"]
    for _, reasons, p in top:
        lines.append(f"• {p['name']} – {fmt_vnd(p['effectivePrice'])}" + (f" ({', '.join(reasons[:3])})" if reasons else ""))
    missing = []
    if "purpose" not in slots: missing.append("mục đích sử dụng")
    if "budget" not in slots: missing.append("ngân sách")
    if "size" not in slots: missing.append("size")
    if missing:
        lines.append("Nếu bạn cho mình biết thêm " + ", ".join(missing) + ", mình sẽ lọc chính xác hơn.")
    return {"reply": "\n".join(lines), "productIds": [p["id"] for _, _, p in top]}


class Handler(BaseHTTPRequestHandler):
    def _send(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/health":
            return self._send(200, {"ok": True})
        self._send(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/chat":
            return self._send(404, {"error": "not found"})
        try:
            length = int(self.headers.get("Content-Length", "0"))
            data = json.loads(self.rfile.read(length).decode("utf-8")) if length else {}
            message = str(data.get("message", ""))[:500]
            history = data.get("history") if isinstance(data.get("history"), list) else []
            self._send(200, chat(message, history))
        except Exception as exc:  # noqa: BLE001
            sys.stderr.write(f"[ai-service] error: {exc!r}\n")
            self._send(502, {"error": "ai_failure"})

    def log_message(self, fmt, *args):
        sys.stderr.write("[ai-service] " + (fmt % args) + "\n")


if __name__ == "__main__":
    srv = ThreadingHTTPServer(("127.0.0.1", AI_PORT), Handler)
    print(f"AI service chạy tại http://127.0.0.1:{AI_PORT} (backend: {BACKEND_URL})")
    srv.serve_forever()
