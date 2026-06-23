from pathlib import Path

VERSION_OLD = "2026-06-23-direct-ical-sync-v1"
VERSION_NEW = "2026-06-23-room-boot-light-v1"


def replace_once(path, old, new, label):
    text = path.read_text(encoding="utf-8")
    if old in text:
        path.write_text(text.replace(old, new, 1), encoding="utf-8")
        print(f"patched {label}")
        return
    if new in text:
        print(f"already patched {label}")
        return
    raise RuntimeError(f"{label} hook not found")


def main():
    base = Path(__file__).resolve().parent
    app = base / "app.py"
    ui = base / "pms_ui_patch.js"

    replace_once(
        app,
        f'PMS_PATCH_VERSION = "{VERSION_OLD}"',
        f'PMS_PATCH_VERSION = "{VERSION_NEW}"',
        "app version",
    )
    replace_once(
        ui,
        f"window.__PMS_PATCH_VERSION='{VERSION_OLD}';",
        f"window.__PMS_PATCH_VERSION='{VERSION_NEW}';",
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
    replace_once(ui, old_boot, new_boot, "ui boot block")


if __name__ == "__main__":
    main()
