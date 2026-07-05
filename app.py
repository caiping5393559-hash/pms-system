from http.server import HTTPServer, BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from datetime import datetime, timedelta, date, timezone
from email.utils import formatdate
from zoneinfo import ZoneInfo
import base64
import gzip
import hashlib
import hmac
import json
import mimetypes
import os
import re
import secrets
import traceback
import urllib.parse
import urllib.request
import urllib.error
import threading
import time

PMS_APP_VERSION = "2026-07-05-v68-mobile-calendar"
PMS_CLEANING_TASK_LAUNCH_DATE = date(2026, 7, 4)
PMS_CLEANING_TASK_RAMP_DAYS = 7
PMS_CLEANING_TASK_DEEP_START_DATE = (PMS_CLEANING_TASK_LAUNCH_DATE + timedelta(days=PMS_CLEANING_TASK_RAMP_DAYS)).isoformat()
ROOM_APPLIANCE_LABELS = {
    "microwave": "微波炉",
    "oven": "烤箱",
    "fridge": "冰箱",
    "washer": "洗衣机",
    "dryer": "烘干机",
    "coffee_maker": "咖啡机",
    "tv": "电视",
    "ac": "空调",
}
BASE = Path(__file__).resolve().parent
STATIC = BASE / "static"
STATE_PATH = BASE / "state.json"
CONFIG_PATH = BASE / "config.json"
FIRESTORE_SCOPE = "https://www.googleapis.com/auth/datastore"
DEFAULT_GROUP_ID = "group_default"
DEFAULT_PROPERTY_ID = "property_default"
STATE_KEYS = [
    "groups",
    "users",
    "properties",
    "propertyCleaners",
    "rooms",
    "commonAreas",
    "bookings",
    "manualChanges",
    "cleaningNotes",
    "roomDateNotes",
    "maintenanceTickets",
    "inventoryItems",
    "expenseRecords",
    "guestProfiles",
    "auditLog",
]
TOKEN_CACHE = {"token": "", "expiry": 0}
SERVICE_ACCOUNT_CACHE = None


def load_config():
    if not CONFIG_PATH.exists():
        return {}
    try:
        return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {}


CONFIG = load_config()
FIREBASE_CONFIG = CONFIG.get("firebase") or {}
HOST = "0.0.0.0"
PORT = int(os.environ.get("PORT", "10000"))
OWNER_KEY = str(os.environ.get("OWNER_KEY") or CONFIG.get("owner_key") or "owner123")
CLEANER_KEY = str(os.environ.get("CLEANER_KEY") or CONFIG.get("cleaner_key") or "cleaner123")
OWNER_USER = str(os.environ.get("OWNER_USER") or CONFIG.get("owner_user") or "admin")
OWNER_PASS = str(os.environ.get("OWNER_PASS") or CONFIG.get("owner_pass") or "admin123")
DEFAULT_ADMIN_USERNAME = str(os.environ.get("ADMIN_USERNAME") or CONFIG.get("admin_username") or "admin")
DEFAULT_ADMIN_PASSWORD = str(os.environ.get("ADMIN_PASSWORD") or CONFIG.get("admin_password") or "PMS-Admin-2026!")
DEFAULT_OWNER_USERNAME = str(os.environ.get("DEFAULT_OWNER_USERNAME") or CONFIG.get("default_owner_username") or "owner1")
DEFAULT_OWNER_PASSWORD = str(os.environ.get("DEFAULT_OWNER_PASSWORD") or CONFIG.get("default_owner_password") or "PMS-Owner-2026!")
SESSION_COOKIE = "pms_session"
SESSION_SECONDS = 60 * 60 * 24 * 7
SESSION_SECRET = str(os.environ.get("SESSION_SECRET") or CONFIG.get("session_secret") or hashlib.sha256(f"{OWNER_KEY}:{CLEANER_KEY}:{OWNER_PASS}".encode("utf-8")).hexdigest())
STATE_COLLECTION = FIREBASE_CONFIG.get("state_collection", "settings")
STATE_DOCUMENT = FIREBASE_CONFIG.get("state_document", "system")
ROOM_FIELDS = [
    "name",
    "type",
    "property_id",
    "cleaning_fee",
    "airbnb_ical",
    "booking_ical",
    "vrbo_ical",
    "other_ical",
    "airbnb_public_url",
    "booking_public_url",
    "vrbo_public_url",
    "other_public_url",
]


def _pms_core_default_state():
    return {
        "groups": [{"id": DEFAULT_GROUP_ID, "name": "默认房东组"}],
        "users": [
            {"id": "admin_default", "role": "admin", "name": "管理员", "group_ids": [DEFAULT_GROUP_ID]},
            {"id": "owner_default", "role": "owner", "name": "默认房东", "group_ids": [DEFAULT_GROUP_ID]},
        ],
        "properties": [{"id": DEFAULT_PROPERTY_ID, "group_id": DEFAULT_GROUP_ID, "name": "默认房源"}],
        "propertyCleaners": [],
        "rooms": [],
        "commonAreas": [],
        "bookings": [],
        "manualChanges": [],
        "cleaningNotes": [],
        "roomDateNotes": [],
        "maintenanceTickets": [],
        "inventoryItems": [],
        "expenseRecords": [],
        "guestProfiles": [],
        "auditLog": [],
        "current_group_id": DEFAULT_GROUP_ID,
        "last_sync": "",
        "sync_errors": [],
    }


def plain(value):
    if isinstance(value, dict):
        return {str(k): plain(v) for k, v in value.items()}
    if isinstance(value, list):
        return [plain(v) for v in value]
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return value


def now_utc_iso():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def normalize_cleaner_code(value):
    value = re.sub(r"[^A-Za-z0-9]", "", str(value or "")).upper()
    if value.startswith("CLN"):
        value = value[3:]
    return f"CLN-{value}" if value else ""


def password_hash(password, salt=None):
    salt = salt or secrets.token_hex(8)
    digest = hashlib.sha256((salt + ":" + str(password or "")).encode("utf-8")).hexdigest()
    return f"sha256${salt}${digest}"


def verify_password(stored, password):
    try:
        algo, salt, digest = str(stored or "").split("$", 2)
    except ValueError:
        return False
    if algo != "sha256" or not salt or not digest:
        return False
    expected = hashlib.sha256((salt + ":" + str(password or "")).encode("utf-8")).hexdigest()
    return hmac.compare_digest(digest, expected)


def ensure_default_accounts(state):
    state = plain(state)
    state.setdefault("groups", [])
    state.setdefault("users", [])
    default_group = next((group for group in state["groups"] if isinstance(group, dict) and group.get("id") == DEFAULT_GROUP_ID), None)
    if default_group is None:
        default_group = {"id": DEFAULT_GROUP_ID, "name": "默认房东组"}
        state["groups"].insert(0, default_group)
    else:
        default_group.setdefault("name", "默认房东组")

    accounts = [
        {
            "id": "admin_default",
            "username": DEFAULT_ADMIN_USERNAME,
            "password": DEFAULT_ADMIN_PASSWORD,
            "role": "admin",
            "name": "管理员",
            "group_ids": [DEFAULT_GROUP_ID],
        },
        {
            "id": "owner_default",
            "username": DEFAULT_OWNER_USERNAME,
            "password": DEFAULT_OWNER_PASSWORD,
            "role": "owner",
            "name": "默认房东",
            "group_ids": [DEFAULT_GROUP_ID],
        },
    ]
    for account in accounts:
        user = next(
            (
                item
                for item in state["users"]
                if isinstance(item, dict)
                and (item.get("id") == account["id"] or str(item.get("username") or "").lower() == account["username"].lower())
            ),
            None,
        )
        if user is None:
            state["users"].append(
                {
                    "id": account["id"],
                    "username": account["username"],
                    "role": account["role"],
                    "name": account["name"],
                    "group_ids": account["group_ids"],
                    "password_hash": password_hash(account["password"]),
                    "created_at": now_utc_iso(),
                }
            )
            continue
        user["id"] = account["id"]
        user["username"] = account["username"]
        user["role"] = account["role"]
        user.setdefault("name", account["name"])
        user.setdefault("group_ids", account["group_ids"])
        if not user.get("password_hash"):
            user["password_hash"] = password_hash(account["password"])
    return state


def public_user(user):
    return {key: value for key, value in plain(user).items() if key not in ("password_hash",)}


def public_state(state):
    state = plain(normalize_state(state))
    state["users"] = [public_user(user) for user in state.get("users", []) if isinstance(user, dict)]
    return state


def user_group_ids(user):
    return {str(item) for item in (user or {}).get("group_ids", []) if item}


PMS_PERMISSION_KEYS = {
    "calendar_view",
    "cleaning_manage",
    "settings_manage",
    "finance_view",
    "finance_edit",
    "ops_manage",
    "users_manage",
}


def user_permission_map(user):
    raw = (user or {}).get("permissions")
    return raw if isinstance(raw, dict) else {}


def actor_has_permission(actor, key):
    role = (actor or {}).get("role")
    if role == "admin":
        return True
    if role != "owner":
        return False
    permissions = user_permission_map(actor)
    if not permissions:
        return True
    return bool(permissions.get(key))


def sanitize_permissions(value):
    if not isinstance(value, dict):
        return {}
    return {key: bool(value.get(key)) for key in sorted(PMS_PERMISSION_KEYS)}


def pms_item_property_id(item, state):
    if not isinstance(item, dict):
        return ""
    prop_id = str(item.get("property_id") or "").strip()
    if prop_id:
        return prop_id
    room_id = str(item.get("room_id") or "").strip()
    if not room_id and item.get("target_type") != "common":
        room_id = str(item.get("target_id") or "").strip()
    if room_id:
        for room in state.get("rooms", []):
            if isinstance(room, dict) and str(room.get("id") or "") == room_id:
                return str(room.get("property_id") or "").strip()
    area_id = ""
    if item.get("target_type") == "common":
        area_id = str(item.get("target_id") or "").strip()
    area_id = area_id or str(item.get("common_area_id") or item.get("area_id") or "").strip()
    if area_id:
        for area in state.get("commonAreas", []):
            if isinstance(area, dict) and str(area.get("id") or "") == area_id:
                return str(area.get("property_id") or "").strip()
    return ""


def _pms_core_filter_state_for_user(state, user):
    state = plain(normalize_state(state))
    role = (user or {}).get("role")
    if role == "admin":
        visible = public_state(state)
        visible["current_user"] = public_user(user)
        return visible

    group_ids = user_group_ids(user)
    if role == "cleaner":
        cleaner_code = normalize_cleaner_code((user or {}).get("cleaner_code"))
        property_ids = {
            item.get("property_id")
            for item in state.get("propertyCleaners", [])
            if isinstance(item, dict) and normalize_cleaner_code(item.get("cleaner_code")) == cleaner_code
        }
        group_ids = {
            prop.get("group_id")
            for prop in state.get("properties", [])
            if isinstance(prop, dict) and prop.get("id") in property_ids
        }
    else:
        property_ids = actor_property_ids(user, state)

    properties = [prop for prop in state.get("properties", []) if isinstance(prop, dict) and prop.get("id") in property_ids]
    property_ids = {prop.get("id") for prop in properties}
    rooms = [room for room in state.get("rooms", []) if isinstance(room, dict) and room.get("property_id") in property_ids]
    room_ids = {room.get("id") for room in rooms}
    first_property = next(iter(property_ids), "")
    common_areas = [area for area in state.get("commonAreas", []) if isinstance(area, dict) and (area.get("property_id") or first_property) in property_ids]
    common_area_ids = {area.get("id") for area in common_areas}
    cleaner_codes = {
        normalize_cleaner_code(item.get("cleaner_code"))
        for item in state.get("propertyCleaners", [])
        if isinstance(item, dict) and item.get("property_id") in property_ids
    }

    visible = dict(state)
    visible["groups"] = [group for group in state.get("groups", []) if isinstance(group, dict) and group.get("id") in group_ids]
    visible["properties"] = properties
    visible["propertyCleaners"] = [
        item for item in state.get("propertyCleaners", []) if isinstance(item, dict) and item.get("property_id") in property_ids
    ]
    visible["rooms"] = rooms
    visible["commonAreas"] = common_areas
    visible["bookings"] = [booking for booking in state.get("bookings", []) if isinstance(booking, dict) and booking.get("room_id") in room_ids]
    visible["manualChanges"] = [
        item
        for item in state.get("manualChanges", [])
        if isinstance(item, dict)
        and (
            (item.get("target_type") == "common" and item.get("target_id") in common_area_ids)
            or (item.get("target_type") != "common" and item.get("target_id") in room_ids)
        )
    ]
    visible["cleaningNotes"] = [
        item
        for item in state.get("cleaningNotes", [])
        if isinstance(item, dict)
        and (
            (item.get("target_type") == "common" and item.get("target_id") in common_area_ids)
            or (item.get("target_type") != "common" and item.get("target_id") in room_ids)
        )
    ]
    visible["roomDateNotes"] = [item for item in state.get("roomDateNotes", []) if isinstance(item, dict) and item.get("room_id") in room_ids]
    visible["maintenanceTickets"] = [
        item
        for item in state.get("maintenanceTickets", [])
        if isinstance(item, dict) and pms_item_property_id(item, state) in property_ids
    ]
    visible["inventoryItems"] = [
        item
        for item in state.get("inventoryItems", [])
        if isinstance(item, dict) and pms_item_property_id(item, state) in property_ids
    ]
    can_view_finance = actor_has_permission(user, "finance_view")
    can_manage_users = actor_has_permission(user, "users_manage")
    visible["expenseRecords"] = [
        item
        for item in state.get("expenseRecords", [])
        if isinstance(item, dict) and role != "cleaner" and can_view_finance and pms_item_property_id(item, state) in property_ids
    ]
    visible["guestProfiles"] = [
        item
        for item in state.get("guestProfiles", [])
        if isinstance(item, dict)
        and role != "cleaner"
        and ((item.get("group_id") in group_ids) or pms_item_property_id(item, state) in property_ids)
    ]
    visible["auditLog"] = [
        item
        for item in state.get("auditLog", [])
        if isinstance(item, dict)
        and (
            (role != "cleaner" and pms_item_property_id(item, state) in property_ids)
            or item.get("actor_id") == (user or {}).get("id")
        )
    ][-300:]
    visible["users"] = [
        public_user(item)
        for item in state.get("users", [])
        if isinstance(item, dict)
        and (
            item.get("id") == (user or {}).get("id")
            or (can_manage_users and item.get("role") == "owner" and user_group_ids(item) & group_ids)
            or (item.get("role") == "cleaner" and normalize_cleaner_code(item.get("cleaner_code")) in cleaner_codes)
        )
    ]
    visible["current_user"] = public_user(user)
    return visible


def normalize_room_appliances_value(value):
    if isinstance(value, list):
        rows = value
    elif isinstance(value, str):
        rows = re.split(r"[,，\s]+", value)
    else:
        rows = []
    out = []
    for item in rows:
        text = str(item or "").strip()
        if text and text not in out:
            out.append(text[:60])
    return out


def normalize_room_has_kitchen(room):
    room = room if isinstance(room, dict) else {}
    if any(key in room for key in ("has_kitchen", "hasKitchen")):
        return bool(room.get("has_kitchen") or room.get("hasKitchen"))
    text = str(room.get("kitchen_type") or room.get("kitchenType") or room.get("kitchen") or "").strip().lower()
    return text in {"private", "yes", "true", "1", "kitchen", "kitchenette", "private_kitchen"}


def pms_positive_int(value, default=1):
    try:
        num = int(float(value))
    except (TypeError, ValueError):
        num = default
    return max(1, num)


def normalize_common_area_components(area):
    area = area if isinstance(area, dict) else {}
    raw_type = str(area.get("area_type") or area.get("areaType") or area.get("kind") or "general").strip().lower()
    count = pms_positive_int(area.get("unit_count") or area.get("unitCount") or area.get("count") or 1)
    has_explicit = any(key in area for key in ("has_kitchen", "hasKitchen", "has_bathroom", "hasBathroom", "has_general", "hasGeneral"))
    if has_explicit:
        has_kitchen = bool(area.get("has_kitchen") or area.get("hasKitchen"))
        has_bathroom = bool(area.get("has_bathroom") or area.get("hasBathroom"))
        has_general = bool(area.get("has_general") or area.get("hasGeneral"))
    else:
        has_kitchen = raw_type in {"shared_kitchen", "kitchen", "厨房"}
        has_bathroom = raw_type in {"shared_bathroom", "bathroom", "bath", "卫生间"}
        has_general = not (has_kitchen or has_bathroom)
    kitchen_count = pms_positive_int(area.get("kitchen_count") or area.get("kitchenCount") or (count if has_kitchen else 1))
    bathroom_count = pms_positive_int(area.get("bathroom_count") or area.get("bathroomCount") or (count if has_bathroom else 1))
    general_count = pms_positive_int(area.get("general_count") or area.get("generalCount") or (count if has_general else 1))
    general_label = str(area.get("general_label") or area.get("generalLabel") or area.get("other_label") or area.get("otherLabel") or "其他公区").strip()[:80] or "其他公区"
    if not (has_kitchen or has_bathroom or has_general):
        has_general = True
    return {
        "has_kitchen": has_kitchen,
        "kitchen_count": kitchen_count,
        "has_bathroom": has_bathroom,
        "bathroom_count": bathroom_count,
        "has_general": has_general,
        "general_count": general_count,
        "general_label": general_label,
    }


def _pms_core_normalize_state(raw):
    state = _pms_core_default_state()
    if isinstance(raw, dict):
        if "property_cleaners" in raw and "propertyCleaners" not in raw:
            raw["propertyCleaners"] = raw.get("property_cleaners")
        for key in STATE_KEYS + ["current_group_id", "last_sync", "sync_errors"]:
            if key in raw:
                state[key] = plain(raw[key])
    for key in STATE_KEYS:
        if not isinstance(state.get(key), list):
            state[key] = []
    if not state["groups"]:
        state["groups"] = [{"id": DEFAULT_GROUP_ID, "name": "默认房东组"}]
    for idx, group in enumerate(state["groups"]):
        if not isinstance(group, dict):
            group = {}
            state["groups"][idx] = group
        group.setdefault("id", DEFAULT_GROUP_ID if idx == 0 else f"group{idx + 1}")
        group.setdefault("name", "默认房东组" if idx == 0 else f"房东组{idx + 1}")
    if not any(group.get("id") == state.get("current_group_id") for group in state["groups"]):
        state["current_group_id"] = state["groups"][0].get("id") or DEFAULT_GROUP_ID
    if not state["properties"]:
        state["properties"] = [{"id": DEFAULT_PROPERTY_ID, "group_id": state["current_group_id"], "name": "默认房源"}]
    for idx, prop in enumerate(state["properties"]):
        if not isinstance(prop, dict):
            prop = {}
            state["properties"][idx] = prop
        prop.setdefault("id", DEFAULT_PROPERTY_ID if idx == 0 else f"property{idx + 1}")
        prop.setdefault("group_id", state["current_group_id"])
        prop.setdefault("name", "默认房源" if idx == 0 else f"房源{idx + 1}")
    default_property = state["properties"][0].get("id") or DEFAULT_PROPERTY_ID
    for idx, user in enumerate(state["users"]):
        if not isinstance(user, dict):
            user = {}
            state["users"][idx] = user
        user.setdefault("id", f"user{idx + 1}")
        user.setdefault("role", "cleaner")
        user.setdefault("name", user.get("cleaner_code") or f"用户{idx + 1}")
        if user.get("role") in ("owner", "admin"):
            user.setdefault("group_ids", [state["current_group_id"]])
    state = ensure_default_accounts(state)
    for idx, room in enumerate(state["rooms"]):
        if not isinstance(room, dict):
            room = {}
            state["rooms"][idx] = room
        room.setdefault("id", f"room{idx + 1}")
        room.setdefault("name", f"Room {idx + 1}")
        room.setdefault("type", "room")
        room.setdefault("property_id", default_property)
        room.setdefault("cleaning_fee", 0)
        room.setdefault("bathroom_type", "private")
        room["has_kitchen"] = normalize_room_has_kitchen(room)
        room["appliances"] = normalize_room_appliances_value(room.get("appliances"))
        for field in ["airbnb_ical", "booking_ical", "vrbo_ical", "other_ical", "airbnb_public_url", "booking_public_url", "vrbo_public_url", "other_public_url"]:
            room.setdefault(field, "")
    for idx, binding in enumerate(state["propertyCleaners"]):
        if not isinstance(binding, dict):
            binding = {}
            state["propertyCleaners"][idx] = binding
        binding.setdefault("property_id", default_property)
        binding["cleaner_code"] = normalize_cleaner_code(binding.get("cleaner_code"))
        binding.setdefault("created_at", "")
    for idx, area in enumerate(state["commonAreas"]):
        if not isinstance(area, dict):
            area = {}
            state["commonAreas"][idx] = area
        area.setdefault("id", f"common{idx + 1}")
        area.setdefault("name", f"Common Area {idx + 1}")
        area.setdefault("type", "common")
        area.setdefault("property_id", default_property)
        area.setdefault("cleaning_fee", 0)
        for key, value in normalize_common_area_components(area).items():
            area[key] = value
    for idx, item in enumerate(state["maintenanceTickets"]):
        if not isinstance(item, dict):
            item = {}
            state["maintenanceTickets"][idx] = item
        item.setdefault("id", f"maint{idx + 1}")
        item.setdefault("property_id", pms_item_property_id(item, state) or default_property)
        item.setdefault("room_id", "")
        item.setdefault("title", "Maintenance task")
        item.setdefault("status", "open")
        item.setdefault("priority", "normal")
        item.setdefault("category", "repair")
        item.setdefault("created_at", "")
    for idx, item in enumerate(state["inventoryItems"]):
        if not isinstance(item, dict):
            item = {}
            state["inventoryItems"][idx] = item
        item.setdefault("id", f"inv{idx + 1}")
        item.setdefault("property_id", pms_item_property_id(item, state) or default_property)
        item.setdefault("name", "Supply item")
        item.setdefault("category", "cleaning")
        item.setdefault("unit", "pcs")
        item.setdefault("current_qty", 0)
        item.setdefault("min_qty", 0)
    for idx, item in enumerate(state["expenseRecords"]):
        if not isinstance(item, dict):
            item = {}
            state["expenseRecords"][idx] = item
        item.setdefault("id", f"expense{idx + 1}")
        item.setdefault("property_id", pms_item_property_id(item, state) or default_property)
        item.setdefault("date", now_utc_iso()[:10])
        item.setdefault("category", "other")
        item.setdefault("amount", 0)
    for idx, item in enumerate(state["guestProfiles"]):
        if not isinstance(item, dict):
            item = {}
            state["guestProfiles"][idx] = item
        item.setdefault("id", f"guest{idx + 1}")
        item.setdefault("group_id", state["current_group_id"])
        item.setdefault("property_id", pms_item_property_id(item, state) or default_property)
        item.setdefault("name", "Guest")
        item.setdefault("created_at", "")
    for idx, item in enumerate(state["auditLog"]):
        if not isinstance(item, dict):
            item = {}
            state["auditLog"][idx] = item
        item.setdefault("id", f"audit{idx + 1}")
        item.setdefault("property_id", pms_item_property_id(item, state) or default_property)
        item.setdefault("action", "")
        item.setdefault("created_at", "")
    for booking in state["bookings"]:
        if isinstance(booking, dict):
            booking.setdefault("source", booking.get("source") or "manual")
    if not isinstance(state.get("sync_errors"), list):
        state["sync_errors"] = []
    if not isinstance(state.get("last_sync"), str):
        state["last_sync"] = str(state.get("last_sync") or "")
    return state


def service_account_info():
    global SERVICE_ACCOUNT_CACHE
    if SERVICE_ACCOUNT_CACHE:
        return SERVICE_ACCOUNT_CACHE
    raw_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON") or os.environ.get("FIREBASE_ADMINSDK_JSON")
    if raw_json:
        SERVICE_ACCOUNT_CACHE = json.loads(raw_json)
        return SERVICE_ACCOUNT_CACHE
    raw_b64 = os.environ.get("FIREBASE_SERVICE_ACCOUNT_BASE64")
    if raw_b64:
        SERVICE_ACCOUNT_CACHE = json.loads(base64.b64decode(raw_b64).decode("utf-8"))
        return SERVICE_ACCOUNT_CACHE
    credential_path = str(os.environ.get("GOOGLE_APPLICATION_CREDENTIALS") or "").strip()
    candidates = []
    if credential_path:
        candidates.append(Path(credential_path))
    candidates.extend([BASE / "firebase-key.json", BASE / "firebase-adminsdk.json"])
    for path in candidates:
        if path and path.is_file():
            SERVICE_ACCOUNT_CACHE = json.loads(path.read_text(encoding="utf-8"))
            return SERVICE_ACCOUNT_CACHE
    raise RuntimeError("Firebase service account is not configured")


def firebase_project_id():
    return os.environ.get("FIREBASE_PROJECT_ID") or FIREBASE_CONFIG.get("project_id") or service_account_info().get("project_id") or "pms-system-aee0d"


def access_token():
    now = datetime.now(timezone.utc).timestamp()
    if TOKEN_CACHE["token"] and TOKEN_CACHE["expiry"] - now > 60:
        return TOKEN_CACHE["token"]
    from google.oauth2 import service_account
    from google.auth.transport.requests import Request
    creds = service_account.Credentials.from_service_account_info(service_account_info(), scopes=[FIRESTORE_SCOPE])
    creds.refresh(Request())
    TOKEN_CACHE["token"] = creds.token
    TOKEN_CACHE["expiry"] = creds.expiry.timestamp() if creds.expiry else now + 3000
    return TOKEN_CACHE["token"]


def firestore_doc_url():
    project = urllib.parse.quote(firebase_project_id(), safe="")
    collection = urllib.parse.quote(STATE_COLLECTION, safe="")
    document = urllib.parse.quote(STATE_DOCUMENT, safe="")
    return f"https://firestore.googleapis.com/v1/projects/{project}/databases/(default)/documents/{collection}/{document}"


def firestore_request(method, url, payload=None, timeout=12):
    headers = {"Authorization": f"Bearer {access_token()}"}
    data = None
    if payload is not None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8") or "{}")
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            return None
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Firestore HTTP {exc.code}: {body[:500]}") from exc
    except Exception as exc:
        reason = getattr(exc, "reason", None) or str(exc) or exc.__class__.__name__
        raise RuntimeError(f"Firebase database request failed: {reason}") from exc


def from_firestore_value(value):
    if "stringValue" in value:
        return value["stringValue"]
    if "integerValue" in value:
        return int(value["integerValue"])
    if "doubleValue" in value:
        return float(value["doubleValue"])
    if "booleanValue" in value:
        return bool(value["booleanValue"])
    if "nullValue" in value:
        return None
    if "timestampValue" in value:
        return value["timestampValue"]
    if "arrayValue" in value:
        return [from_firestore_value(item) for item in value.get("arrayValue", {}).get("values", [])]
    if "mapValue" in value:
        return {key: from_firestore_value(item) for key, item in value.get("mapValue", {}).get("fields", {}).items()}
    return None


def load_seed_state():
    if STATE_PATH.exists():
        return normalize_state(json.loads(STATE_PATH.read_text(encoding="utf-8")))
    return default_state()


def firebase_credentials_configured():
    if os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON") or os.environ.get("FIREBASE_ADMINSDK_JSON") or os.environ.get("FIREBASE_SERVICE_ACCOUNT_BASE64"):
        return True
    credential_path = str(os.environ.get("GOOGLE_APPLICATION_CREDENTIALS") or "").strip()
    if credential_path and Path(credential_path).is_file():
        return True
    return (BASE / "firebase-key.json").is_file() or (BASE / "firebase-adminsdk.json").is_file()


def write_local_state(state):
    STATE_PATH.write_text(json.dumps(normalize_state(state), ensure_ascii=False, indent=2), encoding="utf-8")


def _pms_core_load_state():
    if not firebase_credentials_configured():
        if STATE_PATH.is_file():
            return normalize_state(json.loads(STATE_PATH.read_text(encoding="utf-8")))
        return load_seed_state()
    doc = firestore_request("GET", firestore_doc_url())
    if not doc:
        return load_seed_state()
    fields = doc.get("fields", {})
    compressed = fields.get("state_gzip_base64", {}).get("stringValue") or ""
    if compressed:
        raw = gzip.decompress(base64.b64decode(compressed.encode("ascii"))).decode("utf-8")
        return normalize_state(json.loads(raw or "{}"))
    if "state_json" in fields:
        return normalize_state(json.loads(fields["state_json"].get("stringValue") or "{}"))
    raw = {key: from_firestore_value(value) for key, value in fields.items()}
    return normalize_state(raw) if any(key in raw for key in STATE_KEYS) else load_seed_state()


