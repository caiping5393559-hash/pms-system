from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from datetime import datetime
import json
import urllib.parse
import urllib.request
import os
import mimetypes

BASE = Path(__file__).resolve().parent
DATA = BASE / "data"
STATIC = BASE / "static"
STATE_PATH = DATA / "state.json"
CONFIG_PATH = BASE / "config.json"

def load_config():
    if CONFIG_PATH.exists():
        return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    return {}

CONFIG = load_config()

PORT = int(CONFIG.get("port", 10000))
OWNER_KEY = CONFIG.get("owner_key", "owner123")

# ----------------------
# 数据
# ----------------------
def default_state():
    return {
        "rooms": [],
        "bookings": []
    }

def load_state():
    if STATE_PATH.exists():
        return json.loads(STATE_PATH.read_text(encoding="utf-8"))
    return default_state()

def save_state(state):
    DATA.mkdir(exist_ok=True)
    STATE_PATH.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")

# ----------------------
# iCal解析（核心）
# ----------------------
def fetch_ical(url):
    try:
        return urllib.request.urlopen(url, timeout=10).read().decode("utf-8")
    except:
        return ""

def parse_simple_ical(text, room_id, platform):
    events = []
    for line in text.splitlines():
        if "DTSTART" in line:
            events.append({
                "room_id": room_id,
                "platform": platform,
                "date": line
            })
    return events

def sync_icals(state):
    state["bookings"] = []

    for room in state["rooms"]:
        room_id = room.get("id")

        for platform in ["airbnb_ical", "booking_ical", "vrbo_ical", "other_ical"]:
            url = room.get(platform)
            if not url:
                continue

            ical = fetch_ical(url)
            events = parse_simple_ical(ical, room_id, platform)

            state["bookings"].extend(events)

    return state

# ----------------------
# HTTP
# ----------------------
class Handler(BaseHTTPRequestHandler):

    def do_GET(self):
        path = urllib.parse.urlparse(self.path).path

        # UI
        if path == "/owner":
            return self.serve(STATIC / "index.html")

        if path == "/":
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"PMS V8 ONLINE")
            return

        if path == "/api/state":
            state = load_state()
            self.json(state)
            return

        self.send_response(404)
        self.end_headers()

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length).decode())

        if self.path == "/api/state":
            save_state(body)
            self.json({"ok": True})
            return

        if self.path == "/api/sync":
            state = load_state()
            state = sync_icals(state)
            save_state(state)
            self.json(state)
            return

    def serve(self, file):
        self.send_response(200)
        self.send_header("Content-Type", "text/html")
        self.end_headers()
        self.wfile.write(file.read_bytes())

    def json(self, data):
        raw = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(raw)

if __name__ == "__main__":
    print("PMS V8 STARTED")
    server = HTTPServer(("0.0.0.0", PORT), Handler)
    server.serve_forever()
