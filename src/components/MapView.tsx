import { useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Polyline, Marker, Popup, ZoomControl, Pane, useMap, useMapEvents } from 'react-leaflet'
import type L from 'leaflet'
import { CONFIG } from '../config'
import { dotIcon, pinIcon } from './Icons'
import { fmtKm } from '../lib/geo'
import type { Facility, RouteAnalysis, RouteResult, LngLat } from '../types'

const ll = (c: LngLat[]) => c.map(([lng, lat]) => [lat, lng] as [number, number])
const TIER: Record<string, string> = { 'well-documented': 'Detailed OSM entry (not verified as operational)', basic: 'Basic OSM entry (name only)', incomplete: 'Incomplete OSM entry (no name)' }

export type ShownFacility = Facility & { distToRoute?: number }
interface Props {
  routes: RouteResult[]
  analyses: Record<string, RouteAnalysis>
  selectedId: string | null
  onSelect: (id: string) => void
  origin: { lat: number; lng: number } | null
  destination: { lat: number; lng: number } | null
  onDragEnd: (which: 'origin' | 'dest', lat: number, lng: number) => void
  picking: 'origin' | 'dest' | null
  onPick: (lat: number, lng: number) => void
  facilities: ShownFacility[]
  fitKey: number
  insets: { left: number; bottom: number }
  onReady: (m: L.Map) => void
}

function Inner({ onReady, picking, onPick, fitKey, routes, selectedId, insets }: Pick<Props, 'onReady' | 'picking' | 'onPick' | 'fitKey' | 'routes' | 'selectedId' | 'insets'>) {
  const map = useMap()
  useEffect(() => { onReady(map) }, [map, onReady])
  useMapEvents({ click: e => { if (picking) onPick(e.latlng.lat, e.latlng.lng) } })
  useEffect(() => { map.getContainer().style.cursor = picking ? 'crosshair' : '' }, [picking, map])
  const sel = routes.find(r => r.id === selectedId)
  useEffect(() => { // fit the selected route, leaving room for the floating panel
    if (!sel || sel.coords.length < 2) return
    map.fitBounds(ll(sel.coords), { paddingTopLeft: [insets.left + 30, 70], paddingBottomRight: [30, insets.bottom + 30], animate: true, duration: 0.6 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, selectedId])
  return null
}

function RouteLine({ r, selected, caution, onSelect, drawKey }: { r: RouteResult; selected: boolean; caution: boolean; onSelect: () => void; drawKey: number }) {
  const ref = useRef<L.Polyline>(null)
  const pts = ll(r.coords)
  const color = caution ? '#e37400' : selected ? '#1a73e8' : '#7d8794'
  useEffect(() => { // draw-in animation, only when a fresh result arrives
    const el = ref.current?.getElement() as SVGPathElement | undefined
    if (!el || !selected) return
    el.setAttribute('pathLength', '1')
    el.classList.remove('route-draw'); void (el as unknown as HTMLElement).getBoundingClientRect()
    el.classList.add('route-draw')
    const t = setTimeout(() => el.classList.remove('route-draw'), 1100)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawKey])
  useEffect(() => { if (selected) ref.current?.bringToFront() }, [selected])
  return <>
    {selected && <Pane name={'casing-' + r.id} style={{ zIndex: 395 }}><Polyline positions={pts} pathOptions={{ color: '#fff', weight: 11, opacity: 0.95, lineCap: 'round', lineJoin: 'round', interactive: false, pane: 'casing-' + r.id }} /></Pane>}
    <Polyline ref={ref} positions={pts} pathOptions={{ color, weight: selected ? 7 : 6, opacity: selected ? 1 : 0.75, lineCap: 'round', lineJoin: 'round' }} eventHandlers={{ click: onSelect }} />
  </>
}

export default function MapView(p: Props) {
  const ordered = [...p.routes.filter(r => r.id !== p.selectedId), ...p.routes.filter(r => r.id === p.selectedId)]
  return <MapContainer center={CONFIG.mapCenter} zoom={12} zoomControl={false} className="map" preferCanvas={false}>
    <TileLayer url={CONFIG.tile.url} attribution={CONFIG.tile.attribution} maxZoom={19} />
    <ZoomControl position="bottomright" />
    <Inner onReady={p.onReady} picking={p.picking} onPick={p.onPick} fitKey={p.fitKey} routes={p.routes} selectedId={p.selectedId} insets={p.insets} />
    {ordered.map(r => <RouteLine key={r.id + p.fitKey} r={r} selected={r.id === p.selectedId} caution={!!p.analyses[r.id]?.caution} onSelect={() => p.onSelect(r.id)} drawKey={p.fitKey} />)}
    {p.facilities.map(f => <Marker key={f.kind + f.id} position={[f.lat, f.lng]} icon={dotIcon(f.kind, f.kind === 'police' ? '★' : f.kind === 'hospital' ? '+' : '·')}>
      <Popup><b>{f.name || 'Unnamed ' + f.kind + ' (OSM)'}</b><br />
        <span className="pp-mut">{f.kind === 'police' ? 'Police station' : f.kind === 'hospital' ? 'Hospital' : 'Mapped camera location'}{f.distToRoute != null ? ` · ${fmtKm(f.distToRoute)} from route` : ''}</span><br />
        <span className="pp-mut">{f.kind === 'cctv' ? 'Mapped location only: not confirmed operational.' : TIER[f.tier]}</span><br />
        <a href={f.osmUrl} target="_blank" rel="noreferrer">Source: OpenStreetMap</a></Popup></Marker>)}
    {p.origin && <Marker position={[p.origin.lat, p.origin.lng]} icon={pinIcon('start', 'A')} draggable eventHandlers={{ dragend: e => { const m = (e.target as L.Marker).getLatLng(); p.onDragEnd('origin', m.lat, m.lng) } }} zIndexOffset={1000}><Popup>Start. Drag to move.</Popup></Marker>}
    {p.destination && <Marker position={[p.destination.lat, p.destination.lng]} icon={pinIcon('end', 'B')} draggable eventHandlers={{ dragend: e => { const m = (e.target as L.Marker).getLatLng(); p.onDragEnd('dest', m.lat, m.lng) } }} zIndexOffset={1000}><Popup>Destination. Drag to move.</Popup></Marker>}
  </MapContainer>
}
