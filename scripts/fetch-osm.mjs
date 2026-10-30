// Downloads REAL OpenStreetMap data (police stations, hospitals, mapped CCTV cameras) for the Nagpur area into
// public/data/osm-nagpur.json so the app can show it instantly without depending on a slow public server.
// Usage:  npm run fetch-data        (needs internet; takes up to a minute)
// Data © OpenStreetMap contributors, ODbL. Re-run occasionally to refresh.
import { writeFile, mkdir } from 'node:fs/promises'
const bbox = { south: 20.95, west: 78.9, north: 21.35, east: 79.35 } // Nagpur urban area plus margin
const mirrors = (process.env.OVERPASS_URLS || 'https://overpass-api.de/api/interpreter,https://overpass.kumi.systems/api/interpreter,https://overpass.private.coffee/api/interpreter').split(',')
const bb = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`
const q = `[out:json][timeout:120];(nwr["amenity"="police"](${bb});nwr["amenity"="hospital"](${bb});nwr["healthcare"="hospital"](${bb});nwr["man_made"="surveillance"](${bb}););out center tags;`
let data = null
for (const m of mirrors) {
  try {
    console.log('Trying', m)
    const res = await fetch(m, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'SurakshaSetu-data-fetch/1.0' }, body: 'data=' + encodeURIComponent(q), signal: AbortSignal.timeout(150000) })
    if (!res.ok) { console.log('  HTTP', res.status); continue }
    const j = await res.json()
    if (j.remark && /timed out|out of memory/i.test(j.remark)) { console.log('  server-side timeout'); continue }
    data = j; break
  } catch (e) { console.log('  failed:', e.message) }
}
if (!data) { console.error('\nCould not download data from any server. Try again later or set OVERPASS_URLS.'); process.exit(1) }
const count = k => data.elements.filter(e => e.tags && (k === 'police' ? e.tags.amenity === 'police' : k === 'hospital' ? e.tags.amenity === 'hospital' || e.tags.healthcare === 'hospital' : e.tags.man_made === 'surveillance')).length
await mkdir('public/data', { recursive: true })
await writeFile('public/data/osm-nagpur.json', JSON.stringify({ fetchedAt: new Date().toISOString(), bbox, source: 'OpenStreetMap via Overpass API (ODbL)', elements: data.elements }))
console.log(`\nSaved public/data/osm-nagpur.json: ${count('police')} police, ${count('hospital')} hospital, ${count('cctv')} camera entries.`)
