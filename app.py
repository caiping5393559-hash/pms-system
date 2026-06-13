from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from datetime import datetime
import json
import urllib.parse
import urllib.request
import os

# =========================
# Firebase 初始化
# =========================
import firebase_admin
from firebase_admin import credentials, firestore

BASE = Path(__file__).resolve().parent

# firebase-key.json 必须在项目根目录
cred = credentials.Certificate(str(BASE / "firebase-key.json"))
firebase_admin.initialize_app(cred)
db = firestore.client()

# =========================
# PMS 核心
# =========================

class PMS:

    # -------- rooms --------
    @staticmethod
    def get_rooms():
        docs = db.collection("rooms").stream()
        return [{**d.to_dict(), "id": d.id} for d in docs]

    @staticmethod
    def add_room(data):
        db.collection("rooms").add(data)

    # -------- bookings --------
    @staticmethod
    def get_bookings():
        docs = db.collection("bookings").stream()
        return [{**d.to_dict(), "id": d.id} for d in docs]

    # -------- settings --------
    @staticmethod
    def get_settings():
        docs = db.collection("settings").stream()
        out = {}
        for d in docs:
            out.update(d.to_dict())
        return out

    # -------- iCal 同步 --------
    @staticmethod
    def sync_ical(room):
        urls = [
            room.get("airbnb_ical"),
            room.get("booking_ical"),
            room.get("vrbo_ical"),
            room.get("other_ical")
        ]

        for url in urls:
            if not url:
                continue

            try:
                data = urllib.request.urlopen(url, timeout=10).read().decode()

                db.collection("bookings").add({
                    "room_id": room.get("id"),
                    "raw": data[:2000],
                    "source": "ical",
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

        # 首页
        if path == "/":
            return self.text("PMS Firebase V2 RUNNING")

        # rooms
        if path == "/api/rooms":
            return self.json(PMS.get_rooms())

        # bookings
        if path == "/api/bookings":
            return self.json(PMS.get_bookings())

        # settings
        if path == "/api/settings":
            return self.json(PMS.get_settings())

        return self.text("404 NOT FOUND")

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length).decode())

        # add room
        if self.path == "/api/add_room":
            PMS.add_room(body)
            return self.json({"ok": True})

        # sync all iCal
        if self.path == "/api/sync":
            rooms = PMS.get_rooms()
            for r in rooms:
                PMS.sync_ical(r)
            return self.json({"ok": True})

        return self.json({"ok": False})

    # =========================
    # utils
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
# Render 启动
# =========================

PORT = int(os.environ.get("PORT", 10000))

if __name__ == "__main__":
    print("🔥 PMS Firebase FULL V2 STARTED")
    HTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
