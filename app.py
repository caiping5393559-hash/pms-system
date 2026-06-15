from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from datetime import datetime, timedelta, date
from email.utils import formatdate
import base64
import json
import mimetypes
import os
import re
import traceback
import urllib.parse
import urllib.request

import firebase_admin
from firebase_admin import credentials, firestore


BASE = Path(__file__).resolve().parent
STATIC = BASE / "static"
STATE_PATH = BASE / "state.json"
CONFIG_PATH = BASE / "config.json"


def load_config():
    if not CONFIG_PATH.exists():
        return {}
    try:
        return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {}


CONFIG = load_config()
FIREBASE_CONFIG = CONFIG.get("firebase") or {}


def config_value(name, default=""):
    value = os.environ.get(name.upper())
    if value is None or value == "":
        value = CONFIG.get(name, default)
    return value if value not in (None, "") else default


HOST = "0.0.0.0"
PORT = int(os.environ.get("PORT", "10000"))
OWNER_KEY = str(config_value("owner_key", "owner123"))
CLEANER_KEY = str(config_value("cleaner_key", "cleaner123"))
OWNER_USER = str(config_value("owner_user", "admin"))
OWNER_PASS = str(config_value("owner_pass", "admin123"))
FIREBASE_PROJECT_ID = (
    os.environ.get("FIREBASE_PROJECT_ID")
    or FIREBASE_CONFIG.get("project_id")
    or "pms-system-aee0d"
)
STATE_COLLECTION = FIREBASE_CONFIG.get("state_collection", "settings")
STATE_DOCUMENT = FIREBASE_CONFIG.get("state_document", "system")

STATE_KEYS = [
    "rooms",
    "commonAreas",
    "bookings",
    "manualChanges",
    "cleaningNotes",
    "roomDateNotes",
]

COLLECTION_ALIASES = {
    "rooms": ["rooms"],
    "commonAreas": ["commonAreas", "common_areas"],
    "bookings": ["bookings"],
    "manualChanges": ["manualChanges", "manual_changes"],
    "cleaningNotes": ["cleaningNotes", "cleaning_notes"],
    "roomDateNotes": ["roomDateNotes", "room_date_notes"],
}

FIRESTORE_CLIENT = None


def default_state():
    return {
        "rooms": [],
        "commonAreas": [],
        "bookings": [],
        "manualChanges": [],
        "cleaningNotes": [],
        "roomDateNotes": [],
        "last_sync": "",
        "sync_errors": [],
    }


def plain_value(value):
    if isinstance(value, dict):
        return {str(k): plain_value(v) for k, v in value.items()}
    if isinstance(value, list):
        return [plain_value(v) for v in value]
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return value


def normalize_state(raw):
    state = default_state()
    if isinstance(raw, dict):
        for key in STATE_KEYS + ["last_sync", "sync_errors"]:
            if key in raw:
                state[key] = plain_value(raw[key])

    for key in STATE_KEYS:
        if not isinstance(state.get(key), list):
            state[key] = []

    for idx, room in enumerate(state["rooms"]):
        if not isinstance(room, dict):
            room = {}
            state["rooms"][idx] = room
        room.setdefault("id", f"room{idx + 1}")
        room.setdefault("name", f"Room {idx + 1}")
        room.setdefault("type", "room")
        room.setdefault("cleaning_fee", 0)
        for field in [
            "airbnb_ical",
            "booking_ical",
            "vrbo_ical",
            "other_ical",
            "airbnb_public_url",
            "booking_public_url",
            "vrbo_public_url",
            "other_public_url",
        ]:
            room.setdefault(field, "")

    for idx, area in enumerate(state["commonAreas"]):
        if not isinstance(area, dict):
            area = {}
            state["commonAreas"][idx] = area
        area.setdefault("id", f"common{idx + 1}")
        area.setdefault("name", f"Common Area {idx + 1}")
        area.setdefault("type", "common")
        area.setdefault("cleaning_fee", 0)

    for booking in state["bookings"]:
        if isinstance(booking, dict):
            booking.setdefault("source", booking.get("source") or "manual")

    if not isinstance(state.get("sync_errors"), list):
        state["sync_errors"] = []
    if not isinstance(state.get("last_sync"), str):
        state["last_sync"] = str(state.get("last_sync") or "")

    return state


