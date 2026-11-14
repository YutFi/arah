# Arah (working name)

A privacy-first, open-source navigation app for Malaysia that runs in the phone's browser (PWA) on both iPhone and Android. No accounts, no login, no saved trips.

**Try it on your phone: https://yutfi.github.io/arah/**
(iPhone: open in Safari, then Share → Add to Home Screen. Android: open in Chrome, then menu → Install app. Allow location when asked.)

> **Status: early preview.** Navigation basics work. Live traffic, toll prices, speed-camera data and speed limits do **not** exist yet, and the app says so on screen instead of guessing.

## What works now

- Map, current location, and search by place name, street address (falls back to the nearest area and says so) or coordinates; the result is pinned on the map first, with a Directions button. Long-press the map to drop your own pin
- Nearby petrol, restaurants, entertainment, hotspots and attractions as icons on the map, from OpenStreetMap (no ratings or busy times)
- Routes with alternatives, arrival time, "avoid tolls", and per route: traffic lights, mapped speed cameras and toll plazas counted from OpenStreetMap (volunteer data, can be incomplete; no toll price yet)
- Turn-by-turn directions with voice, current speed, rerouting when you leave the route, screen kept awake
- **Simulate drive** mode, so you can test navigation without driving
- AWAS speed-camera alert engine, built and tested, but fed by an **empty** dataset because no verified records exist yet (see `data/README.md`)

## What does not work yet

| Feature | State |
| --- | --- |
| Live traffic | Not available. See `docs/LIVE-TRAFFIC.md` for what exists and what to do next |
| Toll prices | Not started. No free, verified rates dataset found. Rates differ per plaza, and closed systems (e.g. PLUS) charge per entry and exit. Needs a hand-checked dataset with a source link for every rate |
| AWAS camera locations | Engine done, data empty. Route cards show cameras mapped on OpenStreetMap instead (not the official list, no spoken alerts from it) |
| Speed limits | Not started |
| Background navigation | Not possible in a web app (phones stop it). Needs the native apps later |
| CarPlay / Android Auto | Not started. Not claimed |

## Try it

```bash
npm install
npm run dev          # local server
npm run check        # typecheck + tests + data check + production build
```

To try it on a real phone you need an HTTPS address: see `docs/DEPLOYMENT.md` (GitHub Pages workflow included).

## How it is organised

```
apps/web         the phone app (React, TypeScript, MapLibre)
packages/core    navigation logic with no UI: distance maths, route parsing, turn tracking,
                 AWAS matching, data checks (tested; reusable by future native apps)
data/            reference datasets (AWAS cameras) with a source-and-date rule
scripts/         data validation
docs/            live traffic research, deployment
```

## Privacy: what leaves your phone

- Your position is held in memory only and discarded when the app closes.
- Starting a route sends the start and end points to the routing server. Search sends what you type, plus a nearby point, to the search server. Tiles are fetched from the map server.
- By default those are public demo servers run by others (see `docs/DEPLOYMENT.md`). They see your network address like any website does.

## Data rules

Nothing is invented. A speed-camera record is used only if it has a source URL and a verification date. Run `npm run validate-data` to check, and CI does the same on every change.

## Choices made for you (change them if you disagree)

- **Licence: MIT.** A placeholder I picked as the permissive default; GPL-3.0 is the alternative. Decide before the first public release.
- **Working name "Arah"** (Malay for "direction"). Rename freely.
- **Plain CSS instead of Tailwind**, to keep the app small and simple for now.
- Routing, search and tiles come from free public demo servers so it works on day one.

## Testing notes

- `packages/core` has 28 automated tests (geometry, route parsing, progress tracking, off-route detection, AWAS matching and data gate).
- The app was also exercised in a headless browser with the network calls faked: search, route options, simulated drive to arrival, camera alert, about screen. That test used made-up roads and a made-up camera, only inside the test.
- **Not yet tested:** real GPS on a real phone, the real public servers, iOS Safari voice and wake-lock behaviour, the GitHub workflows.

## Licence

MIT, see `LICENSE`. Map data © OpenStreetMap contributors (ODbL).
