# Data

Everything the app shows about speed cameras (and, later, tolls) comes from files in this folder.

**Current state: `awas/cameras.json` has 20 records, all approximate.** They come from the JPJ list of AwAS camera locations ([PDF](https://www.jpj.gov.my/wp-content/uploads/2025/04/LOKASI-PENGUATKUASAAN-KAMERA-AwAS-TERKINI-15.07.2024-1-1.pdf), file dated 15 July 2024, 49 entries, 46 active and 3 suspended).

## How the AwAS pins were made (and what is not verified)

- The JPJ list gives road, KM and direction only. **It has no coordinates.** No official source with coordinates was found.
- Each pin is the position of a camera mapped by volunteers on OpenStreetMap whose name matches a JPJ entry (KM, road or place). `directionDeg` is the direction of the carriageway that camera sits on, so the other side of the road does not trigger the alert.
- Speed limits are included only where the OpenStreetMap camera and the road agree (the PLUS and ELITE entries, 110 km/h).
- **Placed (20):** JPJ list numbers 1 to 8, 11, 12, 13, 16, 18, 19, 30, 32, 33, 35, 36, 45.
- **Not placed (26):** 9, 10, 14, 15, 17, 20 to 29, 31, 34, 37 to 44, and 46 (no matching mapped camera, or the direction was unclear). The app shows nothing for these.
- **Suspended (47 to 49):** never pinned.
- Not driven or surveyed. Positions can be off by some metres, the JPJ list can be out of date, and the app never replaces road signs and the posted limit.

## The data gate

A camera record is only used by the app if it has:

- `sourceUrl`: a link to where the information came from
- `verifiedOn`: the date (YYYY-MM-DD) a person last checked it
- valid coordinates inside Malaysia

Run `npm run validate-data` to check the file. CI runs it on every change, and the app applies the same check at load time (bad records are skipped, never shown).

## Record format

```json
{
  "id": "unique-id",
  "type": "fixed",
  "lat": 0.0,
  "lng": 0.0,
  "directionDeg": 90,
  "speedLimitKph": 90,
  "roadName": "optional",
  "sourceUrl": "https://where-this-came-from.example",
  "verifiedOn": "2026-11-14",
  "notes": "optional",
  "approximate": true
}
```

`approximate` is `true` when the position was matched from a community map to an official list that has no coordinates. `type` is `fixed`, `red-light` or `average-speed`. `directionDeg` (the direction of travel being enforced) is optional but recommended: without it, an alert fires for either direction on a matching road.

The coordinates above are placeholders to show the shape. Never copy example values into the real file. `npm run validate-data` also enforces house rules for this file: every record must be approximate, have a direction, cite the JPJ list, carry its JPJ list number, and never use entries 47 to 49.