def firebase_credential():
    raw_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON") or os.environ.get(
        "FIREBASE_ADMINSDK_JSON"
    )
    if raw_json:
        return credentials.Certificate(json.loads(raw_json))

    raw_b64 = os.environ.get("FIREBASE_SERVICE_ACCOUNT_BASE64")
    if raw_b64:
        decoded = base64.b64decode(raw_b64).decode("utf-8")
        return credentials.Certificate(json.loads(decoded))

    path_candidates = []
    if os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"):
        path_candidates.append(Path(os.environ["GOOGLE_APPLICATION_CREDENTIALS"]))
    path_candidates.extend(
        [
            BASE / "firebase-key.json",
            BASE / "firebase-adminsdk.json",
            BASE / "xxxx-firebase-adminsdk.json",
        ]
    )
    for path in path_candidates:
        if path.exists():
            return credentials.Certificate(str(path))

    return credentials.ApplicationDefault()


def get_db():
    global FIRESTORE_CLIENT
    if FIRESTORE_CLIENT is not None:
        return FIRESTORE_CLIENT

    if not firebase_admin._apps:
        options = {"projectId": FIREBASE_PROJECT_ID} if FIREBASE_PROJECT_ID else None
        firebase_admin.initialize_app(firebase_credential(), options)
    FIRESTORE_CLIENT = firestore.client()
    return FIRESTORE_CLIENT


def state_doc_ref():
    return get_db().collection(STATE_COLLECTION).document(STATE_DOCUMENT)


def load_seed_state():
    if STATE_PATH.exists():
        return normalize_state(json.loads(STATE_PATH.read_text(encoding="utf-8")))
    return default_state()


def load_state():
    db = get_db()
    snap = state_doc_ref().get()
    if snap.exists:
        data = plain_value(snap.to_dict() or {})
        if isinstance(data.get("state"), dict):
            return normalize_state(data["state"])
        if any(key in data for key in STATE_KEYS):
            return normalize_state(data)

    state = default_state()
    found_collection_data = False
    for key, aliases in COLLECTION_ALIASES.items():
        rows = []
        for collection_name in aliases:
            docs = list(db.collection(collection_name).stream())
            if docs:
                for doc in docs:
                    row = plain_value(doc.to_dict() or {})
                    if isinstance(row, dict):
                        row.setdefault("id", doc.id)
                        rows.append(row)
                found_collection_data = True
                break
        state[key] = rows

    if found_collection_data:
        state = normalize_state(state)
        save_state(state)
        return state

    state = load_seed_state()
    save_state(state)
    return state


def safe_doc_id(value, fallback):
    text = str(value or fallback).strip() or str(fallback)
    text = text.replace("/", "_").replace("\\", "_")
    return text[:140]


def item_doc_id(key, item, index):
    if isinstance(item, dict):
        if item.get("id"):
            return safe_doc_id(item["id"], f"{key}-{index}")
        if key == "bookings":
            raw = "-".join(
                str(item.get(part, ""))
                for part in ["room_id", "platform", "checkin", "checkout", "guest"]
            )
            return safe_doc_id(raw, f"booking-{index}")
        if item.get("date"):
            raw = "-".join(
                str(item.get(part, ""))
                for part in ["date", "target_id", "target_type", "type"]
            )
            return safe_doc_id(raw, f"{key}-{index}")
    return safe_doc_id("", f"{key}-{index}")


def save_state(state):
    state = normalize_state(state)
    doc_payload = {**state, "updated_at": firestore.SERVER_TIMESTAMP}
    state_doc_ref().set(doc_payload)

    db = get_db()
    for key, aliases in COLLECTION_ALIASES.items():
        collection = db.collection(aliases[0])
        for index, item in enumerate(state.get(key, []), start=1):
            if isinstance(item, dict):
                doc_id = item_doc_id(key, item, index)
                collection.document(doc_id).set(item)
    return state


def parse_query(path):
    parsed = urllib.parse.urlparse(path)
    return parsed, urllib.parse.parse_qs(parsed.query)


def query_value(handler, name):
    _, qs = parse_query(handler.path)
    return qs.get(name, [""])[0]


def is_owner(handler):
    key = query_value(handler, "key")
    user = query_value(handler, "user")
    password = query_value(handler, "pass") or query_value(handler, "password")
    return key == OWNER_KEY or (user == OWNER_USER and password == OWNER_PASS)


