#!/usr/bin/env bash
# Builds the pre-made map data (places, traffic lights, cameras, toll booths) from
# a fresh OpenStreetMap extract of Malaysia. Needs: node, python3 with `pip install osmium`.
# usage: scripts/build-osm-data.sh [path-to-.osm.pbf]   (downloads one if not given)
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=apps/web/public/data/osm
WORK=$(mktemp -d)
SRC=${1:-}
if [ -z "$SRC" ]; then
  SRC="$WORK/malaysia.osm.pbf"
  curl -fL --retry 3 --retry-delay 5 -o "$SRC" https://download.geofabrik.de/asia/malaysia-singapore-brunei-latest.osm.pbf
fi
npx tsx scripts/export-osm-rules.ts "$WORK/rules.json"
python3 scripts/extract-osm.py "$SRC" "$WORK/rules.json" "$WORK/elements.ndjson"
npx tsx scripts/build-osm-tiles.ts "$WORK/elements.ndjson" "$OUT" "OpenStreetMap contributors, Geofabrik extract of Malaysia, Singapore and Brunei"
rm -rf "$WORK"
