# Ride Fit

Compare your height (and your crew) against vehicles drawn to scale. Single offline HTML app.

**Live:** deployed by Netlify from the root of `main` — no build step on Netlify.

## Layout

- `index.html` — **generated, do not hand-edit.** Output of `_build/build.py` (same file as `vehicles-vs-you.html`).
- `vehicles.json` — **source of truth** for the vehicle data (schema v2). The app inlines it at build time; the schema is also what a future HTTP endpoint would serve.
- `_build/` — the pipeline that produces both files.

## Rebuild

```
cd _build
python3 export_vehicles.py    # data.json (editing store) -> ../vehicles.json
python3 build.py              # inlines vehicles.json + prerenders the default scene -> ../vehicles-vs-you.html
python3 sanity.py             # cheap checks
cp ../vehicles-vs-you.html ../index.html
```

Requires Python 3 and Node (build.py uses node + geom.js to prerender the static first paint).

Data comes from Edmunds (dimensions), NHTSA SafetyRatings (safety), and cars.com (market/MSRP, MPG, power); per-field provenance is recorded in each record. Raw agent captures (`raw_*.json`, `records_*.json`) are kept so any figure can be traced.

© 2026 Vadim Yerokhin
