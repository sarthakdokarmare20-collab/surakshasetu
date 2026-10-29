import { positionAlong } from '../lib/geo'
import { sampleCctv, sampleCrime } from './sample'
import type { CrimeRow, NearFacility, RouteAnalysis, RouteResult } from '../types'
import type { UserData } from './userData'

export type CctvOrigin = 'osm' | 'user' | 'demo'
export interface CctvRow extends NearFacility { origin: CctvOrigin }
export interface ReportData { cctv: CctvRow[]; cctvOrigins: CctvOrigin[]; crime: CrimeRow[]; crimeOrigin: 'user' | 'demo' | 'none' }

/**
 * Real data first (OSM-mapped cameras, user-supplied files). Demo placeholders are generated ONLY when demo mode is on
 * and no real data exists for that category, and every row carries origin 'demo'.
 */
export function buildReportData(route: RouteResult, analysis: RouteAnalysis | undefined, user: UserData | null, demo: boolean): ReportData {
  const near = (p: { lat: number; lng: number }, max: number) => { const x = positionAlong([p.lng, p.lat], route.coords); return x.dist <= max ? x : null }
  const cctv: CctvRow[] = (analysis?.nearbyCctv ?? []).map(f => ({ ...f, origin: 'osm' as const }))
  for (const c of user?.cctv ?? []) { const x = near(c, 100); if (x) cctv.push({ ...c, distToRoute: x.dist, alongM: x.along, origin: 'user' }) }
  if (!cctv.length && demo) for (const c of sampleCctv(route)) { const x = positionAlong([c.lng, c.lat], route.coords); cctv.push({ ...c, distToRoute: x.dist, alongM: x.along, origin: 'demo' }) }
  cctv.sort((a, b) => a.alongM - b.alongM)

  const crime: CrimeRow[] = []
  for (const [i, c] of (user?.crime ?? []).entries()) { const x = near(c, 300); if (x) crime.push({ id: `user-crime-${i}`, lat: c.lat, lng: c.lng, category: c.category, period: c.period || 'n/a', alongM: x.along, origin: 'user', source: c.source || user!.crimeSource }) }
  let crimeOrigin: ReportData['crimeOrigin'] = crime.length || (user?.crime.length ?? 0) ? 'user' : 'none'
  if (!crime.length && demo && !(user?.crime.length)) { for (const s of sampleCrime(route)) crime.push({ id: s.id, lat: s.lat, lng: s.lng, category: s.category, period: s.period, alongM: s.alongM, origin: 'demo', source: 'Demo placeholder', note: s.note }); crimeOrigin = 'demo' }
  crime.sort((a, b) => a.alongM - b.alongM)
  return { cctv, cctvOrigins: [...new Set(cctv.map(c => c.origin))], crime, crimeOrigin }
}
