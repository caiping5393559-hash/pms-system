#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
PMS V8 完整后端部署版
特点：
- 不需要 Flask / Streamlit / Django
- 房东后台与保洁页面分开访问
- 支持 V8 前端：房间、公区、保洁、备注、公开链接、iCal 链接
- 支持读取各平台 iCal URL 并同步为预订记录
- 支持为每个房间生成 /feed/<room_id>.ics，给 Airbnb / Booking / Vrbo 反向导入锁房
- 推荐使用 MySQL 正常关系表保存数据；未配置 MySQL 时回退到 data/state.json

启动：
  python app.py
或：
  python3 app.py

配置文件：
  config.json
"""

from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from datetime import datetime
from email.utils import formatdate
import json
import urllib.parse
import urllib.request
import re
import os
import mimetypes
import traceback

from firebase_init import get_db

BASE = Path(__file__).resolve().parent
db = get_db()
DATA = BASE / "data"
STATIC = BASE / "static"
LOGS = BASE / "logs"
STATE_PATH = DATA / "state.json"
CONFIG_PATH = BASE / "config.json"

def load_config():
    if not CONFIG_PATH.exists():
        return {}
    try:
        return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except Exception as e:
        raise RuntimeError(f"配置文件 config.json 读取失败：{e}") from e

CONFIG = load_config()

def config_value(name, default=""):
    value = CONFIG.get(name)
    if value is None or value == "":
        value = os.environ.get(name.upper(), default)
    return value

def mysql_config_value(name, default=""):
    mysql = CONFIG.get("mysql") or {}
    value = mysql.get(name)
    if value is None or value == "":
        value = os.environ.get("MYSQL_" + name.upper(), default)
    return value

HOST = "0.0.0.0"
PORT = int(config_value("port", "8080"))
OWNER_KEY = str(config_value("owner_key", "owner123"))
CLEANER_KEY = str(config_value("cleaner_key", "cleaner123"))
MYSQL_HOST = str(mysql_config_value("host", "")).strip()
MYSQL_PORT = int(mysql_config_value("port", "3306"))
MYSQL_USER = str(mysql_config_value("user", "")).strip()
MYSQL_PASSWORD = str(mysql_config_value("password", ""))
MYSQL_DATABASE = str(mysql_config_value("database", "")).strip()

def mysql_enabled():
    return bool(MYSQL_HOST and MYSQL_USER and MYSQL_DATABASE)

def log_error(text):
    LOGS.mkdir(exist_ok=True)
    with (LOGS / "error.log").open("a", encoding="utf-8") as f:
        f.write(datetime.now().isoformat(timespec="seconds") + "\n")
        f.write(str(text) + "\n\n")

def default_state():
    return {
        "rooms": [], "commonAreas": [], "bookings": [],
        "manualChanges": [], "cleaningNotes": [], "roomDateNotes": [],
        "last_sync": "", "sync_errors": []
    }

def mysql_connect():
    try:
        import pymysql
    except ImportError as e:
        raise RuntimeError("MySQL 模式需要先安装 PyMySQL：pip3 install pymysql") from e
    return pymysql.connect(
        host=MYSQL_HOST,
        port=MYSQL_PORT,
        user=MYSQL_USER,
        password=MYSQL_PASSWORD,
        database=MYSQL_DATABASE,
        charset="utf8mb4",
        autocommit=False,
        cursorclass=pymysql.cursors.DictCursor,
    )

def db_date(value):
    if value is None:
        return ""
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)

def ensure_mysql_schema(conn, cur):
    cur.execute("""
        SELECT COUNT(*) AS cnt
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = %s
          AND TABLE_NAME = 'pms_manual_changes'
          AND COLUMN_NAME = 'amount'
    """, (MYSQL_DATABASE,))
    row = cur.fetchone()
    if not row or not row.get("cnt"):
        cur.execute("""
            ALTER TABLE pms_manual_changes
            ADD COLUMN amount DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER change_type
        """)
        conn.commit()

def load_state_mysql():
    state = default_state()
    with mysql_connect() as conn:
        with conn.cursor() as cur:
            ensure_mysql_schema(conn, cur)
            cur.execute("""
                SELECT id, name, cleaning_fee, type,
                       airbnb_ical, booking_ical, vrbo_ical, other_ical,
                       airbnb_public_url, booking_public_url, vrbo_public_url, other_public_url
                FROM pms_rooms
                ORDER BY sort_order, id
            """)
            for row in cur.fetchall():
                state["rooms"].append({
                    "id": row["id"],
                    "name": row["name"],
                    "cleaning_fee": float(row["cleaning_fee"] or 0),
                    "type": row.get("type") or "room",
                    "airbnb_ical": row.get("airbnb_ical") or "",
                    "booking_ical": row.get("booking_ical") or "",
                    "vrbo_ical": row.get("vrbo_ical") or "",
                    "other_ical": row.get("other_ical") or "",
                    "airbnb_public_url": row.get("airbnb_public_url") or "",
                    "booking_public_url": row.get("booking_public_url") or "",
                    "vrbo_public_url": row.get("vrbo_public_url") or "",
                    "other_public_url": row.get("other_public_url") or "",
                })

            if not state["rooms"] and STATE_PATH.exists():
                legacy_state = normalize_state(json.loads(STATE_PATH.read_text(encoding="utf-8")))
                if legacy_state.get("rooms"):
                    save_state_mysql(legacy_state)
                    return legacy_state

            cur.execute("""
                SELECT id, name, cleaning_fee, type, daily_default
                FROM pms_common_areas
                ORDER BY sort_order, id
            """)
            for row in cur.fetchall():
                state["commonAreas"].append({
                    "id": row["id"],
                    "name": row["name"],
                    "cleaning_fee": float(row["cleaning_fee"] or 0),
                    "type": row.get("type") or "common",
                    "daily_default": bool(row.get("daily_default")),
                })

            cur.execute("""
                SELECT room_id, platform, guest, checkin, checkout, status, source
                FROM pms_bookings
                ORDER BY sort_order, id
            """)
            for row in cur.fetchall():
                state["bookings"].append({
                    "room_id": row["room_id"],
                    "platform": row.get("platform") or "",
                    "guest": row.get("guest") or "",
                    "checkin": db_date(row.get("checkin")),
                    "checkout": db_date(row.get("checkout")),
                    "status": row.get("status") or "",
                    "source": row.get("source") or "",
                })

            cur.execute("""
                SELECT change_date, target_id, target_type, change_type, amount, reason, created_by
                FROM pms_manual_changes
                ORDER BY sort_order, id
            """)
            for row in cur.fetchall():
                state["manualChanges"].append({
                    "date": db_date(row.get("change_date")),
                    "target_id": row.get("target_id") or "",
                    "target_type": row.get("target_type") or "room",
                    "type": row.get("change_type") or "",
                    "amount": float(row.get("amount") or 0),
                    "reason": row.get("reason") or "",
                    "created_by": row.get("created_by") or "",
                })

            cur.execute("""
                SELECT note_date, target_id, target_type, note, priority, created_by
                FROM pms_cleaning_notes
                ORDER BY sort_order, id
            """)
            for row in cur.fetchall():
                state["cleaningNotes"].append({
                    "date": db_date(row.get("note_date")),
                    "target_id": row.get("target_id") or "",
                    "target_type": row.get("target_type") or "room",
                    "note": row.get("note") or "",
                    "priority": row.get("priority") or "普通",
                    "created_by": row.get("created_by") or "",
                })

            cur.execute("""
                SELECT note_date, room_id, note, priority, created_by
                FROM pms_room_date_notes
                ORDER BY sort_order, id
            """)
            for row in cur.fetchall():
                state["roomDateNotes"].append({
                    "date": db_date(row.get("note_date")),
                    "room_id": row.get("room_id") or "",
                    "note": row.get("note") or "",
                    "priority": row.get("priority") or "普通",
                    "created_by": row.get("created_by") or "",
                })

            cur.execute("SELECT last_sync FROM pms_sync_meta WHERE id = 1")
            meta = cur.fetchone()
            if meta:
                state["last_sync"] = meta.get("last_sync") or ""

            cur.execute("""
                SELECT room_id, platform, error
                FROM pms_sync_errors
                ORDER BY sort_order, id
            """)
            for row in cur.fetchall():
                state["sync_errors"].append({
                    "room_id": row.get("room_id") or "",
                    "platform": row.get("platform") or "",
                    "error": row.get("error") or "",
                })
    return state

def save_state_mysql(state):
    state = normalize_state(state)
    with mysql_connect() as conn:
        try:
            with conn.cursor() as cur:
                ensure_mysql_schema(conn, cur)
                for table in [
                    "pms_sync_errors", "pms_room_date_notes", "pms_cleaning_notes",
                    "pms_manual_changes", "pms_bookings", "pms_common_areas", "pms_rooms"
                ]:
                    cur.execute(f"DELETE FROM {table}")

                for i, r in enumerate(state.get("rooms", [])):
                    cur.execute("""
                        INSERT INTO pms_rooms (
                            id, name, cleaning_fee, type,
                            airbnb_ical, booking_ical, vrbo_ical, other_ical,
                            airbnb_public_url, booking_public_url, vrbo_public_url, other_public_url,
                            sort_order
                        ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                    """, (
                        r.get("id"), r.get("name", ""), r.get("cleaning_fee", 0), r.get("type", "room"),
                        r.get("airbnb_ical", ""), r.get("booking_ical", ""), r.get("vrbo_ical", ""), r.get("other_ical", ""),
                        r.get("airbnb_public_url", ""), r.get("booking_public_url", ""), r.get("vrbo_public_url", ""), r.get("other_public_url", ""),
                        i,
                    ))

                for i, c in enumerate(state.get("commonAreas", [])):
                    cur.execute("""
                        INSERT INTO pms_common_areas (id, name, cleaning_fee, type, daily_default, sort_order)
                        VALUES (%s,%s,%s,%s,%s,%s)
                    """, (
                        c.get("id"), c.get("name", ""), c.get("cleaning_fee", 0),
                        c.get("type", "common"), 1 if c.get("daily_default", True) else 0, i,
                    ))

                for i, b in enumerate(state.get("bookings", [])):
                    cur.execute("""
                        INSERT INTO pms_bookings (room_id, platform, guest, checkin, checkout, status, source, sort_order)
                        VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
                    """, (
                        b.get("room_id", ""), b.get("platform", ""), b.get("guest", ""),
                        b.get("checkin") or None, b.get("checkout") or None,
                        b.get("status", ""), b.get("source", ""), i,
                    ))

                for i, m in enumerate(state.get("manualChanges", [])):
                    cur.execute("""
                        INSERT INTO pms_manual_changes (change_date, target_id, target_type, change_type, amount, reason, created_by, sort_order)
                        VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
                    """, (
                        m.get("date") or None, m.get("target_id", ""), m.get("target_type", "room"),
                        m.get("type", ""), m.get("amount") or 0, m.get("reason", ""), m.get("created_by", ""), i,
                    ))

                for i, n in enumerate(state.get("cleaningNotes", [])):
                    cur.execute("""
                        INSERT INTO pms_cleaning_notes (note_date, target_id, target_type, note, priority, created_by, sort_order)
                        VALUES (%s,%s,%s,%s,%s,%s,%s)
                    """, (
                        n.get("date") or None, n.get("target_id", ""), n.get("target_type", "room"),
                        n.get("note", ""), n.get("priority", "普通"), n.get("created_by", ""), i,
                    ))

                for i, n in enumerate(state.get("roomDateNotes", [])):
                    cur.execute("""
                        INSERT INTO pms_room_date_notes (note_date, room_id, note, priority, created_by, sort_order)
                        VALUES (%s,%s,%s,%s,%s,%s)
                    """, (
                        n.get("date") or None, n.get("room_id", ""), n.get("note", ""),
                        n.get("priority", "普通"), n.get("created_by", ""), i,
                    ))

                cur.execute("""
                    INSERT INTO pms_sync_meta (id, last_sync)
                    VALUES (1, %s)
                    ON DUPLICATE KEY UPDATE last_sync = VALUES(last_sync)
                """, (state.get("last_sync", ""),))

                for i, e in enumerate(state.get("sync_errors", [])):
                    cur.execute("""
                        INSERT INTO pms_sync_errors (room_id, platform, error, sort_order)
                        VALUES (%s,%s,%s,%s)
                    """, (e.get("room_id", ""), e.get("platform", ""), e.get("error", ""), i))
            conn.commit()
        except Exception:
            conn.rollback()
            raise

def load_state():
    if mysql_enabled():
        return load_state_mysql()
    if not STATE_PATH.exists():
        return default_state()
    return json.loads(STATE_PATH.read_text(encoding="utf-8"))

def normalize_state(state):
    state.setdefault("rooms", [])
    state.setdefault("commonAreas", [])
    state.setdefault("bookings", [])
    state.setdefault("manualChanges", [])
    state.setdefault("cleaningNotes", [])
    state.setdefault("roomDateNotes", [])
    state.setdefault("last_sync", "")
    state.setdefault("sync_errors", [])
    for r in state["rooms"]:
        r.setdefault("airbnb_ical", "")
        r.setdefault("booking_ical", "")
        r.setdefault("vrbo_ical", "")
        r.setdefault("other_ical", "")
        r.setdefault("airbnb_public_url", "")
        r.setdefault("booking_public_url", "")
        r.setdefault("vrbo_public_url", "")
        r.setdefault("other_public_url", "")
    for m in state["manualChanges"]:
        m.setdefault("amount", 0)
    return state

def save_state(state):
    if mysql_enabled():
        save_state_mysql(state)
        return
    DATA.mkdir(exist_ok=True)
    state = normalize_state(state)
    tmp = STATE_PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(STATE_PATH)

def json_response(handler, data, status=200):
    raw = json.dumps(data, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(raw)))
    handler.end_headers()
    handler.wfile.write(raw)

def text_response(handler, text, content_type="text/plain; charset=utf-8", status=200):
    raw = text.encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", content_type)
    handler.send_header("Content-Length", str(len(raw)))
    handler.send_header("Last-Modified", formatdate(usegmt=True))
    handler.end_headers()
    handler.wfile.write(raw)

def redirect(handler, location):
    handler.send_response(302)
    handler.send_header("Location", location)
    handler.end_headers()

def parse_query(path):
    parsed = urllib.parse.urlparse(path)
    return parsed, urllib.parse.parse_qs(parsed.query)

def get_key(handler):
    parsed, qs = parse_query(handler.path)
    return qs.get("key", [""])[0]

def is_owner(handler):
    return get_key(handler) == OWNER_KEY

def is_cleaner(handler):
    key = get_key(handler)
    return key == CLEANER_KEY or key == OWNER_KEY

def require_owner(handler):
    if is_owner(handler):
        return True
    text_response(handler, "403: 需要房东权限。请使用 /owner?key=你的房东密码", status=403)
    return False

def require_cleaner(handler):
    if is_cleaner(handler):
        return True
    text_response(handler, "403: 需要保洁查看权限。请使用 /cleaner?key=保洁密码", status=403)
    return False

def parse_date_value(value):
    if not value:
        return None
    value = value.strip()
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
                if checkin and checkout and checkout > checkin:
                    events.append({
                        "room_id": room_id,
                        "platform": platform,
                        "guest": "",
                        "checkin": checkin,
                        "checkout": checkout,
                        "status": current.get("summary") or f"{platform} iCal",
                        "source": "ical"
                    })
            in_event = False
            continue
        if not in_event or ":" not in line:
            continue
        k, v = line.split(":", 1)
        key = k.split(";", 1)[0].upper()
        if key == "DTSTART":
            current["checkin"] = parse_date_value(v)
        elif key == "DTEND":
            current["checkout"] = parse_date_value(v)
        elif key == "SUMMARY":
            current["summary"] = v.strip()
    return events

def fetch_text(url):
    req = urllib.request.Request(url, headers={"User-Agent": "PMS-V8/1.0"})
    with urllib.request.urlopen(req, timeout=25) as resp:
        return resp.read().decode("utf-8", errors="replace")

def sync_icals():
    state = normalize_state(load_state())

    # 删除旧的 URL 同步记录，保留房东手动添加、前端文件导入等记录
    state["bookings"] = [b for b in state.get("bookings", []) if b.get("source") != "ical"]
    errors = []

    for room in state.get("rooms", []):
        room_id = room.get("id")
        sources = [
            ("Airbnb", room.get("airbnb_ical", "")),
            ("Booking", room.get("booking_ical", "")),
            ("Vrbo", room.get("vrbo_ical", "")),
            ("其他平台", room.get("other_ical", "")),
        ]
        for platform, url in sources:
            url = (url or "").strip()
            if not url:
                continue
            try:
                text = fetch_text(url)
                events = parse_ics(text, platform, room_id)
                state["bookings"].extend(events)
            except Exception as e:
                errors.append({"room_id": room_id, "platform": platform, "error": str(e)})

    state["last_sync"] = datetime.now().isoformat(timespec="seconds")
    state["sync_errors"] = errors
    save_state(state)
    return state

def ics_escape(text):
    return str(text or "").replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")

def ics_date(d):
    return str(d).replace("-", "")

def make_feed(room_id):
    state = normalize_state(load_state())
    room = next((r for r in state.get("rooms", []) if r.get("id") == room_id), None)
    if not room:
        return None

    # 反向锁房日历：默认不输出 Airbnb 自己同步进来的占用，避免循环导入。
    # Booking/Vrbo/其他平台/手动订单会输出。
    bookings = []
    for b in state.get("bookings", []):
        if b.get("room_id") != room_id:
            continue
        if b.get("platform") == "Airbnb":
            continue
        if not b.get("checkin") or not b.get("checkout"):
            continue
        bookings.append(b)

    now = datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//PMS V8//CN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:{ics_escape(room.get('name','房源'))} 外部锁房日历",
    ]
    for i, b in enumerate(bookings):
        uid = f"{room_id}-{b.get('checkin')}-{b.get('checkout')}-{i}@pms-v8"
        summary = f"{b.get('platform','外部平台')} 已预订"
        lines.extend([
            "BEGIN:VEVENT",
            f"UID:{ics_escape(uid)}",
            f"DTSTAMP:{now}",
            f"DTSTART;VALUE=DATE:{ics_date(b.get('checkin'))}",
            f"DTEND;VALUE=DATE:{ics_date(b.get('checkout'))}",
            f"SUMMARY:{ics_escape(summary)}",
            "TRANSP:OPAQUE",
            "END:VEVENT",
        ])
    lines.append("END:VCALENDAR")
    return "\r\n".join(lines) + "\r\n"

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            parsed, qs = parse_query(self.path)
            path = parsed.path

            if path == "/":
                redirect(self, f"/owner?key={OWNER_KEY}")
                return

            if path == "/owner":
                if not require_owner(self):
                    return
                self.serve_file(STATIC / "index.html")
                return

            if path == "/cleaner":
                if not require_cleaner(self):
                    return
                self.serve_file(STATIC / "index.html")
                return

            if path == "/api/state":
                if not require_cleaner(self):
                    return
                json_response(self, normalize_state(load_state()))
                return

            if path.startswith("/feed/") and path.endswith(".ics"):
                room_id = urllib.parse.unquote(path[len("/feed/"):-len(".ics")])
                feed = make_feed(room_id)
                if feed is None:
                    text_response(self, "not found", status=404)
                else:
                    text_response(self, feed, content_type="text/calendar; charset=utf-8")
                return

            safe = path.lstrip("/")
            f = STATIC / safe
            if f.exists() and f.is_file():
                self.serve_file(f)
                return

            text_response(self, "not found", status=404)
        except Exception:
            err = traceback.format_exc()
            log_error(err)
            text_response(self, err, status=500)

    def do_POST(self):
        try:
            parsed, qs = parse_query(self.path)
            path = parsed.path
            length = int(self.headers.get("Content-Length", "0") or "0")
            raw = self.rfile.read(length)

            if path == "/api/state":
                if not require_owner(self):
                    return
                state = json.loads(raw.decode("utf-8"))
                save_state(state)
                json_response(self, {"ok": True})
                return

            if path == "/api/sync":
                if not require_owner(self):
                    return
                state = sync_icals()
                json_response(self, state)
                return

            text_response(self, "not found", status=404)
        except Exception:
            err = traceback.format_exc()
            log_error(err)
            json_response(self, {"ok": False, "error": err}, status=500)

    def serve_file(self, f):
        raw = f.read_bytes()
        ctype = mimetypes.guess_type(str(f))[0] or "application/octet-stream"
        self.send_response(200)
        self.send_header("Content-Type", ctype + ("; charset=utf-8" if ctype.startswith("text/") else ""))
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

if __name__ == "__main__":
    print("=" * 60)
    print(f"PMS V8 已启动")
    print(f"端口: {PORT}")
    print(f"本地房东后台: http://127.0.0.1:{PORT}/owner?key={OWNER_KEY}")
    print(f"本地保洁页面: http://127.0.0.1:{PORT}/cleaner?key={CLEANER_KEY}")
    print("云端部署后，把 127.0.0.1 换成服务器公网 IP 或域名")
    print("=" * 60)
    HTTPServer((HOST, PORT), Handler).serve_forever()
