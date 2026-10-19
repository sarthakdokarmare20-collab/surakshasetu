import { CONFIG } from '../config'
import { fetchJson, HttpError } from '../lib/http'
import { haversine, overlapShare, polylineLength } from '../lib/geo'
import type { LngLat, Place, RouteResult, Step } from '../types'

interface OsrmStep { distance: number; duration: number; name: string; ref?: string; maneuver: { type: string; modifier?: string; exit?: number } }
interface OsrmRoute { distance: number; duration: number; geometry: { type: 'LineString'; coordinates: LngLat[] }; legs: { steps: OsrmStep[] }[]; weight_name?: string }
interface OsrmResponse { code: string; message?: string; routes?: OsrmRoute[]; waypoints?: { location: LngLat; name: string; distance?: number }[] }

export interface RoutingOutcome {
  routes: RouteResult[]
  snapped: { origin: LngLat; destination: LngLat; originSnapM: number; destinationSnapM: number; originRoad: string; destinationRoad: string }
  droppedDuplicates: number
  notes: string[]
}

const dirWord = (m?: string) => (m ? m.replace('slight ', 'slight ').replace('sharp ', 'sharp ') : '')

export function describeStep(s: OsrmStep): string {
  const road = s.name || s.ref || ''
  const onto = road ? ` onto ${road}` : ''
  const m = s.maneuver
  switch (m.type) {
    case 'depart': return road ? `Head out on ${road}` : 'Start'
    case 'arrive': return 'Arrive at your destination'
    case 'turn': return `Turn ${dirWord(m.modifier)}${onto}`
    case 'new name': return road ? `Continue on ${road}` : 'Continue'
    case 'continue': return m.modifier === 'straight' || !m.modifier ? `Continue${road ? ' on ' + road : ''}` : `Continue ${dirWord(m.modifier)}${onto}`
    case 'merge': return `Merge ${dirWord(m.modifier)}${onto}`.replace('  ', ' ')
    case 'on ramp': return `Take the ramp${onto}`
    case 'off ramp': return `Take the exit${onto}`
    case 'fork': return `Keep ${dirWord(m.modifier)} at the fork${onto}`
    case 'end of road': return `At the end of the road turn ${dirWord(m.modifier)}${onto}`
    case 'roundabout': case 'rotary': return `At the roundabout${m.exit ? ` take exit ${m.exit}` : ''}${onto}`
    case 'roundabout turn': return `At the roundabout turn ${dirWord(m.modifier)}${onto}`
    default: return `${m.type[0].toUpperCase()}${m.type.slice(1)}${m.modifier ? ' ' + dirWord(m.modifier) : ''}${onto}`
  }
}

/**
 * Ask the OSRM server for real road-following routes. Nothing is drawn or invented client-side:
 * geometry, distance and duration all come from the engine's response.
 */
export async function fetchRoutes(from: Place, to: Place, signal?: AbortSignal): Promise<RoutingOutcome> {
  const coords = `${from.lng},${from.lat};${to.lng},${to.lat}`
  const base = `${CONFIG.osrmBase}/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=true`
  let data: OsrmResponse
  try { data = await fetchJson<OsrmResponse>(`${base}&alternatives=3`, { signal }) }
  catch (e) {
    // Some servers reject a numeric alternatives value; retry with the boolean form.
    if (e instanceof HttpError && e.status === 400) data = await fetchJson<OsrmResponse>(`${base}&alternatives=true`, { signal })
    else throw e
  }
  if (data.code === 'NoRoute') throw new HttpError('No drivable road route was found between these two points. Try moving a marker closer to a road.', 200)
  if (data.code === 'NoSegment') throw new HttpError('One of the points could not be matched to a nearby road. Try a point closer to a road.', 200)
  if (data.code !== 'Ok' || !data.routes?.length) throw new HttpError(`Routing engine could not produce a route (${data.code}${data.message ? ': ' + data.message : ''}).`, 200)

  const notes: string[] = []
  const wp = data.waypoints || []
  const oLoc = wp[0]?.location ?? [from.lng, from.lat]
  const dLoc = wp[1]?.location ?? [to.lng, to.lat]
  const originSnapM = wp[0]?.distance ?? haversine([from.lng, from.lat], oLoc)
  const destinationSnapM = wp[1]?.distance ?? haversine([to.lng, to.lat], dLoc)
  if (originSnapM > 150) notes.push(`Start point was ${Math.round(originSnapM)} m from the nearest drivable road; the route begins at the snapped road point.`)
  if (destinationSnapM > 150) notes.push(`Destination was ${Math.round(destinationSnapM)} m from the nearest drivable road; the route ends at the snapped road point.`)

  const all: RouteResult[] = data.routes.map((r, i) => ({
    id: `r${i + 1}`,
    coords: r.geometry.coordinates,
    distance: r.distance,
    duration: r.duration,
    weightName: r.weight_name,
    steps: r.legs.flatMap(l => l.steps).map<Step>(s => ({ instruction: describeStep(s), name: s.name || s.ref || '', distance: s.distance, duration: s.duration, maneuver: s.maneuver.type, modifier: s.maneuver.modifier })),
  }))

  // Drop alternatives that are (near-)duplicates of a route we already kept. Only removes; never adds routes.
  const kept: RouteResult[] = []
  let dropped = 0
  for (const r of all) {
    const dup = kept.some(k => overlapShare(r.coords, k.coords) >= CONFIG.duplicateOverlap && overlapShare(k.coords, r.coords) >= CONFIG.duplicateOverlap)
    if (dup) dropped++; else kept.push(r)
  }
  // Sanity check: geometry length should agree with the engine's reported distance.
  for (const r of kept) { const g = polylineLength(r.coords); if (Math.abs(g - r.distance) / Math.max(r.distance, 1) > 0.1) notes.push('A route’s geometry length differs from the engine’s reported distance by more than 10%.') }
  if (kept.length === 1) notes.push('The routing engine returned only one route for this journey; no genuine alternative is available.')
  const uniqueNotes = [...new Set(notes)]
  return { routes: kept, snapped: { origin: oLoc, destination: dLoc, originSnapM, destinationSnapM, originRoad: wp[0]?.name || '', destinationRoad: wp[1]?.name || '' }, droppedDuplicates: dropped, notes: uniqueNotes }
}