def _pms_core_save_state(state):
    state = normalize_state(state)
    if not firebase_credentials_configured():
        write_local_state(state)
        return state
    raw = json.dumps(state, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    compressed = base64.b64encode(gzip.compress(raw, compresslevel=9)).decode("ascii")
    if len(compressed) > 950000:
        raise RuntimeError(f"Compressed state is still too large for one Firestore document: {len(compressed)} bytes")
    payload = {
        "fields": {
            "state_json": {"stringValue": ""},
            "state_gzip_base64": {"stringValue": compressed},
            "state_storage": {"stringValue": "gzip_base64"},
            "state_raw_bytes": {"integerValue": str(len(raw))},
            "state_compressed_bytes": {"integerValue": str(len(compressed))},
            "updated_at": {"timestampValue": now_utc_iso()},
        }
    }
    firestore_request("PATCH", firestore_doc_url(), payload=payload)
    return state


def merge_scoped_list(current_items, incoming_items, keep_current):
    incoming_items = [item for item in incoming_items if isinstance(item, dict)]
    return [item for item in current_items if isinstance(item, dict) and keep_current(item)] + incoming_items


def _pms_core_save_state_from_payload(payload, actor=None):
    if not isinstance(payload, dict):
        raise RuntimeError("state payload must be an object")
    current = normalize_state(load_state())
    if actor and actor.get("role") != "admin":
        property_ids = actor_property_ids(actor, current)
        room_ids = actor_room_ids(actor, current)
        common_area_ids = {
            area.get("id")
            for area in current.get("commonAreas", [])
            if isinstance(area, dict)
            and (area.get("property_id") or first_actor_property_id(actor, current)) in property_ids
        }
        merged = dict(current)
        if "groups" in payload:
            group_ids = user_group_ids(actor)
            merged["groups"] = merge_scoped_list(current.get("groups", []), payload.get("groups", []), lambda item: item.get("id") not in group_ids)
        if "properties" in payload:
            merged["properties"] = merge_scoped_list(current.get("properties", []), payload.get("properties", []), lambda item: item.get("id") not in property_ids)
        if "propertyCleaners" in payload:
            merged["propertyCleaners"] = merge_scoped_list(current.get("propertyCleaners", []), payload.get("propertyCleaners", []), lambda item: item.get("property_id") not in property_ids)
        if "rooms" in payload:
            incoming_rooms = []
            for room in payload.get("rooms", []):
                if not isinstance(room, dict):
                    continue
                property_id = str(room.get("property_id") or first_actor_property_id(actor, current))
                if property_id not in property_ids:
                    continue
                fixed = dict(room)
                fixed["property_id"] = property_id
                incoming_rooms.append(fixed)
            merged["rooms"] = merge_scoped_list(current.get("rooms", []), incoming_rooms, lambda item: item.get("id") not in room_ids)
            room_ids = {room.get("id") for room in incoming_rooms if isinstance(room, dict)} | {
                room.get("id") for room in current.get("rooms", []) if isinstance(room, dict) and room.get("property_id") in property_ids
            }
        if "bookings" in payload:
            merged["bookings"] = merge_scoped_list(current.get("bookings", []), payload.get("bookings", []), lambda item: item.get("room_id") not in room_ids)
        if "manualChanges" in payload:
            merged["manualChanges"] = merge_scoped_list(
                current.get("manualChanges", []),
                payload.get("manualChanges", []),
                lambda item: (
                    (item.get("target_type") == "common" and item.get("target_id") not in common_area_ids)
                    or (item.get("target_type") != "common" and item.get("target_id") not in room_ids)
                ),
            )
        if "cleaningNotes" in payload:
            merged["cleaningNotes"] = merge_scoped_list(
                current.get("cleaningNotes", []),
                payload.get("cleaningNotes", []),
                lambda item: (
                    (item.get("target_type") == "common" and item.get("target_id") not in common_area_ids)
                    or (item.get("target_type") != "common" and item.get("target_id") not in room_ids)
                ),
            )
        if "roomDateNotes" in payload:
            merged["roomDateNotes"] = merge_scoped_list(current.get("roomDateNotes", []), payload.get("roomDateNotes", []), lambda item: item.get("room_id") not in room_ids)
        if "commonAreas" in payload:
            incoming_common_areas = []
            for area in payload.get("commonAreas", []):
                if not isinstance(area, dict):
                    continue
                property_id = str(area.get("property_id") or first_actor_property_id(actor, current))
                if property_id not in property_ids:
                    continue
                fixed = dict(area)
                fixed["property_id"] = property_id
                fixed.setdefault("type", "common")
                incoming_common_areas.append(fixed)
            merged["commonAreas"] = merge_scoped_list(
                current.get("commonAreas", []),
                incoming_common_areas,
                lambda item: (item.get("property_id") or first_actor_property_id(actor, current)) not in property_ids,
            )
        if "users" in payload:
            if not actor_has_permission(actor, "users_manage"):
                raise RuntimeError("user permission required")
            cleaner_codes = {
                normalize_cleaner_code(item.get("cleaner_code"))
                for item in current.get("propertyCleaners", [])
                if isinstance(item, dict) and item.get("property_id") in property_ids
            }
            incoming_by_id = {
                str(item.get("id")): item
                for item in payload.get("users", [])
                if isinstance(item, dict) and item.get("id")
            }

            def can_update_user(row):
                if not isinstance(row, dict):
                    return False
                if row.get("id") == actor.get("id"):
                    return True
                if row.get("role") == "owner" and user_group_ids(row) & user_group_ids(actor):
                    return True
                if row.get("role") == "cleaner" and normalize_cleaner_code(row.get("cleaner_code")) in cleaner_codes:
                    return True
                return False

            editable_fields = {
                "name",
                "email",
                "phone",
                "mobile",
                "tel",
                "phone_number",
                "wechat",
                "weixin",
                "wx",
                "wechat_id",
                "timezone",
                "time_zone",
                "timeZone",
                "language",
                "locale",
                "lang",
                "default_room_ids",
                "defaultRoomIds",
            }
            fixed_users = []
            for existing in current.get("users", []):
                if not isinstance(existing, dict):
                    continue
                incoming = incoming_by_id.get(str(existing.get("id")))
                if incoming and can_update_user(existing):
                    fixed = dict(existing)
                    for field in editable_fields:
                        if field in incoming:
                            fixed[field] = plain(incoming.get(field))
                    if "permissions" in incoming:
                        fixed["permissions"] = sanitize_permissions(incoming.get("permissions"))
                    raw_props = incoming.get("allowed_property_ids", incoming.get("property_ids", incoming.get("propertyIds")))
                    if isinstance(raw_props, list):
                        allowed = [str(item) for item in raw_props if str(item or "").strip() in {str(pid) for pid in property_ids}]
                        fixed["allowed_property_ids"] = allowed
                    fixed_users.append(fixed)
                else:
                    fixed_users.append(existing)
            merged["users"] = fixed_users

        def scoped_property_rows(key):
            rows = []
            for item in payload.get(key, []):
                if not isinstance(item, dict):
                    continue
                fixed = dict(item)
                property_id = str(fixed.get("property_id") or pms_item_property_id(fixed, current) or first_actor_property_id(actor, current))
                if property_id not in property_ids:
                    continue
                fixed["property_id"] = property_id
                rows.append(fixed)
            merged[key] = merge_scoped_list(
                current.get(key, []),
                rows,
                lambda item: pms_item_property_id(item, current) not in property_ids,
            )
        for key in ["maintenanceTickets", "inventoryItems", "expenseRecords", "guestProfiles", "auditLog"]:
            if key in payload:
                if key == "expenseRecords" and not actor_has_permission(actor, "finance_edit"):
                    raise RuntimeError("finance permission required")
                scoped_property_rows(key)
        for key in ["last_sync", "sync_errors"]:
            if key in payload:
                merged[key] = payload.get(key)
        validate_property_names_unique(merged)
        return save_state(merged)
    merged = dict(payload)
    for key in STATE_KEYS:
        if key not in merged:
            merged[key] = current.get(key, [])
    if "users" in merged:
        current_by_id = {user.get("id"): user for user in current.get("users", []) if isinstance(user, dict)}
        fixed_users = []
        for user in merged.get("users", []):
            if not isinstance(user, dict):
                continue
            old = current_by_id.get(user.get("id"))
            if old and old.get("password_hash") and not user.get("password_hash"):
                user = dict(user)
                user["password_hash"] = old.get("password_hash")
            fixed_users.append(user)
        merged["users"] = fixed_users
    validate_property_names_unique(merged)
    return save_state(merged)


def generate_cleaner_code(state):
    existing = {normalize_cleaner_code(user.get("cleaner_code")) for user in state.get("users", []) if isinstance(user, dict)}
    for _ in range(100):
        code = f"CLN-{secrets.randbelow(9000) + 1000}"
        if code not in existing:
            return code
    return f"CLN-{secrets.token_hex(3).upper()}"



def normalized_property_name(value):
    return re.sub(r"\s+", "", str(value or "").strip()).lower()


def validate_property_names_unique(state):
    seen = set()
    for prop in normalize_state(state).get("properties", []):
        if not isinstance(prop, dict):
            continue
        key = normalized_property_name(prop.get("name"))
        if not key:
            continue
        scoped = (prop.get("group_id") or DEFAULT_GROUP_ID, key)
        if scoped in seen:
            raise RuntimeError("同一房东下房源名字不能重复")
        seen.add(scoped)


def username_key(value):
    return str(value or "").strip().lower()


def login_name_exists(state, username):
    key = username_key(username)
    if not key:
        return False
    return find_user_for_login(state, key) is not None


def unique_state_id(state, prefix, field="id"):
    existing = {str(item.get(field) or "") for key in STATE_KEYS for item in state.get(key, []) if isinstance(item, dict)}
    for _ in range(100):
        candidate = f"{prefix}_{secrets.token_hex(4)}"
        if candidate not in existing:
            return candidate
    return f"{prefix}_{secrets.token_hex(8)}"


def register_owner(payload):
    if not isinstance(payload, dict):
        raise RuntimeError("payload must be an object")
    username = str(payload.get("username") or "").strip()
    password = str(payload.get("password") or "").strip()
    name = str(payload.get("name") or "").strip() or username
    if not username:
        raise RuntimeError("username is required")
    if not password:
        raise RuntimeError("password is required")
    state = normalize_state(load_main_state())
    if login_name_exists(state, username):
        raise RuntimeError("username already exists")
    group_id = unique_state_id(state, "group")
    owner_id = unique_state_id(state, "owner")
    property_id = unique_state_id(state, "property")
    state["groups"].append({"id": group_id, "name": f"{name}的房东组", "created_at": now_utc_iso()})
    user = {
        "id": owner_id,
        "username": username,
        "role": "owner",
        "name": name,
        "group_ids": [group_id],
        "password_hash": password_hash(password),
        "created_at": now_utc_iso(),
    }
    state["users"].append(user)
    state["properties"].append({"id": property_id, "group_id": group_id, "name": "默认房源", "created_at": now_utc_iso()})
    saved = save_state(state)
    return saved, public_user(user)

def register_cleaner(payload):
    if not isinstance(payload, dict):
        raise RuntimeError("payload must be an object")
    name = str(payload.get("name") or "").strip()
    phone = str(payload.get("phone") or "").strip()
    password = str(payload.get("password") or "").strip()
    if not name:
        raise RuntimeError("name is required")
    if not password:
        raise RuntimeError("password is required")
    state = normalize_state(load_main_state())
    cleaner_code = normalize_cleaner_code(payload.get("cleaner_code")) or generate_cleaner_code(state)
    if any(normalize_cleaner_code(user.get("cleaner_code")) == cleaner_code for user in state["users"] if isinstance(user, dict)):
        raise RuntimeError("cleaner code already exists")
    user = {
        "id": f"cleaner_{cleaner_code.lower().replace('-', '_')}",
        "role": "cleaner",
        "username": name,
        "name": name,
        "phone": phone,
        "cleaner_code": cleaner_code,
        "password_hash": password_hash(password),
        "created_at": now_utc_iso(),
    }
    state["users"].append(user)
    saved = save_state(state)
    return saved, public_user(user)


def actor_group_ids(actor):
    if not actor:
        return set()
    if actor.get("role") == "admin":
        return None
    return user_group_ids(actor)


def actor_property_ids(actor, state):
    state = normalize_state(state)
    if not actor or actor.get("role") == "admin":
        return {prop.get("id") for prop in state.get("properties", []) if isinstance(prop, dict)}
    if actor.get("role") == "owner":
        groups = user_group_ids(actor)
        property_ids = {prop.get("id") for prop in state.get("properties", []) if isinstance(prop, dict) and prop.get("group_id") in groups}
        raw_allowed = actor.get("allowed_property_ids")
        if raw_allowed is None:
            raw_allowed = actor.get("property_ids")
        if raw_allowed is None:
            raw_allowed = actor.get("propertyIds")
        if isinstance(raw_allowed, list):
            allowed = {str(item) for item in raw_allowed if str(item or "").strip()}
            property_ids = {item for item in property_ids if str(item) in allowed}
        return property_ids
    cleaner_code = normalize_cleaner_code(actor.get("cleaner_code"))
    return {
        item.get("property_id")
        for item in state.get("propertyCleaners", [])
        if isinstance(item, dict) and normalize_cleaner_code(item.get("cleaner_code")) == cleaner_code
    }


def actor_room_ids(actor, state):
    property_ids = actor_property_ids(actor, state)
    return {
        room.get("id")
        for room in normalize_state(state).get("rooms", [])
        if isinstance(room, dict) and room.get("property_id") in property_ids
    }


def first_actor_property_id(actor, state):
    property_ids = sorted(item for item in actor_property_ids(actor, state) if item)
    return property_ids[0] if property_ids else DEFAULT_PROPERTY_ID


def can_manage_property(actor, state, property_id):
    if not actor:
        return False
    if actor.get("role") == "admin":
        return True
    return property_id in actor_property_ids(actor, state)


def save_room(room_id, payload, actor=None):
    room_id = str(room_id or "").strip()
    if not room_id:
        raise RuntimeError("room_id is required")
    if not isinstance(payload, dict):
        raise RuntimeError("room payload must be an object")
    state = normalize_state(load_state())
    room = next((item for item in state["rooms"] if item.get("id") == room_id), None)
    if room is None:
        room = {"id": room_id, "type": "room"}
        state["rooms"].append(room)
    requested_property_id = str(payload.get("property_id") or room.get("property_id") or first_actor_property_id(actor, state))
    if actor and not can_manage_property(actor, state, requested_property_id):
        raise RuntimeError("property permission required")
    payload = dict(payload)
    payload["property_id"] = requested_property_id
    for field in ROOM_FIELDS:
        if field not in payload:
            continue
        if field == "cleaning_fee":
            try:
                value = float(payload.get(field) or 0)
                room[field] = int(value) if value.is_integer() else value
            except Exception:
                room[field] = 0
        else:
            room[field] = str(payload.get(field) or "")
    room["id"] = room_id
    room["type"] = "room"
    saved = save_state(state)
    saved_room = next((item for item in saved["rooms"] if item.get("id") == room_id), room)
    return saved, saved_room


def save_property(property_id, payload, actor=None):
    property_id = str(property_id or "").strip()
    if not property_id:
        raise RuntimeError("property_id is required")
    if not isinstance(payload, dict):
        raise RuntimeError("property payload must be an object")
    state = normalize_state(load_state())
    requested_group_id = str(payload.get("group_id") or state.get("current_group_id") or DEFAULT_GROUP_ID)
    if actor and actor.get("role") != "admin":
        groups = sorted(user_group_ids(actor))
        requested_group_id = groups[0] if groups else DEFAULT_GROUP_ID
        existing = next((item for item in state["properties"] if item.get("id") == property_id), None)
        if existing and existing.get("group_id") not in groups:
            raise RuntimeError("property permission required")
    prop = next((item for item in state["properties"] if item.get("id") == property_id), None)
    if prop is None:
        prop = {"id": property_id, "group_id": requested_group_id}
        state["properties"].append(prop)
    proposed_group_id = requested_group_id if actor and actor.get("role") != "admin" else str(payload.get("group_id") or prop.get("group_id") or state.get("current_group_id") or DEFAULT_GROUP_ID)
    proposed_name = str(payload.get("name") or prop.get("name") or "未命名房源").strip()
    name_key = normalized_property_name(proposed_name)
    if name_key and any(
        item.get("id") != property_id
        and item.get("group_id") == proposed_group_id
        and normalized_property_name(item.get("name")) == name_key
        for item in state["properties"]
        if isinstance(item, dict)
    ):
        raise RuntimeError("同一房东下房源名字不能重复")
    prop["id"] = property_id
    prop["group_id"] = proposed_group_id
    prop["name"] = proposed_name
    saved = save_state(state)
    saved_prop = next((item for item in saved["properties"] if item.get("id") == property_id), prop)
    return saved, saved_prop


def update_property_cleaner(payload, actor=None):
    if not isinstance(payload, dict):
        raise RuntimeError("payload must be an object")
    property_id = str(payload.get("property_id") or "").strip()
    cleaner_code = normalize_cleaner_code(payload.get("cleaner_code"))
    action = str(payload.get("action") or "bind").strip().lower()
    if not property_id:
        raise RuntimeError("property_id is required")
    if not cleaner_code:
        raise RuntimeError("cleaner_code is required")
    state = normalize_state(load_main_state())
    if not any(prop.get("id") == property_id for prop in state["properties"]):
        raise RuntimeError("property not found")
    if actor and not can_manage_property(actor, state, property_id):
        raise RuntimeError("property permission required")
    cleaner = next((user for user in state["users"] if isinstance(user, dict) and user.get("role") == "cleaner" and normalize_cleaner_code(user.get("cleaner_code")) == cleaner_code), None)
    if cleaner is None:
        raise RuntimeError("cleaner code not found")
    state["propertyCleaners"] = [
        item for item in state["propertyCleaners"]
        if not (item.get("property_id") == property_id and normalize_cleaner_code(item.get("cleaner_code")) == cleaner_code)
    ]
    if action not in ("unbind", "delete", "remove"):
        state["propertyCleaners"].append({"property_id": property_id, "cleaner_code": cleaner_code, "created_at": now_utc_iso()})
    return save_state(state)


def parse_query(path):
    parsed = urllib.parse.urlparse(path)
    return parsed, urllib.parse.parse_qs(parsed.query)


def query_value(handler, name):
    _, qs = parse_query(handler.path)
    return qs.get(name, [""])[0]


def cookie_value(handler, name):
    cookie_header = handler.headers.get("Cookie", "")
    for part in cookie_header.split(";"):
        if "=" not in part:
            continue
        key, value = part.strip().split("=", 1)
        if key == name:
            return urllib.parse.unquote(value)
    return ""


def make_session_token(user_id):
    expires = int(datetime.now(timezone.utc).timestamp()) + SESSION_SECONDS
    message = f"{user_id}:{expires}"
    signature = hmac.new(SESSION_SECRET.encode("utf-8"), message.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"{message}:{signature}"


def parse_session_token(token):
    try:
        user_id, expires, signature = str(token or "").split(":", 2)
        expires_int = int(expires)
    except Exception:
        return ""
    if expires_int < int(datetime.now(timezone.utc).timestamp()):
        return ""
    message = f"{user_id}:{expires}"
    expected = hmac.new(SESSION_SECRET.encode("utf-8"), message.encode("utf-8"), hashlib.sha256).hexdigest()
    return user_id if hmac.compare_digest(signature, expected) else ""


def find_user_by_id(state, user_id):
    return next((user for user in state.get("users", []) if isinstance(user, dict) and user.get("id") == user_id), None)


def find_user_for_login(state, username):
    username = str(username or "").strip().lower()
    if not username:
        return None
    for user in state.get("users", []):
        if not isinstance(user, dict):
            continue
        candidates = [
            str(user.get("username") or ""),
            str(user.get("name") or ""),
            str(user.get("cleaner_code") or ""),
            str(user.get("phone") or ""),
        ]
        if username in {item.strip().lower() for item in candidates if item}:
            return user
    return None



def load_main_state():
    base_loader = globals().get("_pms_external_base_load_state")
    if callable(base_loader):
        return normalize_state(base_loader())
    return normalize_state(load_state())


def save_state_from_payload_light(payload, actor=None):
    original_load_state = globals().get("load_state")
    original_save_state = globals().get("save_state")
    external_keys = tuple(globals().get("_PMS_EXTERNAL_STATE_KEYS", ()))
    base_load_state = globals().get("_pms_external_base_load_state")
    base_save_state = globals().get("_pms_external_base_save_state") or original_save_state

    def light_load_state():
        if callable(base_load_state):
            return normalize_state(base_load_state())
        if callable(original_load_state):
            return normalize_state(original_load_state())
        return normalize_state(default_state())

    def light_save_state(state):
        compact_state = dict(normalize_state(state))
        for key in external_keys:
            compact_state.pop(key, None)
        if callable(base_save_state):
            saved = base_save_state(compact_state)
        else:
            saved = compact_state
        return normalize_state(saved)

    globals()["load_state"] = light_load_state
    globals()["save_state"] = light_save_state
    try:
        return save_state_from_payload(payload, actor=actor)
    finally:
        if callable(original_load_state):
            globals()["load_state"] = original_load_state
        if callable(original_save_state):
            globals()["save_state"] = original_save_state


def pms_public_profile(user):
    public = {}
    if not isinstance(user, dict):
        return public
    for key in ("id", "role", "username", "name", "email", "phone", "mobile", "tel", "phone_number", "wechat", "weixin", "wx", "wechat_id", "cleaner_code", "group_id", "group_ids", "default_room_ids", "defaultRoomIds", "timezone", "time_zone", "timeZone", "language", "locale", "lang", "permissions", "allowed_property_ids", "property_ids", "propertyIds"):
        value = user.get(key)
        if value not in (None, ""):
            public[key] = value
    return public


def pms_valid_timezone(value):
    text = str(value or "").strip()
    if not text:
        return ""
    try:
        ZoneInfo(text)
        return text
    except Exception:
        return ""


def pms_valid_language(value):
    text = str(value or "").strip()
    aliases = {
        "zh": "zh-CN",
        "zh-cn": "zh-CN",
        "zh-hans": "zh-CN",
        "cn": "zh-CN",
        "en": "en-US",
        "en-us": "en-US",
        "es": "es-ES",
        "es-es": "es-ES",
    }
    return aliases.get(text.lower(), "") if text else ""


def update_current_user_profile(payload, actor=None):
    if not isinstance(payload, dict):
        raise RuntimeError("payload must be an object")
    if not actor:
        raise RuntimeError("login required")
    display_name = str(payload.get("name") or payload.get("display_name") or payload.get("displayName") or "").strip()
    if len(display_name) > 80:
        raise RuntimeError("display name is too long")
    timezone_value = pms_valid_timezone(payload.get("timezone") or payload.get("time_zone") or payload.get("timeZone"))
    language_value = pms_valid_language(payload.get("language") or payload.get("locale") or payload.get("lang"))

    state = normalize_state(load_main_state())
    users = state.setdefault("users", [])
    actor_id = str(actor.get("id") or "")
    actor_username = str(actor.get("username") or "").strip().lower()
    target = None
    for row in users:
        if isinstance(row, dict) and actor_id and str(row.get("id") or "") == actor_id:
            target = row
            break
    if target is None and actor_username:
        for row in users:
            if isinstance(row, dict) and str(row.get("username") or "").strip().lower() == actor_username:
                target = row
                break
    if target is None:
        raise RuntimeError("user not found")

    if not display_name:
        display_name = str(target.get("name") or target.get("username") or actor.get("name") or actor.get("username") or "").strip()
    if not display_name and not timezone_value and not language_value and not ("default_room_ids" in payload or "defaultRoomIds" in payload):
        raise RuntimeError("display name is required")
    if display_name:
        target["name"] = display_name
    if timezone_value:
        target["timezone"] = timezone_value
        target["time_zone"] = timezone_value
    if language_value:
        target["language"] = language_value
        target["locale"] = language_value
    if "default_room_ids" in payload or "defaultRoomIds" in payload:
        raw_defaults = payload.get("default_room_ids", payload.get("defaultRoomIds"))
        if raw_defaults is None:
            raw_defaults = []
        if not isinstance(raw_defaults, list):
            raise RuntimeError("default room ids must be a list")
        if actor.get("role") == "admin":
            allowed_room_ids = {
                str(room.get("id") or "")
                for room in state.get("rooms", [])
                if isinstance(room, dict) and room.get("id")
            }
        else:
            allowed_room_ids = {str(item or "") for item in actor_room_ids(actor, state)}
        clean_defaults = []
        for item in raw_defaults:
            room_id = str(item or "").strip()
            if room_id and room_id in allowed_room_ids and room_id not in clean_defaults:
                clean_defaults.append(room_id)
        if not clean_defaults:
            raise RuntimeError("default room selection is empty")
        target["default_room_ids"] = clean_defaults
        target["defaultRoomIds"] = clean_defaults
    target["updated_at"] = now_utc_iso()
    base_save_state = globals().get("_pms_external_base_save_state")
    if callable(base_save_state):
        saved = base_save_state(state)
    else:
        saved = save_state(state)
    public_profile = pms_public_profile(target)
    updated_actor = dict(actor)
    updated_actor.update(public_profile)
    return normalize_state(saved), public_profile, updated_actor

def authenticate_user(username, password):
    state = normalize_state(load_main_state())
    user = find_user_for_login(state, username)
    if not user or not verify_password(user.get("password_hash"), password):
        return None
    return user


def current_user(handler):
    user_id = parse_session_token(cookie_value(handler, SESSION_COOKIE))
    if not user_id:
        return None
    return find_user_by_id(normalize_state(load_main_state()), user_id)


def require_user(handler, roles=None):
    user = current_user(handler)
    if not user:
        json_response(handler, {"ok": False, "error": "login required"}, 401)
        return None
    if roles and user.get("role") not in roles:
        json_response(handler, {"ok": False, "error": "permission required"}, 403)
        return None
    return user


def is_owner(handler):
    user = current_user(handler)
    return bool(user and user.get("role") in ("admin", "owner"))


def is_cleaner(handler):
    user = current_user(handler)
    return bool(user and user.get("role") in ("admin", "owner", "cleaner"))


def _pms_inject_html_version_badge(text, content_type):
    raw = str(text)
    if "text/html" not in str(content_type or "").lower():
        return raw
    badge = ""
    if 'id="pmsVersionBadge"' not in raw:
        badge = f"""<style id="pmsVersionBadgeServerStyle">
#pmsVersionBadge{{display:inline-flex;align-items:center;justify-content:center;border:1px solid #99f6e4;background:#ecfeff;color:#0f766e;border-radius:999px;padding:6px 9px;font:900 11px/1 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",Arial,sans-serif;white-space:nowrap;box-shadow:0 8px 20px rgba(15,23,42,.08);pointer-events:none;opacity:.9}}
</style><span id="pmsVersionBadge" class="pms-version-badge">PMS v{PMS_APP_VERSION}</span>"""
    inject = badge
    if not inject:
        return raw
    marker = "</body>"
    if marker in raw:
        return raw.replace(marker, inject + marker, 1)
    return raw + inject


def text_response(handler, text, status=200, content_type="text/plain; charset=utf-8"):
    data = _pms_inject_html_version_badge(text, content_type).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", content_type)
    handler.send_header("Content-Length", str(len(data)))
    handler.send_header("Cache-Control", "no-store")
    handler.end_headers()
    handler.wfile.write(data)


def json_response(handler, payload, status=200, extra_headers=None):
    data = json.dumps(plain(payload), ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(data)))
    handler.send_header("Cache-Control", "no-store")
    for key, value in (extra_headers or {}).items():
        handler.send_header(key, value)
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



def ical_clean_text(value):
    return (
        str(value or "")
        .replace("\\n", " ")
        .replace("\\N", " ")
        .replace("\\,", ",")
        .replace("\\;", ";")
        .strip()
    )


def ical_lock_reason(summary="", description="", status=""):
    text = " ".join([ical_clean_text(summary), ical_clean_text(description), ical_clean_text(status)]).lower()
    if not text:
        return ""
    if ("reserved" in text or "reservation" in text) and not any(word in text for word in ["not available", "unavailable", "blocked", "closed"]):
        return ""
    patterns = [
        "not available",
        "unavailable",
        "blocked",
        "calendar blocked",
        "closed",
        "not open",
        "不开放",
        "锁定",
        "关闭",
        "不可订",
        "不可预订",
        "已阻止",
    ]
    if any(pattern in text for pattern in patterns):
        return ical_clean_text(summary) or ical_clean_text(description) or "平台关闭日历或关联房源占用"
    return ""


def parse_ics(text, platform, room_id):
    events, in_event, current = [], False, {}
    lines = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    unfolded = []
    for line in lines:
        if (line.startswith(" ") or line.startswith("\t")) and unfolded:
            unfolded[-1] += line[1:]
        else:
            unfolded.append(line)
    for line in unfolded:
        line = line.strip("\ufeff")
        if line == "BEGIN:VEVENT":
            in_event, current = True, {}
            continue
        if line == "END:VEVENT":
            checkin, checkout = current.get("checkin"), current.get("checkout")
            if in_event and checkin:
                if not checkout:
                    checkout = (datetime.strptime(checkin, "%Y-%m-%d") + timedelta(days=1)).strftime("%Y-%m-%d")
                if checkout > checkin:
                    summary = ical_clean_text(current.get("summary"))
                    description = ical_clean_text(current.get("description"))
                    reason = ical_lock_reason(summary, description, current.get("status"))
                    if reason:
                        in_event = False
                        continue
                    if reason:
                        events.append({
                            "room_id": room_id,
                            "platform": platform,
                            "guest": "",
                            "checkin": checkin,
                            "checkout": checkout,
                            "status": "不开放锁定",
                            "source": "ical",
                            "booking_type": "lock",
                            "is_locked": True,
                            "lock_reason": reason,
                            "summary": summary,
                        })
                    else:
                        events.append({
                            "room_id": room_id,
                            "platform": platform,
                            "guest": "",
                            "checkin": checkin,
                            "checkout": checkout,
                            "status": summary or f"{platform} iCal",
                            "source": "ical",
                            "booking_type": "booking",
                            "is_locked": False,
                            "summary": summary,
                        })
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
        elif key == "DESCRIPTION":
            current["description"] = value.strip()
        elif key == "STATUS":
            current["status"] = value.strip()
    return events


def fetch_text(url):
    req = urllib.request.Request(url, headers={"User-Agent": "PMS-Firebase/1.0"})
    timeout = float(os.environ.get("PMS_ICAL_FETCH_TIMEOUT_SECONDS", "8"))
    max_bytes = int(os.environ.get("PMS_ICAL_FETCH_MAX_BYTES", "1048576"))
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = resp.read(max_bytes + 1)
            if len(data) > max_bytes:
                raise RuntimeError(f"iCal file too large: over {max_bytes} bytes")
            return data.decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"iCal fetch HTTP {exc.code}") from exc
    except Exception as exc:
        host = urllib.parse.urlparse(str(url or "")).netloc or "iCal"
        reason = getattr(exc, "reason", None) or str(exc) or exc.__class__.__name__
        raise RuntimeError(f"iCal fetch failed from {host}: {reason}") from exc


def _pms_legacy_sync_icals(actor=None, property_id=None):
    state = normalize_state(load_state())
    allowed_property_ids = actor_property_ids(actor, state) if actor else {prop.get("id") for prop in state.get("properties", []) if isinstance(prop, dict)}
    requested_property_id = str(property_id or "").strip()
    if requested_property_id:
        if requested_property_id not in allowed_property_ids:
            raise RuntimeError("property permission required")
        allowed_property_ids = {requested_property_id}
    allowed_room_ids = {
        room.get("id")
        for room in state.get("rooms", [])
        if isinstance(room, dict) and room.get("property_id") in allowed_property_ids
    }
    sync_time = datetime.now().isoformat(timespec="seconds")
    state["bookings"] = [
        booking
        for booking in state.get("bookings", [])
        if booking.get("source") != "ical" or booking.get("room_id") not in allowed_room_ids
    ]
    errors = []
    for room in state.get("rooms", []):
        if room.get("id") not in allowed_room_ids:
            continue
        room_id = room.get("id")
        room["last_sync"] = sync_time
        room["sync_error"] = ""
        room["synced_booking_count"] = 0
        for platform, url in [("Airbnb", room.get("airbnb_ical", "")), ("Booking", room.get("booking_ical", "")), ("Vrbo", room.get("vrbo_ical", "")), ("Other", room.get("other_ical", ""))]:
            url = (url or "").strip()
            if not url:
                continue
            try:
                imported = parse_ics(fetch_text(url), platform, room_id)
                room["synced_booking_count"] = int(room.get("synced_booking_count") or 0) + len(imported)
                state["bookings"].extend(imported)
            except Exception as exc:
                message = str(exc)
                room["sync_error"] = (room.get("sync_error") + "；" if room.get("sync_error") else "") + f"{platform}: {message}"
                errors.append({"room_id": room_id, "platform": platform, "error": message})
    state["last_sync"] = sync_time
    state["sync_errors"] = errors
    return save_state(state)


