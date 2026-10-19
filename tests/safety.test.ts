import { describe, it, expect } from 'vitest'
import { analyzeRoute, recommend } from '../src/services/safety'
import { samplePolyline, polylineLength, pointToPolyline, overlapShare, simplify } from '../src/lib/geo'
import { describeStep } from '../src/services/routing'
import type { Facility, RouteResult } from '../src/types'

// SYNTHETIC test geometry on an arbitrary grid near 0°,0°. It is NOT Nagpur data and never ships in the app.
const route = (id: string, coords: [number, number][], dur: number): RouteResult => ({ id, coords, distance: polylineLength(coords), duration: dur, steps: [] })
const fac = (id: string, kind: Facility['kind'], lng: number, lat: number, name: string | null = 'X'): Facility => ({ id, kind, lat, lng, name, tier: name ? 'basic' : 'incomplete', osmUrl: '', tags: {} })

describe('geo helpers', () => {
  const line: [number, number][] = [[0, 0], [0.01, 0]]
  it('samples every ~100 m', () => { const s = samplePolyline(line, 100); expect(s.length).toBeGreaterThan(10); expect(s[0]).toEqual([0, 0]); expect(s.at(-1)).toEqual([0.01, 0]) })
  it('point-to-polyline distance', () => { expect(pointToPolyline([0.005, 0.001], line)).toBeGreaterThan(100); expect(pointToPolyline([0.005, 0.001], line)).toBeLessThan(120) })
  it('overlap', () => { expect(overlapShare(line, line)).toBe(1); expect(overlapShare(line, [[0, 0.01], [0.01, 0.01]])).toBe(0) })
  it('simplify keeps endpoints', () => { const s = simplify([[0, 0], [0.005, 0.00001], [0.01, 0]], 20); expect(s.length).toBe(2) })
})

describe('step text', () => {
  it('describes turns', () => { expect(describeStep({ distance: 1, duration: 1, name: 'Wardha Road', maneuver: { type: 'turn', modifier: 'left' } })).toBe('Turn left onto Wardha Road') })
})

describe('safety analysis', () => {
  const near = route('r1', [[0, 0], [0.02, 0]], 600)
  const far = route('r2', [[0, 0.05], [0.02, 0.05]], 700)
  const facs = [fac('p1', 'police', 0.01, 0.002), fac('h1', 'hospital', 0.01, -0.003)]

  it('never invents crime or CCTV', () => {
    const a = analyzeRoute({ route: near, facilities: facs, facilitiesLoaded: true, roadEnv: null })
    expect(a.factors.find(f => f.key === 'crime')!.status).toBe('unavailable')
    expect(a.factors.find(f => f.key === 'cctv')!.headline).toBe('CCTV coverage data unavailable')
    expect(a.confidence).toBeLessThanOrEqual(50)
  })
  it('scores closer routes higher', () => {
    const a = analyzeRoute({ route: near, facilities: facs, facilitiesLoaded: true, roadEnv: null })
    const b = analyzeRoute({ route: far, facilities: facs, facilitiesLoaded: true, roadEnv: null })
    expect(a.index!).toBeGreaterThan(b.index!)
  })
  it('is insufficient when facility data fails to load', () => {
    const a = analyzeRoute({ route: near, facilities: [], facilitiesLoaded: false, roadEnv: null })
    expect(a.index).toBeNull(); expect(a.insufficient).toBe(true)
  })
  it('ignores unnamed facilities for scoring', () => {
    const a = analyzeRoute({ route: near, facilities: [fac('p1', 'police', 0.01, 0.0001, null), fac('h1', 'hospital', 0.01, 0.0001)], facilitiesLoaded: true, roadEnv: null })
    expect(a.factors[0].status).toBe('unavailable')
    expect(a.nearbyPolice.length).toBe(1)
  })
  it('does not auto-prefer longer routes', () => {
    const an = [analyzeRoute({ route: near, facilities: facs, facilitiesLoaded: true, roadEnv: null }), analyzeRoute({ route: far, facilities: facs, facilitiesLoaded: true, roadEnv: null })]
    const r = recommend([near, far], an)
    expect(r.fastestId).toBe('r1'); expect(r.evidenceId).toBe('r1')
  })
  it('says inconclusive when gap is small', () => {
    const t1 = route('a', [[0, 0], [0.02, 0]], 600), t2 = route('b', [[0, 0.0005], [0.02, 0.0005]], 800)
    const an = [t1, t2].map(r => analyzeRoute({ route: r, facilities: facs, facilitiesLoaded: true, roadEnv: null }))
    expect(recommend([t1, t2], an).verdict).toBe('inconclusive')
  })
  it('handles a single route', () => { expect(recommend([near], [analyzeRoute({ route: near, facilities: facs, facilitiesLoaded: true, roadEnv: null })]).verdict).toBe('single-route') })
})
