from pathlib import Path

VERSION_NEW = "2026-06-29-lock-layout-v1"


def replace_version(text, token):
    versions = [
        "2026-06-23-direct-ical-sync-v1",
        "2026-06-23-room-boot-light-v1",
        "2026-06-23-ical-loop-guard-v1",
        "2026-06-23-ical-no-external-locks-v1",
        "2026-06-24-room-entry-click-v1",
        "2026-06-24-sync-direct-v1",
        "2026-06-24-firestore-shard-history-v1",
        "2026-06-25-platform-lock-display-v1",
        "2026-06-25-mail-auto-sync-timestamp-v1",
        "2026-06-25-state-zero-guard-v1",
        "2026-06-26-room-e-feed-release-v1",
        "2026-06-26-room-e-fast-empty-feed-v1",
        "2026-06-27-fast-save-logout-v1",
        "2026-06-27-cleaner-product-v1",
        "2026-06-27-cleaner-dashboard-v1",
        "2026-06-27-cleaner-static-v1",
        "2026-06-27-cleaner-static-v2",
        "2026-06-27-login-ready-v1",
        "2026-06-27-weekend-calendar-v1",
        "2026-06-28-owner-tab-lazy-render-v1",
        "2026-06-28-property-module-guard-v1",
        "2026-06-28-property-module-final-v1",
    ]
    for old in versions:
        old_text = token.format(old)
        new_text = token.format(VERSION_NEW)
        if old_text in text:
            return text.replace(old_text, new_text, 1), True
    if token.format(VERSION_NEW) in text:
        return text, False
    return text, False


def patch_room_sync_timestamp(path):
    if not path.exists():
        return False
    text = path.read_text(encoding="utf-8")
    changed = False

    new_summary = """  function roomChannelSummaryText(r){const list=roomChannels(r.id),ready=list.filter(ch=>String(ch&&ch.ical_url||'').trim()).length;return `${list.length} \u4e2a\u6e20\u9053 \u00b7 ${ready} \u4e2a\u5df2\u586b iCal`;}
  function roomLatestChannelSync(r){const times=roomChannels(r.id).map(ch=>String(ch&&ch.last_sync||'').trim()).filter(Boolean).sort();return times.length?times[times.length-1]:String(r&&r.last_sync||'').trim();}
  function roomSyncPill(r){const last=roomLatestChannelSync(r);return last?`<span class='channel-mini-pill good' title='\u81ea\u52a8\u540c\u6b65\u548c\u624b\u52a8\u70b9\u51fb\u540c\u6b65\u90fd\u4f1a\u66f4\u65b0\u8fd9\u4e2a\u65f6\u95f4'>\u6700\u8fd1 iCal \u540c\u6b65\uff1a${esc(last)}</span>`:'';}"""
    old_summary = """  function roomChannelSummaryText(r){const list=roomChannels(r.id),ready=list.filter(ch=>String(ch&&ch.ical_url||'').trim()).length;return `${list.length} \u4e2a\u6e20\u9053 \u00b7 ${ready} \u4e2a\u5df2\u586b iCal`;}"""
    if old_summary in text and "function roomLatestChannelSync" not in text:
        text = text.replace(old_summary, new_summary, 1)
        changed = True

    old_room_sync = """${r.last_sync?`<span class='channel-mini-pill good'>\u4e0a\u6b21\u540c\u6b65\uff1a${esc(r.last_sync)}</span>`:''}"""
    if old_room_sync in text:
        text = text.replace(old_room_sync, """${roomSyncPill(r)}""")
        changed = True

    if changed:
        path.write_text(text, encoding="utf-8")
    return changed


def patch_mail_auto_sync(app):
    text = app.read_text(encoding="utf-8")
    if "_pms_start_mail_auto_sync" in text:
        return False

    old = '''    threading.Thread(target=worker, daemon=True, name="pms-ical-auto-sync").start()

if __name__ == "__main__":
    _pms_start_ical_auto_sync()
    print(f"PMS Firebase REST backend started on port {PORT}")
    HTTPServer((HOST, PORT), Handler).serve_forever()
'''
    new = '''    threading.Thread(target=worker, daemon=True, name="pms-ical-auto-sync").start()

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
    HTTPServer((HOST, PORT), Handler).serve_forever()
'''
    if old not in text:
        raise RuntimeError("mail auto sync startup hook not found")
    app.write_text(text.replace(old, new, 1), encoding="utf-8")
    return True


