import { CONFIG } from '../config'
import { cache, fetchJson, sleep } from '../lib/http'
import type { Place } from '../types'

interface NominatimHit { lat: string; lon: string; display_name: string; name?: string; type?: string; class?: string; address?: Record<string, string> }

// Nominatim usage policy: max 1 request/second. All calls are serialised through this queue.
let chain: Promise<unknown> = Promise.resolve()
let lastAt = 0
function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const wait = Math.max(0, lastAt + 1100 - Date.now())
    if (wait) await sleep(wait)
    lastAt = Date.now()
    return fn()
  })
  chain = run.catch(() => undefined)
  return run
}

const TTL = 7 * 24 * 3600 * 1000
const emailParam = () => (CONFIG.contactEmail ? `&email=${encodeURIComponent(CONFIG.contactEmail)}` : '')

function toPlace(h: NominatimHit, source: Place['source']): Place {
  const short = h.name || h.display_name.split(',')[0]
  return { label: h.display_name, shortLabel: short, lat: parseFloat(h.lat), lng: parseFloat(h.lon), source, osmClass: h.class, osmType: h.type }
}

/** Search restricted to the Nagpur urban area. Call on explicit submit (not per keystroke). */
const rank = (p: Place) => (p.osmClass === 'place' ? 0 : p.osmClass === 'boundary' ? 1 : 2)

/**
 * Search restricted to the Nagpur urban area. Call on explicit submit (not per keystroke).
 * With `locality: true` (used for area names like "Dighori"), settlements/suburbs are requested first and
 * place/boundary results are ranked above shops, banks and other POIs that merely contain the name.
 */
export async function searchPlaces(q: string, opts: { locality?: boolean; signal?: AbortSignal } = {}): Promise<Place[]> {
  const query = q.trim()
  if (query.length < 2) return []
  const key = 'geo2:' + (opts.locality ? 'loc:' : '') + query.toLowerCase()
  const hit = cache.get<Place[]>(key)
  if (hit) return hit
  const [w, s, e, n] = CONFIG.nagpurViewbox
  const base = `${CONFIG.nominatimBase}/search?format=jsonv2&limit=6&countrycodes=in&bounded=1&viewbox=${w},${n},${e},${s}&q=${encodeURIComponent(/nagpur/i.test(query) ? query : query + ', Nagpur')}${emailParam()}`
  const get = (url: string) => throttled(() => fetchJson<NominatimHit[]>(url, { signal: opts.signal, timeoutMs: CONFIG.timeouts.geocodeMs, headers: { Accept: 'application/json' } }))
  let data: NominatimHit[] = []
  if (opts.locality) data = await get(base + '&featuretype=settlement')
  if (!data.length) data = await get(base)
  const places = data.map(h => toPlace(h, 'search')).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng))
  if (opts.locality) places.sort((a, b) => rank(a) - rank(b)) // stable: keeps Nominatim's importance order within a rank
  if (places.length) cache.set(key, places, TTL)
  return places
}

export async function reverseGeocode(lat: number, lng: number, signal?: AbortSignal): Promise<Place> {
  const fallback: Place = { label: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, shortLabel: `Pinned location (${lat.toFixed(4)}, ${lng.toFixed(4)})`, lat, lng, source: 'map-click' }
  try {
    const url = `${CONFIG.nominatimBase}/reverse?format=jsonv2&zoom=17&lat=${lat}&lon=${lng}${emailParam()}`
    const h = await throttled(() => fetchJson<NominatimHit & { error?: string }>(url, { signal, timeoutMs: 10000 }))
    if (!h || h.error || !h.display_name) return fallback
    const a = h.address || {}
    const short = h.name || a.road || a.neighbourhood || a.suburb || h.display_name.split(',')[0]
    return { label: h.display_name, shortLabel: short, lat, lng, source: 'map-click' }
  } catch { return fallback }
}

/** Example journeys. Place names are geocoded at runtime (no hard-coded coordinates). */
export const SCENARIOS = [
  { id: 'A', from: 'Dighori', to: 'Sadar' },
  { id: 'B', from: 'Dighori', to: 'Wadi' },
  { id: 'C', from: 'Dighori', to: 'Sitabuldi' },
] as const
