#!/usr/bin/env python3
"""One-off diagnostic: road geometry next to each candidate camera node.
usage: diag-osm-ways.py <pbf> <targets.json>"""
import json, math, sys
import osmium

src, tj = sys.argv[1], sys.argv[2]
T = json.load(open(tj))
pts = {k: (v['lat'], v['lng']) for k, v in T.items()}
R = 6371000.0
def xy(lat, lon, lat0):
    return (math.radians(lon) * R * math.cos(math.radians(lat0)), math.radians(lat) * R)
def bearing(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    y = math.sin(lo2 - lo1) * math.cos(la2)
    x = math.cos(la1) * math.sin(la2) - math.sin(la1) * math.cos(la2) * math.cos(lo2 - lo1)
    return (math.degrees(math.atan2(y, x)) + 360) % 360
found = {k: [] for k in pts}
fp = osmium.FileProcessor(src, osmium.osm.NODE | osmium.osm.WAY).with_locations().with_filter(osmium.filter.KeyFilter("highway"))
for w in fp:
    if not hasattr(w, "nodes"):
        continue
    hw = w.tags.get("highway")
    if hw in ("footway", "path", "cycleway", "steps", "pedestrian", "track", "service", "bridleway", "corridor"):
        continue
    try:
        coords = [(n.lat, n.lon) for n in w.nodes if n.location.valid()]
    except Exception:
        continue
    if len(coords) < 2:
        continue
    for k, (la, lo) in pts.items():
        if abs(coords[0][0] - la) > 0.05 and abs(coords[-1][0] - la) > 0.05 and not any(abs(c[0] - la) < 0.002 and abs(c[1] - lo) < 0.002 for c in coords):
            continue
        px, py = xy(la, lo, la)
        best = None
        for a, b in zip(coords, coords[1:]):
            ax, ay = xy(a[0], a[1], la); bx, by = xy(b[0], b[1], la)
            dx, dy = bx - ax, by - ay
            L2 = dx * dx + dy * dy
            if L2 == 0:
                continue
            tt = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / L2))
            d = math.hypot(px - (ax + tt * dx), py - (ay + tt * dy))
            if best is None or d < best[0]:
                best = (d, bearing(a, b))
        if best and best[0] <= 80:
            t = w.tags
            found[k].append({"way": w.id, "d_m": round(best[0], 1), "brg": round(best[1]), "hw": hw,
                             "name": t.get("name"), "ref": t.get("ref"), "oneway": t.get("oneway"),
                             "maxspeed": t.get("maxspeed"), "lanes": t.get("lanes")})
for k in sorted(found, key=int):
    print(f"ENTRY {k} node={T[k]['id']} {T[k]['lat']},{T[k]['lng']} name={T[k]['tags'].get('name')}")
    for f in sorted(found[k], key=lambda f: f["d_m"]):
        print("   ", f)
