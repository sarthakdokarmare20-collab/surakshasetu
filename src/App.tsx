import { useCallback, useMemo, useRef, useState } from 'react'
import type L from 'leaflet'
import { AlertTriangle, ArrowDownUp, BookOpen, ChevronDown, ChevronUp, Layers, Loader2, Phone, ShieldAlert, Siren, Users } from 'lucide-react'
import MapView, { type ShownFacility } from './components/MapView'
import PlaceInput from './components/PlaceInput'
import { Directions, SafetyDetail, delta } from './components/RouteDetails'
import Methodology from './components/Methodology'
import { CommunityModal, ReportModal, SosModal } from './components/Community'
import { Logo } from './components/Icons'
import { CONFIG } from './config'
import { bbox, fmtDur, fmtKm } from './lib/geo'
import { reverseGeocode, searchPlaces, SCENARIOS } from './services/geocode'
import { fetchRoutes, type RoutingOutcome } from './services/routing'
import { fetchFacilities, fetchRoadEnv } from './services/overpass'
import { analyzeRoute, recommend } from './services/safety'
import type { DataStatus, Facility, Place, Recommendation, RoadEnv, RouteAnalysis } from './types'
import type { Report, Sess } from './data/community'

const SEED: Report[] = []
type Layers = { police: boolean; hospital: boolean; cctv: boolean }

