#!/usr/bin/env python3
"""One-off diagnostic: what does OpenStreetMap carry that could place AwAS cameras?
Prints counts and samples of (a) kilometre markers, (b) mapped speed/enforcement cameras.
usage: diag-osm-awas.py <malaysia.osm.pbf>"""
import collections
import sys

import osmium

src = sys.argv[1]
fp = osmium.FileProcessor(src, osmium.osm.NODE).with_locations().with_filter(osmium.filter.KeyFilter("highway", "railway", "enforcement", "distance", "man_made", "camera:type"))
miles, cams, enf = [], [], []
for o in fp:
    t = {x.k: x.v for x in o.tags}
    if not o.location.valid():
        continue
    lat, lon = o.location.lat, o.location.lon
    t['_id'] = o.id
    if not (0.8 < lat < 7.5 and 99 < lon < 120):
        continue
    if t.get("highway") == "milestone" or t.get("railway") == "milestone" or ("distance" in t and t.get("highway") in (None, "milestone")):
        miles.append((lat, lon, t))
    if t.get("highway") == "speed_camera":
        cams.append((lat, lon, t))
    elif "enforcement" in t or t.get("man_made") == "surveillance" and "camera:type" in t and False:
        enf.append((lat, lon, t))

print(f"MILESTONES total={len(miles)}")
c = collections.Counter((t.get("highway") or t.get("railway") or "?", "distance" in t, "name" in t, "ref" in t) for _, _, t in miles)
print("  by (kind, has distance, has name, has ref):", dict(c))
for lat, lon, t in miles[:40]:
    print(f"  M {lat:.5f},{lon:.5f} {dict(t)}")
print(f"SPEED_CAMERA nodes total={len(cams)}")
for lat, lon, t in cams[:400]:
    print(f"  C {lat:.5f},{lon:.5f} {dict(t)}")
print(f"ENFORCEMENT nodes (not speed_camera) total={len(enf)}")
for lat, lon, t in enf[:60]:
    print(f"  E {lat:.5f},{lon:.5f} {dict(t)}")