def is_cleaner(handler):
    key = query_value(handler, "key")
    return is_owner(handler) or key == CLEANER_KEY


def text_response(handler, text, status=200, content_type="text/plain; charset=utf-8"):
    data = str(text).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", content_type)
    handler.send_header("Content-Length", str(len(data)))
    handler.send_header("Cache-Control", "no-store")
    handler.end_headers()
    handler.wfile.write(data)


def json_response(handler, payload, status=200):
    data = json.dumps(plain_value(payload), ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(data)))
    handler.send_header("Cache-Control", "no-store")
    handler.end_headers()
    handler.wfile.write(data)


def redirect(handler, url):
    handler.send_response(302)
    handler.send_header("Location", url)
    handler.end_headers()


def require_owner(handler):
    if is_owner(handler):
        return True
    json_response(handler, {"ok": False, "error": "owner permission required"}, 403)
    return False


def require_cleaner(handler):
    if is_cleaner(handler):
        return True
    json_response(handler, {"ok": False, "error": "permission required"}, 403)
    return False


def parse_date_value(value):
    value = str(value or "").strip()
    if not value:
        return None
    if "T" in value:
        value = value.split("T", 1)[0]
    if re.match(r"^\d{8}$", value):
        return f"{value[:4]}-{value[4:6]}-{value[6:8]}"
    if re.match(r"^\d{4}-\d{2}-\d{2}$", value):
        return value
    return None


def unfold_ical(text):
    lines = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    out = []
    for line in lines:
        if (line.startswith(" ") or line.startswith("\t")) and out:
            out[-1] += line[1:]
        else:
            out.append(line)
    return out


def parse_ics(text, platform, room_id):
    events = []
    in_event = False
    current = {}
    for line in unfold_ical(text):
        line = line.strip("\ufeff")
        if line == "BEGIN:VEVENT":
            in_event = True
            current = {}
            continue
        if line == "END:VEVENT":
            if in_event:
                checkin = current.get("checkin")
                checkout = current.get("checkout")
                if checkin and not checkout:
                    checkout = (
                        datetime.strptime(checkin, "%Y-%m-%d") + timedelta(days=1)
                    ).strftime("%Y-%m-%d")
                if checkin and checkout and checkout > checkin:
                    events.append(
                        {
                            "room_id": room_id,
                            "platform": platform,
                            "guest": "",
                            "checkin": checkin,
                            "checkout": checkout,
                            "status": current.get("summary") or f"{platform} iCal",
                            "source": "ical",
                        }
                    )
            in_event = False
            continue
        if not in_event or ":" not in line:
            continue
        key, value = line.split(":", 1)
        key = key.split(";", 1)[0].upper()
        if key == "DTSTART":
            current["checkin"] = parse_date_value(value)
        elif key == "DTEND":
            current["checkout"] = parse_date_value(value)
        elif key == "SUMMARY":
            current["summary"] = value.strip()
    return events


def fetch_text(url):
    req = urllib.request.Request(url, headers={"User-Agent": "PMS-Firebase/1.0"})
    with urllib.request.urlopen(req, timeout=25) as resp:
        return resp.read().decode("utf-8", errors="replace")


def sync_icals():
    state = normalize_state(load_state())
    state["bookings"] = [
        booking for booking in state.get("bookings", []) if booking.get("source") != "ical"
    ]
    errors = []

    for room in state.get("rooms", []):
        room_id = room.get("id")
        sources = [
            ("Airbnb", room.get("airbnb_ical", "")),
            ("Booking", room.get("booking_ical", "")),
            ("Vrbo", room.get("vrbo_ical", "")),
            ("Other", room.get("other_ical", "")),
        ]
        for platform, url in sources:
            url = (url or "").strip()
            if not url:
                continue
            try:
                state["bookings"].extend(parse_ics(fetch_text(url), platform, room_id))
            except Exception as exc:
                errors.append(
                    {"room_id": room_id, "platform": platform, "error": str(exc)}
                )

    state["last_sync"] = datetime.now().isoformat(timespec="seconds")
    state["sync_errors"] = errors
    return save_state(state)


def ics_escape(text):
    return (
        str(text or "")
        .replace("\\", "\\\\")
        .replace(";", "\\;")
        .replace(",", "\\,")
        .replace("\n", "\\n")
    )


def ics_date(value):
    return str(value or "").replace("-", "")


