from pathlib import Path

VERSION_OLD = "2026-06-23-direct-ical-sync-v1"
VERSION_ROOM_BOOT = "2026-06-23-room-boot-light-v1"
VERSION_LOOP_GUARD = "2026-06-23-ical-loop-guard-v1"
VERSION_NEW = "2026-06-23-ical-no-external-locks-v1"


def replace_any_once(path, replacements, label):
    text = path.read_text(encoding="utf-8")
    for old, new in replacements:
        if old in text:
            path.write_text(text.replace(old, new, 1), encoding="utf-8")
            print(f"patched {label}")
            return
    if any(new in text for _, new in replacements):
        print(f"already patched {label}")
        return
    raise RuntimeError(f"{label} hook not found")


def patch_empty_state_write_guard(path):
    marker = "_pms_empty_state_write_guard_v1"
    text = path.read_text(encoding="utf-8")
    if marker in text:
        print("already patched empty state write guard")
        return
    hook = 'exec(compile(source_text, __file__, "exec"))'
    if hook not in text:
        raise RuntimeError("empty state write guard hook not found")
    guard = '''if "_pms_empty_state_write_guard_v1" not in source_text:
    source_text += r"""
# _pms_empty_state_write_guard_v1
_PMS_DATA_GUARD_KEYS = (
    "properties",
    "rooms",
    "commonAreas",
    "bookings",
    "channelListings",
    "propertyCleaners",
    "users",
    "groups",
)


def _pms_data_guard_count(state, key):
    value = (state or {}).get(key, [])
    return len(value) if isinstance(value, list) else 0


def _pms_data_guard_counts(state):
    return {key: _pms_data_guard_count(state, key) for key in _PMS_DATA_GUARD_KEYS}


def _pms_data_guard_should_block(incoming_state, current_state):
    allow = str(os.environ.get("PMS_ALLOW_EMPTY_STATE_WRITE", "")).strip().lower()
    if allow in ("1", "true", "yes", "on"):
        return False, {}, {}
    current = _pms_data_guard_counts(current_state)
    incoming = _pms_data_guard_counts(incoming_state)
    current_structure = current["properties"] + current["rooms"] + current["users"] + current["groups"]
    incoming_structure = incoming["properties"] + incoming["rooms"] + incoming["users"] + incoming["groups"]
    current_activity = current["commonAreas"] + current["bookings"] + current["channelListings"] + current["propertyCleaners"]
    incoming_activity = incoming["commonAreas"] + incoming["bookings"] + incoming["channelListings"] + incoming["propertyCleaners"]
    if current_structure >= 2 and incoming_structure == 0:
        return True, current, incoming
    if current_structure >= 4 and incoming_structure < max(1, current_structure // 4) and current_activity > 0 and incoming_activity == 0:
        return True, current, incoming
    return False, current, incoming


_pms_empty_state_guard_base_save_state = save_state


def save_state(state):
    normalized = normalize_state(state)
    try:
        current = normalize_state(load_state())
    except Exception as exc:
        print(f"PMS data guard could not read current state: {exc}")
        return _pms_empty_state_guard_base_save_state(normalized)
    block, current_counts, incoming_counts = _pms_data_guard_should_block(normalized, current)
    if block:
        print(f"PMS data guard blocked suspicious empty state write: current={current_counts} incoming={incoming_counts}")
        return current
    return _pms_empty_state_guard_base_save_state(normalized)
"""
'''
    path.write_text(text.replace(hook, guard + "\n" + hook, 1), encoding="utf-8")
    print("patched empty state write guard")


