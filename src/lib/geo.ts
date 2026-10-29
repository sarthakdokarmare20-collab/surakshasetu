import type { LngLat } from '../types'
const R = 6371008.8
const rad = (d: number) => (d * Math.PI) / 180

export function haversine(a: LngLat, b: LngLat): number {
  const dLat = rad(b[1] - a[1]), dLng = rad(b[0] - a[0])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Local equirectangular projection to metres around a reference latitude (accurate at city scale). */
function project(p: LngLat, lat0: number): [number, number] {
  return [rad(p[0]) * R * Math.cos(rad(lat0)), rad(p[1]) * R]
}

export function pointToSegment(p: LngLat, a: LngLat, b: LngLat): number {
  const lat0 = p[1]
  const [px, py] = project(p, lat0), [ax, ay] = project(a, lat0), [bx, by] = project(b, lat0)
  const dx = bx - ax, dy = by - ay
  const len2 = dx * dx + dy * dy
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

export function pointToPolyline(p: LngLat, line: LngLat[]): number {
  let best = Infinity
  for (let i = 0; i < line.length - 1; i++) { const d = pointToSegment(p, line[i], line[i + 1]); if (d < best) best = d }
  if (line.length === 1) best = haversine(p, line[0])
  return best
}

export function polylineLength(line: LngLat[]): number {
  let s = 0
  for (let i = 1; i < line.length; i++) s += haversine(line[i - 1], line[i])
  return s
}

/** Points placed every `step` metres along the polyline (including the first and last point). */
export function samplePolyline(line: LngLat[], step: number): LngLat[] {
  if (line.length === 0) return []
  const out: LngLat[] = [line[0]]
  let carry = 0
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i]
    const seg = haversine(a, b)
    if (seg === 0) continue
    let d = step - carry
    while (d <= seg) {
      const t = d / seg
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
      d += step
    }
    carry = seg - (d - step)
  }
  const last = line[line.length - 1]
  const lp = out[out.length - 1]
  if (lp[0] !== last[0] || lp[1] !== last[1]) out.push(last)
  return out
}

/** Douglas-Peucker simplification (tolerance in metres). */
export function simplify(line: LngLat[], tol: number): LngLat[] {
  if (line.length <= 2) return line
  const keep = new Array(line.length).fill(false)
  keep[0] = keep[line.length - 1] = true
  const stack: [number, number][] = [[0, line.length - 1]]
  while (stack.length) {
    const [s, e] = stack.pop()!
    let maxD = 0, idx = -1
    for (let i = s + 1; i < e; i++) { const d = pointToSegment(line[i], line[s], line[e]); if (d > maxD) { maxD = d; idx = i } }
    if (maxD > tol && idx > -1) { keep[idx] = true; stack.push([s, idx], [idx, e]) }
  }
  return line.filter((_, i) => keep[i])
}

export function bbox(lines: LngLat[][], padMeters: number): { south: number; west: number; north: number; east: number } {
  let s = 90, w = 180, n = -90, e = -180
  for (const l of lines) for (const [lng, lat] of l) { s = Math.min(s, lat); n = Math.max(n, lat); w = Math.min(w, lng); e = Math.max(e, lng) }
  const dLat = (padMeters / R) * (180 / Math.PI)
  const dLng = dLat / Math.cos(rad((s + n) / 2))
  return { south: s - dLat, north: n + dLat, west: w - dLng, east: e + dLng }
}

/** Share of `a`'s sampled points lying within `tol` metres of `b`. */
export function overlapShare(a: LngLat[], b: LngLat[], tol = 30): number {
  const pts = samplePolyline(a, 100)
  if (!pts.length) return 0
  let near = 0
  for (const p of pts) if (pointToPolyline(p, b) <= tol) near++
  return near / pts.length
}

export const fmtKm = (m: number) => (m < 950 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`)
export function fmtDur(s: number) {
  const m = Math.max(1, Math.round(s / 60))
  if (m < 60) return `${m} min`
  return `${Math.floor(m / 60)} h ${m % 60} min`
}

/** Nearest point on a polyline: perpendicular distance (m) and distance travelled along the line (m) to that point. */
export function positionAlong(p: LngLat, line: LngLat[]): { dist: number; along: number; point: LngLat } {
  let best = { dist: Infinity, along: 0, point: line[0] as LngLat }
  let cum = 0
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i], b = line[i + 1]
    const lat0 = p[1]
    const [px, py] = project(p, lat0), [ax, ay] = project(a, lat0), [bx, by] = project(b, lat0)
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2))
    const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
    const seg = haversine(a, b)
    if (d < best.dist) best = { dist: d, along: cum + seg * t, point: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] }
    cum += seg
  }
  return best
}

/**
 * Share of sampled points that lie close to an EARLIER, non-adjacent part of the same route (detects out-and-back spurs).
 * Compares each sample with the earlier *line* (not earlier samples), so differing sample phase cannot hide a spur.
 */
export function selfOverlapShare(line: LngLat[], tol = 25, minGapSamples = 8): number {
  const pts = samplePolyline(line, 100)
  let hits = 0
  for (let i = minGapSamples + 1; i < pts.length; i++) {
    if (pointToPolyline(pts[i], pts.slice(0, i - minGapSamples)) <= tol) hits++
  }
  return pts.length ? hits / pts.length : 0
}

/** Point `frac` of the way along the straight line a→b, pushed sideways by `offsetM` (positive = left of travel direction). */
export function offsetMidpoint(a: LngLat, b: LngLat, frac: number, offsetM: number): LngLat {
  const lat0 = (a[1] + b[1]) / 2
  const [ax, ay] = project(a, lat0), [bx, by] = project(b, lat0)
  const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1
  const mx = ax + dx * frac + (-dy / len) * offsetM, my = ay + dy * frac + (dx / len) * offsetM
  return [(mx / (R * Math.cos(rad(lat0)))) * (180 / Math.PI), (my / R) * (180 / Math.PI)]
}