STATE_ZERO_GUARD_JS = """  function pmsGuardListCount(name){try{const value=window[name]||eval(name)||[];return Array.isArray(value)?value.length:0;}catch(e){const value=window[name]||[];return Array.isArray(value)?value.length:0;}}
  function pmsGuardStateCount(state,name){const value=state&&state[name];return Array.isArray(value)?value.length:-1;}
  function pmsGuardUserKey(state){const user=(state&&(state.current_user||state.currentUser))||window.currentUser||{};return [user.role||'',user.id||'',user.username||''].join('|');}
  function pmsGuardLooksEmptyState(state){if(!state||typeof state!=='object')return false;const hasCore=Array.isArray(state.properties)||Array.isArray(state.rooms)||Array.isArray(state.bookings);if(!hasCore)return false;return pmsGuardStateCount(state,'properties')<=0&&pmsGuardStateCount(state,'rooms')<=0&&pmsGuardStateCount(state,'bookings')<=0;}
  function pmsGuardLooksUsableState(state){return !!(state&&typeof state==='object'&&(pmsGuardStateCount(state,'properties')>0||pmsGuardStateCount(state,'rooms')>0||pmsGuardStateCount(state,'bookings')>0));}
  function pmsGuardCurrentHasData(){return pmsGuardListCount('properties')>0||pmsGuardListCount('rooms')>0||pmsGuardListCount('bookings')>0;}
  function pmsGuardLoadCachedState(userKey){try{const raw=localStorage.getItem('pms:last-good-state:v1');if(!raw)return null;const parsed=JSON.parse(raw);if(!parsed||!parsed.state||!pmsGuardLooksUsableState(parsed.state))return null;if(parsed.userKey&&userKey&&parsed.userKey!==userKey)return null;return parsed.state;}catch(e){return null;}}
  function pmsGuardSaveCachedState(state){try{if(!pmsGuardLooksUsableState(state))return;localStorage.setItem('pms:last-good-state:v1',JSON.stringify({savedAt:new Date().toISOString(),userKey:pmsGuardUserKey(state),state}));}catch(e){}}
  function pmsGuardScheduleRetry(){try{window.__pmsEmptyStateRetryCount=(window.__pmsEmptyStateRetryCount||0)+1;if(window.__pmsEmptyStateRetryCount>5)return;setTimeout(()=>{try{if(typeof window.loadState==='function')window.loadState();}catch(e){}},1500*window.__pmsEmptyStateRetryCount);}catch(e){}}
  function pmsGuardStatePayload(data){const state=(data&&data.state)||data;if(!state||typeof state!=='object')return data;const userKey=pmsGuardUserKey(state);if(pmsGuardLooksEmptyState(state)){const cached=pmsGuardLoadCachedState(userKey);pmsGuardScheduleRetry();if(cached)return {ok:true,state:cached,_pms_cached_state:true};if(pmsGuardCurrentHasData())return null;}window.__pmsEmptyStateRetryCount=0;pmsGuardSaveCachedState(state);return data;}
  if(!window.__pmsGuardStatePayload)window.__pmsGuardStatePayload=pmsGuardStatePayload;
"""


LOGOUT_GUARD_JS = """  function pmsForceLogout(){try{Object.keys(localStorage||{}).forEach(function(k){if(/^pms/i.test(k)||k.indexOf('last-good-state')>=0)localStorage.removeItem(k);});sessionStorage.clear();document.cookie.split(';').forEach(function(c){var n=c.split('=')[0].trim();if(n)document.cookie=n+'=; Max-Age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';});}catch(e){}try{fetch('/api/logout',{method:'POST',keepalive:true});}catch(e){}location.replace('/logout?ts='+Date.now());}
  window.logout=pmsForceLogout;
  if(!document.__pmsLogoutClickGuard){document.__pmsLogoutClickGuard=true;document.addEventListener('click',function(ev){const btn=ev.target&&ev.target.closest?ev.target.closest('button,a'):null;if(!btn)return;const text=String(btn.textContent||'').trim();const id=String(btn.id||'');const href=String(btn.getAttribute&&btn.getAttribute('href')||'');if(id==='logoutBtn'||text==='\\u9000\\u51fa\\u767b\\u5f55'||href==='/logout'){ev.preventDefault();ev.stopImmediatePropagation();pmsForceLogout();}},true);}
"""


