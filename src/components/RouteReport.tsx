import { Crosshair, ExternalLink, Printer, X } from 'lucide-react'
import { CONFIG } from '../config'
import { fmtDur, fmtKm } from '../lib/geo'
import type { NearFacility, RouteAnalysis, RouteResult } from '../types'
import type { ReportData } from '../services/reportData'

interface Props { route: RouteResult; routeName: string; analysis: RouteAnalysis | undefined; data: ReportData; from: string; to: string; analysisReady: boolean; dataNote?: string; onFocus: (lat: number, lng: number) => void; onClose: () => void }

const km = (m: number) => (m / 1000).toFixed(1)
const Demo = () => <span className="tag demo" title="Placeholder data for demonstration; not a real record">Demo</span>
const quality = (f: NearFacility) => (f.tier === 'well-documented' ? 'Detailed OSM entry' : f.tier === 'basic' ? 'Basic OSM entry' : 'Incomplete (no name)')

function Strip({ route, analysis, data }: { route: RouteResult; analysis?: RouteAnalysis; data: ReportData }) {
  const pos = (m: number) => Math.max(0, Math.min(100, (m / route.distance) * 100)) + '%'
  const lanes: { label: string; cls: string; items: { id: string; m: number; t: string }[] }[] = [
    { label: 'Hospitals', cls: 'hospital', items: (analysis?.nearbyHospitals ?? []).map((f, i) => ({ id: f.id, m: f.alongM, t: `H${i + 1} ${f.name || 'Unnamed'}` })) },
    { label: 'Police', cls: 'police', items: (analysis?.nearbyPolice ?? []).map((f, i) => ({ id: f.id, m: f.alongM, t: `P${i + 1} ${f.name || 'Unnamed'}` })) },
    { label: 'CCTV', cls: 'cctv', items: data.cctv.map((f, i) => ({ id: f.id, m: f.alongM, t: `C${i + 1}${f.origin === 'demo' ? ' (demo)' : ''}` })) },
    { label: 'Crime', cls: 'crime', items: data.crime.map((c, i) => ({ id: c.id, m: c.alongM, t: `${c.category}${c.origin === 'demo' ? ' (demo)' : ''}` })) },
  ]
  return <div className="strip" aria-label="Positions along the route">
    <div className="strip-axis"><span>Start</span><span>{km(route.distance / 2)} km</span><span>End · {km(route.distance)} km</span></div>
    {lanes.map(l => <div className="strip-lane" key={l.label}><span className="strip-label">{l.label}</span><div className="strip-track">{l.items.map(it => <i key={it.id} className={'strip-dot ' + l.cls} style={{ left: pos(it.m) }} title={`${it.t} · ${km(it.m)} km from start`} />)}</div></div>)}
  </div>
}

function FacTable({ title, prefix, rows, empty, onFocus }: { title: string; prefix: string; rows: NearFacility[]; empty: string; onFocus: Props['onFocus'] }) {
  return <section><h4>{title} <span className="count">{rows.length}</span></h4>
    {rows.length === 0 ? <p className="mut">{empty}</p> : <div className="tbl-wrap"><table className="tbl"><thead><tr><th>#</th><th>Name</th><th>At km</th><th>Off route</th><th>Entry quality</th><th>Location</th><th></th></tr></thead><tbody>
      {rows.map((f, i) => <tr key={f.id}><td>{prefix}{i + 1}</td><td><b>{f.name || 'Unnamed entry'}</b></td><td>{km(f.alongM)}</td><td>{fmtKm(f.distToRoute)}</td><td>{quality(f)}</td>
        <td className="mono">{f.lat.toFixed(5)}, {f.lng.toFixed(5)}</td>
        <td className="acts"><button className="icon-btn sm" onClick={() => { onFocus(f.lat, f.lng) }} aria-label={`Show ${f.name || 'entry'} on map`} title="Show on map"><Crosshair size={14} /></button>{f.osmUrl && <a className="icon-btn sm" href={f.osmUrl} target="_blank" rel="noreferrer" aria-label="Open in OpenStreetMap"><ExternalLink size={14} /></a>}</td></tr>)}
    </tbody></table></div>}</section>
}