def ics_escape(text):
    return str(text or "").replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


def _pms_legacy_make_feed(room_id):
    state = normalize_state(load_state())
    room = next((item for item in state["rooms"] if item.get("id") == room_id), None)
    if not room:
        return None
    now = datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//PMS Firebase//CN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", f"X-WR-CALNAME:{ics_escape(room.get('name', 'Room'))} PMS Calendar"]
    for index, booking in enumerate(state.get("bookings", [])):
        if booking.get("room_id") != room_id or booking.get("platform") == "Airbnb" or not booking.get("checkin") or not booking.get("checkout"):
            continue
        uid = f"{room_id}-{booking.get('checkin')}-{booking.get('checkout')}-{index}@pms"
        summary = f"{booking.get('platform', 'PMS')} booked"
        lines.extend(["BEGIN:VEVENT", f"UID:{ics_escape(uid)}", f"DTSTAMP:{now}", f"DTSTART;VALUE=DATE:{str(booking.get('checkin')).replace('-', '')}", f"DTEND;VALUE=DATE:{str(booking.get('checkout')).replace('-', '')}", f"SUMMARY:{ics_escape(summary)}", "TRANSP:OPAQUE", "END:VEVENT"])
    lines.append("END:VCALENDAR")
    return "\r\n".join(lines) + "\r\n"


def login_page():
    return """<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>PMS 登录</title>
<style>
body{margin:0;background:#f5f7fb;color:#182230;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",Arial,sans-serif}
main{max-width:460px;margin:10vh auto;padding:0 16px}
.card{background:#fff;border:1px solid #d9e1ec;border-radius:12px;padding:22px;box-shadow:0 8px 22px rgba(16,24,40,.06)}
h1{font-size:24px;margin:0 0 8px}.small{color:#667085;font-size:14px;line-height:1.5}
label{display:block;font-weight:800;margin:14px 0 6px}
input{width:100%;box-sizing:border-box;border:1px solid #d9e1ec;border-radius:10px;padding:11px;font-size:15px}
button{width:100%;margin-top:16px;border:0;border-radius:10px;background:#0f766e;color:#fff;font-weight:800;padding:12px 14px;cursor:pointer}
.links{display:flex;justify-content:space-between;gap:12px;margin-top:14px}.links a{color:#0f766e;text-decoration:none;font-weight:700}
.err{margin-top:12px;color:#b42318;font-weight:700;min-height:20px}
</style>
</head>
<body>
<main>
  <div class="card">
    <h1>PMS 登录</h1>
    <div class="small">管理员、房东、保洁都需要账号和密码登录后才能进入对应页面。</div>
    <label>账号</label>
    <input id="username" autocomplete="username" autofocus>
    <label>密码</label>
    <input id="password" type="password" autocomplete="current-password">
    <button id="loginBtn" onclick="login()">登录</button>
    <div id="error" class="err"></div>
    <div class="links">
      <a href="/owner-register">房东注册</a>
      <a href="/cleaner-register">保洁注册</a>
    </div>
  </div>
</main>
<script>
async function login(){
  const btn = document.getElementById('loginBtn');
  const err = document.getElementById('error');
  btn.disabled = true;
  btn.textContent = '登录中...';
  err.textContent = '';
  try{
    const res = await fetch('/api/login', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        username: document.getElementById('username').value,
        password: document.getElementById('password').value
      })
    });
    const data = await res.json().catch(() => ({}));
    if(!res.ok || data.ok === false){ throw new Error(data.error || '登录失败'); }
    location.href = data.redirect || '/owner';
  }catch(e){
    err.textContent = e.message;
  }finally{
    btn.disabled = false;
    btn.textContent = '登录';
  }
}
document.addEventListener('keydown', event => {
  if(event.key === 'Enter') login();
});
</script>
</body>
</html>"""



def owner_register_page():
    return """<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>房东注册</title>
<style>
body{margin:0;background:#f5f7fb;color:#182230;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",Arial,sans-serif}
main{max-width:520px;margin:8vh auto;padding:0 16px}
.card{background:#fff;border:1px solid #d9e1ec;border-radius:12px;padding:20px;box-shadow:0 8px 22px rgba(16,24,40,.06)}
h1{font-size:24px;margin:0 0 8px}.small{color:#667085;font-size:14px;line-height:1.5}
label{display:block;font-weight:800;margin:14px 0 6px}
input{width:100%;box-sizing:border-box;border:1px solid #d9e1ec;border-radius:10px;padding:11px;font-size:15px}
button{width:100%;margin-top:16px;border:0;border-radius:10px;background:#0f766e;color:#fff;font-weight:800;padding:12px 14px;cursor:pointer}
.links{display:flex;justify-content:space-between;gap:12px;margin-top:14px}.links a{color:#0f766e;text-decoration:none;font-weight:700}
.result{margin-top:16px;padding:12px;border-radius:10px;background:#f0fdfa;border:1px solid #99f6e4;word-break:break-all}
.err{background:#fff1f2;border-color:#fb7185}
</style>
</head>
<body>
<main>
  <div class="card">
    <h1>房东注册</h1>
    <div class="small">注册后会自动创建你的房东组和一个默认房源。进入后台后可以重命名房源、添加房间和绑定保洁。</div>
    <label>用户名</label>
    <input id="username" autocomplete="username" autofocus>
    <label>显示名字</label>
    <input id="name" autocomplete="name" placeholder="例如：默认房东">
    <label>登录密码</label>
    <input id="password" type="password" autocomplete="new-password">
    <button id="submitBtn" onclick="registerOwner()">注册并进入后台</button>
    <div id="result"></div>
    <div class="links"><a href="/login">返回登录</a><a href="/cleaner-register">保洁注册</a></div>
  </div>
</main>
<script>
async function registerOwner(){
  const btn = document.getElementById('submitBtn');
  const result = document.getElementById('result');
  btn.disabled = true;
  btn.textContent = '注册中...';
  result.innerHTML = '';
  try{
    const res = await fetch('/api/owners/register', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        username: document.getElementById('username').value,
        name: document.getElementById('name').value,
        password: document.getElementById('password').value
      })
    });
    const data = await res.json().catch(() => ({}));
    if(!res.ok || data.ok === false){ throw new Error(data.error || '注册失败'); }
    location.href = data.redirect || '/owner';
  }catch(e){
    result.className = 'result err';
    result.textContent = e.message;
  }finally{
    btn.disabled = false;
    btn.textContent = '注册并进入后台';
  }
}
document.addEventListener('keydown', event => { if(event.key === 'Enter') registerOwner(); });
</script>
</body>
</html>"""

def cleaner_register_page():
    return """<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>保洁注册</title>
<style>
body{margin:0;background:#f5f7fb;color:#182230;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",Arial,sans-serif}
main{max-width:520px;margin:8vh auto;padding:0 16px}
.card{background:#fff;border:1px solid #d9e1ec;border-radius:12px;padding:20px;box-shadow:0 8px 22px rgba(16,24,40,.06)}
h1{font-size:24px;margin:0 0 8px}.small{color:#667085;font-size:14px;line-height:1.5}
label{display:block;font-weight:800;margin:14px 0 6px}
input{width:100%;box-sizing:border-box;border:1px solid #d9e1ec;border-radius:10px;padding:11px;font-size:15px}
button{margin-top:16px;border:0;border-radius:10px;background:#0f766e;color:#fff;font-weight:800;padding:12px 14px;cursor:pointer}
.result{margin-top:16px;padding:12px;border-radius:10px;background:#f0fdfa;border:1px solid #99f6e4;word-break:break-all}
.err{background:#fff1f2;border-color:#fb7185}
</style>
</head>
<body>
<main>
  <div class="card">
    <h1>保洁注册</h1>
    <div class="small">注册后系统会生成一个保洁编号。把这个编号发给房东，房东可以在对应房源里绑定你。</div>
    <label>姓名</label>
    <input id="name" autocomplete="name">
    <label>电话/微信</label>
    <input id="phone" autocomplete="tel">
    <label>登录密码</label>
    <input id="password" type="password" autocomplete="new-password">
    <button id="submitBtn" onclick="registerCleaner()">注册并生成编号</button>
    <div id="result"></div>
  </div>
</main>
<script>
async function registerCleaner(){
  const btn = document.getElementById('submitBtn');
  const result = document.getElementById('result');
  btn.disabled = true;
  btn.textContent = '注册中...';
  result.innerHTML = '';
  try{
    const res = await fetch('/api/cleaners/register', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        name: document.getElementById('name').value,
        phone: document.getElementById('phone').value,
        password: document.getElementById('password').value
      })
    });
    const data = await res.json();
    if(!res.ok || data.ok === false){ throw new Error(data.error || '注册失败'); }
    result.className = 'result';
    result.innerHTML = '<strong>注册成功</strong><br>你的保洁编号：<strong>' + data.cleaner.cleaner_code + '</strong><br><span class="small">请保存这个编号，并发给需要绑定你的房东。</span>';
  }catch(e){
    result.className = 'result err';
    result.textContent = e.message;
  }finally{
    btn.disabled = false;
    btn.textContent = '注册并生成编号';
  }
}
</script>
</body>
</html>"""


def render_index_html(raw):
    text = raw.decode("utf-8")
    text = _pms_inject_html_version_badge(text, "text/html; charset=utf-8")
    return text.encode("utf-8")


class Handler(BaseHTTPRequestHandler):
    def do_HEAD(self):
        if urllib.parse.urlparse(self.path).path in ('/', '/login', '/owner-register', '/cleaner-register', '/health', '/api/health'):
            self.send_response(200)
            self.end_headers()
            return
        self.send_response(404)
        self.end_headers()

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
            if path == "/logout":
                self.send_response(302)
                self.send_header("Location", "/login")
                self.send_header("Set-Cookie", f"{SESSION_COOKIE}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax")
                self.end_headers()
                return
            if urllib.parse.parse_qs(parsed.query).get("key"):
                self.send_response(302)
                self.send_header("Location", "/login")
                self.send_header("Set-Cookie", f"{SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax")
                self.end_headers()
                return
            if path in ("/", "/login"):
                text_response(self, login_page(), content_type="text/html; charset=utf-8")
                return
            if path == "/owner-register":
                text_response(self, owner_register_page(), content_type="text/html; charset=utf-8")
                return
            if path == "/cleaner-register":
                text_response(self, cleaner_register_page(), content_type="text/html; charset=utf-8")
                return
            if path == "/health":
                text_response(self, "OK")
                return
            if path == "/api/version":
                json_response(self, {"ok": True, "version": PMS_APP_VERSION})
                return
            if path == "/api/health":
                json_response(self, {"ok": True, "firebase_project": firebase_project_id(), "driver": "firestore-rest"})
                return
            if path == "/owner":
                user = current_user(self)
                if not user or user.get("role") not in ("admin", "owner"):
                    redirect(self, "/login")
                    return
                self.serve_static("index.html")
                return
            if path == "/cleaner":
                user = current_user(self)
                if not user or user.get("role") not in ("admin", "owner", "cleaner"):
                    redirect(self, "/login")
                    return
                self.serve_static("index.html")
                return
            if path.startswith("/api/cleaning-photo/"):
                user = require_user(self, ("admin", "owner", "cleaner"))
                if not user:
                    return
                photo_id = path.rsplit("/", 1)[-1]
                data, content_type = serve_cleaning_task_photo(photo_id, actor=user)
                pms_photo_binary_response(self, data, content_type)
                return
            if path == "/api/state":
                user = require_user(self, ("admin", "owner", "cleaner"))
                if not user:
                    return
                json_response(self, pms_state_response_for_user(pms_load_state_for_ui(), user))
                return
            if path.startswith("/feed/") and path.endswith(".ics"):
                room_id = urllib.parse.unquote(path[len("/feed/") : -len(".ics")])
                feed = make_feed(room_id)
                text_response(self, feed if feed is not None else "not found", status=200 if feed else 404, content_type="text/calendar; charset=utf-8" if feed else "text/plain; charset=utf-8")
                return
            if path.lstrip("/") == "index.html" and not current_user(self):
                redirect(self, "/login")
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
            raw = self.rfile.read(int(self.headers.get("Content-Length", "0") or "0"))
            if path == "/api/login":
                payload = json.loads(raw.decode("utf-8") or "{}")
                username = str(payload.get("username") or "").strip()
                password = str(payload.get("password") or "")
                user = authenticate_user(username, password)
                if not user:
                    json_response(self, {"ok": False, "error": "账号或密码错误"}, status=401)
                    return
                token = make_session_token(user.get("id"))
                redirect_path = "/cleaner" if user.get("role") == "cleaner" else "/owner"
                json_response(
                    self,
                    {"ok": True, "user": public_user(user), "redirect": redirect_path},
                    extra_headers={"Set-Cookie": f"{SESSION_COOKIE}={urllib.parse.quote(token)}; Path=/; Max-Age={SESSION_SECONDS}; HttpOnly; SameSite=Lax"},
                )
                return
            if path == "/api/logout":
                json_response(self, {"ok": True}, extra_headers={"Set-Cookie": f"{SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax"})
                return
            if path == "/api/profile":
                user = require_user(self, ("admin", "owner", "cleaner"))
                if not user:
                    return
                payload = json.loads(raw.decode("utf-8") or "{}")
                saved, public_profile, updated_user = update_current_user_profile(payload, actor=user)
                json_response(self, {"ok": True, "user": public_profile, "state": pms_state_response_for_user(saved, updated_user)})
                return
            if path == "/api/cleaning-photo":
                user = require_user(self, ("admin", "owner", "cleaner"))
                if not user:
                    return
                payload = json.loads(raw.decode("utf-8") or "{}")
                saved, photo = upload_cleaning_task_photo(payload, actor=user)
                json_response(self, {"ok": True, "photo": photo, "state": pms_state_response_for_user(saved, user)})
                return
            if path == "/api/state":
                user = require_user(self, ("admin", "owner"))
                if not user:
                    return
                payload = json.loads(raw.decode("utf-8") or "{}")
                save_state_from_payload_light(payload, actor=user)
                try:
                    _pms_ui_state_cache_clear()
                except Exception:
                    pass
                json_response(self, {"ok": True, "saved_at": now_utc_iso()})
                return
            if path == "/api/cleaners/register":
                payload = json.loads(raw.decode("utf-8") or "{}")
                _, cleaner = register_cleaner(payload)
                json_response(self, {"ok": True, "cleaner": cleaner})
                return
            if path == "/api/owners/register":
                payload = json.loads(raw.decode("utf-8") or "{}")
                _, owner = register_owner(payload)
                token = make_session_token(owner.get("id"))
                json_response(
                    self,
                    {"ok": True, "owner": owner, "redirect": "/owner"},
                    extra_headers={"Set-Cookie": f"{SESSION_COOKIE}={urllib.parse.quote(token)}; Path=/; Max-Age={SESSION_SECONDS}; HttpOnly; SameSite=Lax"},
                )
                return
            # _pms_mail_bridge_http_v1
            if path == "/api/mail-events/bridge":
                payload = json.loads(raw.decode("utf-8") or "{}")
                expected = _pms_gmail_setting("PMS_MAIL_BRIDGE_TOKEN")
                provided = str(
                    self.headers.get("X-PMS-Mail-Bridge-Token")
                    or payload.get("token")
                    or payload.get("bridge_token")
                    or ""
                ).strip()
                if not expected or not provided or not secrets.compare_digest(str(expected), provided):
                    json_response(self, {"ok": False, "error": "mail bridge unauthorized"}, status=403)
                    return
                payload.pop("token", None)
                payload.pop("bridge_token", None)
                bridge_actor = {"id": "mail_bridge", "role": "admin", "username": "mail_bridge", "group_ids": []}
                saved, rows = parse_mail_events(payload, bridge_actor)
                json_response(self, {"ok": True, "mailEvents": rows, "count": len(rows), "state": filter_state_for_user(saved, bridge_actor)})
                return
            # _pms_property_mail_http_v1
            if path == "/api/storage-diagnostics":
                user = require_user(self, ("admin", "owner"))
                if not user:
                    return
                json_response(self, {"ok": True, "storage": pms_storage_diagnostics()})
                return
            if path == "/api/mail-config":
                user = require_user(self, ("admin",))
                if not user:
                    return
                payload = json.loads(raw.decode("utf-8") or "{}")
                saved = save_mail_config_setting(payload, user)
                json_response(self, {"ok": True, "state": filter_state_for_user(saved, user)})
                return
            if path == "/api/property-mail":
                user = require_user(self, ("admin", "owner"))
                if not user:
                    return
                payload = json.loads(raw.decode("utf-8") or "{}")
                saved, row = save_property_mail_setting(payload, user)
                json_response(self, {"ok": True, "propertyMail": row, "state": filter_state_for_user(saved, user)})
                return
            if path == "/api/mail-events":
                user = require_user(self, ("admin", "owner"))
                if not user:
                    return
                payload = json.loads(raw.decode("utf-8") or "{}")
                saved, rows = save_mail_events(payload, user)
                json_response(self, {"ok": True, "mailEvents": rows, "state": filter_state_for_user(saved, user)})
                return
            if path == "/api/mail-events/parse":
                user = require_user(self, ("admin", "owner"))
                if not user:
                    return
                payload = json.loads(raw.decode("utf-8") or "{}")
                saved, rows = parse_mail_events(payload, user)
                json_response(self, {"ok": True, "mailEvents": rows, "state": filter_state_for_user(saved, user)})
                return
            if path == "/api/mail-diagnostics":
                user = require_user(self, ("admin", "owner"))
                if not user:
                    return
                payload = json.loads(raw.decode("utf-8") or "{}")
                diagnostics = inspect_mail_sync_diagnostics(payload, user)
                json_response(self, {"ok": True, "diagnostics": diagnostics})
                return
            if path == "/api/mail-events/sync":
                user = require_user(self, ("admin", "owner"))
                if not user:
                    return
                payload = json.loads(raw.decode("utf-8") or "{}")
                try:
                    saved, rows, details = sync_gmail_mail_events(payload, user)
                    json_response(self, {"ok": True, "mailEvents": rows, "details": details, "state": filter_state_for_user(saved, user)})
                except Exception as exc:
                    message = str(exc) or exc.__class__.__name__
                    if "GMAIL_CLIENT_ID" in message or "GMAIL_CLIENT_SECRET" in message or "GMAIL_REFRESH_TOKEN" in message or "OAuth 未配置" in message:
                        public_error = "后台 Gmail OAuth 未配置：Render 需要 GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET / GMAIL_REFRESH_TOKEN"
                    elif "没有可同步的房源邮箱设置" in message:
                        public_error = "当前房源没有可同步邮箱：先保存 Airbnb 通知邮箱"
                    elif "Gmail API" in message or "access_token" in message:
                        public_error = "Gmail 授权失败：请检查 Render 里的 Gmail refresh token 是否有效"
                    else:
                        public_error = "Gmail 同步失败，请点“检查 Gmail”查看配置状态"
                    traceback.print_exc()
                    json_response(self, {"ok": False, "error": public_error, "detail": message[:500]}, status=500)
                return
            # _pms_ical_diagnostic_http_v1
            if path == "/api/ical-diagnostics":
                user = require_user(self, ("admin", "owner"))
                if not user:
                    return
                payload = json.loads(raw.decode("utf-8") or "{}")
                json_response(self, {"ok": True, "diagnostics": inspect_ical_diagnostics(payload, user)})
                return
            if path.startswith("/api/property/"):
                user = require_user(self, ("admin", "owner"))
                if not user:
                    return
                property_id = urllib.parse.unquote(path[len("/api/property/") :])
                payload = json.loads(raw.decode("utf-8") or "{}")
                state, prop = save_property(property_id, payload, actor=user)
                json_response(self, {"ok": True, "state": filter_state_for_user(state, user), "property": prop})
                return
            if path == "/api/property-cleaner":
                user = require_user(self, ("admin", "owner"))
                if not user:
                    return
                payload = json.loads(raw.decode("utf-8") or "{}")
                state = update_property_cleaner(payload, actor=user)
                json_response(self, {"ok": True, "state": filter_state_for_user(state, user)})
                return
            if path.startswith("/api/room/"):
                user = require_user(self, ("admin", "owner"))
                if not user:
                    return
                room_id = urllib.parse.unquote(path[len("/api/room/") :])
                payload = json.loads(raw.decode("utf-8") or "{}")
                state, room = save_room(room_id, payload, actor=user)
                json_response(self, {"ok": True, "state": filter_state_for_user(state, user), "room": room})
                return
            if path == "/api/sync":
                user = require_user(self, ("admin", "owner"))
                if not user:
                    return
                payload = json.loads(raw.decode("utf-8") or "{}") if raw else {}
                try:
                    synced = sync_icals(actor=user, property_id=payload.get("property_id"), incoming_channels=payload.get("channelListings"))
                    json_response(self, {"ok": True, "state": pms_state_response_for_user(synced, user)})
                except Exception as exc:
                    message = str(exc) or exc.__class__.__name__
                    debug_id = hashlib.sha1((message + str(time.time())).encode("utf-8")).hexdigest()[:10]
                    if "iCal fetch" in message:
                        public_error = "同步失败：平台 iCal 链接读取失败，请检查对应渠道 iCal 是否仍有效。"
                    elif "Firestore" in message or "Firebase database" in message:
                        public_error = "同步失败：数据库保存或读取失败，iCal 没有被完整写入，请稍后重试。"
                    elif "property permission" in message:
                        public_error = "同步失败：当前账号没有这个房源的权限。"
                    else:
                        public_error = "同步失败：系统没有完成本次 iCal 同步。"
                    traceback.print_exc()
                    json_response(self, {"ok": False, "error": public_error, "detail": message[:500], "debug_id": debug_id}, status=500)
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
        if target.name == "index.html":
            raw = render_index_html(raw)
        self.send_response(200)
        self.send_header("Content-Type", ctype + ("; charset=utf-8" if ctype.startswith("text/") else ""))
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Last-Modified", formatdate(target.stat().st_mtime, usegmt=True))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(raw)
        return True



_pms_channel_listing_model_v1 = True

if "channelListings" not in STATE_KEYS:
    STATE_KEYS.append("channelListings")
if "icalSyncHistory" not in STATE_KEYS:
    STATE_KEYS.append("icalSyncHistory")

_pms_channel_base_default_state = _pms_core_default_state
def _pms_channel_default_state():
    state = _pms_channel_base_default_state()
    state.setdefault("channelListings", [])
    state.setdefault("icalSyncHistory", [])
    return state


def _pms_channel_safe_id(value):
    text = str(value or "").strip()
    safe = "".join(ch if (ch.isalnum() or ch in "-_") else "_" for ch in text)
    return safe or "channel"


def _pms_channel_text(value):
    return str(value or "").strip()


def _pms_channel_bool(value):
    if isinstance(value, bool):
        return value
    return str(value or "").strip().lower() in {"1", "true", "yes", "y", "on", "new", "是"}


def _pms_channel_room_ids(state):
    return {room.get("id") for room in state.get("rooms", []) if isinstance(room, dict) and room.get("id")}


def _pms_channel_clean_listing(item, state=None):
    raw = item if isinstance(item, dict) else {}
    room_id = _pms_channel_text(raw.get("room_id") or raw.get("roomId"))
    listing_id = _pms_channel_text(raw.get("id"))
    if not listing_id:
        seed = room_id + "_" + _pms_channel_text(raw.get("platform") or "channel") + "_" + _pms_channel_text(raw.get("ical_url") or raw.get("icalUrl") or raw.get("listing_url") or raw.get("listingUrl") or time.time())
        listing_id = "channel_" + _pms_channel_safe_id(seed)[:80]
    platform = _pms_channel_text(raw.get("platform") or "Airbnb") or "Airbnb"
    if platform not in {"Airbnb", "Booking", "Vrbo", "Other"}:
        platform = "Other"
    now = datetime.utcnow().isoformat(timespec="seconds")
    return {
        "id": listing_id,
        "room_id": room_id,
        "platform": platform,
        "channel_note": _pms_channel_text(raw.get("channel_note") or raw.get("channelNote") or raw.get("note") or raw.get("label")),
        "is_new_listing": _pms_channel_bool(raw.get("is_new_listing", raw.get("isNewListing", False))),
        "listing_url": _pms_channel_text(raw.get("listing_url") or raw.get("listingUrl")),
        "ical_url": _pms_channel_text(raw.get("ical_url") or raw.get("icalUrl")),
        "last_sync": _pms_channel_text(raw.get("last_sync") or raw.get("lastSync")),
        "sync_error": _pms_channel_text(raw.get("sync_error") or raw.get("syncError")),
        "sync_warning": _pms_channel_text(raw.get("sync_warning") or raw.get("syncWarning")),
        "availability_status": _pms_channel_text(raw.get("availability_status") or raw.get("availabilityStatus")),
        "synced_booking_count": int(raw.get("synced_booking_count") or raw.get("syncedBookingCount") or 0),
        "created_at": _pms_channel_text(raw.get("created_at") or raw.get("createdAt")) or now,
        "updated_at": _pms_mail_text(raw.get("updated_at")) or now,
    }


def _pms_channel_migrate_legacy_listings(state):
    listings = [_pms_channel_clean_listing(item, state) for item in state.get("channelListings", []) if isinstance(item, dict)]
    by_id = {item.get("id"): item for item in listings}
    legacy_fields = [
        ("airbnb_ical", "Airbnb", "airbnb_public_url"),
        ("booking_ical", "Booking", "booking_public_url"),
        ("vrbo_ical", "Vrbo", "vrbo_public_url"),
        ("other_ical", "Other", "other_public_url"),
    ]
    for room in state.get("rooms", []):
        if not isinstance(room, dict) or not room.get("id"):
            continue
        for field, platform, url_field in legacy_fields:
            ical_url = _pms_channel_text(room.get(field))
            if not ical_url:
                continue
            listing_id = "channel_" + _pms_channel_safe_id(room.get("id")) + "_" + field
            if listing_id in by_id:
                if not by_id[listing_id].get("ical_url"):
                    by_id[listing_id]["ical_url"] = ical_url
                room[field] = ""
                if url_field:
                    room[url_field] = ""
                continue
            item = _pms_channel_clean_listing({
                "id": listing_id,
                "room_id": room.get("id"),
                "platform": platform,
                "is_new_listing": False,
                "listing_url": room.get(url_field) or "",
                "ical_url": ical_url,
            }, state)
            listings.append(item)
            by_id[listing_id] = item
            room[field] = ""
            if url_field:
                room[url_field] = ""
    state["channelListings"] = listings
    return state


def _pms_channel_clear_room_legacy_fields(state, room_id):
    for room in state.get("rooms", []):
        if not isinstance(room, dict) or room.get("id") != room_id:
            continue
        for field in ["airbnb_ical", "booking_ical", "vrbo_ical", "other_ical", "airbnb_public_url", "booking_public_url", "vrbo_public_url", "other_public_url"]:
            room[field] = ""
        room["sync_error"] = ""
        room["synced_booking_count"] = 0
        return


_pms_channel_base_normalize_state = _pms_core_normalize_state
def _pms_channel_normalize_state(raw):
    state = _pms_channel_base_normalize_state(raw)
    state.setdefault("channelListings", [])
    state.setdefault("icalSyncHistory", [])
    return _pms_channel_migrate_legacy_listings(state)


def _pms_channel_unfold_ics(text):
    raw_lines = str(text or "").replace("\r\n", "\n").replace("\r", "\n").split("\n")
    lines = []
    for line in raw_lines:
        if line.startswith(" ") or line.startswith("\t"):
            if lines:
                lines[-1] += line[1:]
        else:
            lines.append(line)
    return lines


def _pms_channel_field(event_lines, name):
    target = str(name or "").upper()
    for line in event_lines:
        head, sep, tail = line.partition(":")
        if not sep:
            continue
        if head.split(";", 1)[0].upper() == target:
            return tail.strip()
    return ""


def _pms_channel_field_map(event_lines):
    fields = {}
    for line in event_lines:
        head, sep, tail = line.partition(":")
        if not sep:
            continue
        name = head.split(";", 1)[0].upper()
        value = ical_clean_text(tail.strip())
        if not name:
            continue
        if name in fields:
            if isinstance(fields[name], list):
                fields[name].append(value)
            else:
                fields[name] = [fields[name], value]
        else:
            fields[name] = value
    return fields


def _pms_channel_field_details(event_lines):
    rows = []
    for line in event_lines:
        head, sep, tail = str(line or "").partition(":")
        if not sep:
            continue
        name = head.split(";", 1)[0].upper()
        params = head.split(";", 1)[1] if ";" in head else ""
        rows.append({
            "name": name,
            "raw_name": head,
            "params": params,
            "value": ical_clean_text(tail.strip()),
            "raw": line,
        })
    return rows


def _pms_channel_field_detail(event_lines, target):
    target = str(target or "").upper()
    for row in _pms_channel_field_details(event_lines):
        if row.get("name") == target:
            return row
    return {}


