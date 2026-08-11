"""Memory-safe production bootstrap for PMS on Render.

This keeps the operational PMS data path intact while disabling large iCal
history payloads from normal runtime loads, removes the duplicate in-process
iCal scheduler, and aggressively releases temporary sync memory. GitHub
Actions remains the single iCal scheduler.
"""

import ctypes
import gc
import os
import traceback

# Set allocator knobs before importing the application module.
os.environ.setdefault("MALLOC_ARENA_MAX", "1")
os.environ.setdefault("PMS_ICAL_AUTO_SYNC_ENABLED", "0")
os.environ.setdefault("PMS_STATE_UI_CACHE_SECONDS", "0")
os.environ.setdefault("PMS_STATE_LOAD_EXTERNAL", "0")

import app  # noqa: E402

app.PMS_APP_VERSION = "2026-08-10-v111-memory-safe-sync"

# Keep only mail events in the normal external-state load path. Historical iCal
# archive and the old full sync-history shards remain untouched in Firestore for
# recovery, but are no longer loaded into the production process on every sync.
app._PMS_EXTERNAL_STATE_KEYS = ("mailEvents",)

_base_normalize_state = app.normalize_state


def _memory_safe_normalize_state(raw):
    state = _base_normalize_state(raw)
    # Live operation needs current bookings/channel state, not raw diagnostic
    # archives. Reset these on load so they cannot accumulate in the main state.
    state["icalEventArchive"] = []
    state["icalSyncHistory"] = []
    return state


app.normalize_state = _memory_safe_normalize_state


def _disable_ical_archive_update(state, listing, synced_at, sync_status, raw_events,
                                 error="", warning="", missing_events=None):
    state["icalEventArchive"] = []
    return state


app._pms_ical_archive_update = _disable_ical_archive_update


def _lightweight_ical_history(state, listing, synced_at, status, events=None,
                              raw_events=None, error="", warning="",
                              inferred_events=None, missing_events=None):
    """Retain only small sync summaries instead of raw iCal event snapshots."""
    room = next(
        (item for item in state.get("rooms", [])
         if isinstance(item, dict) and item.get("id") == listing.get("room_id")),
        {},
    )
    raw_events = raw_events if raw_events is not None else (events or [])
    inferred_events = inferred_events or []
    missing_events = missing_events or []
    url = str(listing.get("ical_url") or "")
    row = {
        "id": "icalhist_" + app.hashlib.sha1(
            ("|".join([str(listing.get("id") or ""), synced_at, url])).encode("utf-8")
        ).hexdigest()[:24],
        "synced_at": synced_at,
        "property_id": room.get("property_id") or "property_default",
        "room_id": listing.get("room_id"),
        "room_name": room.get("name") or "",
        "channel_listing_id": listing.get("id"),
        "platform": listing.get("platform") or "iCal",
        "channel_note": listing.get("channel_note") or "",
        "status": status,
        "event_count": len(raw_events),
        "booking_count": sum(
            1 for item in raw_events
            if isinstance(item, dict) and item.get("kind") != "lock"
        ),
        "lock_count": sum(
            1 for item in raw_events
            if isinstance(item, dict) and item.get("kind") == "lock"
        ),
        "inferred_lock_count": len(inferred_events),
        "missing_event_count": len(missing_events),
        "warning": str(warning or "")[:500],
        "error": str(error or "")[:500],
    }
    history = [
        item for item in state.get("icalSyncHistory", [])
        if isinstance(item, dict)
    ]
    history.append(row)
    state["icalSyncHistory"] = history[-20:]
    return row


app._pms_channel_append_ical_history = _lightweight_ical_history


def _release_memory():
    try:
        app._pms_ui_state_cache_clear()
    except Exception:
        pass
    gc.collect()
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
    # Intentionally do not start the internal iCal loop. GitHub Actions is the
    # only scheduler, which avoids overlapping duplicate syncs.
    app._pms_start_mail_auto_sync()
    print(f"PMS memory-safe backend started on port {app.PORT}; version={app.PMS_APP_VERSION}")
    app.BoundedThreadingHTTPServer((app.HOST, app.PORT), app.Handler).serve_forever()