export default function RouteReport({ route, routeName, analysis, data, from, to, analysisReady, dataNote, onFocus, onClose }: Props) {
  const police = analysis?.nearbyPolice ?? [], hosp = analysis?.nearbyHospitals ?? []
  const cctvDemo = data.cctv.some(c => c.origin === 'demo'), crimeDemo = data.crimeOrigin === 'demo'
  const crimeFactor = analysis?.factors.find(f => f.key === 'crime')
  const originTxt = (o: string) => (o === 'osm' ? 'OpenStreetMap (mapped, not confirmed operational)' : o === 'user' ? 'Supplied data file' : 'Demo placeholder')
  return <div className="modal report-modal" onClick={onClose}><div className="sheet wide report" role="dialog" aria-label="Full route report" onClick={e => e.stopPropagation()}>
    <div className="sheet-head"><div><h3>Route report: {from} → {to}</h3><p className="mut small">{routeName}{route.viaNote ? ' · found by routing through an extra waypoint' : ''} · generated {new Date().toLocaleString()}</p></div>
      <div className="row noprint"><button className="btn" onClick={() => window.print()}><Printer size={15} />Print / save PDF</button><button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button></div></div>

    <div className="tiles">
      <div><b>{fmtKm(route.distance)}</b><span>Distance</span></div><div><b>{fmtDur(route.duration)}</b><span>Est. drive time</span></div>
      <div><b>{analysisReady ? hosp.length : '…'}</b><span>Hospitals ≤ {CONFIG.safety.corridorMeters / 1000} km</span></div><div><b>{analysisReady ? police.length : '…'}</b><span>Police stations ≤ {CONFIG.safety.corridorMeters / 1000} km</span></div>
      <div><b>{data.cctv.length}</b><span>CCTV points ≤ 100 m</span></div><div><b>{data.crime.length}</b><span>Crime records ≤ 300 m</span></div>
    </div>
    {(cctvDemo || crimeDemo) && <p className="demo-note"><Demo /> CCTV and/or crime rows marked “Demo” are placeholders for demonstration. They are not real records and are excluded from the index and confidence.</p>}

    <section><h4>Where things are along the route</h4><Strip route={route} analysis={analysis} data={data} /></section>
    {!analysisReady && <p className="mut small">Police and hospital tables fill in as soon as the map data arrives (use Retry in the panel if it doesn’t).</p>}
    <FacTable title="Hospitals" prefix="H" rows={hosp} empty="No hospitals mapped within the corridor (OpenStreetMap may be incomplete)." onFocus={onFocus} />
    <FacTable title="Police stations" prefix="P" rows={police} empty="No police stations mapped within the corridor (OpenStreetMap may be incomplete)." onFocus={onFocus} />

    <section><h4>CCTV cameras <span className="count">{data.cctv.length}</span> {cctvDemo && <Demo />}</h4>
      {data.cctv.length === 0 ? <p className="mut"><b>CCTV coverage data unavailable.</b> No cameras are mapped along this route and no public CCTV register is integrated. Absence of data does not mean absence of cameras.</p>
        : <div className="tbl-wrap"><table className="tbl"><thead><tr><th>#</th><th>At km</th><th>Off route</th><th>Location</th><th>Source</th><th></th></tr></thead><tbody>
          {data.cctv.map((c, i) => <tr key={c.id}><td>C{i + 1}</td><td>{km(c.alongM)}</td><td>{fmtKm(c.distToRoute)}</td><td className="mono">{c.lat.toFixed(5)}, {c.lng.toFixed(5)}</td><td>{originTxt(c.origin)} {c.origin === 'demo' && <Demo />}</td>
            <td className="acts"><button className="icon-btn sm" onClick={() => onFocus(c.lat, c.lng)} aria-label="Show on map"><Crosshair size={14} /></button></td></tr>)}
        </tbody></table></div>}</section>

    <section><h4>Previous crime records <span className="count">{data.crime.length}</span> {crimeDemo && <Demo />}</h4>
      {data.crime.length === 0
        ? <p className="mut"><b>{data.crimeOrigin === 'user' ? 'No records in the supplied file lie within 300 m of this route.' : 'Insufficient verified data.'}</b> {crimeFactor?.status === 'unavailable' ? 'Official sources publish city / police-station totals only, not street-level incidents.' : ''}</p>
        : <div className="tbl-wrap"><table className="tbl"><thead><tr><th>#</th><th>Category</th><th>Period</th><th>At km</th><th>Source</th><th></th></tr></thead><tbody>
          {data.crime.map((c, i) => <tr key={c.id}><td>{i + 1}</td><td>{c.category}</td><td>{c.period}</td><td>{km(c.alongM)}</td><td>{c.origin === 'demo' ? <>Demo placeholder <Demo /></> : c.source}</td>
            <td className="acts"><button className="icon-btn sm" onClick={() => onFocus(c.lat, c.lng)} aria-label="Show on map"><Crosshair size={14} /></button></td></tr>)}
        </tbody></table></div>}</section>

    <section><h4>Notes</h4><ul className="small mut">
      <li>Facility data: {dataNote ?? 'OpenStreetMap'}. Hospitals and police stations are OpenStreetMap entries within {CONFIG.safety.corridorMeters / 1000} km of the route line; they are not verified as open, staffed or able to respond. Proximity does not guarantee assistance.</li>
      <li>Emergency-access index: {analysis?.index ?? 'n/a'} · data confidence: {analysis ? analysis.confidenceLabel : 'n/a'}. This is partial evidence, not an overall safety score.</li>
      <li>Map data © OpenStreetMap contributors. Routing: OSRM. In danger, call 112.</li></ul></section>
  </div></div>
}
