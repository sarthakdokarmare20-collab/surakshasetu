import { CONFIG } from '../config'
import { CRIME_SOURCES } from '../data/sources'
import { fmtKm, haversine, pointToPolyline, samplePolyline } from '../lib/geo'
import type { Facility, FactorResult, LngLat, Recommendation, RoadEnv, RouteAnalysis, RouteResult } from '../types'

type Cfg = typeof CONFIG.safety
const clamp01 = (x: number) => Math.max(0, Math.min(1, x))
const round = (x: number) => Math.round(x)

export interface AnalysisInput { route: RouteResult; facilities: Facility[]; facilitiesLoaded: boolean; roadEnv: RoadEnv | null; roadPending?: boolean }

function nearestDist(p: LngLat, list: Facility[]): number {
  let best = Infinity
  for (const f of list) { const d = haversine(p, [f.lng, f.lat]); if (d < best) best = d }
  return best
}

function proximityFactor(key: 'police' | 'hospital', label: string, samples: LngLat[], all: Facility[], loaded: boolean, zeroAt: number, cfg: Cfg): { f: FactorResult; maxGap: number | null } {
  const noun = key === 'police' ? 'police stations' : 'hospitals'
  const scoring = all.filter(f => f.tier !== 'incomplete') // unnamed OSM entries are shown but not scored
  const source = 'OpenStreetMap via Overpass API (crowd-sourced; © OpenStreetMap contributors, ODbL)'
  const limitation = `Straight-line distance, not travel time. Depends on OSM completeness; says nothing about staffing, opening hours or response times. Proximity does not guarantee assistance.`
  if (!loaded) return { f: { key, label, status: 'unavailable', score: null, weight: cfg.weights[key], headline: 'Data could not be loaded', detail: ['The map-data service (Overpass) was unreachable, so facilities could not be assessed.'], source, limitation }, maxGap: null }
  if (!scoring.length) return { f: { key, label, status: 'unavailable', score: null, weight: cfg.weights[key], headline: `No named ${noun} mapped in the search area`, detail: ['This reflects what is mapped in OSM, not proof that none exist.'], source, limitation }, maxGap: null }
  const ds = samples.map(p => nearestDist(p, scoring))
  const mean = ds.reduce((a, b) => a + b, 0) / ds.length
  const max = Math.max(...ds)
  const score = round(100 * (1 - clamp01(mean / zeroAt)))
  return {
    maxGap: max,
    f: { key, label, status: 'scored', score, weight: cfg.weights[key], headline: `Average ${fmtKm(mean)} to nearest mapped ${key === 'police' ? 'station' : 'hospital'}; farthest point ${fmtKm(max)}`,
      detail: [`Score = 100 × (1 − mean distance ÷ ${fmtKm(zeroAt)}), sampled every ${CONFIG.safety.sampleEveryMeters} m along the route.`, `${scoring.length} named ${noun} considered; ${all.length - scoring.length} unnamed entries shown on the map but not scored.`], source, limitation },
  }
}