def _pms_channel_ical_datetime_utc(event_lines, target, property_timezone="America/Los_Angeles"):
    row = _pms_channel_field_detail(event_lines, target)
    value = _pms_channel_text(row.get("value"))
    if not value:
        return ""
    params = _pms_channel_text(row.get("params"))
    tz_name = property_timezone or "America/Los_Angeles"
    tz_match = re.search(r"(?:^|;)TZID=([^;:]+)", params, re.I)
    if tz_match:
        tz_name = tz_match.group(1).strip()
    try:
        local_tz = ZoneInfo(tz_name)
    except Exception:
        local_tz = ZoneInfo("America/Los_Angeles")
    try:
        if re.match(r"^\d{8}$", value):
            local_dt = datetime.strptime(value, "%Y%m%d").replace(tzinfo=local_tz)
            return local_dt.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
        cleaned = value.rstrip("Z")
        if re.match(r"^\d{8}T\d{6}$", cleaned):
            parsed = datetime.strptime(cleaned, "%Y%m%dT%H%M%S")
        elif re.match(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$", cleaned):
            parsed = datetime.strptime(cleaned, "%Y-%m-%dT%H:%M:%S")
        else:
            return ""
        if value.endswith("Z"):
            aware = parsed.replace(tzinfo=timezone.utc)
        else:
            aware = parsed.replace(tzinfo=local_tz)
        return aware.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    except Exception:
        return ""


def _pms_channel_ical_local_date(event_lines, target, property_timezone="America/Los_Angeles"):
    utc_text = _pms_channel_ical_datetime_utc(event_lines, target, property_timezone)
    if utc_text:
        try:
            utc_dt = datetime.fromisoformat(utc_text.replace("Z", "+00:00"))
            return utc_dt.astimezone(ZoneInfo(property_timezone or "America/Los_Angeles")).date().isoformat()
        except Exception:
            pass
    return parse_date_value(_pms_channel_field(event_lines, target))


def _pms_channel_event_excerpt(event_lines, limit=3000):
    text = "\n".join(str(line or "") for line in event_lines)
    return text[:limit]


def _pms_channel_parse_ics(text, listing):
    events = []
    current = []
    inside = False
    for line in _pms_channel_unfold_ics(text):
        token = line.strip().upper()
        if token == "BEGIN:VEVENT":
            inside = True
            current = []
            continue
        if token == "END:VEVENT" and inside:
            events.append(current)
            current = []
            inside = False
            continue
        if inside:
            current.append(line)
    rows = []
    listing_id = listing.get("id")
    room_id = listing.get("room_id")
    platform = listing.get("platform") or "iCal"
    property_timezone = _pms_channel_text(listing.get("_property_timezone") or listing.get("property_timezone") or listing.get("timezone") or "America/Los_Angeles")
    for event in events:
        checkin = _pms_channel_ical_local_date(event, "DTSTART", property_timezone)
        checkout = _pms_channel_ical_local_date(event, "DTEND", property_timezone)
        if not checkin or not checkout or checkout <= checkin:
            continue
        checkin_utc = _pms_channel_ical_datetime_utc(event, "DTSTART", property_timezone)
        checkout_utc = _pms_channel_ical_datetime_utc(event, "DTEND", property_timezone)
        summary = ical_clean_text(_pms_channel_field(event, "SUMMARY"))
        description = ical_clean_text(_pms_channel_field(event, "DESCRIPTION"))
        status = ical_clean_text(_pms_channel_field(event, "STATUS"))
        uid = _pms_channel_text(_pms_channel_field(event, "UID"))
        if not uid:
            uid = hashlib.sha1(("|".join([listing_id or "", checkin, checkout, summary, description])).encode("utf-8")).hexdigest()
        feed_marker = "generated by pms anti-overbooking feed"
        event_text = " ".join([uid, summary, description, status]).lower()
        if uid.lower().endswith("@pms-system") or feed_marker in event_text:
            continue
        lock_reason = ical_lock_reason(summary, description, status)
        stable_id = hashlib.sha1((str(listing_id) + "|" + uid).encode("utf-8")).hexdigest()[:24]
        rows.append({
            "id": "ical_" + stable_id,
            "room_id": room_id,
            "channel_listing_id": listing_id,
            "external_event_uid": uid,
            "platform": platform,
            "channel_note": listing.get("channel_note") or "",
            "listing_url": listing.get("listing_url") or "",
            "is_new_listing": bool(listing.get("is_new_listing")),
            "guest": "",
            "checkin": checkin,
            "checkout": checkout,
            "checkin_utc": checkin_utc,
            "checkout_utc": checkout_utc,
            "dtstart_utc": checkin_utc,
            "dtend_utc": checkout_utc,
            "property_timezone": property_timezone,
            "status": "不开放锁定" if lock_reason else (summary or "iCal导入"),
            "source": "ical",
            "booking_type": "lock" if lock_reason else "booking",
            "is_locked": bool(lock_reason),
            "lock_reason": lock_reason or "",
            "summary": summary,
        })
    return rows


def _pms_channel_date_overlaps(checkin, checkout, date_text):
    checkin = str(checkin or "")
    checkout = str(checkout or "")
    date_text = str(date_text or "")
    return bool(checkin and checkout and date_text and checkin <= date_text < checkout)


def _pms_channel_raw_event_snapshots(text, listing):
    rows = []
    listing_id = listing.get("id")
    room_id = listing.get("room_id")
    platform = listing.get("platform") or "iCal"
    property_timezone = _pms_channel_text(listing.get("_property_timezone") or listing.get("property_timezone") or listing.get("timezone") or "America/Los_Angeles")
    current = []
    inside = False
    for line in _pms_channel_unfold_ics(text):
        token = line.strip().upper()
        if token == "BEGIN:VEVENT":
            inside = True
            current = []
            continue
        if token == "END:VEVENT" and inside:
            fields = _pms_channel_field_map(current)
            raw_excerpt = _pms_channel_event_excerpt(current)
            checkin = _pms_channel_ical_local_date(current, "DTSTART", property_timezone)
            checkout = _pms_channel_ical_local_date(current, "DTEND", property_timezone)
            checkin_utc = _pms_channel_ical_datetime_utc(current, "DTSTART", property_timezone)
            checkout_utc = _pms_channel_ical_datetime_utc(current, "DTEND", property_timezone)
            summary = ical_clean_text(_pms_channel_field(current, "SUMMARY"))
            description = ical_clean_text(_pms_channel_field(current, "DESCRIPTION"))
            status = ical_clean_text(_pms_channel_field(current, "STATUS"))
            uid = _pms_channel_text(_pms_channel_field(current, "UID"))
            lock_reason = ical_lock_reason(summary, description, status)
            if checkin and checkout and checkout > checkin:
                rows.append({
                    "uid": uid,
                    "uid_hash": hashlib.sha1(uid.encode("utf-8")).hexdigest()[:16] if uid else "",
                    "room_id": room_id,
                    "channel_listing_id": listing_id,
                    "platform": platform,
                    "checkin": checkin,
                    "checkout": checkout,
                    "checkin_utc": checkin_utc,
                    "checkout_utc": checkout_utc,
                    "dtstart_utc": checkin_utc,
                    "dtend_utc": checkout_utc,
                    "property_timezone": property_timezone,
                    "kind": "lock" if lock_reason else "booking",
                    "is_locked": bool(lock_reason),
                    "lock_reason": lock_reason or "",
                    "summary": summary,
                    "status": status,
                    "description": description[:300],
                    "fields": fields,
                    "fields_detailed": _pms_channel_field_details(current)[:120],
                    "raw_lines": current[:120],
                    "raw_excerpt": raw_excerpt,
                    "raw_hash": hashlib.sha1(raw_excerpt.encode("utf-8")).hexdigest()[:16],
                })
            current = []
            inside = False
            continue
        if inside:
            current.append(line)
    return rows


def _pms_channel_event_history_snapshot(item):
    return {
        "uid": _pms_channel_text(item.get("external_event_uid") or item.get("uid")),
        "uid_hash": hashlib.sha1(_pms_channel_text(item.get("external_event_uid") or item.get("uid")).encode("utf-8")).hexdigest()[:16] if _pms_channel_text(item.get("external_event_uid") or item.get("uid")) else "",
        "checkin": _pms_channel_text(item.get("checkin")),
        "checkout": _pms_channel_text(item.get("checkout")),
        "checkin_utc": _pms_channel_text(item.get("checkin_utc") or item.get("dtstart_utc")),
        "checkout_utc": _pms_channel_text(item.get("checkout_utc") or item.get("dtend_utc")),
        "property_timezone": _pms_channel_text(item.get("property_timezone")),
        "kind": "lock" if item.get("is_locked") or item.get("booking_type") == "lock" else "booking",
        "is_locked": bool(item.get("is_locked") or item.get("booking_type") == "lock"),
        "lock_reason": _pms_channel_text(item.get("lock_reason")),
        "summary": _pms_channel_text(item.get("summary") or item.get("status")),
        "status": _pms_channel_text(item.get("status")),
    }


def _pms_channel_history_room(state, room_id):
    return next((item for item in state.get("rooms", []) if isinstance(item, dict) and item.get("id") == room_id), {})


def _pms_channel_append_ical_history(state, listing, synced_at, status, events=None, raw_events=None, error="", warning="", inferred_events=None, missing_events=None):
    room = _pms_channel_history_room(state, listing.get("room_id"))
    url = _pms_channel_text(listing.get("ical_url"))
    raw_events = raw_events if raw_events is not None else [_pms_channel_event_history_snapshot(item) for item in (events or [])]
    inferred_events = [_pms_channel_event_history_snapshot(item) for item in (inferred_events or [])]
    missing_events = [_pms_channel_event_history_snapshot(item) for item in (missing_events or [])]
    archive_update = globals().get("_pms_ical_archive_update")
    if callable(archive_update):
        archive_update(state, listing, synced_at, status, raw_events, error=error, warning=warning, missing_events=missing_events)
    row = {
        "id": "icalhist_" + hashlib.sha1(("|".join([_pms_channel_text(listing.get("id")), synced_at, url])).encode("utf-8")).hexdigest()[:24],
        "synced_at": synced_at,
        "property_id": room.get("property_id") or "property_default",
        "room_id": listing.get("room_id"),
        "room_name": room.get("name") or "",
        "channel_listing_id": listing.get("id"),
        "platform": listing.get("platform") or "iCal",
        "channel_note": listing.get("channel_note") or "",
        "url_hash": hashlib.sha1(url.encode("utf-8")).hexdigest()[:16] if url else "",
        "status": status,
        "event_count": len(raw_events),
        "booking_count": sum(1 for item in raw_events if item.get("kind") != "lock"),
        "lock_count": sum(1 for item in raw_events if item.get("kind") == "lock"),
        "inferred_lock_count": len(inferred_events),
        "missing_event_count": len(missing_events),
        "events": raw_events[:120],
        "inferred_events": inferred_events[:80],
        "missing_events": missing_events[:80],
        "warning": warning or "",
        "error": error or "",
    }
    history = [item for item in state.get("icalSyncHistory", []) if isinstance(item, dict)]
    history.append(row)
    state["icalSyncHistory"] = history[-600:]
    return row


def _pms_channel_property_timezone(state, property_id):
    prop = next((item for item in state.get("properties", []) if isinstance(item, dict) and item.get("id") == property_id), {})
    return _pms_channel_text(prop.get("timezone") or prop.get("time_zone") or os.environ.get("PMS_DEFAULT_TIMEZONE") or "America/Los_Angeles")


def _pms_channel_property_id_for_room_id(state, room_id, fallback="property_default"):
    room_id = _pms_channel_text(room_id)
    for room in state.get("rooms", []):
        if isinstance(room, dict) and _pms_channel_text(room.get("id")) == room_id:
            return room.get("property_id") or fallback
    return fallback


def _pms_channel_local_now(state, property_id):
    tz_name = _pms_channel_property_timezone(state, property_id)
    try:
        return datetime.now(ZoneInfo(tz_name))
    except Exception:
        return datetime.utcnow()


def _pms_channel_local_date(state, property_id):
    now = _pms_channel_local_now(state, property_id)
    try:
        return now.date().isoformat()
    except Exception:
        return datetime.utcnow().date().isoformat()


def _pms_channel_cancel_cutoff(state, property_id, checkin):
    try:
        base = datetime.strptime(str(checkin or "") + " 16:00", "%Y-%m-%d %H:%M")
    except Exception:
        return None
    now = _pms_channel_local_now(state, property_id)
    try:
        return base.replace(tzinfo=now.tzinfo)
    except Exception:
        return base


def _pms_channel_disappeared_cancel_status(state, booking, property_id):
    cutoff = _pms_channel_cancel_cutoff(state, property_id, booking.get("checkin"))
    now = _pms_channel_local_now(state, property_id)
    if not cutoff:
        return "unknown", now
    return ("after_checkin_cutoff" if now >= cutoff else "before_checkin_cutoff"), now


def _pms_channel_add_cancel_cleaning_review(state, booking, listing, synced_at):
    if not isinstance(booking, dict):
        return False
    if booking.get("is_locked") or booking.get("booking_type") == "lock":
        return False
    room = _pms_channel_history_room(state, listing.get("room_id") or booking.get("room_id"))
    property_id = room.get("property_id") or "property_default"
    cancel_status, local_now = _pms_channel_disappeared_cancel_status(state, booking, property_id)
    if cancel_status != "after_checkin_cutoff":
        return False
    uid = _pms_channel_text(booking.get("external_event_uid") or booking.get("id"))
    stable = hashlib.sha1(("cancel-review|" + _pms_channel_text(listing.get("id")) + "|" + uid + "|" + _pms_channel_text(booking.get("checkin")) + "|" + _pms_channel_text(booking.get("checkout"))).encode("utf-8")).hexdigest()[:24]
    note_id = "cancel_review_" + stable
    notes = [item for item in state.get("cleaningNotes", []) if isinstance(item, dict)]
    if any(item.get("id") == note_id for item in notes):
        return False
    room_id = listing.get("room_id") or booking.get("room_id")
    review_date = local_now.date().isoformat() if hasattr(local_now, "date") else datetime.utcnow().date().isoformat()
    platform = listing.get("platform") or booking.get("platform") or "iCal"
    try:
        next_review_date = (datetime.strptime(review_date, "%Y-%m-%d") + timedelta(days=1)).date().isoformat()
    except Exception:
        next_review_date = review_date
    review_dates = [review_date]
    if next_review_date and next_review_date not in review_dates:
        review_dates.append(next_review_date)
    note = {
        "id": note_id,
        "date": review_date,
        "review_dates": review_dates,
        "target_id": room_id,
        "target_type": "room",
        "note": f"{platform} iCal 旧订单在入住日16:00后或入住后消失：{booking.get('checkin')} → {booking.get('checkout')}。这是独立的退房保洁待确认任务，请房东确认客人是否入住/退款，是否需要安排保洁；当天来不及可改到第二天。",
        "priority": "保洁确认",
        "note_type": "cancel_review",
        "amount": 0,
        "amount_present": False,
        "source": "iCal取消复核",
        "created_by": "系统",
        "created_at": synced_at,
        "cancellation_review": True,
        "checkin": booking.get("checkin"),
        "checkout": booking.get("checkout"),
        "platform": platform,
        "channel_listing_id": listing.get("id"),
        "external_event_uid": uid,
    }
    notes.insert(0, note)
    state["cleaningNotes"] = notes[:1000]
    return True


def _pms_channel_diagnostic_status(events, date_text):
    matches = [item for item in events if _pms_channel_date_overlaps(item.get("checkin"), item.get("checkout"), date_text)]
    if any(item.get("kind") == "lock" for item in matches):
        return "locked"
    if matches:
        return "booked"
    return "empty"


def _pms_channel_inspect_ical_diagnostics(payload, actor=None):
    state = normalize_state(load_state())
    allowed_property_ids = _pms_channel_allowed_property_ids(actor, state)
    allowed_room_ids = {
        room.get("id") for room in state.get("rooms", [])
        if isinstance(room, dict) and (room.get("property_id") or "property_default") in allowed_property_ids
    }
    room_id = _pms_channel_text(payload.get("room_id") or payload.get("roomId"))
    channel_id = _pms_channel_text(payload.get("channel_listing_id") or payload.get("channelListingId") or payload.get("channel_id") or payload.get("channelId"))
    date_property_id = _pms_channel_property_id_for_room_id(state, room_id)
    if not room_id and channel_id:
        channel_room_id = next((item.get("room_id") for item in state.get("channelListings", []) if isinstance(item, dict) and item.get("id") == channel_id), "")
        date_property_id = _pms_channel_property_id_for_room_id(state, channel_room_id)
    date_text = _pms_channel_text(payload.get("date")) or _pms_channel_local_date(state, date_property_id)
    listings = [
        item for item in normalize_state(state).get("channelListings", [])
        if isinstance(item, dict)
        and item.get("room_id") in allowed_room_ids
        and (not room_id or item.get("room_id") == room_id)
        and (not channel_id or item.get("id") == channel_id)
    ]
    results = []
    now = datetime.utcnow().isoformat(timespec="seconds")
    for listing in listings:
        url = _pms_channel_text(listing.get("ical_url"))
        base = {
            "checked_at": now,
            "date": date_text,
            "room_id": listing.get("room_id"),
            "channel_listing_id": listing.get("id"),
            "platform": listing.get("platform") or "iCal",
            "channel_note": listing.get("channel_note") or "",
            "url_hash": hashlib.sha1(url.encode("utf-8")).hexdigest()[:16] if url else "",
        }
        if not url:
            base.update({"status": "no_url", "events": [], "date_events": [], "message": "这个渠道还没有填写导入 PMS 的 iCal"})
            results.append(base)
            continue
        try:
            text = fetch_text(url)
            events = _pms_channel_raw_event_snapshots(text, listing)
            date_events = [item for item in events if _pms_channel_date_overlaps(item.get("checkin"), item.get("checkout"), date_text)]
            base.update({
                "status": _pms_channel_diagnostic_status(events, date_text),
                "events": events[:160],
                "date_events": date_events,
                "event_count": len(events),
                "booking_count": sum(1 for item in events if item.get("kind") != "lock"),
                "lock_count": sum(1 for item in events if item.get("kind") == "lock"),
                "message": "实时读取 iCal 成功",
            })
        except Exception as exc:
            base.update({"status": "error", "events": [], "date_events": [], "error": str(exc), "message": "实时读取 iCal 失败"})
        results.append(base)
    return {
        "room_id": room_id,
        "channel_listing_id": channel_id,
        "date": date_text,
        "results": results,
        "history": [
            item for item in state.get("icalSyncHistory", [])
            if isinstance(item, dict)
            and (not room_id or item.get("room_id") == room_id)
            and (not channel_id or item.get("channel_listing_id") == channel_id)
        ][-20:],
    }


_pms_channel_base_filter_state_for_user = _pms_core_filter_state_for_user
def _pms_channel_filter_state_for_user(state, actor):
    filtered = _pms_channel_base_filter_state_for_user(state, actor)
    normalized = normalize_state(state)
    if not actor or actor.get("role") == "admin":
        filtered["channelListings"] = normalized.get("channelListings", [])
        filtered["icalSyncHistory"] = normalized.get("icalSyncHistory", [])
        return filtered
    room_ids = {room.get("id") for room in filtered.get("rooms", []) if isinstance(room, dict)}
    filtered["channelListings"] = [
        item for item in normalized.get("channelListings", [])
        if item.get("room_id") in room_ids
    ]
    filtered["icalSyncHistory"] = [
        item for item in normalized.get("icalSyncHistory", [])
        if isinstance(item, dict) and item.get("room_id") in room_ids
    ]
    return filtered


_pms_channel_base_save_state_from_payload = _pms_core_save_state_from_payload
def _pms_channel_room_has_sync(state, room_id):
    room = next((item for item in state.get("rooms", []) if isinstance(item, dict) and item.get("id") == room_id), {})
    legacy_fields = ("airbnb_ical", "booking_ical", "vrbo_ical", "other_ical")
    if any(_pms_channel_text(room.get(field)) for field in legacy_fields):
        return True
    for item in state.get("channelListings", []):
        if not isinstance(item, dict) or item.get("room_id") != room_id:
            continue
        if _pms_channel_text(item.get("ical_url")) or _pms_channel_text(item.get("listing_url")) or item.get("is_new_listing"):
            return True
    return False

def _pms_channel_room_property_id(room):
    if not isinstance(room, dict):
        return ""
    return room.get("property_id") or "property_default"

def _pms_channel_guard_structural_delete(payload, actor=None):
    current = normalize_state(load_state())
    if actor and actor.get("role") != "admin":
        allowed_property_ids = actor_property_ids(actor, current)
    else:
        allowed_property_ids = {prop.get("id") for prop in current.get("properties", []) if isinstance(prop, dict) and prop.get("id")}
    if "properties" in payload:
        incoming_property_ids = {
            item.get("id") for item in payload.get("properties", [])
            if isinstance(item, dict) and item.get("id")
        }
        for prop in current.get("properties", []):
            if not isinstance(prop, dict) or prop.get("id") not in allowed_property_ids or prop.get("id") in incoming_property_ids:
                continue
            room_count = sum(1 for room in current.get("rooms", []) if isinstance(room, dict) and _pms_channel_room_property_id(room) == prop.get("id"))
            if room_count:
                raise RuntimeError("这个房源下面还有房间，不能删除房源。请先进入房间管理处理房间。")
    if "rooms" in payload:
        incoming_room_ids = {
            item.get("id") for item in payload.get("rooms", [])
            if isinstance(item, dict) and item.get("id")
        }
        for room in current.get("rooms", []):
            if not isinstance(room, dict) or _pms_channel_room_property_id(room) not in allowed_property_ids or room.get("id") in incoming_room_ids:
                continue
            if _pms_channel_room_has_sync(current, room.get("id")):
                raise RuntimeError("这个房间还有 iCal/渠道同步，不能删除。请先清空 iCal/渠道后再删除房间。")

def _pms_channel_save_state_from_payload(payload, actor=None):
    working = dict(payload or {})
    if "properties" in working or "rooms" in working:
        _pms_channel_guard_structural_delete(working, actor)
    incoming_channels = working.pop("channelListings", None)
    if incoming_channels is None:
        return _pms_channel_base_save_state_from_payload(working, actor)
    channel_mutation = any(
        isinstance(raw, dict) and (raw.get("_delete") or raw.get("_clear_room_channels") or raw.get("_clearRoomChannels"))
        for raw in incoming_channels
    )
    if (not actor or actor.get("role") == "admin") and not channel_mutation:
        current = normalize_state(load_state())
        room_ids = _pms_channel_room_ids(current)
        working["channelListings"] = [
            _pms_channel_clean_listing(item, current)
            for item in incoming_channels
            if isinstance(item, dict) and _pms_channel_text(item.get("room_id") or item.get("roomId")) in room_ids
        ]
        return _pms_channel_base_save_state_from_payload(working, actor)

    saved = _pms_channel_base_save_state_from_payload(working, actor) if working else normalize_state(load_state())
    current = normalize_state(load_state())
    if not actor or actor.get("role") == "admin":
        allowed_property_ids = {
            prop.get("id") for prop in current.get("properties", [])
            if isinstance(prop, dict) and prop.get("id")
        }
    else:
        allowed_property_ids = actor_property_ids(actor, current)
    allowed_room_ids = {
        room.get("id") for room in current.get("rooms", [])
        if isinstance(room, dict) and room.get("property_id") in allowed_property_ids
    }
    by_id = {item.get("id"): item for item in current.get("channelListings", []) if isinstance(item, dict)}
    delete_ids = set()
    clear_room_ids = set()
    incoming = []
    incoming_ids = set()
    for raw in incoming_channels:
        if not isinstance(raw, dict):
            continue
        if raw.get("_clear_room_channels") or raw.get("_clearRoomChannels"):
            room_id = _pms_channel_text(raw.get("room_id") or raw.get("roomId"))
            if room_id in allowed_room_ids:
                clear_room_ids.add(room_id)
                _pms_channel_clear_room_legacy_fields(current, room_id)
            continue
        item_id = _pms_channel_text(raw.get("id"))
        if raw.get("_delete"):
            existing = by_id.get(item_id)
            if existing and existing.get("room_id") in allowed_room_ids:
                delete_ids.add(item_id)
                _pms_channel_clear_room_legacy_fields(current, existing.get("room_id"))
            continue
        clean = _pms_channel_clean_listing(raw, current)
        if clean.get("room_id") not in allowed_room_ids:
            raise RuntimeError("room permission required")
        existing = by_id.get(clean.get("id"))
        if existing:
            clean["created_at"] = existing.get("created_at") or clean.get("created_at")
        incoming.append(clean)
        incoming_ids.add(clean.get("id"))
    current["channelListings"] = [
        item for item in current.get("channelListings", [])
        if item.get("id") not in delete_ids and item.get("id") not in incoming_ids and item.get("room_id") not in clear_room_ids
    ] + incoming
    if delete_ids or clear_room_ids:
        now = datetime.utcnow().isoformat(timespec="seconds")
        current["bookings"] = [
            item for item in current.get("bookings", [])
            if not (
                isinstance(item, dict)
                and item.get("source") == "ical"
                and (
                    item.get("channel_listing_id") in delete_ids
                    or item.get("room_id") in clear_room_ids
                )
            )
        ]
        current["sync_errors"] = [
            item for item in current.get("sync_errors", [])
            if not (
                isinstance(item, dict)
                and (
                    item.get("channel_listing_id") in delete_ids
                    or item.get("room_id") in clear_room_ids
                )
            )
        ]
        for row in current.get("icalEventArchive", []):
            if not isinstance(row, dict):
                continue
            if row.get("channel_listing_id") in delete_ids or row.get("room_id") in clear_room_ids:
                row["active"] = False
                row["last_sync_status"] = "channel_deleted"
                row["disappeared_at"] = row.get("disappeared_at") or now
                row["last_missing_at"] = now
    return save_state(current)


def _pms_channel_allowed_property_ids(actor, state):
    if actor:
        return actor_property_ids(actor, state)
    return {prop.get("id") for prop in state.get("properties", []) if isinstance(prop, dict) and prop.get("id")}


def _pms_channel_merge_sync_payload(state, incoming_channels, allowed_room_ids):
    if incoming_channels is None:
        return
    if not isinstance(incoming_channels, list):
        raise RuntimeError("channelListings must be a list")
    by_id = {item.get("id"): item for item in state.get("channelListings", []) if isinstance(item, dict)}
    incoming = []
    incoming_ids = set()
    for raw in incoming_channels:
        if not isinstance(raw, dict):
            continue
        clean = _pms_channel_clean_listing(raw, state)
        if clean.get("room_id") not in allowed_room_ids:
            raise RuntimeError("room permission required")
        existing = by_id.get(clean.get("id"))
        if existing:
            clean["created_at"] = existing.get("created_at") or clean.get("created_at")
        incoming.append(clean)
        incoming_ids.add(clean.get("id"))
    if not incoming:
        return
    state["channelListings"] = [
        item for item in state.get("channelListings", [])
        if not (isinstance(item, dict) and item.get("id") in incoming_ids)
    ] + incoming


def _pms_channel_backfill_legacy_room_icals(state, allowed_room_ids):
    legacy_fields = (
        ("airbnb_ical", "Airbnb"),
        ("booking_ical", "Booking"),
        ("vrbo_ical", "Vrbo"),
        ("other_ical", "Other"),
    )
    existing_keys = {
        (str(item.get("room_id") or ""), _pms_channel_text(item.get("ical_url")))
        for item in state.get("channelListings", [])
        if isinstance(item, dict)
    }
    added = []
    for room in state.get("rooms", []):
        if not isinstance(room, dict) or room.get("id") not in allowed_room_ids:
            continue
        for field, platform in legacy_fields:
            url = _pms_channel_text(room.get(field))
            if not url or (str(room.get("id") or ""), url) in existing_keys:
                continue
            seed = f"{room.get('id')}|{field}|{url}"
            raw = {
                "id": "legacy_channel_" + hashlib.sha1(seed.encode("utf-8")).hexdigest()[:18],
                "room_id": room.get("id"),
                "platform": platform,
                "channel_note": "Legacy iCal",
                "ical_url": url,
                "listing_url": "",
                "is_new_listing": False,
            }
            added.append(_pms_channel_clean_listing(raw, state))
            existing_keys.add((str(room.get("id") or ""), url))
    if added:
        state["channelListings"] = state.get("channelListings", []) + added


def _pms_channel_archive_booking(row):
    if not isinstance(row, dict):
        return None
    checkin = str(row.get("checkin") or "")
    checkout = str(row.get("checkout") or "")
    if not checkin or not checkout or checkout <= checkin:
        return None
    kind = "lock" if row.get("is_locked") or row.get("kind") == "lock" else "booking"
    stable_id = hashlib.sha1(str(row.get("id") or "|".join([
        str(row.get("channel_listing_id") or ""),
        str(row.get("uid") or row.get("external_event_uid") or ""),
        checkin,
        checkout,
        kind,
    ])).encode("utf-8")).hexdigest()[:24]
    return {
        "id": "ical_archived_" + stable_id,
        "room_id": row.get("room_id"),
        "channel_listing_id": row.get("channel_listing_id"),
        "external_event_uid": row.get("uid") or row.get("external_event_uid") or row.get("uid_hash") or stable_id,
        "platform": row.get("platform") or "iCal",
        "channel_note": row.get("channel_note") or "",
        "listing_url": row.get("listing_url") or "",
        "guest": "",
        "checkin": checkin,
        "checkout": checkout,
        "status": "不开放锁定" if kind == "lock" else (row.get("summary") or "iCal历史订单"),
        "source": "ical",
        "booking_type": kind,
        "is_locked": kind == "lock",
        "lock_reason": row.get("lock_reason") or "",
        "summary": row.get("summary") or row.get("status") or "",
        "restored_from_archive": True,
    }


def _pms_channel_restore_historical_archive_bookings(state, successful_listing_ids, successful_room_ids, today):
    existing_keys = {
        "|".join([
            str(item.get("channel_listing_id") or ""),
            str(item.get("external_event_uid") or ""),
            str(item.get("checkin") or ""),
            str(item.get("checkout") or ""),
            str(item.get("booking_type") or ("lock" if item.get("is_locked") else "booking")),
        ])
        for item in state.get("bookings", [])
        if isinstance(item, dict) and item.get("source") == "ical"
    }
    restored = []
    for row in state.get("icalEventArchive", []):
        if not isinstance(row, dict):
            continue
        if row.get("channel_listing_id") not in successful_listing_ids and row.get("room_id") not in successful_room_ids:
            continue
        if str(row.get("checkout") or row.get("checkin") or "") >= today:
            continue
        booking = _pms_channel_archive_booking(row)
        if not booking:
            continue
        key = "|".join([
            str(booking.get("channel_listing_id") or ""),
            str(booking.get("external_event_uid") or ""),
            str(booking.get("checkin") or ""),
            str(booking.get("checkout") or ""),
            str(booking.get("booking_type") or ("lock" if booking.get("is_locked") else "booking")),
        ])
        if key in existing_keys:
            continue
        existing_keys.add(key)
        restored.append(booking)
    return restored


def _pms_channel_sync_icals(actor=None, property_id=None, incoming_channels=None):
    state = normalize_state(load_state())
    allowed_property_ids = _pms_channel_allowed_property_ids(actor, state)
    if property_id:
        if property_id not in allowed_property_ids:
            raise RuntimeError("property permission required")
        allowed_property_ids = {property_id}
    allowed_room_ids = {
        room.get("id") for room in state.get("rooms", [])
        if isinstance(room, dict) and room.get("property_id") in allowed_property_ids
    }
    _pms_channel_merge_sync_payload(state, incoming_channels, allowed_room_ids)
    _pms_channel_backfill_legacy_room_icals(state, allowed_room_ids)
    listings = [
        item for item in state.get("channelListings", [])
        if item.get("room_id") in allowed_room_ids
    ]
    if not listings:
        raise RuntimeError("No iCal channel is configured for this property. Add a room channel and save the platform export iCal first.")
    if not any(_pms_channel_text(item.get("ical_url")) for item in listings) and not all(item.get("is_new_listing") for item in listings):
        raise RuntimeError("No platform export iCal URL is saved for this property.")
    listing_ids = {item.get("id") for item in listings if item.get("id")}
    state["bookings"] = [
        booking for booking in state.get("bookings", [])
        if not (
            isinstance(booking, dict)
            and booking.get("source") == "ical"
            and booking.get("room_id") in allowed_room_ids
            and booking.get("channel_listing_id")
            and booking.get("channel_listing_id") not in listing_ids
        )
    ]
    previous_counts = {}
    previous_bookings_by_listing = {}
    for booking in state.get("bookings", []):
        if not isinstance(booking, dict) or booking.get("source") != "ical":
            continue
        listing_id = booking.get("channel_listing_id")
        if listing_id in listing_ids:
            previous_counts[listing_id] = previous_counts.get(listing_id, 0) + 1
            previous_bookings_by_listing.setdefault(listing_id, []).append(booking)
    now = datetime.utcnow().isoformat(timespec="seconds")
    sync_property_id = next(
        (
            room.get("property_id")
            for room in state.get("rooms", [])
            if isinstance(room, dict) and room.get("id") in allowed_room_ids and room.get("property_id")
        ),
        property_id or "property_default",
    )
    today = _pms_channel_local_date(state, sync_property_id)
    sync_errors = [
        err for err in state.get("sync_errors", [])
        if not (isinstance(err, dict) and err.get("room_id") in allowed_room_ids)
    ]
    successful_listing_ids = set()
    successful_room_ids = set()
    new_bookings = []
    def _pms_missing_event_key(item):
        return "|".join([
            str(item.get("external_event_uid") or ""),
            str(item.get("checkin") or ""),
            str(item.get("checkout") or ""),
            str(item.get("booking_type") or ("lock" if item.get("is_locked") else "booking")),
        ])

    def _pms_inferred_platform_lock(item, listing):
        listing_id = str(listing.get("id") or "")
        uid = str(item.get("external_event_uid") or item.get("id") or "")
        checkin = str(item.get("checkin") or "")
        checkout = str(item.get("checkout") or "")
        stable_id = hashlib.sha1(("missing-lock|" + listing_id + "|" + uid + "|" + checkin + "|" + checkout).encode("utf-8")).hexdigest()[:24]
        return {
            "id": "ical_missing_lock_" + stable_id,
            "room_id": listing.get("room_id") or item.get("room_id"),
            "channel_listing_id": listing.get("id"),
            "external_event_uid": "missing-lock-" + (uid or stable_id),
            "platform": listing.get("platform") or item.get("platform") or "iCal",
            "channel_note": listing.get("channel_note") or "",
            "listing_url": listing.get("listing_url") or "",
            "is_new_listing": bool(listing.get("is_new_listing")),
            "guest": "",
            "checkin": checkin,
            "checkout": checkout,
            "status": "不开放锁定",
            "source": "ical",
            "booking_type": "lock",
            "is_locked": True,
            "lock_reason": "平台未返回原订单，系统按不开放锁定处理",
            "summary": "平台状态变更锁定",
        }

    for listing in listings:
        previous_last_sync = listing.get("last_sync") or ""
        listing["last_sync"] = now
        listing["sync_error"] = ""
        listing["sync_warning"] = ""
        listing["availability_status"] = ""
        previous_count = max(previous_counts.get(listing.get("id"), 0), int(listing.get("synced_booking_count") or 0))
        listing_property_id = _pms_channel_property_id_for_room_id(state, listing.get("room_id"), sync_property_id)
        listing_timezone = _pms_channel_property_timezone(state, listing_property_id)
        parse_listing = dict(listing)
        parse_listing["_property_timezone"] = listing_timezone
        listing_today = _pms_channel_local_date(state, listing_property_id)
        listing["synced_booking_count"] = 0
        url = _pms_channel_text(listing.get("ical_url"))
        if not url:
            listing["last_sync"] = previous_last_sync
            listing["synced_booking_count"] = previous_count if previous_last_sync else 0
            listing["sync_warning"] = "未填写平台导出的 iCal，已跳过同步"
            continue
        try:
            raw_ical_text = fetch_text(url)
            raw_events = _pms_channel_raw_event_snapshots(raw_ical_text, parse_listing)
            imported = _pms_channel_parse_ics(raw_ical_text, parse_listing)
            listing["synced_booking_count"] = len(imported)
            imported_keys = {_pms_missing_event_key(item) for item in imported}
            previous_future = [
                item for item in previous_bookings_by_listing.get(listing.get("id"), [])
                if str(item.get("checkout") or item.get("checkin") or "") >= listing_today
            ]
            imported_ranges = {(str(item.get("checkin") or ""), str(item.get("checkout") or "")) for item in imported}
            disappeared = [
                item for item in previous_future
                if _pms_missing_event_key(item) not in imported_keys
                and (str(item.get("checkin") or ""), str(item.get("checkout") or "")) not in imported_ranges
            ]
            if disappeared and not listing.get("is_new_listing"):
                examples = "、".join(
                    f"{item.get('checkin')}→{item.get('checkout')}"
                    for item in disappeared[:3]
                )
                listing["availability_status"] = "order_disappeared"
                listing["sync_warning"] = f"iCal 本次少了 {len(disappeared)} 条当天或未来订单记录（{examples}）。系统已保存取消/移除历史；如果发生在入住日16:00后或入住后，会生成保洁确认任务。"
                review_count = sum(1 for item in disappeared if _pms_channel_add_cancel_cleaning_review(state, item, listing, now))
            else:
                review_count = 0
            _pms_channel_append_ical_history(
                state,
                listing,
                now,
                "order_disappeared" if disappeared and not listing.get("is_new_listing") else "ok",
                events=imported,
                raw_events=raw_events,
                warning=listing.get("sync_warning", ""),
                missing_events=disappeared if disappeared and not listing.get("is_new_listing") else [],
            )
            successful_listing_ids.add(listing.get("id"))
            successful_room_ids.add(listing.get("room_id"))
            new_bookings.extend(imported)
        except Exception as exc:
            error = str(exc)
            listing["sync_error"] = error
            sync_errors.append({"room_id": listing.get("room_id"), "channel_listing_id": listing.get("id"), "platform": listing.get("platform"), "error": error})
            _pms_channel_append_ical_history(state, listing, now, "error", raw_events=[], error=error)
    if successful_listing_ids:
        new_booking_ids = {item.get("id") for item in new_bookings if isinstance(item, dict) and item.get("id")}
        def _pms_should_replace_booking(item):
            if not isinstance(item, dict) or item.get("source") != "ical":
                return False
            if not (
                item.get("channel_listing_id") in successful_listing_ids
                or (not item.get("channel_listing_id") and item.get("room_id") in successful_room_ids)
            ):
                return False
            booking_date = str(item.get("checkout") or item.get("checkin") or "")
            booking_today = _pms_channel_local_date(state, _pms_channel_property_id_for_room_id(state, item.get("room_id"), sync_property_id))
            return booking_date >= booking_today or item.get("id") in new_booking_ids

        state["bookings"] = [
            b for b in state.get("bookings", [])
            if not _pms_should_replace_booking(b)
        ]
        new_bookings.extend(_pms_channel_restore_historical_archive_bookings(state, successful_listing_ids, successful_room_ids, today))
        state["bookings"].extend(new_bookings)
    state["sync_errors"] = sync_errors
    state["last_sync"] = now
    return save_state(state)


def _pms_channel_feed_target(state, feed_id):
    feed_id = str(feed_id or "").replace(".ics", "")
    listing = next((item for item in state.get("channelListings", []) if item.get("id") == feed_id), None)
    if listing:
        return listing.get("room_id"), listing.get("id"), listing
    room = next((item for item in state.get("rooms", []) if item.get("id") == feed_id), None)
    if room:
        return room.get("id"), "", None
    return "", "", None


def _pms_channel_ics_escape(text):
    return str(text or "").replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


def _pms_empty_ical_calendar(title="PMS Anti Overbooking"):
    return "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//PMS System//Channel Feed//EN\r\nCALSCALE:GREGORIAN\r\nX-WR-CALNAME:" + _pms_channel_ics_escape(title) + "\r\nEND:VCALENDAR\r\n"

def _pms_emergency_empty_feed_ids():
    raw = str(os.environ.get("PMS_ICAL_EMPTY_FEED_IDS", "") or "")
    return {item.strip().replace(".ics", "") for item in raw.split(",") if item.strip()}

def _pms_channel_make_feed(feed_id):
    normalized_feed_id = str(feed_id or "").replace(".ics", "")
    state = normalize_state(load_state())
    room_id, target_channel_id, target_listing = _pms_channel_feed_target(state, feed_id)
    if normalized_feed_id in _pms_emergency_empty_feed_ids() and not target_channel_id:
        return _pms_empty_ical_calendar("PMS Anti Overbooking")
    if not room_id:
        return None
    events = []
    seen = set()
    for booking in state.get("bookings", []):
        if not isinstance(booking, dict) or booking.get("room_id") != room_id:
            continue
        if target_channel_id and booking.get("channel_listing_id") == target_channel_id:
            continue
        marker_text = " ".join([
            str(booking.get("external_event_uid") or ""),
            str(booking.get("summary") or ""),
            str(booking.get("lock_reason") or ""),
            str(booking.get("status") or ""),
        ]).lower()
        if "@pms-system" in marker_text or "generated by pms anti-overbooking feed" in marker_text:
            continue
        checkin = booking.get("checkin")
        checkout = booking.get("checkout")
        if not checkin or not checkout or checkout <= checkin:
            continue
        kind = "lock" if (booking.get("is_locked") or booking.get("booking_type") == "lock") else "booking"
        dedupe = (checkin, checkout, kind, booking.get("channel_listing_id") or booking.get("platform") or "")
        if dedupe in seen:
            continue
        seen.add(dedupe)
        platform = booking.get("platform") or "PMS"
        summary = "Not available" if kind == "lock" else f"{platform} booked"
        uid_seed = "|".join([str(feed_id), str(booking.get("channel_listing_id") or ""), str(booking.get("external_event_uid") or booking.get("id") or ""), checkin, checkout, kind])
        uid = hashlib.sha1(uid_seed.encode("utf-8")).hexdigest() + "@pms-system"
        events.append("BEGIN:VEVENT\r\n"
                      f"UID:{uid}\r\n"
                      f"DTSTART;VALUE=DATE:{checkin.replace('-', '')}\r\n"
                      f"DTEND;VALUE=DATE:{checkout.replace('-', '')}\r\n"
                      f"SUMMARY:{_pms_channel_ics_escape(summary)}\r\n"
                      f"DESCRIPTION:{_pms_channel_ics_escape('Generated by PMS anti-overbooking feed')}\r\n"
                      "END:VEVENT")
    title = "PMS Anti Overbooking"
    if target_listing:
        title += " - " + (target_listing.get("platform") or "channel")
    return "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//PMS System//Channel Feed//EN\r\nCALSCALE:GREGORIAN\r\n" + "\r\n".join(events) + "\r\nEND:VCALENDAR\r\n"


_pms_property_mail_forwarding_v1 = True

for _pms_mail_key in ("mailForwardingConfig", "propertyMailForwarding"):
    if _pms_mail_key not in STATE_KEYS:
        STATE_KEYS.append(_pms_mail_key)

_pms_mail_base_default_state = _pms_channel_default_state
def _pms_mail_default_state():
    state = _pms_mail_base_default_state()
    state.setdefault("mailForwardingConfig", [])
    state.setdefault("propertyMailForwarding", [])
    return state


def _pms_mail_text(value, limit=500):
    return str(value or "").strip()[:limit]


def _pms_mail_bool(value):
    if isinstance(value, bool):
        return value
    return str(value or "").strip().lower() in {"1", "true", "yes", "y", "on"}


def _pms_mail_safe_id(value):
    text = _pms_mail_text(value, 120)
    safe = "".join(ch if (ch.isalnum() or ch in "-_") else "_" for ch in text)
    return safe or "property"


def _pms_mail_status(value):
    status = _pms_mail_text(value, 40)
    return status if status in {"not_set", "verification_pending", "rule_created", "active", "paused"} else "not_set"


def _pms_mail_property_ids(state):
    return {prop.get("id") for prop in state.get("properties", []) if isinstance(prop, dict) and prop.get("id")}


def _pms_mail_clean_config(item):
    raw = item if isinstance(item, dict) else {}
    now = datetime.utcnow().isoformat(timespec="seconds")
    return {
        "id": _pms_mail_text(raw.get("id") or "main", 80),
        "inbox_email": _pms_mail_text(raw.get("inbox_email") or raw.get("gmail_address") or raw.get("forwarding_address"), 200),
        "alias_prefix": _pms_mail_text(raw.get("alias_prefix") or "pms", 60),
        "plus_alias_enabled": _pms_mail_bool(raw.get("plus_alias_enabled", True)),
        "notes": _pms_mail_text(raw.get("notes"), 800),
        "updated_at": _pms_mail_text(raw.get("updated_at")) or now,
    }


def _pms_mail_primary_config(state):
    rows = state.get("mailForwardingConfig", [])
    if rows and isinstance(rows[0], dict):
        return _pms_mail_clean_config(rows[0])
    return _pms_mail_clean_config({})


def _pms_mail_forward_address(property_id, state):
    cfg = _pms_mail_primary_config(state)
    inbox = _pms_mail_text(cfg.get("inbox_email"), 200)
    if not inbox or "@" not in inbox:
        return ""
    local, domain = inbox.rsplit("@", 1)
    prefix = _pms_mail_safe_id(cfg.get("alias_prefix") or "pms")
    prop = _pms_mail_safe_id(property_id)
    if cfg.get("plus_alias_enabled", True):
        return f"{local}+{prefix}_{prop}@{domain}"
    return inbox


def _pms_mail_clean_property_setting(item, state=None):
    raw = item if isinstance(item, dict) else {}
    state = state or {}
    property_id = _pms_mail_text(raw.get("property_id") or raw.get("propertyId"), 100)
    group_id = _pms_mail_text(raw.get("group_id") or raw.get("groupId"), 100)
    prop = next((p for p in state.get("properties", []) if isinstance(p, dict) and p.get("id") == property_id), None)
    if prop:
        group_id = group_id or _pms_mail_text(prop.get("group_id"), 100)
    now = datetime.utcnow().isoformat(timespec="seconds")
    forward_address = _pms_mail_text(raw.get("pms_forward_address") or raw.get("pmsForwardAddress"), 220) or _pms_mail_forward_address(property_id, state)
    return {
        "id": _pms_mail_text(raw.get("id") or ("mail_property_" + _pms_mail_safe_id(property_id)), 140),
        "property_id": property_id,
        "owner_id": _pms_mail_text(raw.get("owner_id") or raw.get("ownerId"), 100),
        "group_id": group_id,
        "source_email": _pms_mail_text(raw.get("source_email") or raw.get("sourceEmail") or raw.get("airbnb_email"), 220),
        "pms_forward_address": forward_address,
        "forward_status": _pms_mail_status(raw.get("forward_status") or raw.get("forwardStatus")),
        "notes": _pms_mail_text(raw.get("notes"), 1000),
        "updated_at": _pms_mail_text(raw.get("updated_at")) or now,
    }


_pms_mail_base_normalize_state = _pms_channel_normalize_state
def _pms_mail_normalize_state(raw):
    state = _pms_mail_base_normalize_state(raw)
    configs = state.get("mailForwardingConfig", [])
    state["mailForwardingConfig"] = [_pms_mail_clean_config(configs[0] if configs else {})]
    valid_properties = _pms_mail_property_ids(state)
    by_property = {}
    for item in state.get("propertyMailForwarding", []):
        if not isinstance(item, dict):
            continue
        clean = _pms_mail_clean_property_setting(item, state)
        property_id = clean.get("property_id")
        if property_id and (not valid_properties or property_id in valid_properties):
            by_property[property_id] = clean
    state["propertyMailForwarding"] = list(by_property.values())
    return state


_pms_mail_base_filter_state_for_user = _pms_channel_filter_state_for_user
def _pms_mail_filter_state_for_user(state, actor):
    normalized = normalize_state(state)
    filtered = _pms_mail_base_filter_state_for_user(normalized, actor)
    role = (actor or {}).get("role")
    if role == "admin":
        filtered["mailForwardingConfig"] = normalized.get("mailForwardingConfig", [])
        filtered["propertyMailForwarding"] = normalized.get("propertyMailForwarding", [])
        return filtered
    if role == "owner":
        property_ids = {prop.get("id") for prop in filtered.get("properties", []) if isinstance(prop, dict) and prop.get("id")}
        filtered["mailForwardingConfig"] = normalized.get("mailForwardingConfig", [])
        filtered["propertyMailForwarding"] = [
            item for item in normalized.get("propertyMailForwarding", [])
            if item.get("property_id") in property_ids
        ]
        return filtered
    filtered["mailForwardingConfig"] = []
    filtered["propertyMailForwarding"] = []
    return filtered


def save_mail_config_setting(payload, actor=None):
    if not actor or actor.get("role") != "admin":
        raise RuntimeError("admin permission required")
    state = normalize_state(load_state())
    state["mailForwardingConfig"] = [_pms_mail_clean_config(payload if isinstance(payload, dict) else {})]
    return save_state(state)


def save_property_mail_setting(payload, actor=None):
    raw = dict(payload) if isinstance(payload, dict) else {}
    state = normalize_state(load_state())
    property_id = _pms_mail_text(raw.get("property_id") or raw.get("propertyId"), 100)
    if not property_id:
        raise RuntimeError("property required")
    allowed_property_ids = _pms_mail_property_ids(state) if (actor and actor.get("role") == "admin") else actor_property_ids(actor, state)
    if property_id not in allowed_property_ids:
        raise RuntimeError("property permission required")
    if actor and actor.get("role") == "owner":
        raw["owner_id"] = actor.get("id") or raw.get("owner_id") or raw.get("ownerId") or ""
    by_property = {
        item.get("property_id"): item
        for item in state.get("propertyMailForwarding", [])
        if isinstance(item, dict) and item.get("property_id")
    }
    if raw.get("_delete") or raw.get("_clear"):
        by_property.pop(property_id, None)
        state["propertyMailForwarding"] = list(by_property.values())
        return save_state(state), None
    if not _pms_mail_text(raw.get("source_email") or raw.get("sourceEmail"), 240):
        raise RuntimeError("没有内容可保存：请先填写 Airbnb 通知邮箱；如果要删除绑定，请点清空。")
    clean = _pms_mail_clean_property_setting(raw, state)
    by_property[property_id] = clean
    state["propertyMailForwarding"] = list(by_property.values())
    saved = save_state(state)
    saved_row = next(
        (item for item in saved.get("propertyMailForwarding", []) if isinstance(item, dict) and item.get("property_id") == property_id),
        clean,
    )
    return saved, saved_row


_pms_mail_base_save_state_from_payload = _pms_channel_save_state_from_payload
def _pms_mail_save_state_from_payload(payload, actor=None):
    working = dict(payload or {})
    incoming_config = working.pop("mailForwardingConfig", None)
    incoming_property_mail = working.pop("propertyMailForwarding", None)
    if incoming_config is None and incoming_property_mail is None:
        return _pms_mail_base_save_state_from_payload(working, actor)

    if incoming_config is not None and (not actor or actor.get("role") != "admin"):
        raise RuntimeError("admin permission required")

    saved = _pms_mail_base_save_state_from_payload(working, actor) if working else normalize_state(load_state())
    current = normalize_state(load_state())

    if incoming_config is not None:
        row = incoming_config[0] if isinstance(incoming_config, list) and incoming_config else {}
        current["mailForwardingConfig"] = [_pms_mail_clean_config(row)]

    if incoming_property_mail is not None:
        allowed_property_ids = _pms_mail_property_ids(current) if (not actor or actor.get("role") == "admin") else actor_property_ids(actor, current)
        by_property = {
            item.get("property_id"): item
            for item in current.get("propertyMailForwarding", [])
            if isinstance(item, dict) and item.get("property_id")
        }
        rows = incoming_property_mail if isinstance(incoming_property_mail, list) else []
        for raw in rows:
            if not isinstance(raw, dict):
                continue
            property_id = _pms_mail_text(raw.get("property_id") or raw.get("propertyId"), 100)
            if not property_id or property_id not in allowed_property_ids:
                raise RuntimeError("property permission required")
            if raw.get("_delete") or raw.get("_clear"):
                by_property.pop(property_id, None)
                continue
            if not _pms_mail_text(raw.get("source_email") or raw.get("sourceEmail"), 240):
                raise RuntimeError("没有内容可保存：请先填写 Airbnb 通知邮箱；如果要删除绑定，请点清空。")
            clean = _pms_mail_clean_property_setting(raw, current)
            by_property[property_id] = clean
        current["propertyMailForwarding"] = list(by_property.values())

    return save_state(current)


_pms_mail_events_v1 = True

if "mailEvents" not in STATE_KEYS:
    STATE_KEYS.append("mailEvents")

_pms_mail_events_base_default_state = _pms_mail_default_state
def _pms_mail_events_default_state():
    state = _pms_mail_events_base_default_state()
    state.setdefault("mailEvents", [])
    return state


def _pms_mail_event_text(value, limit=1000):
    return str(value or "").strip()[:limit]


def _pms_mail_event_property_ids(state):
    return {prop.get("id") for prop in state.get("properties", []) if isinstance(prop, dict) and prop.get("id")}


def _pms_mail_event_room_property(room_id, state):
    for room in state.get("rooms", []):
        if isinstance(room, dict) and room.get("id") == room_id:
            return room.get("property_id") or next(iter(_pms_mail_event_property_ids(state)), "")
    return ""


def _pms_mail_event_clean(item, state=None):
    raw = item if isinstance(item, dict) else {}
    state = state or {}
    now = datetime.utcnow().isoformat(timespec="seconds")
    room_id = _pms_mail_event_text(raw.get("room_id") or raw.get("roomId"), 120)
    property_id = _pms_mail_event_text(raw.get("property_id") or raw.get("propertyId"), 120)
    if not property_id and room_id:
        property_id = _pms_mail_event_room_property(room_id, state)
    message_id = _pms_mail_event_text(raw.get("message_id") or raw.get("messageId"), 160)
    event_id = _pms_mail_event_text(raw.get("id"), 180) or ("mail_" + hashlib.sha1((message_id or (property_id + "|" + now)).encode("utf-8")).hexdigest()[:18])
    return {
        "id": event_id,
        "message_id": message_id,
        "thread_id": _pms_mail_event_text(raw.get("thread_id") or raw.get("threadId"), 160),
        "received_at": _pms_mail_event_text(raw.get("received_at") or raw.get("receivedAt") or raw.get("date"), 40),
        "source_email": _pms_mail_event_text(raw.get("source_email") or raw.get("sourceEmail"), 220),
        "target_mail": _pms_mail_event_text(raw.get("target_mail") or raw.get("targetMail"), 220),
        "property_id": property_id,
        "room_id": room_id,
        "listing_id": _pms_mail_event_text(raw.get("listing_id") or raw.get("listingId"), 160),
        "reservation_code": _pms_mail_event_text(raw.get("reservation_code") or raw.get("reservationCode"), 120),
        "guest": _pms_mail_event_text(raw.get("guest") or raw.get("guest_name") or raw.get("guestName"), 160),
        "event_type": _pms_mail_event_text(raw.get("event_type") or raw.get("eventType") or "notice", 60),
        "severity": _pms_mail_event_text(raw.get("severity") or "normal", 40),
        "title": _pms_mail_event_text(raw.get("title") or raw.get("subject"), 240),
        "summary": _pms_mail_event_text(raw.get("summary") or raw.get("body_summary") or raw.get("bodySummary"), 1600),
        "checkin": _pms_mail_event_text(raw.get("checkin") or raw.get("start_date") or raw.get("startDate"), 40),
        "checkout": _pms_mail_event_text(raw.get("checkout") or raw.get("end_date") or raw.get("endDate"), 40),
        "amount": _pms_mail_event_text(raw.get("amount"), 80),
        "status": _pms_mail_event_text(raw.get("status") or "open", 60),
        "action_status": _pms_mail_event_text(raw.get("action_status") or raw.get("actionStatus"), 240),
        "raw_subject": _pms_mail_event_text(raw.get("raw_subject") or raw.get("rawSubject") or raw.get("subject"), 300),
        "created_at": _pms_mail_event_text(raw.get("created_at") or raw.get("createdAt")) or now,
        "updated_at": _pms_mail_event_text(raw.get("updated_at") or raw.get("updatedAt")) or now,
    }


_pms_mail_events_base_normalize_state = _pms_mail_normalize_state
def _pms_mail_events_normalize_state(raw):
    state = _pms_mail_events_base_normalize_state(raw)
    valid_properties = _pms_mail_event_property_ids(state)
    by_id = {}
    for item in state.get("mailEvents", []):
        if not isinstance(item, dict):
            continue
        clean = _pms_mail_event_clean(item, state)
        property_id = clean.get("property_id")
        if property_id and (not valid_properties or property_id in valid_properties):
            by_id[clean["id"]] = clean
    state["mailEvents"] = sorted(by_id.values(), key=lambda x: x.get("received_at") or x.get("created_at") or "", reverse=True)[:1000]
    return state


_pms_mail_events_base_filter_state_for_user = _pms_mail_filter_state_for_user
def _pms_mail_events_filter_state_for_user(state, actor):
    normalized = normalize_state(state)
    filtered = _pms_mail_events_base_filter_state_for_user(normalized, actor)
    role = (actor or {}).get("role")
    if role == "admin":
        filtered["mailEvents"] = normalized.get("mailEvents", [])
        return filtered
    if role == "owner":
        property_ids = {prop.get("id") for prop in filtered.get("properties", []) if isinstance(prop, dict) and prop.get("id")}
        filtered["mailEvents"] = [
            item for item in normalized.get("mailEvents", [])
            if item.get("property_id") in property_ids
        ]
        return filtered
    filtered["mailEvents"] = []
    return filtered


def save_mail_events(payload, actor=None):
    state = normalize_state(load_state())
    rows = payload.get("mailEvents") if isinstance(payload, dict) else payload
    if isinstance(rows, dict):
        rows = [rows]
    if not isinstance(rows, list):
        raise RuntimeError("mailEvents required")
    allowed_property_ids = _pms_mail_event_property_ids(state) if (actor and actor.get("role") == "admin") else actor_property_ids(actor, state)
    by_id = {
        item.get("id"): item
        for item in state.get("mailEvents", [])
        if isinstance(item, dict) and item.get("id")
    }
    saved_rows = []
    for raw in rows:
        if not isinstance(raw, dict):
            continue
        clean = _pms_mail_event_clean(raw, state)
        if not clean.get("property_id") or clean.get("property_id") not in allowed_property_ids:
            raise RuntimeError("mail event property permission required")
        if raw.get("_delete") or raw.get("_clear"):
            by_id.pop(clean.get("id"), None)
            continue
        by_id[clean["id"]] = clean
        saved_rows.append(clean)
    state["mailEvents"] = sorted(by_id.values(), key=lambda x: x.get("received_at") or x.get("created_at") or "", reverse=True)[:1000]
    return save_state(state), saved_rows


_pms_mail_events_base_save_state_from_payload = _pms_mail_save_state_from_payload
def _pms_mail_events_save_state_from_payload(payload, actor=None):
    working = dict(payload or {})
    incoming_mail_events = working.pop("mailEvents", None)
    if incoming_mail_events is None:
        return _pms_mail_events_base_save_state_from_payload(working, actor)
    saved = _pms_mail_events_base_save_state_from_payload(working, actor) if working else normalize_state(load_state())
    final_state, _rows = save_mail_events(incoming_mail_events, actor)
    return final_state


_pms_mail_raw_parser_v1 = True


def _pms_mail_raw_list(value):
    if isinstance(value, list):
        return [str(x or "").strip() for x in value if str(x or "").strip()]
    if value is None:
        return []
    return [str(value or "").strip()] if str(value or "").strip() else []


def _pms_mail_raw_value(raw, keys, limit=5000):
    raw = raw if isinstance(raw, dict) else {}
    for key in keys:
        value = raw.get(key)
        if value is None:
            continue
        if isinstance(value, list):
            value = ", ".join(_pms_mail_raw_list(value))
        text = str(value or "").strip()
        if text:
            return text[:limit]
    return ""


def _pms_mail_raw_compact(text, limit=1800):
    text = re.sub(r"\s+", " ", str(text or "")).strip()
    return text[:limit]


def _pms_mail_raw_year(value):
    text = str(value or "")
    match = re.search(r"(\d{4})", text)
    if match:
        return int(match.group(1))
    return datetime.utcnow().year


def _pms_mail_iso_date(year, month, day):
    try:
        return f"{int(year):04d}-{int(month):02d}-{int(day):02d}"
    except Exception:
        return ""


def _pms_mail_extract_cn_dates(text, base_year):
    text = str(text or "")
    checkin = ""
    checkout = ""
    full_range = re.search(r"(\d{4})[/-](\d{1,2})[/-](\d{1,2})\s*(?:-|->|至|到|~|—|－)\s*(?:(\d{4})[/-])?(\d{1,2})[/-](\d{1,2})", text)
    if full_range:
        checkin = _pms_mail_iso_date(full_range.group(1), full_range.group(2), full_range.group(3))
        checkout = _pms_mail_iso_date(full_range.group(4) or full_range.group(1), full_range.group(5), full_range.group(6))
        return checkin, checkout
    cn_full = re.search(r"(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?\s*(?:至|到|-|~|—|－)\s*(?:(\d{4})\s*年\s*)?(\d{1,2})\s*月\s*(\d{1,2})\s*日", text)
    if cn_full:
        checkin = _pms_mail_iso_date(cn_full.group(1), cn_full.group(2), cn_full.group(3))
        checkout = _pms_mail_iso_date(cn_full.group(4) or cn_full.group(1), cn_full.group(5), cn_full.group(6))
        return checkin, checkout
    same_month = re.search(r"(\d{1,2})\s*月\s*(\d{1,2})\s*日?\s*(?:至|到|-|~|—|－)\s*(\d{1,2})\s*日", text)
    if same_month:
        checkin = _pms_mail_iso_date(base_year, same_month.group(1), same_month.group(2))
        checkout = _pms_mail_iso_date(base_year, same_month.group(1), same_month.group(3))
    in_match = re.search(r"(?:入住|抵达|Check.?in)[^\d]{0,30}(\d{1,2})\s*月\s*(\d{1,2})\s*日", text, re.I)
    out_match = re.search(r"(?:退房|离开|Check.?out)[^\d]{0,30}(\d{1,2})\s*月\s*(\d{1,2})\s*日", text, re.I)
    if in_match:
        checkin = _pms_mail_iso_date(base_year, in_match.group(1), in_match.group(2))
    if out_match:
        checkout = _pms_mail_iso_date(base_year, out_match.group(1), out_match.group(2))
    if not checkin:
        arrive = re.search(r"将于\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日.*?(?:抵达|入住)", text)
        if arrive:
            checkin = _pms_mail_iso_date(base_year, arrive.group(1), arrive.group(2))
    return checkin, checkout


def _pms_mail_extract_guest(subject, text):
    patterns = [
        r"预订已确认\s*-\s*(.+?)将于",
        r"(.+?)想要更改预订",
        r"回复(.+?)的咨询",
        r"为(.+?)(?:撰写评价|写评价)",
        r"(.+?)给了你\s*\d+\s*星好评",
        r"房客\s*([A-Za-z\u4e00-\u9fff][A-Za-z\u4e00-\u9fff\s.'-]{0,60})",
        r"guest\s+([A-Za-z][A-Za-z\s.'-]{0,60})",
    ]
    haystacks = [subject or "", text or ""]
    for source in haystacks:
        for pattern in patterns:
            match = re.search(pattern, source, re.I)
            if match:
                return _pms_mail_raw_compact(match.group(1), 80).strip(" ，,。")
    return ""


def _pms_mail_extract_room(text):
    for pattern in [r"(新增房间[A-Za-z0-9\u4e00-\u9fff]{1,8})", r"(房间[A-Za-z0-9\u4e00-\u9fff]{1,8})", r"(\d+个房间整套)"]:
        match = re.search(pattern, str(text or ""))
        if match:
            return _pms_mail_raw_compact(match.group(1), 80)
    return ""


def _pms_mail_extract_listing_id(text):
    text = str(text or "")
    for pattern in [r"/rooms/(\d{8,})", r"项目\s*#?\s*(\d{8,})", r"listing(?:\s+id)?\D{0,10}(\d{8,})", r"房源\D{0,10}(\d{8,})"]:
        match = re.search(pattern, text, re.I)
        if match:
            return match.group(1)
    return ""


def _pms_mail_extract_reservation(text):
    match = re.search(r"\bH[A-Z0-9]{7,14}\b", str(text or ""))
    return match.group(0) if match else ""


def _pms_mail_classify(subject, text):
    blob = f"{subject}\n{text}"
    if re.search(r"取消|cancel", blob, re.I):
        return "cancellation", "warn", "cancelled"
    if re.search(r"更改预订|预订已更新|reservation change|updated", blob, re.I):
        return "reservation_change", "warn", "need_review"
    if re.search(r"预订已确认|新预订|new booking|confirmed", blob, re.I):
        return "new_booking", "normal", "new"
    if re.search(r"咨询|申请已过期|inquiry|request expired", blob, re.I):
        return "inquiry", "warn", "need_reply"
    if re.search(r"评价|review", blob, re.I):
        return "review", "warn", "need_review"
    if re.search(r"款项|收款|发放|payout|payment|\$[0-9]", blob, re.I):
        return "payment", "normal", "open"
    if re.search(r"投诉|申诉|调解中心|resolution|用户支持团队|support|屏蔽|开放|unblock|blocked", blob, re.I):
        return "support", "warn", "need_review"
    return "notice", "normal", "open"


def _pms_mail_event_title(event_type, guest, checkin, checkout, subject):
    date_text = checkin or checkout or ""
    unknown_guest = "\u672a\u77e5\u5ba2\u4eba"
    if event_type == "new_booking":
        return f"\u65b0\u8ba2\u5355\uff1a{guest or unknown_guest} {date_text}"
    if event_type == "cancellation":
        return f"\u8ba2\u5355\u53d6\u6d88\uff1a{guest or unknown_guest} {date_text}"
    if event_type == "reservation_change":
        return f"\u8ba2\u5355\u66f4\u6539\uff1a{guest or unknown_guest}"
    if event_type == "inquiry":
        return f"\u54a8\u8be2\uff1a{guest or unknown_guest}"
    if event_type == "review":
        return f"\u8bc4\u4ef7\u63d0\u9192\uff1a{guest or unknown_guest}"
    if event_type == "payment":
        return "\u6b3e\u9879\u901a\u77e5"
    if event_type == "support":
        return "\u7231\u5f7c\u8fce\u5ba2\u670d/\u98ce\u9669\u901a\u77e5"
    return subject[:80] if subject else "\u90ae\u4ef6\u901a\u77e5"


def _pms_mail_action_status(event_type, status, text):
    if event_type == "cancellation":
        return "\u5165\u4f4f\u524d\u53d6\u6d88\u4e0d\u751f\u6210\u4fdd\u6d01\uff1b\u5982\u5df2\u5165\u4f4f\u540e\u53d6\u6d88\uff0c\u9700\u8981\u627e\u623f\u4e1c\u786e\u8ba4\u662f\u5426\u5b89\u6392\u6253\u626b"
    if event_type == "new_booking":
        return "\u6838\u5bf9 iCal \u662f\u5426\u5df2\u540c\u6b65\uff0c\u5e76\u68c0\u67e5\u9000\u623f\u4fdd\u6d01\u4efb\u52a1"
    if event_type == "reservation_change":
        return "\u9700\u8981\u786e\u8ba4\u6539\u5355\u662f\u5426\u5df2\u88ab\u63a5\u53d7\uff0c\u4eba\u6570/\u65e5\u671f/\u4fdd\u6d01\u662f\u5426\u9700\u8981\u66f4\u65b0"
    if event_type == "inquiry":
        return "\u9700\u8981\u623f\u4e1c\u56de\u590d"
    if event_type == "review":
        return "\u53ef\u51b3\u5b9a\u662f\u5426\u64b0\u5199\u8bc4\u4ef7"
    if event_type == "support":
        if re.search(r"\u5f00\u653e|unblock|opened|unblocked", text or "", re.I):
            return "\u5e73\u53f0\u5df2\u89e3\u9664\u65e5\u5386\u5c4f\u853d\uff0c\u9700\u4e0e iCal \u9501\u5b9a\u5386\u53f2\u5173\u8054"
        return "\u9700\u8981\u623f\u4e1c\u67e5\u770b\u5e76\u5904\u7406\u5e73\u53f0\u5ba2\u670d\u6d88\u606f"
    return status


def _pms_mail_match_room(property_id, listing_id, room_name, text, state):
    if listing_id:
        needle = str(listing_id)
        for listing in state.get("channelListings", []):
            if not isinstance(listing, dict):
                continue
            if str(listing.get("property_id") or "") != str(property_id):
                continue
            try:
                hay = json.dumps(listing, ensure_ascii=False)
            except Exception:
                hay = str(listing)
            if needle and needle in hay and listing.get("room_id"):
                return str(listing.get("room_id"))
    body = str(text or "")
    for room in state.get("rooms", []):
        if not isinstance(room, dict):
            continue
        if str(room.get("property_id") or "") != str(property_id):
            continue
        name = str(room.get("name") or "")
        if name and (name == room_name or name in body):
            return str(room.get("id") or "")
    return ""


def _pms_mail_event_from_raw(raw, property_id, state):
    subject = _pms_mail_raw_value(raw, ["subject", "title"], 500)
    body = _pms_mail_raw_value(raw, ["body", "text", "plain", "html", "snippet", "summary"], 20000)
    snippet = _pms_mail_raw_value(raw, ["snippet", "summary"], 2000)
    combined = "\n".join([subject, body, snippet])
    received_at = _pms_mail_raw_value(raw, ["email_ts", "received_at", "receivedAt", "date", "created_at"], 80) or datetime.utcnow().isoformat(timespec="seconds")
    year = _pms_mail_raw_year(received_at)
    checkin, checkout = _pms_mail_extract_cn_dates(combined, year)
    guest = _pms_mail_extract_guest(subject, combined)
    listing_id = _pms_mail_extract_listing_id(combined)
    reservation_code = _pms_mail_extract_reservation(combined)
    room_name = _pms_mail_extract_room(combined)
    event_type, severity, status = _pms_mail_classify(subject, combined)
    if event_type == "support" and re.search(r"\u5f00\u653e|unblock|opened|unblocked", combined, re.I):
        status = "unblocked"
    source_email = _pms_mail_raw_value(raw, ["source_email", "sourceEmail"], 220)
    if not source_email:
        to_values = _pms_mail_raw_list(raw.get("to") or raw.get("to_") or raw.get("recipients"))
        source_email = next((x for x in to_values if "@" in x and "gmail.com" not in x.lower()), "")
    target_mail = _pms_mail_raw_value(raw, ["target_mail", "targetMail", "delivered_to"], 220)
    message_id = _pms_mail_raw_value(raw, ["id", "message_id", "messageId"], 180)
    if not message_id:
        message_id = hashlib.sha1((subject + "|" + received_at + "|" + body[:500]).encode("utf-8")).hexdigest()[:24]
    room_id = _pms_mail_match_room(property_id, listing_id, room_name, combined, state)
    summary = _pms_mail_raw_compact(snippet or body or subject, 900)
    if event_type in {"new_booking", "cancellation"}:
        pieces = []
        if guest:
            pieces.append(guest)
        if checkin or checkout:
            pieces.append(f"{checkin or '?'} -> {checkout or '?'}")
        if reservation_code:
            pieces.append(f"\u786e\u8ba4\u7801 {reservation_code}")
        if pieces:
            summary = f"{_pms_mail_event_title(event_type, guest, checkin, checkout, subject)}\uff1a" + "\uff0c".join(pieces) + "\u3002"
    event_id = "mail_" + hashlib.sha1((message_id + "|" + str(property_id)).encode("utf-8")).hexdigest()[:18]
    return {
        "id": event_id,
        "message_id": message_id,
        "thread_id": _pms_mail_raw_value(raw, ["thread_id", "threadId"], 180),
        "received_at": received_at,
        "source_email": source_email,
        "target_mail": target_mail,
        "property_id": property_id,
        "room_id": room_id,
        "room_name": room_name,
        "listing_id": listing_id,
        "reservation_code": reservation_code,
        "guest": guest,
        "event_type": event_type,
        "severity": severity,
        "title": _pms_mail_event_title(event_type, guest, checkin, checkout, subject),
        "summary": summary,
        "checkin": checkin,
        "checkout": checkout,
        "status": status,
        "action_status": _pms_mail_action_status(event_type, status, combined),
        "raw_subject": subject,
        "created_at": datetime.utcnow().isoformat(timespec="seconds"),
        "updated_at": datetime.utcnow().isoformat(timespec="seconds"),
    }


def parse_mail_events(payload, actor=None):
    state = normalize_state(load_state())
    property_id = _pms_mail_event_text((payload or {}).get("property_id") or (payload or {}).get("propertyId"), 120)
    allowed_property_ids = _pms_mail_event_property_ids(state) if (actor and actor.get("role") == "admin") else actor_property_ids(actor, state)
    if not property_id and len(allowed_property_ids) == 1:
        property_id = next(iter(allowed_property_ids))
    if not property_id or property_id not in allowed_property_ids:
        raise RuntimeError("mail parse property permission required")
    rows = (payload or {}).get("rawEmails") or (payload or {}).get("raw_emails") or (payload or {}).get("emails") or (payload or {}).get("messages")
    if isinstance(rows, dict):
        rows = [rows]
    if not isinstance(rows, list) or not rows:
        raise RuntimeError("rawEmails required")
    parsed = [_pms_mail_event_from_raw(raw, property_id, state) for raw in rows if isinstance(raw, dict)]
    saved, clean_rows = save_mail_events({"mailEvents": parsed}, actor)
    return saved, clean_rows


_pms_gmail_sync_v1 = True
GMAIL_TOKEN_CACHE = {"token": "", "expiry": 0}


def _pms_gmail_setting(name, default=""):
    return str(os.environ.get(name) or CONFIG.get(name.lower()) or default).strip()


def _pms_gmail_enabled():
    return bool(
        _pms_gmail_setting("GMAIL_CLIENT_ID")
        and _pms_gmail_setting("GMAIL_CLIENT_SECRET")
        and _pms_gmail_setting("GMAIL_REFRESH_TOKEN")
    )


def _pms_gmail_http_json(url, method="GET", payload=None, headers=None):
    data = None
    if payload is not None:
        if isinstance(payload, bytes):
            data = payload
        else:
            data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(url, data=data, method=method)
    for key, value in (headers or {}).items():
        req.add_header(key, value)
    if payload is not None and "Content-Type" not in (headers or {}):
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=25) as response:
            raw = response.read().decode("utf-8")
            return json.loads(raw or "{}")
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", "replace")
        raise RuntimeError(f"Gmail API {exc.code}: {body[:500]}")


