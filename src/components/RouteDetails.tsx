import { useState } from 'react'
import { AlertTriangle, ChevronDown, ExternalLink, Info } from 'lucide-react'
import { fmtDur, fmtKm } from '../lib/geo'
import type { FactorResult, RouteAnalysis, RouteResult } from '../types'

const STATUS_LABEL: Record<FactorResult['status'], string> = { scored: 'Used in index', informational: 'Information only', unavailable: 'No data' }

function Meter({ value, label, tone }: { value: number | null; label: string; tone: 'blue' | 'grey' }) {
  return <div className="meter"><div className="meter-top"><span>{label}</span><b>{value == null ? 'n/a' : value}</b></div><div className={'meter-bar ' + tone}><i style={{ width: (value ?? 0) + '%' }} /></div></div>
}

function Factor({ f }: { f: FactorResult }) {
  const [open, setOpen] = useState(false)
  return <div className={'factor ' + f.status}>
    <button className="factor-head" onClick={() => setOpen(!open)} aria-expanded={open}>
      <span className="factor-title"><b>{f.label}</b><span className={'tag ' + f.status}>{STATUS_LABEL[f.status]}{f.status === 'scored' ? ` · ${f.score}/100` : ''}</span></span>
      <ChevronDown size={16} className={open ? 'rot' : ''} />
    </button>
    <p className="factor-sum">{f.headline}</p>
    {open && <div className="factor-body">
      {f.detail.map((d, i) => <p key={i}>{d}</p>)}
      <p><b>Source:</b> {f.source}</p>
      <p><b>Limitation:</b> {f.limitation}</p>
      {f.weight > 0 && <p><b>Weight in index:</b> {f.weight}</p>}
    </div>}
  </div>
}

export function SafetyDetail({ a, analysisState }: { a: RouteAnalysis | undefined; analysisState: 'loading' | 'ok' | 'error' | 'idle' }) {
  if (analysisState === 'loading' || (!a && analysisState === 'idle')) return <div className="skeleton-wrap" aria-busy="true"><div className="skeleton" /><div className="skeleton" /><div className="skeleton short" /><p className="mut">Loading police, hospital and road data from OpenStreetMap…</p></div>
  if (!a) return <p className="notice info"><Info size={16} />Safety evidence hasn’t loaded yet. The route itself is unaffected.</p>
  const crimeMissing = a.factors.find(f => f.key === 'crime')?.status === 'unavailable'
  return <div className="safety">
    {a.insufficient
      ? <p className="notice info"><Info size={16} /><span>Safety index appears once police and hospital data has loaded.</span></p>
      : crimeMissing && <p className="notice info"><Info size={16} /><span><b>Partial evidence.</b> The index below reflects mapped police and hospital proximity only. Crime and CCTV are not verified, so this is <u>not</u> an overall safety score.</span></p>}
    {a.caution && <p className="notice amber"><AlertTriangle size={16} />{a.caution}</p>}
    <div className="meters"><Meter value={a.index} label="Emergency-access index" tone="blue" /><Meter value={a.confidence} label={`Data confidence · ${a.confidenceLabel}`} tone="grey" /></div>
    {a.factors.map(f => <Factor key={f.key} f={f} />)}
    <FacilityList title="Police stations within 1 km of route" items={a.nearbyPolice} empty="None mapped within 1 km (OSM may be incomplete)." />
    <FacilityList title="Hospitals within 1 km of route" items={a.nearbyHospitals} empty="None mapped within 1 km (OSM may be incomplete)." />
    <p className="mut small">Proximity does not guarantee immediate assistance. Facilities are not verified as open or operational. In danger, call 112.</p>
  </div>
}

function FacilityList({ title, items, empty }: { title: string; items: RouteAnalysis['nearbyPolice']; empty: string }) {
  return <div className="flist"><h5>{title}</h5>
    {items.length === 0 ? <p className="mut small">{empty}</p> : <ul>{items.slice(0, 6).map(f => <li key={f.id}><span><b>{f.name || 'Unnamed entry'}</b><em>{f.tier === 'well-documented' ? 'detailed OSM entry' : f.tier === 'basic' ? 'basic OSM entry' : 'incomplete entry'}</em></span><span>{fmtKm(f.distToRoute)} <a href={f.osmUrl} target="_blank" rel="noreferrer" aria-label="View on OpenStreetMap"><ExternalLink size={12} /></a></span></li>)}</ul>}
  </div>
}

export function Directions({ r }: { r: RouteResult }) {
  if (!r.steps.length) return <p className="mut">Turn-by-turn instructions are not available for this route.</p>
  return <ol className="steps">{r.steps.map((s, i) => <li key={i}><span>{s.instruction}</span><em>{s.distance > 0 ? fmtKm(s.distance) : ''}</em></li>)}</ol>
}

export const delta = (r: RouteResult, fastest: RouteResult) => {
  const dm = Math.round((r.duration - fastest.duration) / 60), dk = (r.distance - fastest.distance) / 1000
  if (r.id === fastest.id) return 'Fastest route'
  return `${dm >= 0 ? '+' : '−'}${Math.abs(dm)} min · ${dk >= 0 ? '+' : '−'}${Math.abs(dk).toFixed(1)} km vs fastest`
}
export { fmtDur }
