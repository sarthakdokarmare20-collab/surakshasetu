// SAMPLE / DEMONSTRATION DATA GENERATOR
// ------------------------------------------------------------------------------------------------
// Real, openly licensed CCTV-installation and route-level crime data for Nagpur is not available.
// For presentations, this module generates PLACEHOLDER camera points and crime records along a route.
//  * Everything returned here is flagged `sample: true` and is labelled "SAMPLE" wherever it is displayed.
//  * It is deterministic (same route -> same output) and is NEVER used in the index, confidence or recommendation.
//  * Do not present these values as real. Replace with verified data when a licensed source is obtained.
import { samplePolyline } from '../lib/geo'
import type { Facility, RouteResult, SampleCrime } from '../types'

function rng(seed: number) { // mulberry32
  let a = seed >>> 0
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
const seedOf = (r: RouteResult) => Math.round(r.distance * 7 + r.duration * 13 + r.coords.length)

export function sampleCctv(route: RouteResult): Facility[] {
  const rand = rng(seedOf(route))
  const pts = samplePolyline(route.coords, 50)
  const out: Facility[] = []
  let d = 400 + rand() * 300 // metres along the route
  let n = 1
  while (d < route.distance - 200) {
    const p = pts[Math.min(pts.length - 1, Math.round(d / 50))]
    const dLng = (rand() - 0.5) * 0.00018, dLat = (rand() - 0.5) * 0.00018 // ~10 m sideways
    out.push({ sample: true, id: `sample-cctv-${n}`, kind: 'cctv', lat: p[1] + dLat, lng: p[0] + dLng, name: `Sample camera S-${String(n).padStart(2, '0')}`, tier: 'basic', osmUrl: '', tags: { sample: 'yes' } })
    d += 650 + rand() * 900
    n++
  }
  return out
}

const CATS = ['Mobile / chain snatching', 'Vehicle theft', 'Road accident (injury)', 'Harassment complaint', 'Pickpocketing']
export function sampleCrime(route: RouteResult): SampleCrime[] {
  const rand = rng(seedOf(route) + 99)
  const pts = samplePolyline(route.coords, 50)
  const count = Math.max(3, Math.min(7, Math.round(route.distance / 3000)))
  const out: SampleCrime[] = []
  for (let i = 0; i < count; i++) {
    const along = (0.08 + (i + rand() * 0.6) / count * 0.86) * route.distance
    const p = pts[Math.min(pts.length - 1, Math.round(along / 50))]
    out.push({ id: `sample-crime-${i + 1}`, sample: true, category: CATS[Math.floor(rand() * CATS.length)], period: ['2022', '2023', '2024'][Math.floor(rand() * 3)], lat: p[1], lng: p[0], alongM: along, note: `Sample record ${i + 1}: illustrative only` })
  }
  return out.sort((a, b) => a.alongM - b.alongM)
}
