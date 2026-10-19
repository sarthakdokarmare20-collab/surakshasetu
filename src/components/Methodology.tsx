import { X } from 'lucide-react'
import { CONFIG } from '../config'
import { CRIME_SOURCES } from '../data/sources'

export default function Methodology({ onClose }: { onClose: () => void }) {
  const s = CONFIG.safety
  return <div className="modal" onClick={onClose}><div className="sheet wide" role="dialog" aria-label="Methodology" onClick={e => e.stopPropagation()}>
    <div className="sheet-head"><h3>How SurakshaSetu compares routes</h3><button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button></div>
    <p>SurakshaSetu never draws routes itself. Geometry, distance, duration and turn-by-turn steps all come from an OSRM routing engine running on OpenStreetMap data. Evidence is then measured <i>along each returned route</i>. Missing data is treated as <b>unknown</b>, never as safe or dangerous.</p>
    <h4>Factors</h4>
    <table><thead><tr><th>Factor</th><th>Method</th><th>Source &amp; coverage</th><th>Limits</th></tr></thead><tbody>
      <tr><td>Police stations<br /><small>weight {s.weights.police}</small></td><td>Route sampled every {s.sampleEveryMeters} m; distance from each sample to the nearest <i>named</i> mapped station. Score = 100 × (1 − mean ÷ {s.policeZeroAtMeters / 1000} km).</td><td>OSM <code>amenity=police</code> via Overpass; search area padded by 4 km.</td><td>Straight-line, not travel time. OSM may be incomplete. No staffing or response data.</td></tr>
      <tr><td>Hospitals<br /><small>weight {s.weights.hospital}</small></td><td>Same method; zero point at {s.hospitalZeroAtMeters / 1000} km. Entries are labelled <i>detailed</i> (extra tags), <i>basic</i> (name only) or <i>incomplete</i> (no name; shown, not scored).</td><td>OSM <code>amenity=hospital</code> / <code>healthcare=hospital</code>.</td><td>Not verified as open, staffed or equipped for emergencies.</td></tr>
      <tr><td>CCTV<br /><small>weight {s.weights.cctv} (info only)</small></td><td>Counts cameras mapped within 100 m of the route. If none are mapped: “CCTV coverage data unavailable”.</td><td>OSM <code>man_made=surveillance</code>.</td><td>Volunteer-mapped, sparse, not confirmed operational. No coverage percentages are produced.</td></tr>
      <tr><td>Historical crime<br /><small>weight {s.weights.crime} (no data)</small></td><td>Not scored. Always shown as “Insufficient verified data”.</td><td>See sources below.</td><td>No open, route-resolvable dataset exists. City totals are never converted into street-level predictions.</td></tr>
      <tr><td>Road environment<br /><small>weight {s.weights.roadEnvironment} (info only)</small></td><td>OSM ways within 15 m of the route: class mix, <code>lit</code> and <code>sidewalk</code> tags. Lighting is reported only if ≥ {Math.round(s.minLitTagShare * 100)}% of ways are tagged.</td><td>OSM tags via Overpass.</td><td>Untagged ≠ unlit. Main roads are not assumed safer.</td></tr>
    </tbody></table>
    <h4>Index, confidence and recommendation</h4>
    <ul>
      <li><b>Emergency-access index</b> = weighted mean of the scored factors (weights renormalised). With fewer than two scored factors the app says “Insufficient data for a reliable safety comparison”.</li>
      <li><b>Data confidence</b> = points out of 5 evidence types (police, hospital, CCTV, crime, road). Crowd-sourced evidence earns 0.5, official verified evidence 1. An OSM-only analysis therefore cannot exceed 50%.</li>
      <li><b>Evidence-led route</b>: recommended over the fastest only if its index is at least {s.minIndexAdvantage} points higher and it costs ≤ {s.maxExtraMinutes} min and ≤ {s.maxExtraFraction * 100}% extra time. Otherwise the app reports that the evidence cannot separate the routes. Longer is never assumed safer.</li>
      <li>Amber marks a route with a data-supported caution (e.g. a stretch &gt; {s.gapCautionMeters / 1000} km from any mapped police station or hospital). Red is reserved for a verified hazard; no hazard dataset is connected, so it is never shown.</li>
    </ul>
    <h4>Crime-data sources reviewed (last checked {CONFIG.lastChecked})</h4>
    <ul>{CRIME_SOURCES.map(c => <li key={c.name}><a href={c.url} target="_blank" rel="noreferrer">{c.name}</a>, {c.publisher}. <i>Coverage:</i> {c.coverage}. <i>Period:</i> {c.period}. <i>Status:</i> {c.usable}</li>)}</ul>
    <h4>Services &amp; attribution</h4>
    <p>Map data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a> (ODbL). Tiles: standard OpenStreetMap tile server. Routing: OSRM public demo server (car profile, fair use). Search: Nominatim (max 1 request/s, results cached). Facilities: Overpass API. These public endpoints are not for production traffic; every provider URL is configurable in <code>.env</code>.</p>
    <p className="mut small">SurakshaSetu is a college community-engagement prototype, not an emergency or official safety service. In danger, call 112.</p>
  </div></div>
}
