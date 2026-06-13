from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path
import json
import os
import urllib.parse
import urllib.request
from datetime import datetime

# =========================
# Firebase（必须）
# =========================
import firebase_admin
from firebase_admin import credentials, firestore

BASE = Path(__file__).resolve().parent

# ⚠️ Render必须放这个文件（你已上传）
cred = credentials.Certificate(str(BASE / "firebase-key.json"))
firebase_admin.initialize_app(cred)
db = firestore.client()

# =========================
# 登录系统
# =========================
USERS = {
    "admin": {"password": "admin123", "role": "admin"},
    "cleaner": {"password": "cleaner123", "role": "cleaner"}
}

# =========================
# PMS核心
# =========================
class PMS:

    # 房间
    @staticmethod
    def rooms():
        docs = db.collection("rooms").stream()
        return [{**d.to_dict(), "id": d.id} for d in docs]

    # bookings
    @staticmethod
    def bookings():
        docs = db.collection("bookings").stream()
        return [{**d.to_dict(), "id": d.id} for d in docs]

    # settings
    @staticmethod
    def settings():
        docs = db.collection("settings").stream()
        out = {}
        for d in docs:
            out.update(d.to_dict())
        return out

    # 添加房间
    @staticmethod
    def add_room(data):
        db.collection("rooms").add(data)

    # iCal同步（简化版）
    @staticmethod
    def sync_ical(room):
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
                    "time": str(datetime.now())
                })
            except Exception as e:
                print("ICAL ERROR:", e)

# =========================
# HTTP Server
# =========================
class Handler(BaseHTTPRequestHandler):

    # -------------------------
    # 登录验证
    # -------------------------
    def auth(self):
        q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        u = q.get("user", [""])[0]
        p = q.get("pass", [""])[0]

        user = USERS.get(u)
        if user and user["password"] == p:
            return user["role"]
        return None

    # -------------------------
    # GET
    # -------------------------
    def do_GET(self):

        path = urllib.parse.urlparse(self.path).path
        role = self.auth()

        # 登录页
        if path == "/login":
            return self.html("""
                <h2>PMS Login</h2>
                <p>admin / admin123</p>
                <p>cleaner / cleaner123</p>
            """)

        # 管理员UI
        if path == "/owner":
            if role != "admin":
                return self.html("ADMIN ONLY")

            return self.html("""
                <h1>PMS ADMIN PANEL</h1>
                <button onclick="fetch('/api/sync?user=admin&pass=admin123',{method:'POST'})">
                    Sync iCal
                </button>
            """)

        # 保洁
        if path == "/cleaner":
            if role not in ["cleaner", "admin"]:
                return self.html("CLEANER ONLY")

            return self.html("<h1>Cleaner Dashboard</h1>")

        # API - rooms
        if path == "/api/rooms":
            return self.json(PMS.rooms())

        # API - bookings
        if path == "/api/bookings":
            return self.json(PMS.bookings())

        return self.html("PMS RUNNING")

    # -------------------------
    # POST
    # -------------------------
    def do_POST(self):

        path = urllib.parse.urlparse(self.path).path

        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length)
        data = json.loads(body.decode() or "{}")

        # add room
        if path == "/api/add_room":
            PMS.add_room(data)
            return self.json({"ok": True})

        # sync iCal
        if path == "/api/sync":
            rooms = PMS.rooms()
            for r in rooms:
                PMS.sync_ical(r)
            return self.json({"ok": True})

        return self.json({"ok": False})

    # -------------------------
    # utils
    # -------------------------
    def html(self, t):
        self.send_response(200)
        self.send_header("Content-Type", "text/html")
        self.end_headers()
        self.wfile.write(t.encode())

    def json(self, d):
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(d).encode())

# =========================
# 启动
# =========================
PORT = int(os.environ.get("PORT", 10000))

if __name__ == "__main__":
    print("🏨 PMS PRO SYSTEM STARTED")
    HTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
