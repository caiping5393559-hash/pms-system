from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path
import json
import os
import urllib.parse
import urllib.request
from datetime import datetime

# =========================
# Firebase
# =========================
import firebase_admin
from firebase_admin import credentials, firestore

BASE = Path(__file__).resolve().parent

cred = credentials.Certificate(str(BASE / "firebase-key.json"))
firebase_admin.initialize_app(cred)
db = firestore.client()

# =========================
# PMS 核心数据操作
# =========================

class PMS:

    # ---------------- rooms ----------------
    @staticmethod
    def get_rooms():
        docs = db.collection("rooms").stream()
        return [{**d.to_dict(), "id": d.id} for d in docs]

    @staticmethod
    def save_rooms(data):
        for r in data.get("rooms", []):
            if "id" in r:
                db.collection("rooms").document(r["id"]).set(r)

    # ---------------- bookings ----------------
    @staticmethod
    def get_bookings():
        docs = db.collection("bookings").stream()
        return [{**d.to_dict(), "id": d.id} for d in docs]

    # ---------------- settings ----------------
    @staticmethod
    def get_settings():
        docs = db.collection("settings").stream()
        out = {}
        for d in docs:
            out.update(d.to_dict())
        return out

    # ---------------- iCal 同步（关键功能） ----------------
    @staticmethod
    def sync_ical():
        rooms = PMS.get_rooms()

        for room in rooms:
            urls = [
                room.get("airbnb_ical"),
                room.get("booking_ical"),
                room.get("vrbo_ical")
            ]

            for url in urls:
                if not url:
                    continue

                try:
                    raw = urllib.request.urlopen(url, timeout=10).read().decode()

                    db.collection("bookings").add({
                        "room_id": room.get("id"),
                        "source": "ical",
                        "data": raw[:2000],
                        "created_at": str(datetime.now())
                    })

                except Exception as e:
                    print("ICAL ERROR:", e)


# =========================
# HTTP SERVER
# =========================

class Handler(BaseHTTPRequestHandler):

    def do_GET(self):
        path = urllib.parse.urlparse(self.path).path

        # PMS首页
        if path == "/":
            return self.text("PMS V8 RUNNING (FIXED API)")

        # rooms
        if path == "/api/rooms":
            return self.json(PMS.get_rooms())

        # bookings
        if path == "/api/bookings":
            return self.json(PMS.get_bookings())

        # settings
        if path == "/api/settings":
            return self.json(PMS.get_settings())

        return self.text("NOT FOUND")

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length)
        data = json.loads(body.decode() or "{}")

        # =========================
        # 保存房间（解决 save state failed）
        # =========================
        if self.path == "/api/state":
            PMS.save_rooms(data)
            return self.json({"ok": True})

        # =========================
        # 手动同步 iCal
        # =========================
        if self.path == "/api/sync":
            PMS.sync_ical()
            return self.json({"ok": True})

        return self.json({"ok": False})

    # =========================
    # tools
    # =========================
    def json(self, data):
        raw = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(raw)

    def text(self, t):
        self.send_response(200)
        self.end_headers()
        self.wfile.write(t.encode())


# =========================
# 启动
# =========================

PORT = int(os.environ.get("PORT", 10000))

if __name__ == "__main__":
    print("🔥 PMS FIXED API STARTED")
    HTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
