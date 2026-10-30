// Central configuration. Every external provider is swappable via Vite env vars (see .env.example)
// so the public demo endpoints can be replaced by self-hosted ones for production.
const env = import.meta.env as Record<string, string | undefined>

/** Test-only knob: VITE_TIMEOUT_SCALE=0.2 shortens the Overpass timeouts and retry back-off. Leave unset in real use. */
const SCALE = Number(env.VITE_TIMEOUT_SCALE) || 1

export const CONFIG = {
  /** Public OSRM demo server: car profile only, fair-use, NOT for production traffic. */
  osrmBase: env.VITE_OSRM_URL || 'https://router.project-osrm.org',
  /** Public Nominatim: max 1 request/second, no autocomplete, identify the app. NOT for heavy use. */
  nominatimBase: env.VITE_NOMINATIM_URL || 'https://nominatim.openstreetmap.org',
  /** Overpass instances tried in order. */
  overpassBases: (env.VITE_OVERPASS_URLS || 'https://overpass-api.de/api/interpreter,https://overpass.kumi.systems/api/interpreter,https://overpass.private.coffee/api/interpreter').split(',').map(s => s.trim()).filter(Boolean),
  /** Optional contact for Nominatim's "identify your application" policy (sent as email= param). */
  contactEmail: env.VITE_CONTACT_EMAIL || '',
  /**
   * Standard OpenStreetMap tiles (no API key). Policy: https://operations.osmfoundation.org/policies/tiles/
   * Attribution is mandatory; no bulk downloading; not for heavy production traffic (switch provider via VITE_TILE_URL).
   */
  tile: {
    url: env.VITE_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
  },
  /** Network budgets so loading states always finish. */
  timeouts: { osrmMs: 20000, geocodeMs: 12000, facilitiesAttemptMs: 25000 * SCALE, roadEnvAttemptMs: 15000 * SCALE },
  retryBackoffMs: 3000 * SCALE,
  /** Geocoding is restricted to this box (Nagpur urban area, generous) to avoid same-name places elsewhere. [west, south, east, north] */
  nagpurViewbox: [78.95, 21.03, 79.25, 21.27] as [number, number, number, number],
  mapCenter: [21.1458, 79.0882] as [number, number],

  safety: {
    /** Corridor half-width (metres) used to COUNT facilities "along" a route. */
    corridorMeters: 1000,
    /** Spacing (metres) at which routes are sampled to compute facility distances. */
    sampleEveryMeters: 100,
    /** Distance at which the proximity sub-score reaches 0 (linear from 0 m = 1). */
    policeZeroAtMeters: 3000,
    hospitalZeroAtMeters: 4000,
    /** An evidence-led alternative must beat the fastest route's index by this many points... */
    minIndexAdvantage: 10,
    /** ...and cost at most this many extra minutes AND this fraction of extra duration. */
    maxExtraMinutes: 15,
    maxExtraFraction: 0.4,
    /** Show an amber caution when the farthest point on the route is this far from the nearest mapped facility. */
    gapCautionMeters: 3000,
    /** Share of corridor ways that must carry a `lit` tag before lighting is used at all. */
    minLitTagShare: 0.3,
    /** Factor weights. A weight of 0 = shown for information, not used in the index. */
    weights: { police: 0.4, hospital: 0.4, cctv: 0, crime: 0.2, roadEnvironment: 0.0 } as Record<string, number>,
  },
  /** Alternative routes whose geometry overlaps a better route by more than this share are treated as duplicates. */
  duplicateOverlap: 0.97,
  lastChecked: '2026-10-19',
}
