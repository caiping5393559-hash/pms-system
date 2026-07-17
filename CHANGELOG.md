# PMS Version History

## 2026-07-17 · v104-ical-cron

Release identifier: `2026-07-17-v104-ical-cron`

### Reliable iCal scheduling on sleeping Render services

- Replaces the keep-alive-only request with a direct scheduled iCal sync trigger.
- Wakes a sleeping Render instance and queues synchronization immediately.
- Adds a server-side nine-minute rate limit and reuses the global sync lock to prevent duplicate work.
- Keeps the internal 15-minute scheduler as a fallback while the instance is already awake.

## 2026-07-14 · v103-cleaning-future30

Release identifier: `2026-07-14-v103-cleaning-future30`

### Cleaning settlement default range

- Opens cleaning settlement statistics on today through the next 29 days (30 calendar days total).
- Sorts settlement dates by proximity to today, so the nearest date appears first.
- Keeps the recent-30-days, current-month, and future-30-days shortcut buttons.

## 2026-07-13 · v102-lock-dedupe

Release identifier: `2026-07-13-v102-lock-dedupe`

### Duplicate Airbnb lock reconciliation

- Hides an Airbnb `Not available` lock when the same room and dates are already fully covered by a real reservation.
- Removes the duplicate lock from the daily dashboard, lock totals, calendar statistics, and booking views.
- Preserves genuine locks that extend beyond a real reservation.

## 2026-07-13 · v101-stats-summary

Release identifier: `2026-07-13-v101-stats-summary`

### Reservation summary and iCal schedule correction

- Adds a highlighted summary row below the per-room reservation statistics.
- Totals orders, booked nights, blocked nights, and available nights.
- Calculates the overall occupancy rate from total booked versus bookable nights.
- Shows the average per-room cleaning fee.
- Corrects the in-process iCal scheduler to measure 15 minutes from sync start instead of waiting 15 minutes after a sync completes.
- Documents that Render sleep can still pause in-process scheduling; an external keep-alive is included.

## 2026-07-10 · v100-photo-batch

Release identifier: `2026-07-10-v100-photo-batch`

### One-request photo architecture

- Sends all selected photos in one HTTP request.
- Authenticates and checks permissions once per batch.
- Uses one Firestore `batchWrite` request to atomically save all photo documents and the photo index.
- Routes single-photo uploads through the same one-request batch path.
- Keeps local preview, remove/retake, retry, and duplicate protection.
- Replaces the v99 experiment, which did not meet the 2–4 second target.

## 2026-07-10 · v99-photo-speed

Release identifier: `2026-07-10-v99-photo-speed`

### Single-photo latency

- Reuses the state already loaded during session authentication instead of loading it again inside the upload handler.
- Writes photo bytes and photo metadata concurrently instead of serially.
- Keeps the v98 three-photo parallel upload, preview, retry, and duplicate protection flow.
- Production target: reduce a real single upload from the v98 baseline of 8.6 seconds to 2–4 seconds.

## 2026-07-10 · v98-photo-flow

Release identifier: `2026-07-10-v98-photo-flow`

### Photo upload

- Added a guided photo checklist for room overview, bed, bathroom, floors/trash, supplies, and issues.
- Added local previews before upload, per-photo removal, retake, and one confirmation step.
- Uploads up to three photos concurrently and keeps failed photos available for retry.
- Prevents duplicate selection in the browser and duplicate upload storage on the server.
- Uses the known Firestore photo path directly by default instead of retrying unavailable Storage buckets for every photo.
- Reduced compression overhead for already-compressed image payloads.
- Added mobile-first sticky camera/gallery actions and upload progress states.

### Performance target

- Previous production baseline: 12.7 seconds for a single tiny upload and about 5 seconds to reopen.
- v98 target: remove Storage fallback delay and reduce total multi-photo time through concurrency.

## 2026-07-10 · v97-responsive-ui

Release identifier: `2026-07-10-v97-responsive-ui`

### UI

- Added a shared responsive UI layer for owner, cleaner, finance, operations, subaccount, room, calendar, channel, and profile modules.
- Improved desktop layout up to 1440 px.
- Standardized mobile form layouts, horizontal table scrolling, navigation scrolling, card spacing, touch targets, focus states, safe-area spacing, and reduced-motion behavior.
- Updated frontend asset cache keys so browsers load the v97 CSS and JavaScript.

### Reliability

- Fixed deploy readiness checks so CI validates files that actually exist.
- Reduced Render memory overhead by disabling the duplicate full-state UI cache and limiting allocator arenas.

### Deployment tracking

- GitHub Actions must pass before the Render deploy hook can run.
- A release is considered complete only after the deployed service reports the same release identifier.

## 2026-07-09 · v96-future-booking-locks

- Clarified future booking locks in the owner calendar and booking views.
- Continued iCal save, cleaning task, and photo workflow improvements.

## 2026-07-08 · v88-memory-stable-state

- Moved large external rows out of the main PMS state path.
- Reduced repeated state loading and mail synchronization frequency.
- Removed photo payload data from normal UI state responses.
