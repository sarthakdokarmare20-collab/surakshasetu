import { useEffect, useState } from 'react'
import { Crosshair, Loader2, Search } from 'lucide-react'
import { searchPlaces } from '../services/geocode'
import type { Place } from '../types'

interface Props { label: string; badge: 'A' | 'B'; place: Place | null; onChange: (p: Place) => void; picking: boolean; onPickToggle: () => void }

export default function PlaceInput({ label, badge, place, onChange, picking, onPickToggle }: Props) {
  const [text, setText] = useState('')
  const [hits, setHits] = useState<Place[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => { setText(place ? place.shortLabel : ''); setHits(null); setErr('') }, [place])

  const search = async () => {
    if (text.trim().length < 2) return
    setBusy(true); setErr(''); setHits(null)
    try {
      const r = await searchPlaces(text, { locality: true })
      if (!r.length) setErr('No matching place found in the Nagpur area.')
      else if (r.length === 1) onChange(r[0])
      else setHits(r)
    } catch (e) { setErr((e as Error).message || 'Search failed.') } finally { setBusy(false) }
  }

  return <div className="pi">
    <span className={'pi-badge ' + (badge === 'A' ? 'a' : 'b')}>{badge}</span>
    <div className="pi-field">
      <input aria-label={label} placeholder={label} value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') search() }} title={place?.label} />
      <button className="icon-btn sm" onClick={search} aria-label={`Search ${label}`} disabled={busy}>{busy ? <Loader2 size={16} className="spin" /> : <Search size={16} />}</button>
      <button className={'icon-btn sm' + (picking ? ' on' : '')} onClick={onPickToggle} aria-label={`Pick ${label} on map`} aria-pressed={picking} title="Pick on map"><Crosshair size={16} /></button>
    </div>
    {picking && <p className="pi-hint">Click anywhere on the map to set the {label.toLowerCase()}.</p>}
    {err && <p className="pi-err" role="alert">{err}</p>}
    {hits && <ul className="pi-list" role="listbox">{hits.map(h => <li key={h.lat + ',' + h.lng}><button onClick={() => onChange(h)}><b>{h.shortLabel}</b><span>{h.label}</span></button></li>)}</ul>}
  </div>
}
