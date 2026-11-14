#!/usr/bin/env python3
"""Pick the places we need out of an OpenStreetMap file.

usage: extract-osm.py <input.osm.pbf|.osm> <rules.json> <output.ndjson>

Writes one JSON object per line in the same shape the Overpass API uses
({"type","id","lat","lon","tags"}). Ways get the centre of their bounding box.
Only tags listed in rules.json are kept, to keep the output small.
"""
import json
import sys

import osmium

src, rules_path, dst = sys.argv[1:4]
with open(rules_path, encoding="utf-8") as f:
    cfg = json.load(f)
want = {(k, v) for k, v in cfg["rules"]}
keep = set(cfg["keepTags"])
keys = sorted({k for k, _ in want})

fp = (
    osmium.FileProcessor(src, osmium.osm.NODE | osmium.osm.WAY)
    .with_locations()
    .with_filter(osmium.filter.KeyFilter(*keys))
)

kept = 0
with open(dst, "w", encoding="utf-8") as out:
    for o in fp:
        tags = {t.k: t.v for t in o.tags}
        if not any(tags.get(k) == v for k, v in want):
            continue
        if o.is_node():
            if not o.location.valid():
                continue
            lat, lon, typ = o.location.lat, o.location.lon, "node"
        else:
            locs = [n.location for n in o.nodes if n.location.valid()]
            if not locs:
                continue
            lat = (min(l.lat for l in locs) + max(l.lat for l in locs)) / 2
            lon = (min(l.lon for l in locs) + max(l.lon for l in locs)) / 2
            typ = "way"
        slim = {k: v for k, v in tags.items() if k in keep}
        out.write(json.dumps({"type": typ, "id": o.id, "lat": round(lat, 6), "lon": round(lon, 6), "tags": slim}, ensure_ascii=False))
        out.write("\n")
        kept += 1
print(f"Kept {kept} objects")