def patch_logout_js(path):
    if not path.exists():
        return False
    text = path.read_text(encoding="utf-8")
    if "pmsForceLogout" in text:
        return False
    marker = ")();"
    idx = text.rfind(marker)
    if idx < 0:
        return False
    text = text[:idx] + LOGOUT_GUARD_JS + text[idx:]
    path.write_text(text, encoding="utf-8")
    return True


def patch_state_zero_guard(path):
    if not path.exists():
        return False
    text = path.read_text(encoding="utf-8")
    changed = False
    if "__pmsGuardStatePayload" not in text:
        old_apply = """  function applyState(data){
    const state=(data&&data.state)||data;"""
        new_apply = STATE_ZERO_GUARD_JS + """
  function applyState(data){
    if(window.__pmsGuardStatePayload){data=window.__pmsGuardStatePayload(data);if(!data)return null;}
    const state=(data&&data.state)||data;"""
        if old_apply in text:
            text = text.replace(old_apply, new_apply, 1)
            changed = True

    old_object = """  function applyStateObject(data){const state=(data&&data.state)||data;if(!state||typeof state!=='object')return null;"""
    new_object = STATE_ZERO_GUARD_JS + """  function applyStateObject(data){if(window.__pmsGuardStatePayload){data=window.__pmsGuardStatePayload(data);if(!data)return null;}const state=(data&&data.state)||data;if(!state||typeof state!=='object')return null;"""
    if old_object in text and "function applyStateObject(data){if(window.__pmsGuardStatePayload)" not in text:
        text = text.replace(old_object, new_object, 1)
        changed = True

    if changed:
        path.write_text(text, encoding="utf-8")
    return changed


def patch_logout_route(app):
    text = app.read_text(encoding="utf-8")
    if 'path == "/logout"' in text:
        changed = False
        old_api = '''            if path == "/api/logout":
                json_response(self, {"ok": True}, extra_headers={"Set-Cookie": f"{SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax"})
                return
'''
        new_api = '''            if path == "/api/logout":
                json_response(self, {"ok": True}, extra_headers={"Set-Cookie": f"{SESSION_COOKIE}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax"})
                return
'''
        if old_api in text and new_api not in text:
            text = text.replace(old_api, new_api, 1)
            changed = True
        if changed:
            app.write_text(text, encoding="utf-8")
        return changed
    old = '''            path = parsed.path
            if urllib.parse.parse_qs(parsed.query).get("key"):
'''
    new = '''            path = parsed.path
            if path == "/logout":
                self.send_response(302)
                self.send_header("Location", "/login")
                self.send_header("Set-Cookie", f"{SESSION_COOKIE}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax")
                self.end_headers()
                return
            if urllib.parse.parse_qs(parsed.query).get("key"):
'''
    if old not in text:
        raise RuntimeError("logout route hook not found")
    app.write_text(text.replace(old, new, 1), encoding="utf-8")
    return True


