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

## What the public demo servers mean

By default the app calls three free public servers: map tiles (OpenFreeMap), routing (Valhalla demo by FOSSGIS e.V.) and search (Photon demo by komoot). They are fine for development and a few testers. They are **not** meant for a public launch: they have fair-use rules, no promise of uptime, and the project does not control them.

To switch to your own servers, create `apps/web/.env.local`:

```
VITE_STYLE_URL=https://your-tiles.example/style.json
VITE_ROUTING_URL=https://your-routing.example
VITE_GEOCODER_URL=https://your-search.example
```

Hosting your own Valhalla for Malaysia (about the size of a small VM: a Geofabrik extract of Malaysia, Singapore and Brunei) is covered in the architecture document, section 8.
