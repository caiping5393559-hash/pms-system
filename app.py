from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path
import json
import os
import urllib.request
import urllib.parse

# ======================
# 路径
# ======================
BASE = Path(__file__).resolve().parent
STATIC = BASE / "static"
DATA = BASE / "data"
STATE_PATH = DATA / "state.json"

# ======================
# 数据加载
# ======================
def load_state():
    if STATE_PATH.exists():
        return json.loads(STATE_PATH.read_text(encoding="utf-8"))
    return {"rooms": [], "bookings": []}

def save_state(state):
    DATA.mkdir(exist_ok=True)
    STATE_PATH.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")

# ======================
# iCal 同步（稳定版）
# ======================
def sync_ical(state):
    rooms = state.get("rooms", [])

    for room in rooms:
        room_id = room.get("id")

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

                if "bookings" not in state:
                    state["bookings"] = []

                state["bookings"].append({
                    "room_id": room_id,
                    "source": "ical",
                    "data": data[:1000]
                })

            except Exception as e:
                print("ICAL ERROR:", e)

    return state

# ======================
# HTTP服务
# ======================
class Handler(BaseHTTPRequestHandler):

    def do_GET(self):
        path = urllib.parse.urlparse(self.path).path

        # 首页UI
        if path == "/" or path == "/owner":
            file_path = STATIC / "index.html"
            if file_path.exists():
                self.send_response(200)
                self.end_headers()
                self.wfile.write(file_path.read_bytes())
            else:
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b"UI NOT FOUND")
            return

        # API - state
        if path == "/api/state":
            self.json(load_state())
            return

        self.send_response(404)
        self.end_headers()

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length)
        data = json.loads(body.decode() or "{}")

        # 保存房间（不会覆盖）
        if self.path == "/api/state":
            state = load_state()

            state["rooms"] = data.get("rooms", state.get("rooms", []))

            save_state(state)
            self.json({"ok": True})
            return

        # 同步 iCal
        if self.path == "/api/sync":
            state = load_state()
            state = sync_ical(state)
