from pathlib import Path

VERSION_OLD = "2026-06-23-direct-ical-sync-v1"
VERSION_ROOM_BOOT = "2026-06-23-room-boot-light-v1"
VERSION_LOOP_GUARD = "2026-06-23-ical-loop-guard-v1"
VERSION_NO_EXTERNAL_LOCKS = "2026-06-23-ical-no-external-locks-v1"
VERSION_ROOM_ENTRY = "2026-06-24-room-entry-click-v1"
VERSION_SYNC_DIRECT = "2026-06-24-sync-direct-v1"
VERSION_FIRESTORE_HISTORY = "2026-06-24-firestore-shard-history-v1"
VERSION_PLATFORM_LOCK = "2026-06-25-platform-lock-display-v1"
VERSION_MAIL_AUTO = "2026-06-25-mail-auto-sync-timestamp-v1"
VERSION_ZERO_GUARD = "2026-06-25-state-zero-guard-v1"
VERSION_ROOM_E_RELEASE = "2026-06-26-room-e-feed-release-v1"
VERSION_ROOM_E_FAST = "2026-06-26-room-e-fast-empty-feed-v1"
VERSION_FAST_SAVE_LOGOUT = "2026-06-27-fast-save-logout-v1"
VERSION_CLEANER_PRODUCT = "2026-06-27-cleaner-product-v1"
VERSION_CLEANER_DASHBOARD = "2026-06-27-cleaner-dashboard-v1"
VERSION_NEW = "2026-06-27-cleaner-static-v1"


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


def patch_direct_ical_sync(app, ui):
    ui_text = ui.read_text(encoding="utf-8")
    ui_changed = False

    old_save_wrapper = """  syncPropertyIcal=async function(propertyId,btn){const id=propertyId||(activeProp()&&activeProp().id);if(id)await saveVisibleChannelInputs(id);return pmsChannelBaseSyncPropertyIcal(propertyId,btn);};"""
    new_save_wrapper = """  syncPropertyIcal=async function(propertyId,btn){const id=propertyId||(activeProp()&&activeProp().id);if(id)collectChannelInputs(id);return pmsChannelBaseSyncPropertyIcal(propertyId,btn);};"""
    if old_save_wrapper in ui_text:
        ui_text = ui_text.replace(old_save_wrapper, new_save_wrapper, 1)
        ui_changed = True

    old_progress = """setPropertySyncStatus(id,'syncing','同步中：正在保存渠道并读取 iCal...');"""
    new_progress = """setPropertySyncStatus(id,'syncing','同步中：正在直接读取平台 iCal...');"""
    if old_progress in ui_text:
        ui_text = ui_text.replace(old_progress, new_progress)
        ui_changed = True

    old_direct_export = """};
  function install(){if(window.renderOwner!==renderOwner)S.baseRenderOwner=window.renderOwner;"""
    new_direct_export = """};
  window.syncPropertyIcal=syncPropertyIcal;
  function install(){if(window.renderOwner!==renderOwner)S.baseRenderOwner=window.renderOwner;"""
    if old_direct_export in ui_text and "window.syncPropertyIcal=syncPropertyIcal;" not in ui_text:
        ui_text = ui_text.replace(old_direct_export, new_direct_export, 1)
        ui_changed = True

    if ui_changed:
        ui.write_text(ui_text, encoding="utf-8")
        print("patched direct iCal sync ui")
    elif new_save_wrapper in ui_text or new_progress in ui_text:
        print("already patched direct iCal sync ui")
    else:
        raise RuntimeError("direct iCal sync ui hook not found")

    app_text = app.read_text(encoding="utf-8")
    app_changed = False

    old_final_status = """S.syncResults[id]={kind:'loading',text:'同步中：正在保存渠道并读取 iCal...'};"""
    new_final_status = """S.syncResults[id]={kind:'loading',text:'同步中：正在直接读取平台 iCal...'};"""
    if old_final_status in app_text:
        app_text = app_text.replace(old_final_status, new_final_status)
        app_changed = True

    old_final_fetch = """      collectVisibleIcal(id);
      await persistVisibleChannels(id);
      const res=await fetch(url('/api/sync'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({property_id:id})});"""
    new_final_fetch = """      collectVisibleIcal(id);
      const rows=propRooms(id).flatMap(r=>roomChannels(r.id).map(ch=>readChannelForm(ch.id)||ch));
      const controller=window.AbortController?new AbortController():null;
      const timer=controller?setTimeout(()=>controller.abort(),90000):null;
      const res=await fetch(url('/api/sync'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({property_id:id,channelListings:rows}),signal:controller?controller.signal:undefined});
      if(timer)clearTimeout(timer);"""
    if old_final_fetch in app_text:
        app_text = app_text.replace(old_final_fetch, new_final_fetch, 1)
        app_changed = True

    old_final_catch = """      const msg=e&&e.message?e.message:String(e||'未知错误');
      S.syncResults[id]={kind:'error',text:'同步失败：'+msg};"""
    new_final_catch = """      const msg=e&&e.name==='AbortError'?'同步超过 90 秒已停止，请先点检查确认 iCal 链接是否有效。':(e&&e.message?e.message:String(e||'未知错误'));
      S.syncResults[id]={kind:'error',text:'同步失败：'+msg};"""
    if old_final_catch in app_text:
        app_text = app_text.replace(old_final_catch, new_final_catch, 1)
        app_changed = True

    if app_changed:
        app.write_text(app_text, encoding="utf-8")
        print("patched direct iCal sync final ui")
    elif new_final_status in app_text and "channelListings:rows" in app_text:
        print("already patched direct iCal sync final ui")
    else:
        raise RuntimeError("direct iCal sync final ui hook not found")


