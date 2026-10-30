# SurakshaSetu: safer navigation in Nagpur

Frontend-only React + Vite + TypeScript + Leaflet app. It requests **real road routes** from an OSRM engine (OpenStreetMap data), then measures **public, source-labelled safety evidence along each returned route**. No API keys, no billing, no backend.

## Run (Windows PowerShell)
    cd C:\Users\Lenovo\Desktop\cep_SurakshaSetu
    npm install
    npm run dev          # open the URL Vite prints (usually http://localhost:5173)

Needs internet for: map tiles (OpenStreetMap standard tiles), OSRM routing, Nominatim search, Overpass facility data.
Other scripts: `npm run build`, `npm test` (unit tests), `npm run test:e2e` (browser test against stubbed services; needs `npm run build` then `npx vite preview --port 4173` running).

## What it does
- **Routes** come only from OSRM (`/route/v1/driving`, `alternatives=3`, `overview=full`, GeoJSON geometry + steps). Nothing is drawn by joining markers. Near-duplicate alternatives are merged; none are ever invented. One route back = one route shown.
- **Places** are geocoded at runtime by Nominatim, restricted to a Nagpur bounding box. Example journeys (Dighori → Sadar / Wadi / Sitabuldi) resolve their names live, with no hard-coded coordinates. The resolved address is shown in the input so you can check it is the intended place; use the search box or the crosshair (pick on map) to correct it. Markers are draggable. Endpoints are snapped to the nearest road by OSRM; snaps > 150 m are reported.
- **Safety evidence** (Overpass / OpenStreetMap): police stations, hospitals, mapped CCTV, road class and `lit` tags. See the in-app **Methodology** (book icon) for formulae, weights, sources and limits.
- **Honesty rules built in**
  - Crime: always "Insufficient verified data" (no open, route-resolvable dataset found; sources reviewed are in `src/data/sources.ts` and in the app).
  - CCTV: "CCTV coverage data unavailable" when none is mapped; otherwise "camera locations mapped, not confirmed operational". Not used in the index by default.
  - The index is labelled **Emergency-access index (partial evidence)** and is never presented as an overall safety score. Data confidence is shown separately; an OSM-only analysis cannot exceed 50%.
  - A detour is recommended only if it beats the fastest route by ≥ 10 index points for ≤ 15 extra minutes / 40%; otherwise the app says the evidence is inconclusive. Longer is never assumed safer.
  - Red is reserved for verified hazards; none are connected, so it is never shown. Amber = a data-supported caution.
- Community SOS and reports are **simulations kept in browser memory** (nothing is sent). `tel:112` links are real.

## Report, extra routes and demo data
- **Full report** (button on the selected route): counts and tables of hospitals and police stations within 1 km of the route (name, km from start, distance off route, coordinates, OSM link), CCTV points, crime records, and a strip showing where everything lies along the route. **Print / save PDF** included.
- **3+ routes:** native OSRM alternatives first; if fewer than three, extra *real* road routes are requested via a side waypoint (filtered for duplicates, spurs and absurd detours; labelled "Extra route"). If none exist, none are shown.
- **Your own real data:** put `public/data/cctv.json` and/or `public/data/crime.json` (formats in `public/data/README.md`). They are shown without a Demo tag, crediting your `source`.
- **Demo placeholders:** with no real data, generated CCTV/crime rows can appear, always tagged "Demo"; toggle in the Layers menu. They are never used in the index, confidence or recommendation.

## Making police/hospital data instant and reliable (recommended before a presentation)
The public Overpass servers are sometimes slow. Download the real OpenStreetMap data for Nagpur once:

    npm run fetch-data

This writes `public/data/osm-nagpur.json` (police stations, hospitals, mapped cameras; © OpenStreetMap contributors). The app then uses it instantly with no live query. Commit the file so the GitHub Pages site uses it too. Re-run occasionally to refresh. Without it, the app queries Overpass live (all mirrors in parallel, 3 automatic attempts).

## Configuration (all optional, see `.env.example`)
Weights, corridor widths and thresholds live in `src/config.ts`. Provider URLs can be overridden with `VITE_OSRM_URL`, `VITE_NOMINATIM_URL`, `VITE_OVERPASS_URLS`, `VITE_TILE_URL`, `VITE_CONTACT_EMAIL`. Nothing secret is used in the frontend.

## Limitations / production notes
- Public OSRM demo, Nominatim and Overpass are fair-use, **not for production traffic**. Nominatim calls are throttled to 1 req/s and cached in localStorage; Overpass results are cached for 6 h. For production, self-host OSRM (Maharashtra extract), use a hosted geocoder / Overpass instance, and set the env vars above.
- The OSRM demo server serves the **car** profile only.
- Map tiles use the public OpenStreetMap tile server (no API key; attribution shown). Its [usage policy](https://operations.osmfoundation.org/policies/tiles/) forbids heavy/bulk use; for production use a tile provider and set `VITE_TILE_URL`.
- OSM completeness varies: no mapped police station, hospital or camera is not evidence that none exist.
- To add crime evidence: obtain permitted/licensed data (Nagpur City Police station-jurisdiction level, or NCRB), add jurisdiction polygons, and implement it as a new factor in `src/services/safety.ts` with its own source, period and limitation.

## Structure
    src/config.ts                 providers, weights, thresholds
    src/services/geocode.ts       Nominatim search / reverse (throttled, cached)
    src/services/routing.ts       OSRM client, step text, duplicate merge
    src/services/overpass.ts      facilities + road environment
    src/services/safety.ts        scoring, confidence, recommendation
    src/data/sources.ts           crime sources reviewed
    src/components/*              map, planner inputs, route details, methodology, community
    tests/safety.test.ts          unit tests (synthetic geometry)
    tests/e2e/run.mjs             browser test with stubbed, synthetic service responses

## Deploy to GitHub Pages
Push to `main`; the workflow in `.github/workflows/deploy.yml` tests, builds and publishes. One-time setup: repo **Settings → Pages → Source: GitHub Actions**. The site is served from `https://<user>.github.io/<repo>/`. Everything runs in the visitor's browser and calls the public OSRM/Nominatim/Overpass/OSM-tile servers directly (fair-use limits apply to all visitors), so treat the hosted site as a demo.