def patch_fast_external_save(app):
    text = app.read_text(encoding="utf-8")
    changed = False
    if "_PMS_EXTERNAL_LAST_HASH" in text:
        skip_guard = '''        if key not in _PMS_EXTERNAL_LAST_HASH and not rows:
            continue
'''
        anchor = '''        row_hash = _pms_external_rows_hash(rows)
'''
        if skip_guard not in text and anchor in text:
            text = text.replace(anchor, skip_guard + anchor, 1)
            app.write_text(text, encoding="utf-8")
            return True
        return False

    old_limit = '''_PMS_EXTERNAL_SHARD_RAW_LIMIT = 360000
'''
    new_limit = '''_PMS_EXTERNAL_SHARD_RAW_LIMIT = 360000
_PMS_EXTERNAL_LAST_HASH = {}


def _pms_external_rows_hash(rows):
    try:
        raw = json.dumps(rows if isinstance(rows, list) else [], ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    except Exception:
        raw = json.dumps([], separators=(",", ":")).encode("utf-8")
    return hashlib.sha1(raw).hexdigest()
'''
    if old_limit not in text:
        raise RuntimeError("external storage hash hook not found")
    text = text.replace(old_limit, new_limit, 1)
    changed = True

    old_load = '''        for key in _PMS_EXTERNAL_STATE_KEYS:
            rows = _pms_external_read(key)
            if rows is not None:
                state[key] = rows
    return normalize_state(state)
'''
    new_load = '''        for key in _PMS_EXTERNAL_STATE_KEYS:
            rows = _pms_external_read(key)
            if rows is not None:
                state[key] = rows
                _PMS_EXTERNAL_LAST_HASH[key] = _pms_external_rows_hash(rows)
    return normalize_state(state)
'''
    if old_load not in text:
        raise RuntimeError("external load hash hook not found")
    text = text.replace(old_load, new_load, 1)

    old_save = '''    for key, rows in external_rows.items():
        _pms_external_write(key, rows)
    saved = _pms_external_base_save_state(compact_state)
    for key, rows in external_rows.items():
        saved[key] = rows
    return normalize_state(saved)
'''
    new_save = '''    changed_external_rows = {}
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
'''
    if old_save not in text:
        raise RuntimeError("external save skip hook not found")
    text = text.replace(old_save, new_save, 1)

    if changed:
        app.write_text(text, encoding="utf-8")
    return changed


def patch_light_auth_state(app):
    text = app.read_text(encoding="utf-8")
    if "_pms_light_auth_state_v1" in text:
        return False
    marker = "\nexec(compile(source_text, __file__, \"exec\"))"
    block = r"""

# _pms_light_auth_state_v1
light_auth_helper = r'''
def load_main_state():
    base_loader = globals().get("_pms_external_base_load_state")
    if callable(base_loader):
        return normalize_state(base_loader())
    return normalize_state(load_state())
'''
light_auth_anchor = "\ndef authenticate_user(username, password):\n"
if "def load_main_state():" not in source_text:
    if light_auth_anchor not in source_text:
        raise RuntimeError("light auth helper hook not found")
    source_text = source_text.replace(light_auth_anchor, "\n" + light_auth_helper + light_auth_anchor, 1)

light_auth_replacements = [
    (
        '''def authenticate_user(username, password):
    state = normalize_state(load_state())
    user = find_user_for_login(state, username)''',
        '''def authenticate_user(username, password):
    state = normalize_state(load_main_state())
    user = find_user_for_login(state, username)''',
        "authenticate user light state hook",
    ),
    (
        '''    return find_user_by_id(normalize_state(load_state()), user_id)''',
        '''    return find_user_by_id(normalize_state(load_main_state()), user_id)''',
        "current user light state hook",
    ),
    (
        '''    state = normalize_state(load_state())
    if login_name_exists(state, username):''',
        '''    state = normalize_state(load_main_state())
    if login_name_exists(state, username):''',
        "owner register light state hook",
    ),
    (
        '''    state = normalize_state(load_state())
    cleaner_code = normalize_cleaner_code(payload.get("cleaner_code")) or generate_cleaner_code(state)''',
        '''    state = normalize_state(load_main_state())
    cleaner_code = normalize_cleaner_code(payload.get("cleaner_code")) or generate_cleaner_code(state)''',
        "cleaner register light state hook",
    ),
    (
        '''    state = normalize_state(load_state())
    if not any(prop.get("id") == property_id for prop in state["properties"]):''',
        '''    state = normalize_state(load_main_state())
    if not any(prop.get("id") == property_id for prop in state["properties"]):''',
        "property cleaner light state hook",
    ),
]
for old, new, label in light_auth_replacements:
    if new not in source_text:
        if old not in source_text:
            raise RuntimeError(label + " not found")
        source_text = source_text.replace(old, new, 1)
"""
    if marker not in text:
        raise RuntimeError("light auth patch insertion hook not found")
    app.write_text(text.replace(marker, block + marker, 1), encoding="utf-8")
    return True


