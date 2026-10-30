import { CONFIG } from '../config'
import { fetchJson, HttpError, cache } from '../lib/http'
import { simplify } from '../lib/geo'
import type { Facility, DocTier, LngLat, RoadEnv } from '../types'

interface OverpassEl { type: 'node' | 'way' | 'relation'; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }
interface OverpassResp { elements: OverpassEl[]; remark?: string }

/** Sends the query to every configured Overpass mirror at once; the first good answer wins and the rest are cancelled. */
async function runQuery(q: string, perAttemptMs: number, signal?: AbortSignal): Promise<OverpassResp> {
  const ctrl = new AbortController()
  const onAbort = () => ctrl.abort()
  signal?.addEventListener('abort', onAbort)
  try {
    return await Promise.any(CONFIG.overpassBases.map(async base => {
      const data = await fetchJson<OverpassResp>(base, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: ctrl.signal, timeoutMs: perAttemptMs })
      if (data.remark && /timed out|out of memory/i.test(data.remark)) throw new HttpError('Overpass query timed out.', 200, 'timeout')
      return data
    }))
  } catch (e) {
    if (signal?.aborted) throw new HttpError('Request cancelled.', undefined, 'aborted')
    if (e instanceof AggregateError) throw (e.errors.find(x => x instanceof HttpError && x.kind !== 'aborted') ?? e.errors[0] ?? new Error('Overpass unavailable'))
    throw e
  } finally { ctrl.abort(); signal?.removeEventListener('abort', onAbort) }
}

const DOC_KEYS = ['phone', 'contact:phone', 'website', 'contact:website', 'opening_hours', 'operator', 'addr:street', 'addr:full', 'addr:city', 'check_date', 'survey:date', 'emergency']
function tierOf(tags: Record<string, string>): DocTier {
  if (!tags.name && !tags['name:en']) return 'incomplete'
  return DOC_KEYS.some(k => tags[k]) ? 'well-documented' : 'basic'
}

export interface FacilitiesResult { facilities: Facility[]; bbox: string; fetchedAt: string; origin: 'live' | 'snapshot' }
type Box = { south: number; west: number; north: number; east: number }

/** Turn raw Overpass elements into Facility records (shared by the live query and the downloaded snapshot). */
export function parseFacilities(elements: OverpassEl[]): Facility[] {
  const seen = new Set<string>()
  const facilities: Facility[] = []
  for (const el of elements) {
    const t = el.tags || {}
    const lat = el.lat ?? el.center?.lat, lng = el.lon ?? el.center?.lon
    if (lat == null || lng == null) continue
    const id = `${el.type}/${el.id}`
    if (seen.has(id)) continue
    seen.add(id)
    let kind: Facility['kind'] | null = null
    if (t.amenity === 'police') kind = 'police'
    else if (t.amenity === 'hospital' || t.healthcare === 'hospital') kind = 'hospital'
    else if (t.man_made === 'surveillance') kind = 'cctv'
    if (!kind) continue
    if (kind === 'cctv' && t['surveillance:type'] && !/camera|alpr/i.test(t['surveillance:type'])) continue // skip guards
    facilities.push({ id, kind, lat, lng, name: t.name || t['name:en'] || null, tier: kind === 'cctv' ? 'basic' : tierOf(t), osmUrl: `https://www.openstreetmap.org/${el.type}/${el.id}`, tags: t })
  }
  return facilities
}

/**
 * Optional real-data snapshot: `npm run fetch-data` downloads Nagpur's police stations, hospitals and mapped cameras
 * from OpenStreetMap once into public/data/osm-nagpur.json. When it covers the requested area it is used instead of a
 * live query, so the app is instant and works even when the public Overpass servers are slow.
 */
interface Snapshot { fetchedAt: string; bbox: Box; elements: OverpassEl[] }
let snapshotPromise: Promise<Snapshot | null> | null = null
function getSnapshot(): Promise<Snapshot | null> {
  snapshotPromise ??= fetch(`${import.meta.env.BASE_URL}data/osm-nagpur.json`, { cache: 'no-cache' }).then(r => (r.ok ? r.json() : null)).then(j => (j && Array.isArray(j.elements) && j.bbox ? (j as Snapshot) : null)).catch(() => null)
  return snapshotPromise
}

export async function fetchFacilities(b: Box, signal?: AbortSignal): Promise<FacilitiesResult> {
  const bb = `${b.south.toFixed(4)},${b.west.toFixed(4)},${b.north.toFixed(4)},${b.east.toFixed(4)}`
  const snap = await getSnapshot()
  if (snap && snap.bbox.south <= b.south && snap.bbox.west <= b.west && snap.bbox.north >= b.north && snap.bbox.east >= b.east)
    return { facilities: parseFacilities(snap.elements), bbox: bb, fetchedAt: snap.fetchedAt, origin: 'snapshot' }
  const key = 'ovp:fac2:' + bb
  const hit = cache.get<FacilitiesResult>(key)
  if (hit) return hit
  const q = `[out:json][timeout:25];(
    nwr["amenity"="police"](${bb});
    nwr["amenity"="hospital"](${bb});
    nwr["healthcare"="hospital"](${bb});
    nwr["man_made"="surveillance"](${bb});
  );out center tags;`
  const data = await runQuery(q, CONFIG.timeouts.facilitiesAttemptMs, signal)
  const out: FacilitiesResult = { facilities: parseFacilities(data.elements), bbox: bb, fetchedAt: new Date().toISOString(), origin: 'live' }
  cache.set(key, out, 6 * 3600 * 1000)
  return out
}

const DRIVABLE = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street', 'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link'])
const norm = (h: string) => h.replace('_link', '')

/** Road-environment attributes of OSM ways lying within ~15 m of the (simplified) route line. */
export async function fetchRoadEnv(coords: LngLat[], signal?: AbortSignal): Promise<RoadEnv> {
  let line = simplify(coords, 15), tol = 15
  while (line.length > 120 && tol < 200) { tol *= 1.6; line = simplify(coords, tol) }
  const poly = line.map(([lng, lat]) => `${lat.toFixed(5)},${lng.toFixed(5)}`).join(',')
  const q = `[out:json][timeout:15];way["highway"](around:15,${poly});out tags;`
  const data = await runQuery(q, CONFIG.timeouts.roadEnvAttemptMs, signal)
  const env: RoadEnv = { ways: 0, byClass: {}, litYes: 0, litNo: 0, litUnknown: 0, sidewalkTagged: 0, sourceNote: 'OSM ways within 15 m of the route line (includes intersecting side roads); drivable classes only.' }
  for (const el of data.elements) {
    const t = el.tags || {}
    const h = t.highway
    if (!h || !DRIVABLE.has(h)) continue
    env.ways++
    env.byClass[norm(h)] = (env.byClass[norm(h)] || 0) + 1
    if (t.lit === 'yes' || t.lit === '24/7' || t.lit === 'automatic') env.litYes++
    else if (t.lit === 'no') env.litNo++
    else env.litUnknown++
    if (['both', 'left', 'right', 'yes'].includes(t.sidewalk || '')) env.sidewalkTagged++
  }
  return env
}
