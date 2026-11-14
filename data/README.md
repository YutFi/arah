# Data

Everything the app shows about speed cameras (and, later, tolls) comes from files in this folder.

**Current state: `awas/cameras.json` is empty on purpose.** No verified AWAS records have been added yet, and this project does not guess. The app shows "AWAS data not loaded" until real, checked records exist.

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
  "notes": "optional"
}
```

`type` is `fixed`, `red-light` or `average-speed`. `directionDeg` (the direction of travel being enforced) is optional but recommended: without it, an alert fires for either direction on a matching road.

The coordinates above are placeholders to show the shape. Never copy example values into the real file.