export function analyzeRoute(input: AnalysisInput, cfg: Cfg = CONFIG.safety): RouteAnalysis {
  const { route, facilities, facilitiesLoaded, roadEnv, roadPending } = input
  const samples = samplePolyline(route.coords, cfg.sampleEveryMeters)
  const police = facilities.filter(f => f.kind === 'police')
  const hosp = facilities.filter(f => f.kind === 'hospital')
  const cctv = facilities.filter(f => f.kind === 'cctv')

  const withDist = (list: Facility[], max: number) => list.map(f => ({ ...f, distToRoute: pointToPolyline([f.lng, f.lat], route.coords) })).filter(f => f.distToRoute <= max).sort((a, b) => a.distToRoute - b.distToRoute)
  const nearbyPolice = withDist(police, cfg.corridorMeters)
  const nearbyHospitals = withDist(hosp, cfg.corridorMeters)
  const nearbyCctv = withDist(cctv, 100)

  const p = proximityFactor('police', 'Police stations', samples, police, facilitiesLoaded, cfg.policeZeroAtMeters, cfg)
  const h = proximityFactor('hospital', 'Hospitals & emergency facilities', samples, hosp, facilitiesLoaded, cfg.hospitalZeroAtMeters, cfg)
  const hospDoc = hosp.filter(x => x.tier === 'well-documented').length
  if (h.f.status === 'scored') h.f.detail.push(`${hospDoc} of ${hosp.length} mapped hospitals have extra detail tags (phone, website, hours, operator, address…); none are verified as open or operational.`)

  // CCTV
  const cctvSource = 'OpenStreetMap man_made=surveillance (crowd-sourced; mapped ≠ operational)'
  let cctvF: FactorResult
  if (!facilitiesLoaded || cctv.length === 0) {
    cctvF = { key: 'cctv', label: 'CCTV coverage', status: 'unavailable', score: null, weight: cfg.weights.cctv, headline: 'CCTV coverage data unavailable', detail: [facilitiesLoaded ? 'No surveillance cameras are mapped in OSM in this area. No public dataset of operational CCTV coverage was found. Absence of data does not mean absence of cameras.' : 'Map-data service unreachable.'], source: cctvSource, limitation: 'No official, public, machine-readable CCTV register for Nagpur has been integrated.' }
  } else {
    const perKm = nearbyCctv.length / Math.max(route.distance / 1000, 0.1)
    const scored = cfg.weights.cctv > 0
    cctvF = { key: 'cctv', label: 'CCTV coverage', status: scored ? 'scored' : 'informational', score: scored ? round(100 * clamp01(perKm / 3)) : null, weight: cfg.weights.cctv,
      headline: `${nearbyCctv.length} camera location(s) mapped within 100 m of this route`, detail: ['Mapped camera locations are volunteer-contributed and not confirmed to be operational. They are NOT coverage percentages.', `Excluded from the index by default (weight ${cfg.weights.cctv}) because OSM camera mapping is patchy.`], source: cctvSource, limitation: 'Cannot show which roads have no cameras.' }
  }

  // Crime
  const crimeF: FactorResult = { key: 'crime', label: 'Historical crime', status: 'unavailable', score: null, weight: cfg.weights.crime, headline: 'Insufficient verified data',
    detail: ['Reviewed sources publish city / police-station-level totals only, with no open licence or street-level locations. Converting them into route-level predictions would be misleading, so none are used.', ...CRIME_SOURCES.map(s => `${s.publisher}: ${s.name}. ${s.coverage}. Checked ${s.checked}.`)],
    source: 'NCRB; Nagpur City Police dashboard; data.gov.in (see Methodology)', limitation: 'Missing data is treated as unknown, not as evidence that the route is safe or unsafe.' }

  // Road environment
  const roadSource = 'OpenStreetMap highway / lit / sidewalk tags via Overpass API'
  let roadF: FactorResult
  if (!roadEnv || roadEnv.ways === 0) {
    roadF = { key: 'roadEnvironment', label: 'Road environment', status: 'unavailable', score: null, weight: cfg.weights.roadEnvironment, headline: roadPending ? 'Loading road-environment data…' : roadEnv ? 'No drivable OSM ways matched this route' : 'Road-environment data unavailable (service did not respond)', detail: [], source: roadSource, limitation: 'Lighting, footpaths and surface condition are not verified.' }
  } else {
    const known = roadEnv.litYes + roadEnv.litNo
    const share = known / roadEnv.ways
    const classes = Object.entries(roadEnv.byClass).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${v} ${k}`).join(', ')
    const useLit = share >= cfg.minLitTagShare
    const scored = useLit && cfg.weights.roadEnvironment > 0
    roadF = { key: 'roadEnvironment', label: 'Road environment', status: scored ? 'scored' : 'informational', score: scored ? round(100 * roadEnv.litYes / known) : null, weight: cfg.weights.roadEnvironment,
      headline: useLit ? `Street lighting mapped for ${known} of ${roadEnv.ways} road segments (${roadEnv.litYes} lit)` : `Lighting not documented: only ${known} of ${roadEnv.ways} road segments carry a lit tag`,
      detail: [`Road classes along the route: ${classes}.`, `${roadEnv.sidewalkTagged} segment(s) have a sidewalk tag.`, roadEnv.sourceNote, 'Counts are of OSM ways, not weighted by length. Not used in the index by default (weight 0).'], source: roadSource, limitation: 'Untagged ≠ unlit. Lighting, footpaths, pedestrian activity and road condition are NOT verified.' }
  }

  const factors = [p.f, h.f, cctvF, crimeF, roadF]
  const scoredF = factors.filter(f => f.status === 'scored' && f.weight > 0)
  const wsum = scoredF.reduce((a, f) => a + f.weight, 0)
  const index = scoredF.length >= 2 && wsum > 0 ? round(scoredF.reduce((a, f) => a + f.score! * f.weight, 0) / wsum) : null

  // Confidence: each of the 5 evidence types contributes up to 1 point. Crowd-sourced (OSM-only) evidence counts 0.5,
  // official/verified evidence would count 1. So an OSM-only analysis can never exceed 50%.
  const credit = (f: FactorResult, officialCredit: number) => (f.status === 'unavailable' ? 0 : officialCredit)
  const confidence = round((credit(p.f, 0.5) + credit(h.f, 0.5) + credit(cctvF, 0.5) + credit(crimeF, 1) + credit(roadF, 0.5)) / 5 * 100)
  const confidenceLabel = confidence < 40 ? 'Low' : confidence < 70 ? 'Moderate' : 'High'

  const gaps: string[] = []
  if (p.maxGap != null && p.maxGap > cfg.gapCautionMeters) gaps.push(`police station ${fmtKm(p.maxGap)}`)
  if (h.maxGap != null && h.maxGap > cfg.gapCautionMeters) gaps.push(`hospital ${fmtKm(h.maxGap)}`)
  const caution = gaps.length ? `At its most remote point this route is ${gaps.join(' and ')} from the nearest mapped facility. OSM may be incomplete.` : null

  return { routeId: route.id, factors, index, confidence, confidenceLabel, insufficient: index === null, nearbyPolice, nearbyHospitals, nearbyCctv, maxGapPolice: p.maxGap, maxGapHospital: h.maxGap, caution }
}

export function recommend(routes: RouteResult[], analyses: RouteAnalysis[], cfg: Cfg = CONFIG.safety): Recommendation {
  const fastest = routes.reduce((a, b) => (b.duration < a.duration ? b : a))
  const shortest = routes.reduce((a, b) => (b.distance < a.distance ? b : a))
  const base = { fastestId: fastest.id, shortestId: shortest.id }
  if (routes.length === 1) return { ...base, evidenceId: null, verdict: 'single-route', text: 'The routing engine returned a single route, so there is nothing to compare. Review its safety evidence below.' }
  const idx = (id: string) => analyses.find(a => a.routeId === id)?.index ?? null
  const scored = routes.filter(r => idx(r.id) !== null)
  if (scored.length < routes.length) return { ...base, evidenceId: null, verdict: 'insufficient', text: 'Insufficient data for a reliable safety comparison: not every route has enough usable evidence.' }
  const best = scored.reduce((a, b) => (idx(b.id)! > idx(a.id)! || (idx(b.id)! === idx(a.id)! && b.duration < a.duration) ? b : a))
  const fi = idx(fastest.id)!
  if (best.id === fastest.id) {
    const second = Math.max(...scored.filter(r => r.id !== fastest.id).map(r => idx(r.id)!))
    return fi - second >= cfg.minIndexAdvantage
      ? { ...base, evidenceId: fastest.id, verdict: 'evidence-led', text: `The fastest route also has the strongest emergency-access evidence (index ${fi} vs ${second}). No detour is needed on this evidence.` }
      : { ...base, evidenceId: null, verdict: 'inconclusive', text: `The fastest route scores ${fi}, with the best alternative at ${second}. That gap is under ${cfg.minIndexAdvantage} points, so the available evidence cannot separate these routes.` }
  }
  const extraMin = (best.duration - fastest.duration) / 60
  const extraFrac = (best.duration - fastest.duration) / fastest.duration
  const bi = idx(best.id)!
  if (bi - fi >= cfg.minIndexAdvantage && extraMin <= cfg.maxExtraMinutes && extraFrac <= cfg.maxExtraFraction)
    return { ...base, evidenceId: best.id, verdict: 'evidence-led', text: `Evidence-led option: emergency-access index ${bi} vs ${fi} for the fastest route, for about ${Math.max(1, Math.round(extraMin))} extra minute(s). This reflects mapped police/hospital proximity only. Crime and CCTV are not verified.` }
  const why = bi - fi < cfg.minIndexAdvantage ? `the index gap (${bi} vs ${fi}) is under ${cfg.minIndexAdvantage} points` : `the detour costs ${Math.round(extraMin)} extra minutes (limit ${cfg.maxExtraMinutes} min / ${Math.round(cfg.maxExtraFraction * 100)}%)`
  return { ...base, evidenceId: null, verdict: 'inconclusive', text: `The available evidence cannot establish that any route is safer: ${why}. Compare the details for each route below.` }
}