def main():
    base = Path(__file__).resolve().parent
    app = base / "app.py"
    ui = base / "pms_ui_patch.js"

    replace_any_once(
        app,
        [
            (f'PMS_PATCH_VERSION = "{VERSION_OLD}"', f'PMS_PATCH_VERSION = "{VERSION_NEW}"'),
            (f'PMS_PATCH_VERSION = "{VERSION_ROOM_BOOT}"', f'PMS_PATCH_VERSION = "{VERSION_NEW}"'),
            (f'PMS_PATCH_VERSION = "{VERSION_LOOP_GUARD}"', f'PMS_PATCH_VERSION = "{VERSION_NEW}"'),
        ],
        "app version",
    )
    replace_any_once(
        ui,
        [
            (f"window.__PMS_PATCH_VERSION='{VERSION_OLD}';", f"window.__PMS_PATCH_VERSION='{VERSION_NEW}';"),
            (f"window.__PMS_PATCH_VERSION='{VERSION_ROOM_BOOT}';", f"window.__PMS_PATCH_VERSION='{VERSION_NEW}';"),
            (f"window.__PMS_PATCH_VERSION='{VERSION_LOOP_GUARD}';", f"window.__PMS_PATCH_VERSION='{VERSION_NEW}';"),
        ],
        "ui version",
    )

    old_boot = """  function boot(){install();if(document.getElementById('owner')){renderCleaner();renderOwner();if(!props().length&&typeof window.loadState==='function')window.loadState().then(()=>{if(!Array.isArray(S.ownerPropertyIds)||!S.ownerPropertyIds.length)saveOwnerPropIds(validPropIds());renderCleaner();renderOwner();}).catch(()=>{});}else if(document.getElementById('roomSettings'))renderRoomSettings();}
  boot();
  setTimeout(boot,0);
  setTimeout(boot,80);
  setTimeout(boot,500);
  setTimeout(boot,1500);
  setTimeout(boot,3000);"""
    new_boot = """  function boot(){install();const owner=document.getElementById('owner');if(owner){if(!props().length&&typeof window.loadState==='function'&&!S.bootLoadStarted){S.bootLoadStarted=true;window.loadState().then(()=>{if(!Array.isArray(S.ownerPropertyIds)||!S.ownerPropertyIds.length)saveOwnerPropIds(validPropIds());renderCleaner();renderOwner();S.bootRendered=true;}).catch(()=>{});return;}if(!S.bootRendered){renderCleaner();renderOwner();S.bootRendered=true;}}else if(document.getElementById('roomSettings')&&!S.bootRendered){renderRoomSettings();S.bootRendered=true;}}
  function bootFallback(){install();if(!S.bootRendered)boot();}
  boot();
  setTimeout(bootFallback,120);"""
    replace_any_once(ui, [(old_boot, new_boot)], "ui boot block")

    old_legacy_lock = """                    reason = ical_lock_reason(summary, description, current.get("status"))
                    if reason:
                        events.append({"""
    new_legacy_lock = """                    reason = ical_lock_reason(summary, description, current.get("status"))
                    if reason:
                        in_event = False
                        continue
                    if reason:
                        events.append({"""
    replace_any_once(app, [(old_legacy_lock, new_legacy_lock)], "legacy external lock import guard")

    old_import_guard = """        lock_reason = ical_lock_reason(summary, description, status)
        stable_id = hashlib.sha1((str(listing_id) + "|" + uid).encode("utf-8")).hexdigest()[:24]"""
    loop_import_guard = """        feed_marker = "generated by pms anti-overbooking feed"
        event_text = " ".join([uid, summary, description, status]).lower()
        if uid.lower().endswith("@pms-system") or feed_marker in event_text:
            continue
        lock_reason = ical_lock_reason(summary, description, status)
        stable_id = hashlib.sha1((str(listing_id) + "|" + uid).encode("utf-8")).hexdigest()[:24]"""
    new_import_guard = """        feed_marker = "generated by pms anti-overbooking feed"
        event_text = " ".join([uid, summary, description, status]).lower()
        if uid.lower().endswith("@pms-system") or feed_marker in event_text:
            continue
        lock_reason = ical_lock_reason(summary, description, status)
        if lock_reason:
            continue
        stable_id = hashlib.sha1((str(listing_id) + "|" + uid).encode("utf-8")).hexdigest()[:24]"""
    replace_any_once(app, [(old_import_guard, new_import_guard), (loop_import_guard, new_import_guard)], "self-generated and external lock import guard")

    old_feed_guard = """        if target_channel_id and booking.get("channel_listing_id") == target_channel_id:
            continue
        checkin = booking.get("checkin")"""
    new_feed_guard = """        if target_channel_id and booking.get("channel_listing_id") == target_channel_id:
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
        checkin = booking.get("checkin")"""
    replace_any_once(app, [(old_feed_guard, new_feed_guard)], "anti-overbooking feedback export guard")
    patch_empty_state_write_guard(app)


if __name__ == "__main__":
    main()

# deploy trigger: 2026-06-23-ical-no-external-locks-v1
