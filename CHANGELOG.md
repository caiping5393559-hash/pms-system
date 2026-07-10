# PMS Version History

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