def _pms_gmail_access_token():
    if not _pms_gmail_enabled():
        raise RuntimeError("后台 Gmail OAuth 未配置：需要 GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET / GMAIL_REFRESH_TOKEN")
    now = time.time()
    if GMAIL_TOKEN_CACHE.get("token") and GMAIL_TOKEN_CACHE.get("expiry", 0) > now + 60:
        return GMAIL_TOKEN_CACHE["token"]
    form = urllib.parse.urlencode({
        "client_id": _pms_gmail_setting("GMAIL_CLIENT_ID"),
        "client_secret": _pms_gmail_setting("GMAIL_CLIENT_SECRET"),
        "refresh_token": _pms_gmail_setting("GMAIL_REFRESH_TOKEN"),
        "grant_type": "refresh_token",
    }).encode("utf-8")
    data = _pms_gmail_http_json(
        "https://oauth2.googleapis.com/token",
        method="POST",
        payload=form,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    token = str(data.get("access_token") or "")
    if not token:
        raise RuntimeError("Gmail OAuth 未返回 access_token")
    GMAIL_TOKEN_CACHE["token"] = token
    GMAIL_TOKEN_CACHE["expiry"] = now + int(data.get("expires_in") or 3000)
    return token


def _pms_gmail_auth_headers():
    return {"Authorization": "Bearer " + _pms_gmail_access_token()}


def _pms_gmail_decode_body(data):
    text = str(data or "").strip()
    if not text:
        return ""
    pad = "=" * (-len(text) % 4)
    try:
        return base64.urlsafe_b64decode((text + pad).encode("ascii")).decode("utf-8", "replace")
    except Exception:
        return ""


def _pms_gmail_payload_text(payload):
    payload = payload if isinstance(payload, dict) else {}
    mime = str(payload.get("mimeType") or "").lower()
    body = payload.get("body") if isinstance(payload.get("body"), dict) else {}
    if mime.startswith("text/plain"):
        text = _pms_gmail_decode_body(body.get("data"))
        if text:
            return text
    parts = payload.get("parts") if isinstance(payload.get("parts"), list) else []
    plain = []
    html = []
    for part in parts:
        text = _pms_gmail_payload_text(part)
        if not text:
            continue
        pmime = str((part or {}).get("mimeType") or "").lower()
        if pmime.startswith("text/html"):
            html.append(re.sub(r"<[^>]+>", " ", text))
        else:
            plain.append(text)
    if plain:
        return "\n".join(plain)
    if html:
        return "\n".join(html)
    return _pms_gmail_decode_body(body.get("data"))


def _pms_gmail_headers(message):
    payload = message.get("payload") if isinstance(message, dict) else {}
    headers = payload.get("headers") if isinstance(payload, dict) and isinstance(payload.get("headers"), list) else []
    out = {}
    for item in headers:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").lower()
        if name:
            out[name] = str(item.get("value") or "")
    return out


def _pms_gmail_message_to_raw(message):
    headers = _pms_gmail_headers(message)
    return {
        "id": str(message.get("id") or ""),
        "thread_id": str(message.get("threadId") or ""),
        "from_": headers.get("from", ""),
        "to": _pms_mail_raw_list(headers.get("to", "")),
        "subject": headers.get("subject", ""),
        "date": headers.get("date", ""),
        "email_ts": datetime.utcfromtimestamp(int(message.get("internalDate") or "0") / 1000).isoformat(timespec="seconds") if message.get("internalDate") else "",
        "snippet": str(message.get("snippet") or ""),
        "body": _pms_gmail_payload_text(message.get("payload") or {}),
        "target_mail": _pms_gmail_setting("GMAIL_INBOX_EMAIL") or _pms_gmail_setting("PMS_GMAIL_INBOX") or "",
    }


def _pms_gmail_search(query, max_results=20):
    token_headers = _pms_gmail_auth_headers()
    url = "https://gmail.googleapis.com/gmail/v1/users/me/messages?" + urllib.parse.urlencode({
        "q": query,
        "maxResults": max(1, min(int(max_results or 20), 50)),
    })
    data = _pms_gmail_http_json(url, headers=token_headers)
    ids = [item.get("id") for item in data.get("messages", []) if isinstance(item, dict) and item.get("id")]
    messages = []
    for message_id in ids:
        detail_url = "https://gmail.googleapis.com/gmail/v1/users/me/messages/" + urllib.parse.quote(message_id) + "?format=full"
        messages.append(_pms_gmail_http_json(detail_url, headers=token_headers))
    return [_pms_gmail_message_to_raw(message) for message in messages]


def _pms_mail_property_targets(state, actor, property_id=""):
    normalized = normalize_state(state)
    allowed = _pms_mail_event_property_ids(normalized) if (actor and actor.get("role") == "admin") else actor_property_ids(actor, normalized)
    targets = []
    for row in normalized.get("propertyMailForwarding", []):
        if not isinstance(row, dict):
            continue
        pid = str(row.get("property_id") or "")
        if property_id and pid != property_id:
            continue
        if pid not in allowed:
            continue
        source = str(row.get("source_email") or "").strip()
        if not source:
            continue
        targets.append((pid, source))
    return targets


def _pms_gmail_target_addresses(state, property_id, source_email):
    addresses = []
    for value in (source_email,):
        text = str(value or "").strip()
        if text and text not in addresses:
            addresses.append(text)
    row = next(
        (item for item in normalize_state(state).get("propertyMailForwarding", []) if isinstance(item, dict) and item.get("property_id") == property_id),
        {},
    )
    for value in (row.get("pms_forward_address"), _pms_mail_forward_address(property_id, state) if "_pms_mail_forward_address" in globals() else ""):
        text = str(value or "").strip()
        if text and text not in addresses:
            addresses.append(text)
    return addresses


def _pms_gmail_target_query(addresses):
    terms = []
    for address in addresses:
        text = str(address or "").strip().replace('"', "")
        if not text:
            continue
        terms.extend([f"to:{text}", f"deliveredto:{text}", f'"{text}"'])
    if not terms:
        return ""
    return "(" + " OR ".join(terms) + ")"


def sync_gmail_mail_events(payload, actor=None):
    payload = payload if isinstance(payload, dict) else {}
    if not _pms_gmail_enabled():
        if _pms_gmail_setting("PMS_MAIL_BRIDGE_TOKEN"):
            state = normalize_state(load_state())
            property_id = _pms_mail_event_text(payload.get("property_id") or payload.get("propertyId"), 120)
            targets = _pms_mail_property_targets(state, actor, property_id)
            allowed = {pid for pid, _source in targets}
            rows = [
                row for row in state.get("mailEvents", [])
                if not allowed or str(row.get("property_id") or "") in allowed
            ]
            details = [
                {"property_id": pid, "source_email": source_email, "emails": 0, "events": 0, "bridge_enabled": True}
                for pid, source_email in targets
            ] or [{"property_id": property_id, "emails": 0, "events": 0, "bridge_enabled": True}]
            return state, rows, details
        raise RuntimeError("后台 Gmail OAuth 未配置，暂时只能用页面的“导入/解析邮件”手动导入")
    state = normalize_state(load_state())
    property_id = _pms_mail_event_text(payload.get("property_id") or payload.get("propertyId"), 120)
    days = max(1, min(int(payload.get("days") or 3), 30))
    max_results = max(1, min(int(payload.get("max_results") or payload.get("maxResults") or 20), 50))
    targets = _pms_mail_property_targets(state, actor, property_id)
    if not targets:
        raise RuntimeError("没有可同步的房源邮箱设置：请先在房源里保存 Airbnb 通知邮箱")
    all_events = []
    details = []
    for pid, source_email in targets:
        base_query = _pms_gmail_setting("GMAIL_SYNC_QUERY") or "(airbnb OR 爱彼迎 OR from:airbnb.com OR from:airbnbmail.com OR from:supportmessaging.airbnb.com OR from:automated@airbnb.com) -in:spam -in:trash"
        target_addresses = _pms_gmail_target_addresses(state, pid, source_email)
        target_query = _pms_gmail_target_query(target_addresses)
        query = f"newer_than:{days}d {target_query} {base_query}".strip()
        raw_rows = _pms_gmail_search(query, max_results=max_results)
        parsed = [_pms_mail_event_from_raw(raw, pid, state) for raw in raw_rows]
        all_events.extend(parsed)
        details.append({"property_id": pid, "source_email": source_email, "target_addresses": target_addresses, "query": query, "emails": len(raw_rows), "events": len(parsed)})
    saved, rows = save_mail_events({"mailEvents": all_events}, actor)
    return saved, rows, details


_pms_gmail_diagnostics_v1 = True


def _pms_mail_mask_email(value):
    text = str(value or "").strip()
    if "@" not in text:
        return text[:3] + "***" if text else ""
    local, domain = text.rsplit("@", 1)
    if len(local) <= 2:
        masked = local[:1] + "***"
    else:
        masked = local[:2] + "***" + local[-1:]
    return masked + "@" + domain


def _pms_mail_diagnostic_bool_env(name):
    return bool(str(os.environ.get(name) or "").strip())


def _pms_mail_property_name(state, property_id):
    for prop in normalize_state(state).get("properties", []):
        if isinstance(prop, dict) and prop.get("id") == property_id:
            return str(prop.get("name") or property_id)
    return str(property_id or "")


def inspect_mail_sync_diagnostics(payload, actor=None):
    payload = payload if isinstance(payload, dict) else {}
    state = normalize_state(load_state())
    property_id = _pms_mail_event_text(payload.get("property_id") or payload.get("propertyId"), 120)
    check_token = str(payload.get("check_token") or payload.get("checkToken") or "").strip().lower() in {"1", "true", "yes", "on"}
    targets = _pms_mail_property_targets(state, actor, property_id)
    target_rows = []
    for pid, source_email in targets:
        addresses = _pms_gmail_target_addresses(state, pid, source_email) if "_pms_gmail_target_addresses" in globals() else [source_email]
        target_rows.append({
            "property_id": pid,
            "property_name": _pms_mail_property_name(state, pid),
            "source_email": _pms_mail_mask_email(source_email),
            "target_addresses": [_pms_mail_mask_email(item) for item in addresses],
        })
    diagnostics = {
        "gmail_oauth_configured": _pms_gmail_enabled(),
        "gmail_bridge_configured": bool(_pms_gmail_setting("PMS_MAIL_BRIDGE_TOKEN")),
        "has_client_id": _pms_mail_diagnostic_bool_env("GMAIL_CLIENT_ID"),
        "has_client_secret": _pms_mail_diagnostic_bool_env("GMAIL_CLIENT_SECRET"),
        "has_refresh_token": _pms_mail_diagnostic_bool_env("GMAIL_REFRESH_TOKEN"),
        "has_inbox_email": _pms_mail_diagnostic_bool_env("GMAIL_INBOX_EMAIL") or _pms_mail_diagnostic_bool_env("PMS_GMAIL_INBOX"),
        "auto_sync_enabled": str(os.environ.get("PMS_MAIL_AUTO_SYNC_ENABLED", "1")).strip().lower() in ("1", "true", "yes", "on"),
        "auto_sync_interval_seconds": int(os.environ.get("PMS_MAIL_SYNC_INTERVAL_SECONDS", "7200") or "7200"),
        "sync_days": int(os.environ.get("PMS_MAIL_SYNC_DAYS", "3") or "3"),
        "sync_max_results": int(os.environ.get("PMS_MAIL_SYNC_MAX_RESULTS", "25") or "25"),
        "property_id": property_id,
        "target_count": len(target_rows),
        "targets": target_rows,
    }
    if check_token and diagnostics["gmail_oauth_configured"]:
        try:
            _pms_gmail_auth_headers()
            diagnostics["gmail_token_ok"] = True
        except Exception as exc:
            diagnostics["gmail_token_ok"] = False
            diagnostics["gmail_error"] = str(exc)[:500]
    if diagnostics["gmail_bridge_configured"] and not diagnostics["gmail_oauth_configured"]:
        diagnostics["gmail_token_ok"] = True
        diagnostics["gmail_bridge_mode"] = True
    return diagnostics


_pms_cleaning_confirm_v1 = True

if "cleaningTaskConfirmations" not in STATE_KEYS:
    STATE_KEYS.append("cleaningTaskConfirmations")

_pms_cleaning_confirm_base_default_state = _pms_mail_events_default_state
def _pms_cleaning_confirm_default_state():
    state = _pms_cleaning_confirm_base_default_state()
    state.setdefault("cleaningTaskConfirmations", [])
    return state


def _pms_cleaning_confirm_text(value, limit=1000):
    return str(value or "").strip()[:limit]


def _pms_cleaning_confirm_bool(value):
    if isinstance(value, bool):
        return value
    return str(value or "").strip().lower() in {"1", "true", "yes", "y", "on", "done", "completed", "已完成", "完成"}


def _pms_cleaning_confirm_allowed_targets(state, actor):
    normalized = normalize_state(state)
    if not actor or actor.get("role") == "admin":
        property_ids = {
            item.get("id")
            for item in normalized.get("properties", [])
            if isinstance(item, dict) and item.get("id")
        }
    else:
        property_ids = actor_property_ids(actor, normalized)
    first_property = next(iter(property_ids), "")
    room_ids = {
        item.get("id")
        for item in normalized.get("rooms", [])
        if isinstance(item, dict)
        and item.get("id")
        and (item.get("property_id") or first_property) in property_ids
    }
    common_ids = {
        item.get("id")
        for item in normalized.get("commonAreas", [])
        if isinstance(item, dict)
        and item.get("id")
        and (item.get("property_id") or first_property) in property_ids
    }
    return room_ids, common_ids


def _pms_cleaning_confirm_target_allowed(row, room_ids, common_ids):
    target_type = _pms_cleaning_confirm_text(row.get("target_type") or row.get("targetType") or "room", 20)
    target_id = _pms_cleaning_confirm_text(row.get("target_id") or row.get("targetId"), 120)
    if target_type == "common":
        return target_id in common_ids
    return target_id in room_ids


def _pms_cleaning_confirm_key(row):
    return "|".join([
        _pms_cleaning_confirm_text(row.get("date"), 20),
        _pms_cleaning_confirm_text(row.get("target_type") or row.get("targetType") or "room", 20),
        _pms_cleaning_confirm_text(row.get("target_id") or row.get("targetId"), 120),
        _pms_cleaning_confirm_text(row.get("task_key") or row.get("taskKey"), 300),
    ])


def _pms_cleaning_confirm_clean(row):
    raw = row if isinstance(row, dict) else {}
    date = _pms_cleaning_confirm_text(raw.get("date"), 20)
    target_type = _pms_cleaning_confirm_text(raw.get("target_type") or raw.get("targetType") or "room", 20)
    if target_type not in {"room", "common"}:
        target_type = "room"
    target_id = _pms_cleaning_confirm_text(raw.get("target_id") or raw.get("targetId"), 120)
    task_key = _pms_cleaning_confirm_text(raw.get("task_key") or raw.get("taskKey") or "|".join([date, target_type, target_id]), 500)
    completed = _pms_cleaning_confirm_bool(raw.get("completed")) or _pms_cleaning_confirm_text(raw.get("status"), 40) in {"已完成", "完成"}
    now = datetime.utcnow().isoformat(timespec="seconds")
    stable = hashlib.sha1(task_key.encode("utf-8")).hexdigest()[:24]
    return {
        "id": _pms_cleaning_confirm_text(raw.get("id"), 80) or "cleanconf_" + stable,
        "date": date,
        "target_type": target_type,
        "target_id": target_id,
        "task_key": task_key,
        "source": _pms_cleaning_confirm_text(raw.get("source"), 80),
        "task_type": _pms_cleaning_confirm_text(raw.get("task_type") or raw.get("taskType"), 80),
        "task_reason": _pms_cleaning_confirm_text(raw.get("task_reason") or raw.get("taskReason"), 500),
        "amount": raw.get("amount", 0),
        "completed": completed,
        "status": "已完成" if completed else _pms_cleaning_confirm_text(raw.get("status"), 40) or "未完成",
        "feedback": _pms_cleaning_confirm_text(raw.get("feedback"), 2000),
        "confirmed_by": _pms_cleaning_confirm_text(raw.get("confirmed_by") or raw.get("confirmedBy"), 120),
        "confirmed_at": _pms_cleaning_confirm_text(raw.get("confirmed_at") or raw.get("confirmedAt"), 40) if completed else "",
        "updated_at": now,
    }


_pms_cleaning_confirm_base_normalize_state = _pms_mail_events_normalize_state
def _pms_cleaning_confirm_normalize_state(raw):
    state = _pms_cleaning_confirm_base_normalize_state(raw)
    state.setdefault("cleaningTaskConfirmations", [])
    state["cleaningTaskConfirmations"] = [
        _pms_cleaning_confirm_clean(item)
        for item in state.get("cleaningTaskConfirmations", [])
        if isinstance(item, dict)
    ][-2000:]
    return state


_pms_cleaning_confirm_base_filter_state_for_user = _pms_mail_events_filter_state_for_user
def _pms_cleaning_confirm_filter_state_for_user(state, actor):
    filtered = _pms_cleaning_confirm_base_filter_state_for_user(state, actor)
    normalized = normalize_state(state)
    if not actor or actor.get("role") == "admin":
        filtered["cleaningTaskConfirmations"] = normalized.get("cleaningTaskConfirmations", [])
        return filtered
    room_ids = {item.get("id") for item in filtered.get("rooms", []) if isinstance(item, dict)}
    common_ids = {item.get("id") for item in filtered.get("commonAreas", []) if isinstance(item, dict)}
    filtered["cleaningTaskConfirmations"] = [
        item for item in normalized.get("cleaningTaskConfirmations", [])
        if isinstance(item, dict)
        and (
            (item.get("target_type") == "common" and item.get("target_id") in common_ids)
            or (item.get("target_type") != "common" and item.get("target_id") in room_ids)
        )
    ]
    return filtered


_pms_cleaning_confirm_base_save_state_from_payload = _pms_mail_events_save_state_from_payload
def _pms_cleaning_confirm_save_state_from_payload(payload, actor=None):
    working = dict(payload or {})
    incoming_confirmations = working.pop("cleaningTaskConfirmations", None)
    if incoming_confirmations is None:
        return _pms_cleaning_confirm_base_save_state_from_payload(working, actor)
    saved = _pms_cleaning_confirm_base_save_state_from_payload(working, actor) if working else normalize_state(load_state())
    current = normalize_state(load_state())
    room_ids, common_ids = _pms_cleaning_confirm_allowed_targets(current, actor)
    existing = [
        item for item in current.get("cleaningTaskConfirmations", [])
        if isinstance(item, dict) and not _pms_cleaning_confirm_target_allowed(item, room_ids, common_ids)
    ]
    by_key = {_pms_cleaning_confirm_key(item): item for item in existing}
    rows = incoming_confirmations if isinstance(incoming_confirmations, list) else []
    for raw in rows:
        if not isinstance(raw, dict):
            continue
        clean = _pms_cleaning_confirm_clean(raw)
        if not _pms_cleaning_confirm_target_allowed(clean, room_ids, common_ids):
            raise RuntimeError("cleaning task permission required")
        key = _pms_cleaning_confirm_key(clean)
        if raw.get("_delete") or raw.get("_clear"):
            by_key.pop(key, None)
            continue
        by_key[key] = clean
    current["cleaningTaskConfirmations"] = list(by_key.values())[-2000:]
    return save_state(current)


_pms_cleaning_photo_v1 = True

import uuid as _pms_photo_uuid
import urllib.error as _pms_photo_urllib_error
import datetime as _pms_photo_dt

if "cleaningTaskPhotos" not in STATE_KEYS:
    STATE_KEYS.append("cleaningTaskPhotos")

_PMS_PHOTO_MAX_BYTES = 6 * 1024 * 1024
_PMS_PHOTO_RETENTION_DAYS = int(os.environ.get("PMS_CLEANING_PHOTO_RETENTION_DAYS", "7") or "7")


def _pms_photo_text(value, limit=2000):
    return str(value or "").strip()[:limit]


def _pms_photo_now():
    return _pms_photo_dt.datetime.now(_pms_photo_dt.timezone.utc)


def _pms_photo_iso(dt):
    return dt.astimezone(_pms_photo_dt.timezone.utc).isoformat().replace("+00:00", "Z")


def _pms_photo_parse_iso(value):
    text = _pms_photo_text(value, 80)
    if not text:
        return None
    try:
        return _pms_photo_dt.datetime.fromisoformat(text.replace("Z", "+00:00"))
    except Exception:
        return None


def _pms_photo_is_expired(row, now=None):
    expires = _pms_photo_parse_iso((row or {}).get("expires_at"))
    return bool(expires and expires <= (now or _pms_photo_now()))


def _pms_photo_clean(row):
    raw = row if isinstance(row, dict) else {}
    cleaned = {
        "id": _pms_photo_text(raw.get("id"), 120),
        "date": _pms_photo_text(raw.get("date"), 20),
        "target_id": _pms_photo_text(raw.get("target_id") or raw.get("targetId"), 120),
        "target_type": _pms_photo_text(raw.get("target_type") or raw.get("targetType") or "room", 20),
        "task_key": _pms_photo_text(raw.get("task_key") or raw.get("taskKey"), 500),
        "file_name": _pms_photo_text(raw.get("file_name") or raw.get("fileName"), 180),
        "content_type": _pms_photo_text(raw.get("content_type") or raw.get("contentType") or "image/jpeg", 80),
        "upload_source": _pms_photo_text(raw.get("upload_source") or raw.get("uploadSource"), 40),
        "size": int(raw.get("size") or 0),
        "url": _pms_photo_text(raw.get("url"), 2000),
        "storage_bucket": _pms_photo_text(raw.get("storage_bucket") or raw.get("storageBucket"), 200),
        "storage_object": _pms_photo_text(raw.get("storage_object") or raw.get("storageObject"), 500),
        "storage_backend": _pms_photo_text(raw.get("storage_backend") or raw.get("storageBackend"), 40),
        "photo_doc": _pms_photo_text(raw.get("photo_doc") or raw.get("photoDoc"), 120),
        "uploaded_by": _pms_photo_text(raw.get("uploaded_by") or raw.get("uploadedBy"), 120),
        "uploaded_by_name": _pms_photo_text(raw.get("uploaded_by_name") or raw.get("uploadedByName"), 200),
        "uploaded_at": _pms_photo_text(raw.get("uploaded_at") or raw.get("uploadedAt"), 80),
        "expires_at": _pms_photo_text(raw.get("expires_at") or raw.get("expiresAt"), 80),
    }
    return {key: value for key, value in cleaned.items() if value not in ("", None, 0)}


_pms_photo_base_default_state = _pms_cleaning_confirm_default_state
def _pms_photo_default_state():
    state = _pms_photo_base_default_state()
    state.setdefault("cleaningTaskPhotos", [])
    return state


_pms_photo_base_normalize_state = _pms_cleaning_confirm_normalize_state
def _pms_photo_normalize_state(raw):
    state = _pms_photo_base_normalize_state(raw)
    state.setdefault("cleaningTaskPhotos", [])
    state["cleaningTaskPhotos"] = [
        item for item in (_pms_photo_clean(row) for row in state.get("cleaningTaskPhotos", []))
        if item.get("id") and item.get("url") and item.get("task_key")
    ][-2000:]
    return state


def _pms_photo_allowed_targets(state, actor):
    normalized = normalize_state(state)
    base_filter = globals().get("_pms_photo_base_filter_state_for_user") or filter_state_for_user
    filtered = base_filter(normalized, actor) if actor else {}
    room_ids = {
        _pms_photo_text(item.get("id"), 120)
        for item in filtered.get("rooms", [])
        if isinstance(item, dict) and item.get("id")
    }
    common_ids = {
        _pms_photo_text(item.get("id"), 120)
        for item in filtered.get("commonAreas", [])
        if isinstance(item, dict) and item.get("id")
    }
    return room_ids, common_ids


def _pms_photo_target_allowed(row, room_ids, common_ids):
    target_type = _pms_photo_text(row.get("target_type") or row.get("targetType") or "room", 20)
    target_id = _pms_photo_text(row.get("target_id") or row.get("targetId"), 120)
    if target_type == "common":
        return target_id in common_ids
    return target_id in room_ids


_pms_photo_base_filter_state_for_user = _pms_cleaning_confirm_filter_state_for_user
def _pms_photo_filter_state_for_user(state, actor):
    filtered = _pms_photo_base_filter_state_for_user(state, actor)
    normalized = normalize_state(state)
    room_ids, common_ids = _pms_photo_allowed_targets(normalized, actor)
    now = _pms_photo_now()
    filtered["cleaningTaskPhotos"] = [
        row for row in normalized.get("cleaningTaskPhotos", [])
        if _pms_photo_target_allowed(row, room_ids, common_ids) and not _pms_photo_is_expired(row, now)
    ]
    return filtered


def _pms_photo_storage_buckets():
    project = firebase_project_id()
    raw = [
        os.environ.get("FIREBASE_STORAGE_BUCKET"),
        os.environ.get("FIREBASE_STORAGE_BUCKET_NAME"),
        os.environ.get("GOOGLE_CLOUD_STORAGE_BUCKET"),
        f"{project}.firebasestorage.app" if project else "",
        f"{project}.appspot.com" if project else "",
    ]
    out = []
    for item in raw:
        text = _pms_photo_text(item, 200)
        if text and text not in out:
            out.append(text)
    return out


def _pms_photo_storage_request(method, bucket, object_name, data=None, content_type="application/octet-stream"):
    if method == "POST":
        url = "https://storage.googleapis.com/upload/storage/v1/b/{}/o?uploadType=media&name={}".format(
            urllib.parse.quote(bucket, safe=""),
            urllib.parse.quote(object_name, safe=""),
        )
    else:
        url = "https://storage.googleapis.com/storage/v1/b/{}/o/{}".format(
            urllib.parse.quote(bucket, safe=""),
            urllib.parse.quote(object_name, safe=""),
        )
    headers = {"Authorization": "Bearer " + access_token()}
    if method == "POST":
        headers["Content-Type"] = content_type or "application/octet-stream"
        headers["x-goog-meta-firebaseStorageDownloadTokens"] = str(_pms_photo_uuid.uuid4())
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    with urllib.request.urlopen(req, timeout=45) as response:
        raw = response.read().decode("utf-8", errors="replace")
        return json.loads(raw or "{}"), headers.get("x-goog-meta-firebaseStorageDownloadTokens", "")


def _pms_photo_upload_storage(object_name, content, content_type):
    errors = []
    for bucket in _pms_photo_storage_buckets():
        try:
            meta, token = _pms_photo_storage_request("POST", bucket, object_name, data=content, content_type=content_type)
            token = token or str(_pms_photo_uuid.uuid4())
            url = "https://firebasestorage.googleapis.com/v0/b/{}/o/{}?alt=media&token={}".format(
                urllib.parse.quote(bucket, safe=""),
                urllib.parse.quote(object_name, safe=""),
                urllib.parse.quote(token, safe=""),
            )
            return bucket, object_name, url
        except _pms_photo_urllib_error.HTTPError as exc:
            errors.append(f"{bucket}: HTTP {exc.code}")
            if exc.code not in (400, 403, 404):
                raise
    raise RuntimeError("Firebase Storage upload failed: " + "; ".join(errors))


def _pms_photo_delete_storage(row):
    if _pms_photo_text((row or {}).get("storage_backend"), 40) == "firestore" or (row or {}).get("photo_doc"):
        doc_id = _pms_photo_text((row or {}).get("photo_doc") or (row or {}).get("id"), 120)
        if doc_id:
            try:
                firestore_request("DELETE", _pms_photo_doc_url(doc_id))
            except Exception:
                pass
        return
    bucket = _pms_photo_text((row or {}).get("storage_bucket"), 200)
    object_name = _pms_photo_text((row or {}).get("storage_object"), 500)
    if not bucket or not object_name:
        return
    try:
        _pms_photo_storage_request("DELETE", bucket, object_name)
    except Exception:
        pass


def _pms_photo_doc_url(photo_id):
    project = urllib.parse.quote(firebase_project_id(), safe="")
    collection = urllib.parse.quote(STATE_COLLECTION, safe="")
    document = urllib.parse.quote(f"{STATE_DOCUMENT}__photo__{_pms_photo_text(photo_id, 120)}", safe="")
    return f"https://firestore.googleapis.com/v1/projects/{project}/databases/(default)/documents/{collection}/{document}"


def _pms_photo_write_firestore(photo_id, content, content_type, expires_at):
    compressed = base64.b64encode(gzip.compress(content, compresslevel=9)).decode("ascii")
    firestore_request("PATCH", _pms_photo_doc_url(photo_id), payload={
        "fields": {
            "photo_id": {"stringValue": photo_id},
            "content_type": {"stringValue": content_type or "image/jpeg"},
            "data_gzip_base64": {"stringValue": compressed},
            "raw_bytes": {"integerValue": str(len(content))},
            "expires_at": {"timestampValue": expires_at},
            "created_at": {"timestampValue": _pms_photo_iso(_pms_photo_now())},
        }
    })


def _pms_photo_read_firestore(photo_id):
    doc = firestore_request("GET", _pms_photo_doc_url(photo_id))
    if not doc:
        raise RuntimeError("photo not found")
    fields = doc.get("fields", {})
    content_type = fields.get("content_type", {}).get("stringValue") or "image/jpeg"
    data = fields.get("data_gzip_base64", {}).get("stringValue") or ""
    if not data:
        raise RuntimeError("photo data not found")
    content = gzip.decompress(base64.b64decode(data.encode("ascii")))
    return content, content_type


def pms_photo_binary_response(handler, data, content_type):
    handler.send_response(200)
    handler.send_header("Content-Type", content_type or "application/octet-stream")
    handler.send_header("Content-Length", str(len(data)))
    handler.send_header("Cache-Control", "private, max-age=300")
    handler.end_headers()
    handler.wfile.write(data)


def _pms_photo_cleanup_state(state, delete_objects=False):
    normalized = normalize_state(state)
    now = _pms_photo_now()
    keep = []
    for row in normalized.get("cleaningTaskPhotos", []):
        if _pms_photo_is_expired(row, now):
            if delete_objects:
                _pms_photo_delete_storage(row)
            continue
        keep.append(row)
    normalized["cleaningTaskPhotos"] = keep[-2000:]
    return normalized


_pms_photo_base_save_state = _pms_core_save_state
def _pms_photo_save_state(state):
    return _pms_photo_base_save_state(_pms_photo_cleanup_state(state, delete_objects=True))


def _pms_photo_decode_payload(payload):
    data_url = _pms_photo_text(payload.get("photo_data") or payload.get("photoData") or payload.get("data_url") or payload.get("dataUrl"), _PMS_PHOTO_MAX_BYTES * 2)
    content_type = _pms_photo_text(payload.get("content_type") or payload.get("contentType") or "image/jpeg", 80)
    if "," in data_url and data_url.startswith("data:"):
        header, body = data_url.split(",", 1)
        if ";" in header:
            content_type = header[5:].split(";", 1)[0] or content_type
        data_url = body
    content = base64.b64decode(data_url.encode("ascii"), validate=False)
    if not content:
        raise RuntimeError("empty photo")
    if len(content) > _PMS_PHOTO_MAX_BYTES:
        raise RuntimeError("photo is too large")
    if not str(content_type).lower().startswith("image/"):
        raise RuntimeError("only image uploads are allowed")
    return content, content_type


def upload_cleaning_task_photo(payload, actor=None):
    if not isinstance(payload, dict):
        raise RuntimeError("payload must be an object")
    state = _pms_photo_cleanup_state(load_state(), delete_objects=True)
    room_ids, common_ids = _pms_photo_allowed_targets(state, actor)
    target_type = _pms_photo_text(payload.get("target_type") or payload.get("targetType") or "room", 20)
    target_id = _pms_photo_text(payload.get("target_id") or payload.get("targetId"), 120)
    date = _pms_photo_text(payload.get("date"), 20)
    task_key = _pms_photo_text(payload.get("task_key") or payload.get("taskKey"), 500)
    if not date or not target_id or not task_key:
        raise RuntimeError("date, target and task key are required")
    if not _pms_photo_target_allowed({"target_type": target_type, "target_id": target_id}, room_ids, common_ids):
        raise RuntimeError("cleaning task permission required")
    content, content_type = _pms_photo_decode_payload(payload)
    now = _pms_photo_now()
    photo_id = "photo_" + _pms_photo_uuid.uuid4().hex
    ext = ".jpg"
    if "png" in content_type:
        ext = ".png"
    elif "webp" in content_type:
        ext = ".webp"
    elif "heic" in content_type or "heif" in content_type:
        ext = ".heic"
    object_name = "cleaning-photos/{}/{}/{}/{}{}".format(date, target_type, target_id, photo_id, ext)
    expires_at = _pms_photo_iso(now + _pms_photo_dt.timedelta(days=max(1, _PMS_PHOTO_RETENTION_DAYS)))
    storage_backend = "storage"
    photo_doc = ""
    try:
        bucket, storage_object, url = _pms_photo_upload_storage(object_name, content, content_type)
    except Exception:
        bucket, storage_object = "", ""
        storage_backend = "firestore"
        photo_doc = photo_id
        _pms_photo_write_firestore(photo_id, content, content_type, expires_at)
        url = f"/api/cleaning-photo/{photo_id}"
    row = {
        "id": photo_id,
        "date": date,
        "target_id": target_id,
        "target_type": target_type,
        "task_key": task_key,
        "file_name": _pms_photo_text(payload.get("file_name") or payload.get("fileName") or (photo_id + ext), 180),
        "content_type": content_type,
        "upload_source": _pms_photo_text(payload.get("upload_source") or payload.get("uploadSource"), 40),
        "size": len(content),
        "url": url,
        "storage_bucket": bucket,
        "storage_object": storage_object,
        "storage_backend": storage_backend,
        "photo_doc": photo_doc,
        "uploaded_by": _pms_photo_text((actor or {}).get("id") or (actor or {}).get("username"), 120),
        "uploaded_by_name": _pms_photo_text((actor or {}).get("name") or (actor or {}).get("username"), 200),
        "uploaded_at": _pms_photo_iso(now),
        "expires_at": expires_at,
    }
    photos = [item for item in state.get("cleaningTaskPhotos", []) if isinstance(item, dict)]
    photos.append(row)
    state["cleaningTaskPhotos"] = photos[-2000:]
    saved = save_state(state)
    return saved, row


def serve_cleaning_task_photo(photo_id, actor=None):
    state = _pms_photo_cleanup_state(load_state(), delete_objects=True)
    room_ids, common_ids = _pms_photo_allowed_targets(state, actor)
    row = next((item for item in state.get("cleaningTaskPhotos", []) if isinstance(item, dict) and item.get("id") == photo_id), None)
    if not row or _pms_photo_is_expired(row) or not _pms_photo_target_allowed(row, room_ids, common_ids):
        raise RuntimeError("photo not found")
    if _pms_photo_text(row.get("storage_backend"), 40) == "firestore" or row.get("photo_doc"):
        return _pms_photo_read_firestore(row.get("photo_doc") or row.get("id"))
    raise RuntimeError("direct storage photo")


_PMS_DEFAULT_ROOM_CLEANING_TASKS = [
    {
        "id": "checkout_turnover_standard",
        "title": "每次退房基础保洁",
        "note": "垃圾清空、床品毛巾更换、厨房台面和餐具检查、卫生间清洁、地面吸尘拖地、高频接触点擦拭、补齐耗材、拍照记录异常。",
        "interval": 1,
        "flex": 0,
        "mode": "regular",
        "base": True,
    },
    {"id": "weekly_kitchen_bath_detail", "title": "厨卫深清和水垢检查", "note": "检查厨房油污、水槽、淋浴玻璃、马桶边角、地漏和水垢。", "interval": 7, "flex": 1, "mode": "regular", "private_bath": True},
    {"id": "weekly_supply_audit", "title": "耗材库存和布草检查", "note": "检查纸巾、垃圾袋、洗手液、洗衣液、备用毛巾和床品，记录缺货。", "interval": 7, "flex": 1, "mode": "regular"},
    {"id": "biweekly_window_tracks_screens", "title": "窗户轨道/纱窗/窗台灰尘", "note": "清理窗户轨道、窗台、纱窗表面灰尘；保洁量大时可顺延到下一次退房。", "interval": 14, "flex": 3, "mode": "deep"},
    {"id": "biweekly_under_furniture_edges", "title": "床底沙发边角和踢脚线", "note": "吸尘床底、沙发边角、踢脚线、门后和柜角。", "interval": 14, "flex": 3, "mode": "deep"},
    {"id": "monthly_drain_deodorize", "title": "排水口/马桶异味维护", "note": "检查淋浴、洗手池、厨房水槽、马桶和地漏异味，按产品说明维护。", "interval": 30, "flex": 7, "mode": "deep", "private_bath": True},
    {"id": "monthly_pest_ipm_check", "title": "防虫巡检和必要处理", "note": "检查食物残渣、垃圾、门窗缝、潮湿点和虫迹；优先清洁/封堵，必要时按标签处理。", "interval": 30, "flex": 7, "mode": "deep"},
    {"id": "monthly_appliance_detail", "title": "家电细节清洁", "note": "微波炉、烤箱、冰箱抽屉、洗衣机胶圈/滤网、咖啡机、遥控器和小家电外观深清。", "interval": 30, "flex": 7, "mode": "deep"},
    {"id": "monthly_air_filter_vents", "title": "空调滤网/通风口检查", "note": "检查空调滤网、回风口、排风扇和出风口积灰，需更换时记录给房东确认。", "interval": 30, "flex": 7, "mode": "deep"},
    {"id": "quarterly_mattress_sofa", "title": "床垫/沙发/枕芯保护层检查", "note": "检查床垫保护套、枕芯、沙发垫、床架缝隙和可见污渍，必要时拍照反馈。", "interval": 90, "flex": 14, "mode": "deep"},
    {"id": "quarterly_curtains_blinds", "title": "窗帘百叶/灯具/高处灰尘", "note": "清理窗帘、百叶、灯具、风扇、高处置物架和装饰物积灰。", "interval": 90, "flex": 14, "mode": "deep"},
]


def _pms_room_bathroom_type(room):
    text = str((room or {}).get("bathroom_type") or (room or {}).get("bathroomType") or (room or {}).get("bathroom") or "private").strip().lower()
    if text in {"shared", "common", "public", "共享卫生间"}:
        return "shared"
    if text in {"none", "no", "without", "无卫生间"}:
        return "none"
    return "private"


def _pms_room_has_kitchen(room):
    return normalize_room_has_kitchen(room)


def _pms_room_appliances(room):
    return normalize_room_appliances_value((room or {}).get("appliances"))


def _pms_room_appliance_labels(room):
    return [ROOM_APPLIANCE_LABELS.get(item, item) for item in _pms_room_appliances(room)]


def _pms_default_room_task_applicable(room, preset):
    task_id = str(preset.get("id") or "")
    if task_id in {"weekly_kitchen_bath_detail", "monthly_drain_deodorize"}:
        if _pms_room_bathroom_type(room) != "private" and not _pms_room_has_kitchen(room):
            return False, "no_room_plumbing"
        return True, ""
    if preset.get("private_bath") and _pms_room_bathroom_type(room) != "private":
        return False, "no_private_bath"
    if task_id == "monthly_appliance_detail" and not _pms_room_appliances(room):
        return False, "no_room_appliances"
    return True, ""


def _pms_default_room_task_key(room_id, preset_id):
    return f"room_default|{room_id or ''}|{preset_id or ''}"


def _pms_default_room_task_start_date(is_base):
    if is_base:
        return datetime.now(ZoneInfo("America/Los_Angeles")).date().isoformat()
    return PMS_CLEANING_TASK_DEEP_START_DATE


def _pms_apply_cleaning_task_launch_ramp(notes):
    for item in notes:
        if not isinstance(item, dict):
            continue
        if not item.get("recurring_task") or not item.get("default_room_task"):
            continue
        if str(item.get("template_id") or "") == "checkout_turnover_standard":
            continue
        start_date = str(item.get("start_date") or "")[:10]
        if not start_date or start_date < PMS_CLEANING_TASK_DEEP_START_DATE:
            item["start_date"] = PMS_CLEANING_TASK_DEEP_START_DATE
            item["launch_ramp_applied"] = True
    return notes


def _pms_default_checkout_note(bathroom, has_kitchen):
    parts = ["垃圾清空", "床品毛巾更换"]
    if has_kitchen:
        parts.append("房间内厨房/小厨房台面、水槽和餐具检查")
    if bathroom == "private":
        parts.append("独立卫生间清洁")
    elif bathroom == "shared":
        parts.append("本房间使用共享卫生间，卫生间清洁归入公区任务")
    else:
        parts.append("本房间无卫生间，卫生间清洁不在本房间任务内")
    parts.extend(["地面吸尘拖地", "高频接触点擦拭", "补齐耗材", "拍照记录异常"])
    return "、".join(parts) + "。"


def _pms_kitchen_bath_detail_title_note(bathroom, has_kitchen):
    if bathroom == "private" and has_kitchen:
        return "厨卫深清和水垢检查", "检查房间内厨房油污、水槽、台面、淋浴玻璃、马桶边角、地漏和水垢；在当天保洁量少时补做。"
    if has_kitchen:
        return "房间厨房深清和水垢检查", "检查房间内厨房油污、水槽、台面和小厨房区域水垢；在当天保洁量少时补做。"
    return "卫浴深清和水垢检查", "检查独立卫生间淋浴玻璃、马桶边角、地漏和水垢；在当天保洁量少时补做。"


def _pms_drain_deodorize_title_note(bathroom, has_kitchen):
    if bathroom == "private" and has_kitchen:
        return "排水口/卫浴/厨房异味维护", "检查淋浴、洗手池、房间内厨房水槽、马桶和地漏异味，按产品说明维护。"
    if has_kitchen:
        return "厨房水槽异味维护", "检查房间内厨房水槽和小厨房区域异味，按产品说明维护。"
    return "排水口/马桶异味维护", "检查淋浴、洗手池、马桶和地漏异味，按产品说明维护。"


def _pms_default_room_task(room, preset):
    room_id = str(room.get("id") or "")
    is_base = bool(preset.get("base"))
    bathroom = _pms_room_bathroom_type(room)
    has_kitchen = _pms_room_has_kitchen(room)
    task_id = str(preset.get("id") or "")
    title = str(preset.get("title") or "")
    note = str(preset.get("note") or "")
    if is_base:
        note = _pms_default_checkout_note(bathroom, has_kitchen)
    elif task_id == "weekly_kitchen_bath_detail":
        title, note = _pms_kitchen_bath_detail_title_note(bathroom, has_kitchen)
    elif task_id == "monthly_drain_deodorize":
        title, note = _pms_drain_deodorize_title_note(bathroom, has_kitchen)
    if task_id == "monthly_appliance_detail":
        appliances = _pms_room_appliance_labels(room)
        if appliances:
            note = f"{note} 本房间独有电器：{'、'.join(appliances)}。"
    return {
        "id": "recurring_default_" + re.sub(r"[^a-zA-Z0-9_-]", "_", room_id) + "_" + re.sub(r"[^a-zA-Z0-9_-]", "_", str(preset.get("id") or "")),
        "recurring_task": True,
        "enabled": True,
        "default_room_task": True,
        "default_task_key": _pms_default_room_task_key(room_id, preset.get("id")),
        "template_id": preset.get("id"),
        "attach_to_checkout": True,
        "can_defer": not is_base,
        "task_mode": preset.get("mode") or ("regular" if is_base else "deep"),
        "target_id": room_id,
        "target_type": "room",
        "title": title,
        "note": note,
        "priority": "普通",
        "schedule_type": "daily" if is_base else "interval",
        "weekday": 1,
        "interval_days": 1 if is_base else int(preset.get("interval") or 30),
        "flex_days": 0 if is_base else int(preset.get("flex") or 0),
        "workload_sensitive": not is_base,
        "amount": 0,
        "start_date": _pms_default_room_task_start_date(is_base),
        "created_by": "系统默认",
        "created_at": now_utc_iso(),
    }


def _pms_ensure_default_room_cleaning_tasks(state):
    notes = [item for item in state.get("cleaningNotes", []) if isinstance(item, dict)]
    existing = {
        str(item.get("default_task_key") or _pms_default_room_task_key(item.get("target_id"), item.get("template_id")) if item.get("default_room_task") else item.get("default_task_key") or "")
        for item in notes
        if item.get("recurring_task")
    }
    rooms_by_id = {str(room.get("id")): room for room in state.get("rooms", []) if isinstance(room, dict) and room.get("id")}
    presets_by_id = {str(preset.get("id")): preset for preset in _PMS_DEFAULT_ROOM_CLEANING_TASKS}
    for item in notes:
        if not isinstance(item, dict) or not item.get("recurring_task") or not item.get("default_room_task"):
            continue
        room = rooms_by_id.get(str(item.get("target_id") or ""))
        preset = presets_by_id.get(str(item.get("template_id") or ""))
        if not room or not preset:
            continue
        applicable, reason = _pms_default_room_task_applicable(room, preset)
        if not applicable:
            item["enabled"] = False
            item["inactive"] = True
            item["auto_disabled_reason"] = reason
        elif item.get("auto_disabled_reason") in {"no_private_bath", "no_room_appliances", "no_room_plumbing"}:
            item["enabled"] = True
            item.pop("inactive", None)
            item.pop("auto_disabled_reason", None)
        if applicable:
            updated = _pms_default_room_task(room, preset)
            for key in (
                "title",
                "note",
                "task_mode",
                "schedule_type",
                "weekday",
                "interval_days",
                "flex_days",
                "workload_sensitive",
                "attach_to_checkout",
                "can_defer",
            ):
                item[key] = updated.get(key)
    for area in state.get("commonAreas", []):
        if isinstance(area, dict):
            area.setdefault("area_type", "general")
            area.setdefault("unit_count", 1)
            for key, value in normalize_common_area_components(area).items():
                area[key] = value
    for room in state.get("rooms", []):
        if not isinstance(room, dict) or not room.get("id"):
            continue
        room.setdefault("bathroom_type", "private")
        room["has_kitchen"] = _pms_room_has_kitchen(room)
        room["appliances"] = _pms_room_appliances(room)
        bathroom = _pms_room_bathroom_type(room)
        for preset in _PMS_DEFAULT_ROOM_CLEANING_TASKS:
            applicable, _reason = _pms_default_room_task_applicable(room, preset)
            if not applicable:
                continue
            key = _pms_default_room_task_key(room.get("id"), preset.get("id"))
            if key in existing:
                continue
            notes.append(_pms_default_room_task(room, preset))
            existing.add(key)
    state["cleaningNotes"] = _pms_apply_cleaning_task_launch_ramp(notes)[-3000:]
    return state


_pms_ical_event_archive_v1 = True

if "icalEventArchive" not in STATE_KEYS:
    STATE_KEYS.append("icalEventArchive")


def _pms_ical_archive_text(value, limit=5000):
    return str(value or "").strip()[:limit]


def _pms_ical_archive_bool(value):
    if isinstance(value, bool):
        return value
    return str(value or "").strip().lower() in {"1", "true", "yes", "y", "on", "是"}


def _pms_ical_archive_int(value, default=0):
    try:
        return int(value or 0)
    except Exception:
        return default


def _pms_ical_archive_hash(value, length=24):
    return hashlib.sha1(str(value or "").encode("utf-8")).hexdigest()[:length]


def _pms_ical_archive_room(state, room_id):
    return next((item for item in state.get("rooms", []) if isinstance(item, dict) and item.get("id") == room_id), {})


def _pms_ical_archive_event_id(listing, event):
    listing_id = _pms_ical_archive_text(listing.get("id"), 160)
    uid = _pms_ical_archive_text(event.get("uid") or event.get("external_event_uid"), 300)
    checkin = _pms_ical_archive_text(event.get("checkin"), 40)
    checkout = _pms_ical_archive_text(event.get("checkout"), 40)
    raw_hash = _pms_ical_archive_text(event.get("raw_hash"), 80)
    if not raw_hash:
        raw_hash = _pms_ical_archive_hash(event.get("raw_excerpt") or event.get("summary") or event.get("description"), 16)
    identity = uid or raw_hash or _pms_ical_archive_hash("|".join([
        _pms_ical_archive_text(event.get("summary"), 300),
        _pms_ical_archive_text(event.get("status"), 120),
        _pms_ical_archive_text(event.get("description"), 500),
    ]), 24)
    return "icalevt_" + _pms_ical_archive_hash("|".join([listing_id, identity, checkin, checkout]), 28)


def _pms_ical_archive_kind(event):
    return "lock" if _pms_ical_archive_bool(event.get("is_locked")) or event.get("kind") == "lock" or event.get("booking_type") == "lock" else "booking"


def _pms_ical_archive_snapshot(event, synced_at):
    return {
        "synced_at": synced_at,
        "raw_hash": _pms_ical_archive_text(event.get("raw_hash"), 80),
        "uid": _pms_ical_archive_text(event.get("uid") or event.get("external_event_uid"), 300),
        "checkin": _pms_ical_archive_text(event.get("checkin"), 40),
        "checkout": _pms_ical_archive_text(event.get("checkout"), 40),
        "checkin_utc": _pms_ical_archive_text(event.get("checkin_utc") or event.get("dtstart_utc"), 80),
        "checkout_utc": _pms_ical_archive_text(event.get("checkout_utc") or event.get("dtend_utc"), 80),
        "property_timezone": _pms_ical_archive_text(event.get("property_timezone"), 120),
        "kind": _pms_ical_archive_kind(event),
        "summary": _pms_ical_archive_text(event.get("summary"), 500),
        "status": _pms_ical_archive_text(event.get("status"), 300),
        "lock_reason": _pms_ical_archive_text(event.get("lock_reason"), 600),
    }


def _pms_ical_archive_clean(item):
    raw = item if isinstance(item, dict) else {}
    snapshots = raw.get("snapshots") if isinstance(raw.get("snapshots"), list) else []
    return {
        "id": _pms_ical_archive_text(raw.get("id"), 160),
        "property_id": _pms_ical_archive_text(raw.get("property_id") or raw.get("propertyId"), 120),
        "room_id": _pms_ical_archive_text(raw.get("room_id") or raw.get("roomId"), 120),
        "room_name": _pms_ical_archive_text(raw.get("room_name") or raw.get("roomName"), 240),
        "channel_listing_id": _pms_ical_archive_text(raw.get("channel_listing_id") or raw.get("channelListingId"), 160),
        "platform": _pms_ical_archive_text(raw.get("platform") or "iCal", 80),
        "channel_note": _pms_ical_archive_text(raw.get("channel_note") or raw.get("channelNote"), 240),
        "uid": _pms_ical_archive_text(raw.get("uid"), 300),
        "uid_hash": _pms_ical_archive_text(raw.get("uid_hash") or raw.get("uidHash"), 80),
        "raw_hash": _pms_ical_archive_text(raw.get("raw_hash") or raw.get("rawHash"), 80),
        "checkin": _pms_ical_archive_text(raw.get("checkin"), 40),
        "checkout": _pms_ical_archive_text(raw.get("checkout"), 40),
        "checkin_utc": _pms_ical_archive_text(raw.get("checkin_utc") or raw.get("checkinUtc") or raw.get("dtstart_utc") or raw.get("dtstartUtc"), 80),
        "checkout_utc": _pms_ical_archive_text(raw.get("checkout_utc") or raw.get("checkoutUtc") or raw.get("dtend_utc") or raw.get("dtendUtc"), 80),
        "property_timezone": _pms_ical_archive_text(raw.get("property_timezone") or raw.get("propertyTimezone"), 120),
        "kind": "lock" if raw.get("kind") == "lock" or _pms_ical_archive_bool(raw.get("is_locked") or raw.get("isLocked")) else "booking",
        "is_locked": _pms_ical_archive_bool(raw.get("is_locked") or raw.get("isLocked")),
        "lock_reason": _pms_ical_archive_text(raw.get("lock_reason") or raw.get("lockReason"), 800),
        "summary": _pms_ical_archive_text(raw.get("summary"), 800),
        "status": _pms_ical_archive_text(raw.get("status"), 500),
        "description": _pms_ical_archive_text(raw.get("description"), 1600),
        "fields": raw.get("fields") if isinstance(raw.get("fields"), dict) else {},
        "fields_detailed": raw.get("fields_detailed") if isinstance(raw.get("fields_detailed"), list) else [],
        "raw_lines": raw.get("raw_lines") if isinstance(raw.get("raw_lines"), list) else [],
        "raw_excerpt": _pms_ical_archive_text(raw.get("raw_excerpt") or raw.get("rawExcerpt"), 3000),
        "first_seen": _pms_ical_archive_text(raw.get("first_seen") or raw.get("firstSeen") or raw.get("synced_at"), 80),
        "last_seen": _pms_ical_archive_text(raw.get("last_seen") or raw.get("lastSeen") or raw.get("synced_at"), 80),
        "seen_count": _pms_ical_archive_int(raw.get("seen_count") or raw.get("seenCount"), 0),
        "active": _pms_ical_archive_bool(raw.get("active", True)),
        "disappeared_at": _pms_ical_archive_text(raw.get("disappeared_at") or raw.get("disappearedAt"), 80),
        "last_missing_at": _pms_ical_archive_text(raw.get("last_missing_at") or raw.get("lastMissingAt"), 80),
        "missing_count": _pms_ical_archive_int(raw.get("missing_count") or raw.get("missingCount"), 0),
        "last_sync_status": _pms_ical_archive_text(raw.get("last_sync_status") or raw.get("lastSyncStatus"), 80),
        "last_error": _pms_ical_archive_text(raw.get("last_error") or raw.get("lastError"), 500),
        "last_warning": _pms_ical_archive_text(raw.get("last_warning") or raw.get("lastWarning"), 900),
        "snapshots": snapshots,
    }


_pms_ical_archive_base_default_state = _pms_photo_default_state
def _pms_ical_archive_default_state():
    state = _pms_ical_archive_base_default_state()
    state.setdefault("icalEventArchive", [])
    return state


_pms_ical_archive_base_normalize_state = _pms_photo_normalize_state
def _pms_ical_archive_normalize_state(raw):
    state = _pms_ical_archive_base_normalize_state(raw)
    archive = {}
    for item in state.get("icalEventArchive", []):
        if not isinstance(item, dict):
            continue
        clean = _pms_ical_archive_clean(item)
        if clean.get("id"):
            archive[clean["id"]] = clean
    state["icalEventArchive"] = sorted(
        archive.values(),
        key=lambda item: item.get("last_seen") or item.get("first_seen") or item.get("disappeared_at") or "",
        reverse=True,
    )
    return _pms_ensure_default_room_cleaning_tasks(state)


def _pms_ical_archive_record_from_event(state, listing, event, synced_at, sync_status, error="", warning=""):
    room = _pms_ical_archive_room(state, listing.get("room_id"))
    uid = _pms_ical_archive_text(event.get("uid") or event.get("external_event_uid"), 300)
    raw_hash = _pms_ical_archive_text(event.get("raw_hash"), 80) or _pms_ical_archive_hash(event.get("raw_excerpt") or event.get("summary"), 16)
    kind = _pms_ical_archive_kind(event)
    return {
        "id": _pms_ical_archive_event_id(listing, event),
        "property_id": room.get("property_id") or "property_default",
        "room_id": listing.get("room_id"),
        "room_name": room.get("name") or "",
        "channel_listing_id": listing.get("id"),
        "platform": listing.get("platform") or "iCal",
        "channel_note": listing.get("channel_note") or "",
        "uid": uid,
        "uid_hash": _pms_ical_archive_hash(uid, 16) if uid else "",
        "raw_hash": raw_hash,
        "checkin": _pms_ical_archive_text(event.get("checkin"), 40),
        "checkout": _pms_ical_archive_text(event.get("checkout"), 40),
        "checkin_utc": _pms_ical_archive_text(event.get("checkin_utc") or event.get("dtstart_utc"), 80),
        "checkout_utc": _pms_ical_archive_text(event.get("checkout_utc") or event.get("dtend_utc"), 80),
        "property_timezone": _pms_ical_archive_text(event.get("property_timezone"), 120),
        "kind": kind,
        "is_locked": kind == "lock",
        "lock_reason": _pms_ical_archive_text(event.get("lock_reason"), 800),
        "summary": _pms_ical_archive_text(event.get("summary"), 800),
        "status": _pms_ical_archive_text(event.get("status"), 500),
        "description": _pms_ical_archive_text(event.get("description"), 1600),
        "fields": event.get("fields") if isinstance(event.get("fields"), dict) else {},
        "fields_detailed": event.get("fields_detailed") if isinstance(event.get("fields_detailed"), list) else [],
        "raw_lines": event.get("raw_lines") if isinstance(event.get("raw_lines"), list) else [],
        "raw_excerpt": _pms_ical_archive_text(event.get("raw_excerpt"), 3000),
        "first_seen": synced_at,
        "last_seen": synced_at,
        "seen_count": 1,
        "active": True,
        "disappeared_at": "",
        "last_missing_at": "",
        "missing_count": 0,
        "last_sync_status": sync_status,
        "last_error": _pms_ical_archive_text(error, 500),
        "last_warning": _pms_ical_archive_text(warning, 900),
        "snapshots": [_pms_ical_archive_snapshot(event, synced_at)],
    }


def _pms_ical_archive_update(state, listing, synced_at, sync_status, raw_events, error="", warning="", missing_events=None):
    state.setdefault("icalEventArchive", [])
    archive = {}
    for item in state.get("icalEventArchive", []):
        if isinstance(item, dict):
            clean = _pms_ical_archive_clean(item)
            if clean.get("id"):
                archive[clean["id"]] = clean
    current_ids = set()
    for event in raw_events or []:
        if not isinstance(event, dict):
            continue
        event_id = _pms_ical_archive_event_id(listing, event)
        current_ids.add(event_id)
        fresh = _pms_ical_archive_record_from_event(state, listing, event, synced_at, sync_status, error=error, warning=warning)
        existing = archive.get(event_id)
        if existing:
            first_seen = existing.get("first_seen") or fresh.get("first_seen")
            snapshots = existing.get("snapshots") if isinstance(existing.get("snapshots"), list) else []
            snap = _pms_ical_archive_snapshot(event, synced_at)
            if not snapshots or snapshots[-1].get("raw_hash") != snap.get("raw_hash") or snapshots[-1].get("checkin") != snap.get("checkin") or snapshots[-1].get("checkout") != snap.get("checkout") or snapshots[-1].get("status") != snap.get("status"):
                snapshots.append(snap)
            fresh["first_seen"] = first_seen
            fresh["seen_count"] = _pms_ical_archive_int(existing.get("seen_count"), 0) + 1
            fresh["snapshots"] = snapshots
        archive[event_id] = fresh
    listing_id = listing.get("id")
    for event_id, row in list(archive.items()):
        if row.get("channel_listing_id") != listing_id or event_id in current_ids:
            continue
        if row.get("active"):
            row["disappeared_at"] = row.get("disappeared_at") or synced_at
        row["active"] = False
        row["last_missing_at"] = synced_at
        row["missing_count"] = _pms_ical_archive_int(row.get("missing_count"), 0) + 1
        row["last_sync_status"] = "missing_from_latest_sync"
        row["last_warning"] = _pms_ical_archive_text(warning or "平台最新 iCal 没有返回这条旧事件，已保留为历史记录", 900)
    for event in missing_events or []:
        if not isinstance(event, dict):
            continue
        event_id = _pms_ical_archive_event_id(listing, event)
        row = archive.get(event_id)
        if row:
            row["active"] = False
            row["disappeared_at"] = row.get("disappeared_at") or synced_at
            row["last_missing_at"] = synced_at
            row["missing_count"] = max(_pms_ical_archive_int(row.get("missing_count"), 0), 1)
    state["icalEventArchive"] = sorted(
        archive.values(),
        key=lambda item: item.get("last_seen") or item.get("first_seen") or item.get("disappeared_at") or "",
        reverse=True,
    )
    return state


_pms_ical_archive_base_filter_state_for_user = _pms_photo_filter_state_for_user
def _pms_ical_archive_filter_state_for_user(state, actor):
    filtered = _pms_ical_archive_base_filter_state_for_user(state, actor)
    normalized = normalize_state(state)
    role = (actor or {}).get("role")
    if role == "admin":
        filtered["icalEventArchive"] = normalized.get("icalEventArchive", [])
        return filtered
    if role == "owner":
        room_ids = {room.get("id") for room in filtered.get("rooms", []) if isinstance(room, dict)}
        filtered["icalEventArchive"] = [
            item for item in normalized.get("icalEventArchive", [])
            if item.get("room_id") in room_ids
        ]
        return filtered
    filtered["icalEventArchive"] = []
    return filtered


_pms_ical_archive_base_inspect_ical_diagnostics = _pms_channel_inspect_ical_diagnostics
def _pms_ical_archive_inspect_ical_diagnostics(payload, actor=None):
    data = _pms_ical_archive_base_inspect_ical_diagnostics(payload, actor)
    state = normalize_state(load_state())
    allowed_property_ids = _pms_channel_allowed_property_ids(actor, state)
    allowed_room_ids = {
        room.get("id") for room in state.get("rooms", [])
        if isinstance(room, dict) and (room.get("property_id") or "property_default") in allowed_property_ids
    }
    room_id = _pms_ical_archive_text((payload or {}).get("room_id") or (payload or {}).get("roomId"), 120)
    channel_id = _pms_ical_archive_text((payload or {}).get("channel_listing_id") or (payload or {}).get("channelListingId") or (payload or {}).get("channel_id") or (payload or {}).get("channelId"), 160)
    data["archive"] = [
        item for item in state.get("icalEventArchive", [])
        if item.get("room_id") in allowed_room_ids
        and (not room_id or item.get("room_id") == room_id)
        and (not channel_id or item.get("channel_listing_id") == channel_id)
    ][:120]
    return data


_pms_external_event_storage_v1 = True

_PMS_EXTERNAL_STATE_KEYS = ("icalEventArchive", "mailEvents", "icalSyncHistory")
_PMS_EXTERNAL_SHARD_RAW_LIMIT = 360000
_PMS_EXTERNAL_LAST_HASH = {}


def _pms_external_rows_hash(rows):
    try:
        raw = json.dumps(rows if isinstance(rows, list) else [], ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    except Exception:
        raw = json.dumps([], separators=(",", ":")).encode("utf-8")
    return hashlib.sha1(raw).hexdigest()


def _pms_external_doc_url(suffix):
    project = urllib.parse.quote(firebase_project_id(), safe="")
    collection = urllib.parse.quote(STATE_COLLECTION, safe="")
    document = urllib.parse.quote(f"{STATE_DOCUMENT}__{suffix}", safe="")
    return f"https://firestore.googleapis.com/v1/projects/{project}/databases/(default)/documents/{collection}/{document}"


def _pms_external_pack(value):
    raw = json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return raw, base64.b64encode(gzip.compress(raw, compresslevel=9)).decode("ascii")


def _pms_external_unpack(text):
    if not text:
        return []
    raw = gzip.decompress(base64.b64decode(str(text).encode("ascii"))).decode("utf-8")
    value = json.loads(raw or "[]")
    return value if isinstance(value, list) else []


def _pms_external_index(key):
    doc = firestore_request("GET", _pms_external_doc_url(f"{key}__index"))
    if not doc:
        return None
    fields = doc.get("fields", {})
    return {
        "shard_count": int(fields.get("shard_count", {}).get("integerValue") or 0),
        "row_count": int(fields.get("row_count", {}).get("integerValue") or 0),
        "updated_at": fields.get("updated_at", {}).get("timestampValue") or "",
    }


def _pms_external_read(key):
    if not firebase_credentials_configured():
        return None
    index = _pms_external_index(key)
    if not index:
        legacy = firestore_request("GET", _pms_external_doc_url(key))
        if not legacy:
            return None
        fields = legacy.get("fields", {})
        compressed = fields.get("data_gzip_base64", {}).get("stringValue") or ""
        if compressed:
            return _pms_external_unpack(compressed)
        raw = fields.get("data_json", {}).get("stringValue") or ""
        if raw:
            value = json.loads(raw or "[]")
            return value if isinstance(value, list) else []
        return None
    rows = []
    for idx in range(index.get("shard_count", 0)):
        doc = firestore_request("GET", _pms_external_doc_url(f"{key}__{idx:04d}"))
        if not doc:
            continue
        compressed = doc.get("fields", {}).get("data_gzip_base64", {}).get("stringValue") or ""
        rows.extend(_pms_external_unpack(compressed))
    return rows


def _pms_external_chunk_rows(rows):
    chunks = []
    current = []
    current_size = 2
    for row in rows:
        row_raw = json.dumps(row, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        row_size = len(row_raw) + 1
        if current and current_size + row_size > _PMS_EXTERNAL_SHARD_RAW_LIMIT:
            chunks.append(current)
            current = []
            current_size = 2
        current.append(row)
        current_size += row_size
    chunks.append(current)
    return chunks


def _pms_external_write(key, rows):
    if not firebase_credentials_configured():
        return
    clean_rows = rows if isinstance(rows, list) else []
    chunks = _pms_external_chunk_rows(clean_rows)
    now = now_utc_iso()
    for idx, chunk in enumerate(chunks):
        raw, compressed = _pms_external_pack(chunk)
        if len(compressed) > 950000:
            raise RuntimeError(f"{key} shard {idx} is too large after compression: {len(compressed)} bytes")
        firestore_request("PATCH", _pms_external_doc_url(f"{key}__{idx:04d}"), payload={
            "fields": {
                "key": {"stringValue": key},
                "shard_index": {"integerValue": str(idx)},
                "data_gzip_base64": {"stringValue": compressed},
                "raw_bytes": {"integerValue": str(len(raw))},
                "compressed_bytes": {"integerValue": str(len(compressed))},
                "row_count": {"integerValue": str(len(chunk))},
                "updated_at": {"timestampValue": now},
            }
        })
    firestore_request("PATCH", _pms_external_doc_url(f"{key}__index"), payload={
        "fields": {
            "key": {"stringValue": key},
            "storage": {"stringValue": "gzip_base64_shards"},
            "shard_count": {"integerValue": str(len(chunks))},
            "row_count": {"integerValue": str(len(clean_rows))},
            "updated_at": {"timestampValue": now},
        }
    })


_pms_external_base_load_state = _pms_core_load_state
def _pms_external_load_state():
    state = _pms_external_base_load_state()
    if firebase_credentials_configured():
        for key in _PMS_EXTERNAL_STATE_KEYS:
            rows = _pms_external_read(key)
            if rows is not None:
                state[key] = rows
                _PMS_EXTERNAL_LAST_HASH[key] = _pms_external_rows_hash(rows)
    return normalize_state(state)


_pms_external_base_save_state = _pms_photo_save_state
def _pms_external_save_state(state):
    state = normalize_state(state)
    if not firebase_credentials_configured():
        return _pms_external_base_save_state(state)
    external_rows = {}
    compact_state = dict(state)
    for key in _PMS_EXTERNAL_STATE_KEYS:
        external_rows[key] = compact_state.pop(key, [])
    changed_external_rows = {}
    for key, rows in external_rows.items():
        if key not in _PMS_EXTERNAL_LAST_HASH and not rows:
            continue
        row_hash = _pms_external_rows_hash(rows)
        if _PMS_EXTERNAL_LAST_HASH.get(key) != row_hash:
            changed_external_rows[key] = (rows, row_hash)
    for key, pair in changed_external_rows.items():
        rows, row_hash = pair
        _pms_external_write(key, rows)
        _PMS_EXTERNAL_LAST_HASH[key] = row_hash
    saved = _pms_external_base_save_state(compact_state)
    for key, rows in external_rows.items():
        saved[key] = rows
    return normalize_state(saved)


def pms_storage_diagnostics():
    state = normalize_state(load_state())
    details = {"main_state_keys": sorted(state.keys()), "external": {}}
    if firebase_credentials_configured():
        for key in _PMS_EXTERNAL_STATE_KEYS:
            index = _pms_external_index(key) or {}
            details["external"][key] = {
                "rows": len(state.get(key, [])),
                "shards": index.get("shard_count", 0),
                "updated_at": index.get("updated_at", ""),
            }
    else:
        for key in _PMS_EXTERNAL_STATE_KEYS:
            details["external"][key] = {"rows": len(state.get(key, [])), "shards": 0, "storage": "local_state_json"}
    return details


def _pms_ui_sync_history_summary(rows):
    clean = []
    for item in rows if isinstance(rows, list) else []:
        if not isinstance(item, dict):
            continue
        clean.append({
            "id": item.get("id", ""),
            "synced_at": item.get("synced_at", ""),
            "property_id": item.get("property_id", ""),
            "room_id": item.get("room_id", ""),
            "room_name": item.get("room_name", ""),
            "channel_listing_id": item.get("channel_listing_id", ""),
            "platform": item.get("platform", ""),
            "channel_note": item.get("channel_note", ""),
            "status": item.get("status", ""),
            "event_count": item.get("event_count", 0),
            "booking_count": item.get("booking_count", 0),
            "lock_count": item.get("lock_count", 0),
            "inferred_lock_count": item.get("inferred_lock_count", 0),
            "missing_event_count": item.get("missing_event_count", 0),
            "warning": item.get("warning", ""),
            "error": item.get("error", ""),
        })
    return clean[-80:]


def _pms_actor_group_ids(actor):
    if not actor:
        return []
    group_ids = actor.get("group_ids")
    if isinstance(group_ids, list):
        clean = [str(item) for item in group_ids if str(item or "").strip()]
    else:
        clean = []
    group_id = str(actor.get("group_id") or "").strip()
    if group_id and group_id not in clean:
        clean.append(group_id)
    return clean


def _pms_ensure_owner_default_property(state, actor):
    if not actor or actor.get("role") != "owner":
        return state
    group_ids = _pms_actor_group_ids(actor)
    if not group_ids:
        return state
    if any(
        isinstance(prop, dict) and prop.get("group_id") in group_ids
        for prop in state.get("properties", [])
    ):
        return state
    property_id = unique_state_id(state, "property")
    state.setdefault("properties", []).append({
        "id": property_id,
        "group_id": group_ids[0],
        "name": "Default property",
        "created_at": now_utc_iso(),
        "auto_repaired": True,
    })
    try:
        return normalize_state(save_state(state))
    except Exception:
        return state


def pms_state_response_for_user(state, actor):
    normalized = normalize_state(state)
    normalized = _pms_ensure_owner_default_property(normalized, actor)
    try:
        _pms_ui_state_cache_store(normalized)
    except Exception:
        pass
    normalized["icalEventArchive"] = []
    normalized["icalSyncHistory"] = _pms_ui_sync_history_summary(normalized.get("icalSyncHistory", []))
    filtered = filter_state_for_user(normalized, actor)
    if not isinstance(filtered, dict):
        return filtered
    if actor:
        public_actor = {
            key: actor.get(key, "")
            for key in ("id", "role", "username", "name", "email", "phone", "mobile", "tel", "phone_number", "wechat", "weixin", "wx", "wechat_id", "cleaner_code", "group_id", "group_ids", "default_room_ids", "defaultRoomIds", "timezone", "time_zone", "timeZone", "language", "locale", "lang", "permissions", "allowed_property_ids", "property_ids", "propertyIds")
            if actor.get(key) not in (None, "")
        }
        filtered["current_user"] = public_actor
        filtered["currentUser"] = public_actor
        if actor.get("role") == "cleaner":
            cleaner_code = str(actor.get("cleaner_code") or "").strip().upper()
            links = [
                item for item in normalized.get("propertyCleaners", [])
                if isinstance(item, dict) and str(item.get("cleaner_code") or "").strip().upper() == cleaner_code
            ]
            property_ids = {item.get("property_id") for item in links if item.get("property_id")}
            filtered["propertyCleaners"] = links
            filtered["properties"] = [
                item for item in normalized.get("properties", [])
                if isinstance(item, dict) and item.get("id") in property_ids
            ]
    # The UI never needs raw archived iCal fields. Keep them in Firestore for
    # diagnostics/sync logic, but do not ship them on every page load.
    filtered["icalEventArchive"] = []
    filtered["icalSyncHistory"] = _pms_ui_sync_history_summary(filtered.get("icalSyncHistory", []))
    return filtered


def _pms_ui_state_data_count(state):
    if not isinstance(state, dict):
        return 0
    total = 0
    for key in ("users", "properties", "propertyCleaners", "rooms", "commonAreas", "bookings", "channelListings"):
        value = state.get(key)
        if isinstance(value, list):
            total += len(value)
    return total


_PMS_UI_STATE_CACHE = {"state": None, "loaded_at": 0.0}
_PMS_UI_STATE_CACHE_LOCK = threading.Lock()


def _pms_ui_state_cache_ttl():
    try:
        return max(0.0, float(os.environ.get("PMS_STATE_UI_CACHE_SECONDS", "12") or "12"))
    except Exception:
        return 12.0


def _pms_ui_state_copy(state):
    return normalize_state(json.loads(json.dumps(normalize_state(state), ensure_ascii=False)))


def _pms_ui_state_cache_get():
    ttl = _pms_ui_state_cache_ttl()
    if ttl <= 0:
        return None
    with _PMS_UI_STATE_CACHE_LOCK:
        state = _PMS_UI_STATE_CACHE.get("state")
        loaded_at = float(_PMS_UI_STATE_CACHE.get("loaded_at") or 0.0)
        if not state or not loaded_at:
            return None
        if time.monotonic() - loaded_at > ttl:
            return None
        if not _pms_ui_state_data_count(state):
            return None
        return _pms_ui_state_copy(state)


def _pms_ui_state_cache_store(state):
    normalized = normalize_state(state)
    if not _pms_ui_state_data_count(normalized):
        return normalized
    with _PMS_UI_STATE_CACHE_LOCK:
        _PMS_UI_STATE_CACHE["state"] = _pms_ui_state_copy(normalized)
        _PMS_UI_STATE_CACHE["loaded_at"] = time.monotonic()
    return normalized


def _pms_ui_state_cache_clear():
    with _PMS_UI_STATE_CACHE_LOCK:
        _PMS_UI_STATE_CACHE["state"] = None
        _PMS_UI_STATE_CACHE["loaded_at"] = 0.0


def pms_load_state_for_ui():
    cached = _pms_ui_state_cache_get()
    if cached is not None:
        return cached
    attempts = max(1, int(os.environ.get("PMS_STATE_LOAD_ATTEMPTS", "2") or "2"))
    delay = max(0.05, float(os.environ.get("PMS_STATE_LOAD_RETRY_SECONDS", "0.25") or "0.25"))
    include_external = str(os.environ.get("PMS_STATE_LOAD_EXTERNAL", "0") or "0").strip().lower() in ("1", "true", "yes", "on")
    last_state = None
    for attempt in range(attempts):
        if not firebase_credentials_configured():
            state = normalize_state(load_state())
        else:
            state = _pms_external_base_load_state()
            if include_external:
                for key in ("mailEvents", "icalSyncHistory"):
                    rows = _pms_external_read(key)
                    if rows is not None:
                        state[key] = rows
            else:
                state.setdefault("mailEvents", [])
                state.setdefault("icalSyncHistory", [])
            state = normalize_state(state)
        last_state = state
        if _pms_ui_state_data_count(state) or attempt == attempts - 1:
            return _pms_ui_state_cache_store(state)
        time.sleep(delay)
    return _pms_ui_state_cache_store(normalize_state(last_state or load_state()))


def default_state():
    return _pms_ical_archive_default_state()


def normalize_state(raw):
    return _pms_ical_archive_normalize_state(raw)


def filter_state_for_user(state, actor):
    return _pms_ical_archive_filter_state_for_user(state, actor)


def save_state_from_payload(payload, actor=None):
    return _pms_cleaning_confirm_save_state_from_payload(payload, actor)


def load_state():
    return _pms_external_load_state()


def save_state(state):
    return _pms_external_save_state(state)


def sync_icals(actor=None, property_id=None, incoming_channels=None):
    return _pms_channel_sync_icals(actor=actor, property_id=property_id, incoming_channels=incoming_channels)


def make_feed(feed_id):
    return _pms_channel_make_feed(feed_id)


def inspect_ical_diagnostics(payload, actor=None):
    return _pms_ical_archive_inspect_ical_diagnostics(payload, actor)


_pms_ical_sync_lock = threading.Lock()

def _pms_run_scheduled_ical_sync():
    if not _pms_ical_sync_lock.acquire(blocking=False):
        return
    try:
        sync_icals()
    except Exception:
        traceback.print_exc()
    finally:
        _pms_ical_sync_lock.release()

def _pms_start_ical_auto_sync():
    enabled = str(os.environ.get("PMS_ICAL_AUTO_SYNC_ENABLED", "0")).strip().lower() in ("1", "true", "yes", "on")
    if not enabled:
        return
    interval = int(os.environ.get("PMS_ICAL_SYNC_INTERVAL_SECONDS", "3600"))
    if interval <= 0:
        return
    def worker():
        time.sleep(min(60, interval))
        while True:
            _pms_run_scheduled_ical_sync()
            time.sleep(interval)
    threading.Thread(target=worker, daemon=True, name="pms-ical-auto-sync").start()

_pms_mail_sync_lock = threading.Lock()

def _pms_run_scheduled_mail_sync():
    if not _pms_mail_sync_lock.acquire(blocking=False):
        return
    try:
        if not _pms_gmail_enabled():
            return
        days = max(1, min(int(os.environ.get("PMS_MAIL_SYNC_DAYS", "3")), 30))
        max_results = max(1, min(int(os.environ.get("PMS_MAIL_SYNC_MAX_RESULTS", "25")), 50))
        sync_gmail_mail_events(
            {"days": days, "max_results": max_results},
            actor={"id": "system", "username": "system-auto", "role": "admin"},
        )
    except Exception:
        traceback.print_exc()
    finally:
        _pms_mail_sync_lock.release()

def _pms_start_mail_auto_sync():
    enabled = str(os.environ.get("PMS_MAIL_AUTO_SYNC_ENABLED", "1")).strip().lower() in ("1", "true", "yes", "on")
    if not enabled:
        return
    interval = int(os.environ.get("PMS_MAIL_SYNC_INTERVAL_SECONDS", "7200"))
    if interval <= 0:
        return
    def worker():
        time.sleep(min(120, interval))
        while True:
            _pms_run_scheduled_mail_sync()
            time.sleep(interval)
    threading.Thread(target=worker, daemon=True, name="pms-mail-auto-sync").start()

if __name__ == "__main__":
    _pms_start_ical_auto_sync()
    _pms_start_mail_auto_sync()
    print(f"PMS Firebase REST backend started on port {PORT}")
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
