from pathlib import Path

VERSION_OLD = "2026-06-23-direct-ical-sync-v1"
VERSION_ROOM_BOOT = "2026-06-23-room-boot-light-v1"
VERSION_LOOP_GUARD = "2026-06-23-ical-loop-guard-v1"
VERSION_NO_EXTERNAL_LOCKS = "2026-06-23-ical-no-external-locks-v1"
VERSION_NEW = "2026-06-24-room-entry-click-v1"


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


def patch_property_room_entry(ui):
    text = ui.read_text(encoding="utf-8")
    changed = False

    old_set_active = '''  function setActive(id){S.selectedPropertyId=String(id||'');window.selectedPropertyId=S.selectedPropertyId;}'''
    new_set_active = '''  function setActive(id){S.selectedPropertyId=String(id||'');window.selectedPropertyId=S.selectedPropertyId;try{selectedPropertyId=S.selectedPropertyId;}catch(e){}}'''
    if old_set_active in text:
        text = text.replace(old_set_active, new_set_active, 1)
        changed = True

    old_open = '''  function openPropertyRooms(id){setActive(id);const tab=document.querySelector('button[onclick*="ownerRooms"]');if(tab&&typeof showOwnerTab==='function')showOwnerTab('ownerRooms',tab);renderRoomSettings();}
  function backToPropertyList(){setActive('');renderRoomSettings();}'''
    new_open = '''  function openPropertyRooms(id){setActive(id);S.openingPropertyRooms=true;const tab=document.querySelector('button[onclick*="ownerRooms"]');try{if(tab&&typeof showOwnerTab==='function')showOwnerTab('ownerRooms',tab);}finally{S.openingPropertyRooms=false;}renderRoomSettings();const h=document.getElementById('roomSettings');if(h)h.scrollIntoView({block:'start',behavior:'smooth'});}
  function backToPropertyList(){if(S.openingPropertyRooms)return;setActive('');renderRoomSettings();}
  function installPropertyRoomClickFallback(){if(document.__pmsPropertyRoomClickFallback)return;document.__pmsPropertyRoomClickFallback=true;document.addEventListener('click',ev=>{const btn=ev.target&&ev.target.closest?ev.target.closest('button'):null;if(!btn)return;const code=String(btn.getAttribute('onclick')||''),text=String(btn.textContent||'').trim();const m=code.match(/openPropertyRooms\(["']([^"']+)["']\)/);if(!m&&!text.includes('进入房间管理'))return;if(m){ev.preventDefault();ev.stopImmediatePropagation();openPropertyRooms(m[1]);}},true);}'''
    if old_open in text:
        text = text.replace(old_open, new_open, 1)
        changed = True

    old_setup = '''  function setup(){ensureCss();'''
    new_setup = '''  function setup(){installPropertyRoomClickFallback();ensureCss();'''
    if old_setup in text and "installPropertyRoomClickFallback();ensureCss();" not in text:
        text = text.replace(old_setup, new_setup, 1)
        changed = True

    if changed:
        ui.write_text(text, encoding="utf-8")
        print("patched property room entry click")
    elif "installPropertyRoomClickFallback" in text and "openingPropertyRooms" in text:
        print("already patched property room entry click")
    else:
        raise RuntimeError("property room entry click hook not found")


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
            (f'PMS_PATCH_VERSION = "{VERSION_NO_EXTERNAL_LOCKS}"', f'PMS_PATCH_VERSION = "{VERSION_NEW}"'),
        ],
        "app version",
    )
    replace_any_once(
        ui,
        [
            (f"window.__PMS_PATCH_VERSION='{VERSION_OLD}';", f"window.__PMS_PATCH_VERSION='{VERSION_NEW}';"),
            (f"window.__PMS_PATCH_VERSION='{VERSION_ROOM_BOOT}';", f"window.__PMS_PATCH_VERSION='{VERSION_NEW}';"),
            (f"window.__PMS_PATCH_VERSION='{VERSION_LOOP_GUARD}';", f"window.__PMS_PATCH_VERSION='{VERSION_NEW}';"),
            (f"window.__PMS_PATCH_VERSION='{VERSION_NO_EXTERNAL_LOCKS}';", f"window.__PMS_PATCH_VERSION='{VERSION_NEW}';"),
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
    patch_property_room_entry(ui)

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


if __name__ == "__main__":
    main()

# deploy trigger: 2026-06-24-room-entry-click-v1