def patch_cleaner_login_username(app):
    text = app.read_text(encoding="utf-8")
    if "_pms_cleaner_login_name_v1" in text:
        return False
    marker = "\nexec(compile(source_text, __file__, \"exec\"))"
    block = r"""

# _pms_cleaner_login_name_v1
cleaner_login_candidates_old = '''        candidates = [
            str(user.get("username") or ""),
            str(user.get("cleaner_code") or ""),
            str(user.get("phone") or ""),
        ]'''
cleaner_login_candidates_new = '''        candidates = [
            str(user.get("username") or ""),
            str(user.get("name") or ""),
            str(user.get("cleaner_code") or ""),
            str(user.get("phone") or ""),
        ]'''
if cleaner_login_candidates_new not in source_text:
    if cleaner_login_candidates_old not in source_text:
        raise RuntimeError("cleaner login candidates hook not found")
    source_text = source_text.replace(cleaner_login_candidates_old, cleaner_login_candidates_new, 1)

cleaner_register_user_old = '''    user = {
        "id": f"cleaner_{cleaner_code.lower().replace('-', '_')}",
        "role": "cleaner",
        "name": name,
        "phone": phone,
        "cleaner_code": cleaner_code,
        "password_hash": password_hash(password),
        "created_at": now_utc_iso(),
    }'''
cleaner_register_user_new = '''    user = {
        "id": f"cleaner_{cleaner_code.lower().replace('-', '_')}",
        "role": "cleaner",
        "username": name,
        "name": name,
        "phone": phone,
        "cleaner_code": cleaner_code,
        "password_hash": password_hash(password),
        "created_at": now_utc_iso(),
    }'''
if cleaner_register_user_new not in source_text:
    if cleaner_register_user_old not in source_text:
        raise RuntimeError("cleaner register username hook not found")
    source_text = source_text.replace(cleaner_register_user_old, cleaner_register_user_new, 1)
"""
    if marker not in text:
        raise RuntimeError("cleaner login patch insertion hook not found")
    app.write_text(text.replace(marker, block + marker, 1), encoding="utf-8")
    return True


def patch_emergency_empty_feeds(app):
    text = app.read_text(encoding="utf-8")
    if "_pms_emergency_empty_feed_ids" in text:
        return False

    old = '''def make_feed(feed_id):
    state = normalize_state(load_state())
    room_id, target_channel_id, target_listing = _pms_channel_feed_target(state, feed_id)
    if not room_id:
        return None
    events = []
'''
    new = '''def _pms_empty_ical_calendar(title="PMS Anti Overbooking"):
    return "BEGIN:VCALENDAR\\r\\nVERSION:2.0\\r\\nPRODID:-//PMS System//Channel Feed//EN\\r\\nCALSCALE:GREGORIAN\\r\\nX-WR-CALNAME:" + _pms_channel_ics_escape(title) + "\\r\\nEND:VCALENDAR\\r\\n"

def _pms_emergency_empty_feed_ids():
    raw = str(os.environ.get("PMS_ICAL_EMPTY_FEED_IDS", "") or "")
    return {item.strip().replace(".ics", "") for item in raw.split(",") if item.strip()}

def make_feed(feed_id):
    normalized_feed_id = str(feed_id or "").replace(".ics", "")
    if normalized_feed_id in _pms_emergency_empty_feed_ids():
        return _pms_empty_ical_calendar("PMS Anti Overbooking")
    state = normalize_state(load_state())
    room_id, target_channel_id, target_listing = _pms_channel_feed_target(state, feed_id)
    if not room_id:
        return None
    events = []
'''
    if old not in text:
        raise RuntimeError("feed emergency release hook not found")
    app.write_text(text.replace(old, new, 1), encoding="utf-8")
    return True


