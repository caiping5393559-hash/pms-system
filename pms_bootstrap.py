"""Memory-safe production bootstrap for PMS on Render.

This keeps the operational PMS data path intact while disabling the unbounded
historical iCal archive from normal runtime loads, removes the duplicate
in-process iCal scheduler, and aggressively releases temporary sync memory.
The GitHub Actions OIDC scheduler remains the single iCal scheduler.
"""

import ctypes
import gc
import os
import traceback

# Set allocator knobs before importing the large application module.
os.environ.setdefault("MALLOC_ARENA_MAX", "1")
os.environ.setdefault("PMS_ICAL_AUTO_SYNC_ENABLED", "0")
os.environ.setdefault("PMS_STATE_UI_CACHE_SECONDS", "0")
os.environ.setdefault("PMS_STATE_LOAD_EXTERNAL", "0")

import app  # noqa: E402

app.PMS_APP_VERSION = "2026-08-09-v109-memory-stability"

# iCal event history is diagnostic-only and had grown without a hard retention
# limit. Do not load/save that historical archive during normal production
# requests. Existing Firestore archive shards are left untouched for recovery.
app._PMS_EXTERNAL_STATE_KEYS = ("mailEvents", "icalSyncHistory")

_base_normalize_state = app.normalize_state


def _memory_safe_normalize_state(raw):
    state = _base_normalize_state(raw)
    # Current bookings and sync history stay available; only the large raw
    # historical event archive is excluded from the live in-memory state.
    state["icalEventArchive"] = []
    return state


app.normalize_state = _memory_safe_normalize_state


def _disable_ical_archive_update(state, listing, synced_at, sync_status, raw_events,
                                 error="", warning="", missing_events=None):
    state["icalEventArchive"] = []
    return state


app._pms_ical_archive_update = _disable_ical_archive_update


def _release_memory():
    try:
        app._pms_ui_state_cache_clear()
    except Exception:
        pass
    gc.collect()
    # glibc often keeps freed arenas instead of returning them to Render.
    # malloc_trim materially lowers RSS after large Firestore/iCal sync objects.
    try:
        ctypes.CDLL("libc.so.6").malloc_trim(0)
    except Exception:
        pass


def _memory_safe_scheduled_ical_sync():
    if not app._pms_ical_sync_lock.acquire(blocking=False):
        return
    try:
        app.sync_icals()
    except Exception:
        traceback.print_exc()
    finally:
        _release_memory()
        app._pms_ical_sync_lock.release()


app._pms_run_scheduled_ical_sync = _memory_safe_scheduled_ical_sync

_base_mail_sync = app._pms_run_scheduled_mail_sync


def _memory_safe_mail_sync():
    try:
        return _base_mail_sync()
    finally:
        _release_memory()


app._pms_run_scheduled_mail_sync = _memory_safe_mail_sync


if __name__ == "__main__":
    # Intentionally DO NOT call app._pms_start_ical_auto_sync(). GitHub Actions
    # is the single source of scheduling, avoiding duplicate 10/15-minute syncs.
    app._pms_start_mail_auto_sync()
    print(f"PMS memory-safe backend started on port {app.PORT}; version={app.PMS_APP_VERSION}")
    app.ThreadingHTTPServer((app.HOST, app.PORT), app.Handler).serve_forever()