def make_feed(room_id):
    state = normalize_state(load_state())
    room = next((item for item in state["rooms"] if item.get("id") == room_id), None)
    if not room:
        return None

    now = datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//PMS Firebase//CN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:{ics_escape(room.get('name', 'Room'))} PMS Calendar",
    ]

    for index, booking in enumerate(state.get("bookings", [])):
        if booking.get("room_id") != room_id:
            continue
        if booking.get("platform") == "Airbnb":
            continue
        if not booking.get("checkin") or not booking.get("checkout"):
            continue
        uid = f"{room_id}-{booking.get('checkin')}-{booking.get('checkout')}-{index}@pms"
        summary = f"{booking.get('platform', 'PMS')} booked"
        lines.extend(
            [
                "BEGIN:VEVENT",
                f"UID:{ics_escape(uid)}",
                f"DTSTAMP:{now}",
                f"DTSTART;VALUE=DATE:{ics_date(booking.get('checkin'))}",
                f"DTEND;VALUE=DATE:{ics_date(booking.get('checkout'))}",
                f"SUMMARY:{ics_escape(summary)}",
                "TRANSP:OPAQUE",
                "END:VEVENT",
            ]
        )
    lines.append("END:VCALENDAR")
    return "\r\n".join(lines) + "\r\n"


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print("%s - - [%s] %s" % (self.address_string(), self.log_date_time_string(), fmt % args))

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        try:
            parsed, _ = parse_query(self.path)
            path = parsed.path

            if path in ("/", "/login"):
                redirect(self, f"/owner?key={urllib.parse.quote(OWNER_KEY)}")
                return

            if path == "/health":
                text_response(self, "OK")
                return

            if path == "/api/health":
                get_db()
                json_response(self, {"ok": True, "firebase_project": FIREBASE_PROJECT_ID})
                return

            if path == "/owner":
                if not is_owner(self):
                    redirect(self, f"/owner?key={urllib.parse.quote(OWNER_KEY)}")
                    return
                self.serve_static("index.html")
                return

            if path == "/cleaner":
                if not is_cleaner(self):
                    redirect(self, f"/cleaner?key={urllib.parse.quote(CLEANER_KEY)}")
                    return
                self.serve_static("index.html")
                return

            if path == "/api/state":
                if not require_cleaner(self):
                    return
                json_response(self, load_state())
                return

            if path.startswith("/feed/") and path.endswith(".ics"):
                room_id = urllib.parse.unquote(path[len("/feed/") : -len(".ics")])
                feed = make_feed(room_id)
                if feed is None:
                    text_response(self, "not found", status=404)
                else:
                    text_response(self, feed, content_type="text/calendar; charset=utf-8")
                return

            if self.serve_static(path.lstrip("/")):
                return

            text_response(self, "not found", status=404)
        except Exception:
            json_response(self, {"ok": False, "error": traceback.format_exc()}, status=500)

    def do_POST(self):
        try:
            parsed, _ = parse_query(self.path)
            path = parsed.path
            length = int(self.headers.get("Content-Length", "0") or "0")
            raw = self.rfile.read(length)

            if path == "/api/state":
                if not require_owner(self):
                    return
                payload = json.loads(raw.decode("utf-8") or "{}")
                json_response(self, {"ok": True, "state": save_state(payload)})
                return

            if path == "/api/sync":
                if not require_owner(self):
                    return
                json_response(self, sync_icals())
                return

            text_response(self, "not found", status=404)
        except Exception:
            json_response(self, {"ok": False, "error": traceback.format_exc()}, status=500)

    def serve_static(self, relative_path):
        relative_path = urllib.parse.unquote(relative_path or "index.html")
        target = (STATIC / relative_path).resolve()
        static_root = STATIC.resolve()
        if target == static_root or static_root not in target.parents:
            return False
        if not target.exists() or not target.is_file():
            return False

        raw = target.read_bytes()
        ctype = mimetypes.guess_type(str(target))[0] or "application/octet-stream"
        self.send_response(200)
        self.send_header("Content-Type", ctype + ("; charset=utf-8" if ctype.startswith("text/") else ""))
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Last-Modified", formatdate(target.stat().st_mtime, usegmt=True))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(raw)
        return True


if __name__ == "__main__":
    print(f"PMS Firebase backend started on port {PORT}")
    HTTPServer((HOST, PORT), Handler).serve_forever()