def patch_external_sync_history(app):
    text = app.read_text(encoding="utf-8")
    changed = False

    old_keys = '''_PMS_EXTERNAL_STATE_KEYS = ("icalEventArchive", "mailEvents")'''
    new_keys = '''_PMS_EXTERNAL_STATE_KEYS = ("icalEventArchive", "mailEvents", "icalSyncHistory")'''
    if old_keys in text:
        text = text.replace(old_keys, new_keys, 1)
        changed = True

    old_ui_loader = '''    rows = _pms_external_read("mailEvents")
    if rows is not None:
        state["mailEvents"] = rows
    return normalize_state(state)
'''
    new_ui_loader = '''    for key in ("mailEvents", "icalSyncHistory"):
        rows = _pms_external_read(key)
        if rows is not None:
            state[key] = rows
    return normalize_state(state)
'''
    if old_ui_loader in text:
        text = text.replace(old_ui_loader, new_ui_loader, 1)
        changed = True

    if changed:
        app.write_text(text, encoding="utf-8")
        print("patched Firestore external iCal history storage")
    elif new_keys in text and new_ui_loader in text:
        print("already patched Firestore external iCal history storage")
    else:
        raise RuntimeError("external iCal history storage hook not found")


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
            (f'PMS_PATCH_VERSION = "{VERSION_ROOM_ENTRY}"', f'PMS_PATCH_VERSION = "{VERSION_NEW}"'),
            (f'PMS_PATCH_VERSION = "{VERSION_SYNC_DIRECT}"', f'PMS_PATCH_VERSION = "{VERSION_NEW}"'),
            (f'PMS_PATCH_VERSION = "{VERSION_FIRESTORE_HISTORY}"', f'PMS_PATCH_VERSION = "{VERSION_NEW}"'),
            (f'PMS_PATCH_VERSION = "{VERSION_PLATFORM_LOCK}"', f'PMS_PATCH_VERSION = "{VERSION_NEW}"'),
            (f'PMS_PATCH_VERSION = "{VERSION_MAIL_AUTO}"', f'PMS_PATCH_VERSION = "{VERSION_NEW}"'),
            (f'PMS_PATCH_VERSION = "{VERSION_ZERO_GUARD}"', f'PMS_PATCH_VERSION = "{VERSION_NEW}"'),
            (f'PMS_PATCH_VERSION = "{VERSION_ROOM_E_RELEASE}"', f'PMS_PATCH_VERSION = "{VERSION_NEW}"'),
            (f'PMS_PATCH_VERSION = "{VERSION_ROOM_E_FAST}"', f'PMS_PATCH_VERSION = "{VERSION_NEW}"'),
            (f'PMS_PATCH_VERSION = "{VERSION_FAST_SAVE_LOGOUT}"', f'PMS_PATCH_VERSION = "{VERSION_NEW}"'),
            (f'PMS_PATCH_VERSION = "{VERSION_CLEANER_PRODUCT}"', f'PMS_PATCH_VERSION = "{VERSION_NEW}"'),
            (f'PMS_PATCH_VERSION = "{VERSION_CLEANER_DASHBOARD}"', f'PMS_PATCH_VERSION = "{VERSION_NEW}"'),
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
            (f"window.__PMS_PATCH_VERSION='{VERSION_ROOM_ENTRY}';", f"window.__PMS_PATCH_VERSION='{VERSION_NEW}';"),
            (f"window.__PMS_PATCH_VERSION='{VERSION_SYNC_DIRECT}';", f"window.__PMS_PATCH_VERSION='{VERSION_NEW}';"),
            (f"window.__PMS_PATCH_VERSION='{VERSION_FIRESTORE_HISTORY}';", f"window.__PMS_PATCH_VERSION='{VERSION_NEW}';"),
            (f"window.__PMS_PATCH_VERSION='{VERSION_PLATFORM_LOCK}';", f"window.__PMS_PATCH_VERSION='{VERSION_NEW}';"),
            (f"window.__PMS_PATCH_VERSION='{VERSION_MAIL_AUTO}';", f"window.__PMS_PATCH_VERSION='{VERSION_NEW}';"),
            (f"window.__PMS_PATCH_VERSION='{VERSION_ZERO_GUARD}';", f"window.__PMS_PATCH_VERSION='{VERSION_NEW}';"),
            (f"window.__PMS_PATCH_VERSION='{VERSION_ROOM_E_RELEASE}';", f"window.__PMS_PATCH_VERSION='{VERSION_NEW}';"),
            (f"window.__PMS_PATCH_VERSION='{VERSION_ROOM_E_FAST}';", f"window.__PMS_PATCH_VERSION='{VERSION_NEW}';"),
            (f"window.__PMS_PATCH_VERSION='{VERSION_FAST_SAVE_LOGOUT}';", f"window.__PMS_PATCH_VERSION='{VERSION_NEW}';"),
            (f"window.__PMS_PATCH_VERSION='{VERSION_CLEANER_PRODUCT}';", f"window.__PMS_PATCH_VERSION='{VERSION_NEW}';"),
            (f"window.__PMS_PATCH_VERSION='{VERSION_CLEANER_DASHBOARD}';", f"window.__PMS_PATCH_VERSION='{VERSION_NEW}';"),
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
    room_boot = """  function boot(){install();const owner=document.getElementById('owner');if(owner){if(!props().length&&typeof window.loadState==='function'&&!S.bootLoadStarted){S.bootLoadStarted=true;window.loadState().then(()=>{if(!Array.isArray(S.ownerPropertyIds)||!S.ownerPropertyIds.length)saveOwnerPropIds(validPropIds());renderCleaner();renderOwner();S.bootRendered=true;}).catch(()=>{});return;}if(!S.bootRendered){renderCleaner();renderOwner();S.bootRendered=true;}}else if(document.getElementById('roomSettings')&&!S.bootRendered){renderRoomSettings();S.bootRendered=true;}}
  function bootFallback(){install();if(!S.bootRendered)boot();}
  boot();
  setTimeout(bootFallback,120);"""
    new_boot = """  function boot(){install();const owner=document.getElementById('owner'),cleaner=document.getElementById('cleaner');if(currentIsCleaner()||cleaner){if(!props().length&&typeof window.loadState==='function'&&!S.bootLoadStarted){S.bootLoadStarted=true;window.loadState().then(()=>{if(!Array.isArray(S.ownerPropertyIds)||!S.ownerPropertyIds.length)saveOwnerPropIds(validPropIds());renderCleaner();S.bootRendered=true;}).catch(()=>{});return;}if(!Array.isArray(S.ownerPropertyIds)||!S.ownerPropertyIds.length)saveOwnerPropIds(validPropIds());if(!S.bootRendered){renderCleaner();S.bootRendered=true;}return;}if(owner){if(!props().length&&typeof window.loadState==='function'&&!S.bootLoadStarted){S.bootLoadStarted=true;window.loadState().then(()=>{if(!Array.isArray(S.ownerPropertyIds)||!S.ownerPropertyIds.length)saveOwnerPropIds(validPropIds());renderCleaner();renderOwner();S.bootRendered=true;}).catch(()=>{});return;}if(!S.bootRendered){renderCleaner();renderOwner();S.bootRendered=true;}}else if(document.getElementById('roomSettings')&&!S.bootRendered){renderRoomSettings();S.bootRendered=true;}}
  function bootFallback(){install();if(!S.bootRendered)boot();}
  boot();
  setTimeout(bootFallback,120);"""
    replace_any_once(ui, [(old_boot, new_boot), (room_boot, new_boot)], "ui boot block")
    patch_property_room_entry(ui)
    patch_direct_ical_sync(app, ui)
    patch_external_sync_history(app)

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

# deploy trigger: 2026-06-24-firestore-shard-history-v1
