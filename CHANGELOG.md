# PMS Version History

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
