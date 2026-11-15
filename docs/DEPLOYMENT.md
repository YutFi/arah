# Running and publishing Arah

## Run it on your computer

You need Node.js 22 or newer.

```bash
npm install
npm run dev        # opens a local server, usually http://localhost:5173
```

On your own computer, location works on `localhost`. Use **Simulate drive** to test navigation without driving.

## Try it on a phone (important)

Phones only allow GPS on **HTTPS** pages (the one exception is `localhost`). Opening `http://192.168.x.x:5173` from your phone will load the page, but location will be blocked. So to test on a real phone, put the app on an HTTPS host. Both options below are free and need no credit card.

### Option A: GitHub Pages (simplest, since the repo is on GitHub anyway)

1. Create a GitHub repository and push this folder to the `main` branch.
2. In the repository: Settings, then Pages, then set Source to **GitHub Actions**.
3. The included `pages.yml` workflow builds and publishes on every push. The address will be `https://<your-username>.github.io/<repo-name>/`.
4. Open that address on your phone. On iPhone use Safari, then Share, then **Add to Home Screen**. On Android use Chrome, then menu, then **Install app**.

### Option B: Cloudflare Pages

Connect the repository, then set build command `npm run build`, output folder `apps/web/dist`, and environment variable `NODE_VERSION=22`. Leave `VITE_BASE` unset (the site lives at the root).

(Neither workflow has been run yet. If a step fails, the error in the Actions tab will say why. Paste it back and it can be fixed.)

## Pre-built map data (why places and counts load instantly)

Live public map-data servers are slow and sometimes busy, so the app does **not** ask them when it can avoid it. Instead the deploy workflow (`.github/workflows/pages.yml`) builds small static files from an OpenStreetMap extract of Malaysia and ships them with the app:

- `scripts/build-osm-data.sh` downloads the Geofabrik extract, `scripts/extract-osm.py` keeps petrol stations, food, entertainment, hotspots, attractions, traffic lights, speed cameras and toll booths, and `scripts/build-osm-tiles.ts` cuts them into tiles under `apps/web/public/data/osm/` (not committed).
- The app loads only the few tiles around where you are looking, so Petrol, nearby places and the traffic-light / camera / toll-plaza counts on a route appear in a fraction of a second.
- The workflow runs on every push and **every Monday**, so the data stays fresh. The About screen shows the snapshot date.
- If the "Build map data" step fails, the deploy still works and the app falls back to the slow live Overpass servers (with a timeout and a visible message). Check the Actions tab for the step's log.
- The deploy keeps the last good copy of these tiles (GitHub Actions cache) and refuses to publish with no map data at all. If the Geofabrik download is down, the site ships with the previous copy. On 2026-11-15 one deploy shipped without the data because the download failed and the step was allowed to fail silently, so the app lost its traffic lights and cameras until the next good deploy.
- To try it locally: `pip install osmium`, then `bash scripts/build-osm-data.sh` (downloads about 250 MB) or `bash scripts/build-osm-data.sh scripts/fixtures/sample.osm` for a tiny sample.

The data is OpenStreetMap volunteer data: it can be incomplete or out of date, and it has no ratings or toll prices.

## What the public demo servers mean

By default the app calls free public servers: map tiles (OpenFreeMap), routing (Valhalla demo by FOSSGIS e.V.), search (Photon demo by komoot), full street-address search (Nominatim, only when you press search, as its usage policy asks) and nearby places plus lights, cameras and toll plazas on a route (Overpass API). They are fine for development and a few testers. They are **not** meant for a public launch: they have fair-use rules, no promise of uptime, and the project does not control them.

To switch to your own servers, create `apps/web/.env.local`:

```
VITE_STYLE_URL=https://your-tiles.example/style.json
VITE_ROUTING_URL=https://your-routing.example
VITE_GEOCODER_URL=https://your-search.example
VITE_ADDRESS_URL=https://your-nominatim.example
VITE_POI_URL=https://your-overpass.example/api/interpreter
```

Hosting your own Valhalla for Malaysia (about the size of a small VM: a Geofabrik extract of Malaysia, Singapore and Brunei) is covered in the architecture document, section 8.
