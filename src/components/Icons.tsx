import L from 'leaflet'
export const Logo = ({ size = 28 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true"><path d="M16 2l12 4v9c0 7-5 12-12 15C9 27 4 22 4 15V6z" fill="#1a73e8" /><path d="M9 17c3-6 11-6 14 0" stroke="#fff" strokeWidth="2.4" fill="none" strokeLinecap="round" /><path d="M9 17v5M23 17v5" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" /></svg>
)
export const pinIcon = (cls: string, text: string) => L.divIcon({ className: '', html: `<div class="pin ${cls}"><span>${text}</span></div>`, iconSize: [30, 38], iconAnchor: [15, 36], popupAnchor: [0, -32] })
export const dotIcon = (cls: string, glyph: string) => L.divIcon({ className: '', html: `<div class="dot ${cls}">${glyph}</div>`, iconSize: [22, 22], iconAnchor: [11, 11], popupAnchor: [0, -10] })
