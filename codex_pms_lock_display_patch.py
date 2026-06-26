from pathlib import Path

VERSION_NEW = "2026-06-26-room-e-feed-release-v1"


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
    state = normalize_state(load_state())
    room_id, target_channel_id, target_listing = _pms_channel_feed_target(state, feed_id)
    if not room_id:
        return None
    normalized_feed_id = str(feed_id or "").replace(".ics", "")
    if normalized_feed_id in _pms_emergency_empty_feed_ids():
        title = "PMS Anti Overbooking"
        if target_listing:
            title += " - " + (target_listing.get("platform") or "channel")
        return _pms_empty_ical_calendar(title)
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

    # Show platform-side Airbnb manual blocks in PMS again. The feed exporter below
    # skips imported iCal locks, so visible platform locks won't be sent back to Airbnb.
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

    if changed or app_changed or ui_changed:
        print("patched platform lock display, sync timestamp UI, mail auto sync, zero-state guard, and emergency empty feeds")
    else:
        print("platform lock display, sync timestamp UI, mail auto sync, zero-state guard, and emergency empty feeds already applied")


if __name__ == "__main__":
    main()
