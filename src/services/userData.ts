import type { Facility } from '../types'

// OPTIONAL real data supplied by YOU (e.g. from a field survey, an RTI reply or police data you are permitted to use).
// Put files in  public/data/cctv.json  and  public/data/crime.json  (formats in public/data/README.md).
// When present they are shown in the report as real, with the `source` you give. When absent, nothing happens.
export interface UserCctv { lat: number; lng: number; name?: string; source?: string }
export interface UserCrime { lat: number; lng: number; category: string; period?: string; source?: string }
export interface UserData { cctv: Facility[]; cctvSource: string; crime: UserCrime[]; crimeSource: string }

async function loadArray<T>(file: string): Promise<T[]> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data/${file}`, { cache: 'no-cache' })
    if (!res.ok) return []
    const j = await res.json() // dev servers answer 404s with index.html; that fails to parse and is ignored
    return Array.isArray(j) ? (j as T[]).filter(r => Number.isFinite((r as { lat: number }).lat) && Number.isFinite((r as { lng: number }).lng)) : []
  } catch { return [] }
}

export async function loadUserData(): Promise<UserData> {
  const [cctv, crime] = await Promise.all([loadArray<UserCctv>('cctv.json'), loadArray<UserCrime>('crime.json')])
  const src = (rows: { source?: string }[], fallback: string) => [...new Set(rows.map(r => r.source).filter(Boolean))].join('; ') || fallback
  return {
    cctv: cctv.map((c, i) => ({ id: `user-cctv-${i + 1}`, kind: 'cctv' as const, lat: c.lat, lng: c.lng, name: c.name || `Camera ${i + 1}`, tier: 'basic' as const, osmUrl: '', tags: {} })),
    cctvSource: src(cctv, 'user-supplied file'),
    crime, crimeSource: src(crime, 'user-supplied file'),
  }
}