export default function App() {
  const [origin, setOrigin] = useState<Place | null>(null)
  const [dest, setDest] = useState<Place | null>(null)
  const [picking, setPicking] = useState<'origin' | 'dest' | null>(null)
  const [outcome, setOutcome] = useState<RoutingOutcome | null>(null)
  const [routeStatus, setRouteStatus] = useState<DataStatus>({ state: 'idle' })
  const [analyses, setAnalyses] = useState<Record<string, RouteAnalysis>>({})
  const [analysisStatus, setAnalysisStatus] = useState<DataStatus>({ state: 'idle' })
  const [roadStatus, setRoadStatus] = useState<DataStatus>({ state: 'idle' })
  const [rec, setRec] = useState<Recommendation | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [tab, setTab] = useState<'safety' | 'directions'>('safety')
  const [fitKey, setFitKey] = useState(0)
  const [layers, setLayers] = useState<Layers>({ police: true, hospital: true, cctv: false })
  const [layerMenu, setLayerMenu] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [areaFacilities, setAreaFacilities] = useState<Facility[]>([])
  const [areaStatus, setAreaStatus] = useState<DataStatus>({ state: 'idle' })
  const [scenario, setScenario] = useState<string | null>(null)
  const [resolving, setResolving] = useState(false)
  const [modal, setModal] = useState<null | 'method' | 'community' | 'sos' | 'report'>(null)
  const [sess, setSess] = useState<Sess | null>(null)
  const [reports, setReports] = useState<Report[]>(SEED)
  const [toast, setToast] = useState('')
  const mapRef = useRef<L.Map | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const facsRef = useRef<Facility[]>([])

  const say = useCallback((m: string) => { setToast(m); setTimeout(() => setToast(''), 3000) }, [])
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 760
  const insets = { left: isMobile ? 0 : 420, bottom: isMobile ? Math.round(window.innerHeight * 0.5) : 0 }

  const publish = useCallback((out: RoutingOutcome, facilities: Facility[], loaded: boolean, envs: Record<string, RoadEnv | null>, roadPending: boolean) => {
    const list = out.routes.map(route => analyzeRoute({ route, facilities, facilitiesLoaded: loaded, roadEnv: envs[route.id] ?? null, roadPending: roadPending && !(route.id in envs) }))
    setAnalyses(Object.fromEntries(list.map(a => [a.routeId, a])))
    setRec(recommend(out.routes, list))
  }, [])

  /**
   * Two stages, so the UI never waits on optional data:
   * 1) facilities (police/hospital/CCTV): required for the index; result is published as soon as it arrives or fails.
   * 2) road environment: optional extra detail, loaded in the background and merged in when ready.
   * Every path ends in a final state (ok / error); the loading flags are cleared in `finally`.
   */
  const runAnalysis = useCallback(async (out: RoutingOutcome, signal: AbortSignal) => {
    setAnalysisStatus({ state: 'loading' }); setRoadStatus({ state: 'idle' })
    let facilities: Facility[] = []; let loaded = false
    try {
      try {
        const r = await fetchFacilities(bbox(out.routes.map(x => x.coords), 4000), signal)
        facilities = r.facilities; loaded = true
      } catch (e) {
        if (signal.aborted) return
        setAnalysisStatus({ state: 'error', message: 'Police, hospital and CCTV data could not be loaded: ' + (e as Error).message })
      }
      if (signal.aborted) return
      facsRef.current = facilities
      publish(out, facilities, loaded, {}, true)
      if (loaded) setAnalysisStatus({ state: 'ok' })
      if (!loaded) return // Overpass is unreachable; don't queue more slow requests

      setRoadStatus({ state: 'loading' })
      const envs: Record<string, RoadEnv | null> = {}
      let failed = ''
      for (const r of out.routes) { // sequential: polite to the public Overpass servers
        try { envs[r.id] = await fetchRoadEnv(r.coords, signal) } catch (e) { if (signal.aborted) return; envs[r.id] = null; failed = (e as Error).message }
        if (signal.aborted) return
        publish(out, facilities, loaded, envs, true)
      }
      setRoadStatus(failed ? { state: 'error', message: 'Road-environment details unavailable: ' + failed } : { state: 'ok' })
    } catch (e) {
      if (signal.aborted) return
      setAnalysisStatus({ state: 'error', message: 'Safety analysis failed: ' + (e as Error).message })
      setRoadStatus({ state: 'idle' })
      publish(out, facilities, loaded, {}, false)
    } finally {
      // Guarantee the spinner is never left on for this run.
      if (!signal.aborted) setAnalysisStatus(st => (st.state === 'loading' ? { state: loaded ? 'ok' : 'error', message: loaded ? undefined : 'Safety data did not finish loading.' } : st))
      if (!signal.aborted) setRoadStatus(st => (st.state === 'loading' ? { state: 'error', message: 'Road-environment details did not finish loading.' } : st))
    }
  }, [publish])

  const plan = useCallback(async (o: Place, d: Place) => {
    abortRef.current?.abort()
    const ac = new AbortController(); abortRef.current = ac
    setRouteStatus({ state: 'loading' }); setOutcome(null); setAnalyses({}); setRec(null); setSelectedId(null); setAnalysisStatus({ state: 'idle' }); setRoadStatus({ state: 'idle' }); setCollapsed(false)
    try {
      const out = await fetchRoutes(o, d, ac.signal)
      if (ac.signal.aborted) return
      const fastest = out.routes.reduce((a, b) => (b.duration < a.duration ? b : a))
      setOutcome(out); setSelectedId(fastest.id); setRouteStatus({ state: 'ok' }); setFitKey(k => k + 1)
      void runAnalysis(out, ac.signal)
    } catch (e) { if (ac.signal.aborted) return; setRouteStatus({ state: 'error', message: (e as Error).message }) }
  }, [runAnalysis])

  const runScenario = async (id: string) => {
    const s = SCENARIOS.find(x => x.id === id)!
    setScenario(id); setResolving(true); setPicking(null); setRouteStatus({ state: 'idle' })
    try {
      const [a, b] = [(await searchPlaces(s.from, { locality: true }))[0], (await searchPlaces(s.to, { locality: true }))[0]]
      if (!a || !b) { setRouteStatus({ state: 'error', message: `Could not locate ${!a ? s.from : s.to} with the geocoder.` }); return }
      setOrigin(a); setDest(b); void plan(a, b)
    } catch (e) { setRouteStatus({ state: 'error', message: (e as Error).message }) } finally { setResolving(false) }
  }

  const relocate = (which: 'origin' | 'dest', lat: number, lng: number) => {
    const temp: Place = { label: 'Resolving address…', shortLabel: 'Resolving address…', lat, lng, source: 'map-click' }
    if (which === 'origin') setOrigin(temp); else setDest(temp)
    void reverseGeocode(lat, lng).then(p => {
      if (which === 'origin') setOrigin(p); else setDest(p)
      const o = which === 'origin' ? p : origin, d = which === 'dest' ? p : dest
      if (o && d) { setScenario(null); void plan(o, d) }
    })
  }
  const onPick = (lat: number, lng: number) => { const w = picking; setPicking(null); if (w) relocate(w, lat, lng) }
  const onDrag = relocate
  const swap = () => { setOrigin(dest); setDest(origin); if (origin && dest) { setScenario(null); void plan(dest, origin) } }

  const nearbyEmergency = async () => {
    const m = mapRef.current; if (!m) return
    const c = m.getCenter()
    setAreaStatus({ state: 'loading' })
    try {
      const b = bbox([[[c.lng, c.lat]]], 2500)
      const r = await fetchFacilities(b)
      const f = r.facilities.filter(x => x.kind !== 'cctv')
      setAreaFacilities(f); setLayers(l => ({ ...l, police: true, hospital: true })); setAreaStatus({ state: 'ok' })
      say(f.length ? `${f.length} mapped police stations / hospitals within ~2.5 km of the map centre (OpenStreetMap)` : 'None mapped within ~2.5 km. OSM may be incomplete.')
    } catch (e) { setAreaStatus({ state: 'error', message: (e as Error).message }); say((e as Error).message) }
  }

  const selected = outcome?.routes.find(r => r.id === selectedId) ?? null
  const fastest = outcome?.routes.find(r => r.id === rec?.fastestId) ?? outcome?.routes.reduce((a, b) => (b.duration < a.duration ? b : a))
  const hasAnalysis = Object.keys(analyses).length > 0
  const analysisState: 'idle' | 'loading' | 'ok' | 'error' = hasAnalysis ? 'ok' : analysisStatus.state === 'error' ? 'error' : outcome ? 'loading' : 'idle'

  const shown: ShownFacility[] = useMemo(() => {
    const map = new Map<string, ShownFacility>()
    const a = selectedId ? analyses[selectedId] : undefined
    if (a) { for (const f of [...a.nearbyPolice, ...a.nearbyHospitals, ...a.nearbyCctv]) map.set(f.kind + f.id, f) }
    for (const f of areaFacilities) if (!map.has(f.kind + f.id)) map.set(f.kind + f.id, f)
    return [...map.values()].filter(f => layers[f.kind])
  }, [analyses, selectedId, areaFacilities, layers])

  const badges = (id: string) => {
    const b: string[] = []
    if (rec?.fastestId === id) b.push('Fastest')
    if (rec?.shortestId === id && rec.shortestId !== rec.fastestId) b.push('Shortest')
    else if (rec?.shortestId === id && outcome && outcome.routes.length > 1) b.push('Shortest')
    if (rec?.evidenceId === id && rec.verdict === 'evidence-led') b.push('Strongest evidence')
    return b
  }

  const hasRoutes = !!outcome
  return <div className="app">
    <MapView routes={outcome?.routes ?? []} analyses={analyses} selectedId={selectedId} onSelect={id => { setSelectedId(id); setCollapsed(false) }}
      origin={outcome ? { lat: outcome.snapped.origin[1], lng: outcome.snapped.origin[0] } : origin} destination={outcome ? { lat: outcome.snapped.destination[1], lng: outcome.snapped.destination[0] } : dest}
      onDragEnd={onDrag} picking={picking} onPick={onPick} facilities={shown} fitKey={fitKey} insets={insets} onReady={m => { mapRef.current = m }} />

    <aside className={'panel' + (collapsed ? ' collapsed' : '')} aria-label="Route planner">
      <header className="panel-head">
        <div className="brand"><Logo /><div><b>SurakshaSetu</b><span>Safer navigation · Nagpur</span></div></div>
        <div className="head-actions">
          <button className="icon-btn" onClick={() => setModal('method')} aria-label="Methodology" title="How routes are compared"><BookOpen size={18} /></button>
          <button className="icon-btn" onClick={() => setModal('community')} aria-label="Community" title="Community (simulated)"><Users size={18} /></button>
          <button className="icon-btn mobile-only" onClick={() => setCollapsed(c => !c)} aria-label={collapsed ? 'Expand panel' : 'Collapse panel'}>{collapsed ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</button>
        </div>
      </header>
      {collapsed && <button className="peek" onClick={() => setCollapsed(false)}>{origin && dest ? `${origin.shortLabel} → ${dest.shortLabel}` : 'Plan a route'}{selected ? ` · ${fmtDur(selected.duration)}` : ''}</button>}

      <div className="panel-body">
        <section className="planner">
          <div className="planner-inputs">
            <PlaceInput label="Start" badge="A" place={origin} onChange={p => { setOrigin(p); setScenario(null); if (dest) void plan(p, dest) }} picking={picking === 'origin'} onPickToggle={() => setPicking(picking === 'origin' ? null : 'origin')} />
            <button className="icon-btn swap" onClick={swap} aria-label="Swap start and destination" disabled={!origin && !dest}><ArrowDownUp size={16} /></button>
            <PlaceInput label="Destination" badge="B" place={dest} onChange={p => { setDest(p); setScenario(null); if (origin) void plan(origin, p) }} picking={picking === 'dest'} onPickToggle={() => setPicking(picking === 'dest' ? null : 'dest')} />
          </div>
          <div className="scen"><span>Example journeys</span>
            {SCENARIOS.map(s => <button key={s.id} className={'chip' + (scenario === s.id ? ' on' : '')} onClick={() => runScenario(s.id)} disabled={resolving || routeStatus.state === 'loading'}>{s.from} → {s.to}</button>)}</div>
          <p className="mut small">Enter a place and press Enter, or use the crosshair to pick on the map. Drive routes only.</p>
        </section>

        {(resolving || routeStatus.state === 'loading') && <div className="state" role="status"><Loader2 className="spin" size={18} />{resolving ? 'Locating places…' : 'Finding real road routes…'}</div>}
        {routeStatus.state === 'error' && <div className="state err" role="alert"><AlertTriangle size={18} /><div><b>Couldn’t get routes</b><p>{routeStatus.message}</p>{origin && dest && <button className="btn" onClick={() => plan(origin, dest)}>Try again</button>}</div></div>}
        {!hasRoutes && routeStatus.state === 'idle' && !resolving && <div className="empty"><ShieldAlert size={22} /><p>Choose a start and destination, or try an example journey. Routes follow the real road network; safety evidence is measured along each route and missing data is always disclosed.</p></div>}

        {hasRoutes && fastest && <>
          {rec && <div className={'rec ' + rec.verdict}><b>{rec.verdict === 'evidence-led' ? 'Evidence-based comparison' : rec.verdict === 'inconclusive' ? 'Evidence is inconclusive' : rec.verdict === 'insufficient' ? 'Insufficient data' : 'Single route'}</b><p>{rec.text}</p></div>}
          {analysisStatus.state === 'loading' && <div className="state" role="status"><Loader2 className="spin" size={16} />Loading police, hospital and CCTV data…</div>}
          {analysisStatus.state !== 'loading' && roadStatus.state === 'loading' && <p className="mut small" role="status"><Loader2 className="spin" size={12} style={{ verticalAlign: '-2px' }} /> Loading optional road details…</p>}
          {(analysisStatus.message || roadStatus.message) && analysisStatus.state !== 'loading' && <div className="state warn" role="status"><AlertTriangle size={16} /><div><p>{[analysisStatus.message, roadStatus.state === 'error' ? roadStatus.message : ''].filter(Boolean).join(' ')}</p><p className="small">Your routes and directions are unaffected.</p><button className="btn" onClick={() => { if (!outcome) return; abortRef.current?.abort(); const ac = new AbortController(); abortRef.current = ac; void runAnalysis(outcome, ac.signal) }}>Retry data</button></div></div>}
          <div className="routes" role="radiogroup" aria-label="Route options">
            {outcome!.routes.map((r, i) => { const a = analyses[r.id]; const sel = r.id === selectedId; return <div key={r.id} className={'rcard' + (sel ? ' sel' : '')}>
              <button className="rhead" role="radio" aria-checked={sel} onClick={() => setSelectedId(r.id)}>
                <div className="rtime"><b>{fmtDur(r.duration)}</b><span>{fmtKm(r.distance)}</span></div>
                <div className="rmeta"><div className="rtitle">Route {i + 1}{badges(r.id).map(b => <span key={b} className={'tag ' + (b === 'Strongest evidence' ? 'blue' : '')}>{b}</span>)}</div>
                  <span className="mut small">{delta(r, fastest)}</span>
                  <span className="rev">{a ? (a.index != null ? `Emergency-access index ${a.index} · confidence ${a.confidenceLabel}` : 'Insufficient data for a reliable comparison') : analysisState === 'loading' ? 'Analysing evidence…' : 'Evidence unavailable'}</span>
                  {a?.caution && <span className="caution"><AlertTriangle size={12} />Data-supported caution</span>}</div>
              </button>
              {sel && <div className="rbody">
                <div className="tabs" role="tablist"><button role="tab" aria-selected={tab === 'safety'} className={tab === 'safety' ? 'on' : ''} onClick={() => setTab('safety')}>Safety evidence</button><button role="tab" aria-selected={tab === 'directions'} className={tab === 'directions' ? 'on' : ''} onClick={() => setTab('directions')}>Directions</button></div>
                {tab === 'safety' ? <SafetyDetail a={a} analysisState={analysisState} /> : <Directions r={r} />}
              </div>}
            </div> })}
          </div>
          {outcome!.notes.map(n => <p key={n} className="notice info small">{n}</p>)}
          {outcome!.droppedDuplicates > 0 && <p className="mut small">{outcome!.droppedDuplicates} near-identical alternative(s) returned by the engine were merged.</p>}
        </>}
        <footer className="foot">Route data © OpenStreetMap contributors · OSRM. Prototype only: not an emergency or official safety service. In danger, call 112.</footer>
      </div>
    </aside>

    <div className="map-actions">
      <button className="fab sos" onClick={() => setModal('sos')}><Siren size={16} />I feel unsafe</button>
      <a className="fab call" href="tel:112"><Phone size={16} />112</a>
      <div className="layers">
        <button className="fab" onClick={() => setLayerMenu(v => !v)} aria-expanded={layerMenu} aria-label="Map layers"><Layers size={16} />Layers</button>
        {layerMenu && <div className="menu" role="menu">
          {(['police', 'hospital', 'cctv'] as const).map(k => <label key={k}><input type="checkbox" checked={layers[k]} onChange={() => setLayers(l => ({ ...l, [k]: !l[k] }))} />{k === 'police' ? 'Police stations' : k === 'hospital' ? 'Hospitals' : 'Mapped CCTV (not confirmed)'}</label>)}
          <hr /><button className="btn block" onClick={() => { setLayerMenu(false); void nearbyEmergency() }} disabled={areaStatus.state === 'loading'}>{areaStatus.state === 'loading' ? 'Loading…' : 'Emergency services near map centre'}</button>
        </div>}
      </div>
    </div>
    {shown.length > 0 && <div className="legend" aria-label="Map legend"><span><i className="lg police" />Police (OSM)</span><span><i className="lg hospital" />Hospital (OSM)</span>{layers.cctv && <span><i className="lg cctv" />Camera mapped</span>}</div>}

    {modal === 'method' && <Methodology onClose={() => setModal(null)} />}
    {modal === 'community' && <CommunityModal onClose={() => setModal(null)} sess={sess} setSess={setSess} reports={reports} setReports={setReports} openSos={() => setModal('sos')} openReport={() => setModal('report')} say={say} />}
    {modal === 'sos' && <SosModal onClose={() => setModal(null)} onSubmit={s => { setSess(s); setModal('community'); say('Simulated request ' + s.id + ' created') }} />}
    {modal === 'report' && <ReportModal onClose={() => setModal('community')} onSubmit={r => { setReports(rs => [r, ...rs]); setModal('community'); say('Report saved locally (simulated)') }} />}
    {toast && <div className="toast" role="status">{toast}</div>}
  </div>
}