def main():
    base = Path(__file__).resolve().parent
    app = base / "app.py"
    ui = base / "pms_ui_patch.js"
    if not app.exists():
        return
    text = app.read_text(encoding="utf-8")
    changed = False

    text, did = replace_version(text, 'PMS_PATCH_VERSION = "{}"')
    changed = changed or did

    old_external_keys = '''_PMS_EXTERNAL_STATE_KEYS = ("icalEventArchive", "mailEvents")'''
    new_external_keys = '''_PMS_EXTERNAL_STATE_KEYS = ("icalEventArchive", "mailEvents", "icalSyncHistory")'''
    if old_external_keys in text:
        text = text.replace(old_external_keys, new_external_keys, 1)
        changed = True

    old_skip_lock = '''        lock_reason = ical_lock_reason(summary, description, status)
        if lock_reason:
            continue
        stable_id = hashlib.sha1((str(listing_id) + "|" + uid).encode("utf-8")).hexdigest()[:24]'''
    new_show_lock = '''        lock_reason = ical_lock_reason(summary, description, status)
        stable_id = hashlib.sha1((str(listing_id) + "|" + uid).encode("utf-8")).hexdigest()[:24]'''
    if old_skip_lock in text:
        text = text.replace(old_skip_lock, new_show_lock, 1)
        changed = True

    old_orphan_hook = '''    listing_ids = {item.get("id") for item in listings if item.get("id")}
    previous_counts = {}
'''
    new_orphan_cleanup = '''    listing_ids = {item.get("id") for item in listings if item.get("id")}
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
'''
    if old_orphan_hook in text and 'channel_listing_id") not in listing_ids' not in text:
        text = text.replace(old_orphan_hook, new_orphan_cleanup, 1)
        changed = True

    old_feed_guard = '''        if target_channel_id and booking.get("channel_listing_id") == target_channel_id:
            continue
        checkin = booking.get("checkin")'''
    new_feed_guard = '''        if target_channel_id and booking.get("channel_listing_id") == target_channel_id:
            continue
        imported_lock = booking.get("source") == "ical" and (booking.get("is_locked") or booking.get("booking_type") == "lock")
        marker_text = " ".join([
            str(booking.get("external_event_uid") or ""),
            str(booking.get("summary") or ""),
            str(booking.get("lock_reason") or ""),
            str(booking.get("status") or ""),
        ]).lower()
        if imported_lock or "@pms-system" in marker_text or "generated by pms anti-overbooking feed" in marker_text:
            continue
        checkin = booking.get("checkin")'''
    if old_feed_guard in text:
        text = text.replace(old_feed_guard, new_feed_guard, 1)
        changed = True

    if changed:
        app.write_text(text, encoding="utf-8")

    app_changed = False
    if patch_room_sync_timestamp(app):
        app_changed = True
    if patch_mail_auto_sync(app):
        app_changed = True
    if patch_state_zero_guard(app):
        app_changed = True
    if patch_emergency_empty_feeds(app):
        app_changed = True
    if patch_logout_route(app):
        app_changed = True
    if patch_logout_js(app):
        app_changed = True
    if patch_fast_external_save(app):
        app_changed = True
    if patch_light_auth_state(app):
        app_changed = True
    if patch_cleaner_login_username(app):
        app_changed = True

    ui_changed = False
    if ui.exists():
        ui_text = ui.read_text(encoding="utf-8")
        ui_text, did = replace_version(ui_text, "window.__PMS_PATCH_VERSION='{}';")
        if did:
            ui.write_text(ui_text, encoding="utf-8")
            ui_changed = True
        if patch_room_sync_timestamp(ui):
            ui_changed = True
        if patch_state_zero_guard(ui):
            ui_changed = True
        if patch_logout_js(ui):
            ui_changed = True

    if changed or app_changed or ui_changed:
        print("patched platform lock display, sync timestamp UI, mail auto sync, zero-state guard, emergency empty feeds, fast save, light auth, logout, and cleaner login")
    else:
        print("platform lock display, sync timestamp UI, mail auto sync, zero-state guard, emergency empty feeds, fast save, light auth, logout, and cleaner login already applied")


if __name__ == "__main__":
    main()
