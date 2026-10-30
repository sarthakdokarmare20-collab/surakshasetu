// End-to-end UI test. All external services are STUBBED with SYNTHETIC fixtures (coordinates are arbitrary and are
// not real Nagpur roads/facilities). It verifies UI behaviour and error handling, not real-world data.
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs'
import assert from 'node:assert/strict'
const APP = process.env.APP_URL || 'http://localhost:4173/'
const OUT = process.env.SHOTS || '/tmp/claude-0/-home-claude/a265e145-37f9-5515-a9e6-4d34f75b5889/scratchpad'
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAFUlEQVR42mN8+fYjAzbAxIADDE4JAC0IAtdtdJyoAAAAAElFTkSuQmCC', 'base64')

const places = { dighori: [21.10, 79.12], sadar: [21.15, 79.08], wadi: [21.16, 79.04], sitabuldi: [21.14, 79.085] }
const mkRoute = (pts, dur, dist, name) => ({ distance: dist, duration: dur, weight_name: 'routability', geometry: { type: 'LineString', coordinates: pts },
  legs: [{ steps: [{ distance: dist / 2, duration: dur / 2, name, maneuver: { type: 'depart' } }, { distance: dist / 2, duration: dur / 2, name: 'Test Chowk Road', maneuver: { type: 'turn', modifier: 'left' } }, { distance: 0, duration: 0, name: '', maneuver: { type: 'arrive' } }] }] })
function line(a, b, bend) { const pts = []; for (let i = 0; i <= 20; i++) { const t = i / 20; pts.push([a[1] + (b[1] - a[1]) * t + Math.sin(t * Math.PI) * bend, a[0] + (b[0] - a[0]) * t]) } return pts }

let mode = { osrm: 'ok', overpass: 'ok' }
const results = []
const ok = (name) => { results.push(name); console.log('PASS', name) }

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
async function newPage(viewport) {
  const ctx = await browser.newContext({ viewport })
  const page = await ctx.newPage()
  const errors = []; page.on('pageerror', e => errors.push(e.message))
  page.tileHosts = new Set()
  await page.route(/basemaps\.cartocdn\.com|tile\.openstreetmap|fonts\.g/, r => { if (/\.png(\?|$)/.test(r.request().url())) page.tileHosts.add(new globalThis.URL(r.request().url()).host); r.fulfill({ contentType: 'image/png', body: PNG }) })
  await page.route('**/nominatim.openstreetmap.org/search**', r => {
    const u = new globalThis.URL(r.request().url())
    const q = decodeURIComponent(u.searchParams.get('q')).toLowerCase()
    const key = Object.keys(places).find(k => q.startsWith(k))
    const nm = key ? key[0].toUpperCase() + key.slice(1) : ''
    const locality = { lat: String(key && places[key][0]), lon: String(key && places[key][1]), display_name: `${nm}, Nagpur, Maharashtra, India (TEST FIXTURE)`, name: nm, class: 'place', type: 'suburb' }
    const poi = { ...locality, display_name: `State Bank ${nm}, Nagpur (TEST FIXTURE)`, name: `State Bank ${nm}`, class: 'amenity', type: 'bank' }
    // Unrestricted search returns a bank first (like the real bug); the settlement-restricted search returns the locality.
    const body = !key ? [] : u.searchParams.get('featuretype') === 'settlement' ? [locality] : [poi, locality]
    r.fulfill({ contentType: 'application/json', body: JSON.stringify(body) })
  })
  await page.route('**/nominatim.openstreetmap.org/reverse**', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ display_name: 'Pinned Road, Nagpur (TEST FIXTURE)', name: 'Pinned Road', address: { road: 'Pinned Road' } }) }))
  await page.route('**/route/v1/driving/**', r => {
    if (mode.osrm === 'noroute') return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ code: 'NoRoute', message: 'Impossible route' }) })
    if (mode.osrm === 'down') return r.abort('failed')
    const m = new globalThis.URL(r.request().url()).pathname.split('/').pop().split(';').map(s => s.split(',').map(Number))
    const a = [m[0][1], m[0][0]], b = [m[m.length - 1][1], m[m.length - 1][0]]
    if (m.length === 3) { // route through an extra waypoint (synthetic smooth curve that passes through it; no out-and-back)
      if (mode.osrm === 'single-noextra') return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ code: 'NoRoute' }) })
      const v = [m[1][1], m[1][0]]; const c = [2 * v[0] - (a[0] + b[0]) / 2, 2 * v[1] - (a[1] + b[1]) / 2]
      const pts = []; for (let i = 0; i <= 30; i++) { const u = i / 30; pts.push([(1 - u) ** 2 * a[1] + 2 * u * (1 - u) * c[1] + u * u * b[1], (1 - u) ** 2 * a[0] + 2 * u * (1 - u) * c[0] + u * u * b[0]]) }
      return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ code: 'Ok', routes: [mkRoute(pts, 1100 + Math.abs(v[1] - (a[1] + b[1]) / 2) * 1e4, 10500, 'Via Test Road')], waypoints: [] }) })
    }
    const routes = [mkRoute(line(a, b, 0.002), 900, 9000, 'Fast Test Road')]
    if (mode.osrm === 'ok') routes.push(mkRoute(line(a, b, 0.02), 1200, 12000, 'Long Test Road'))
    r.fulfill({ contentType: 'application/json', body: JSON.stringify({ code: 'Ok', routes, waypoints: [{ location: m[0], name: 'Snap A', distance: 12 }, { location: m[1], name: 'Snap B', distance: 8 }] }) })
  })
  await page.route('**/api/interpreter', r => {
    if (mode.overpass === 'down') return r.fulfill({ status: 504, body: 'timeout' })
    const body = decodeURIComponent(r.request().postData() || '')
    if (mode.overpass === 'hang') return // never answer: tests client-side timeouts
    if (mode.overpass === 'hang-road' && !body.includes('man_made')) return
    if (body.includes('man_made')) return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ elements: [
      { type: 'node', id: 1, lat: 21.12, lon: 79.10, tags: { amenity: 'police', name: 'Test Police Station', phone: '000' } },
      { type: 'node', id: 2, lat: 21.14, lon: 79.09, tags: { amenity: 'hospital', name: 'Test Hospital' } },
      { type: 'node', id: 3, lat: 21.13, lon: 79.095, tags: { amenity: 'hospital' } } ] }) })
    r.fulfill({ contentType: 'application/json', body: JSON.stringify({ elements: [{ type: 'way', id: 9, tags: { highway: 'primary', lit: 'yes' } }, { type: 'way', id: 10, tags: { highway: 'residential' } }] }) })
  })
  return { page, errors, ctx }
}

// 1. Desktop happy path
{
  const { page, errors } = await newPage({ width: 1366, height: 800 })
  await page.goto(APP)
  await page.getByText('Dighori → Sadar').click()
  await page.waitForSelector('.rcard')
  assert.equal(await page.getByRole('textbox', { name: 'Start' }).inputValue(), 'Dighori'); ok('example journey resolves locality, not a POI (bank)')
  await page.waitForFunction(() => document.querySelectorAll('.rcard').length >= 3, null, { timeout: 20000 })
  assert.equal(await page.locator('.rcard').count(), 3); ok('three route options shown (2 native + 1 via-waypoint road route)')
  await page.getByText('Extra route').first().waitFor(); ok('extra route is labelled')
  await page.waitForSelector('.leaflet-overlay-pane path.leaflet-interactive')
  assert.ok(await page.locator('.leaflet-overlay-pane path.leaflet-interactive').count() >= 2); ok('route polylines drawn on map')
  await page.getByText('Partial evidence').waitFor(); ok('partial-evidence disclosure shown')
  await page.getByText('Insufficient verified data').waitFor(); ok('crime shown as insufficient verified data')
  await page.getByText('CCTV coverage data unavailable').waitFor(); ok('CCTV unavailable disclosed')
  await page.locator('.rhead').nth(1).click()
  await page.waitForSelector('.rcard.sel:nth-child(2)'); ok('selecting alternative works')
  await page.getByRole('tab', { name: 'Directions' }).click()
  await page.getByText('Turn left onto Test Chowk Road').waitFor(); ok('turn-by-turn directions shown')
  await page.waitForTimeout(1300); await page.screenshot({ path: OUT + '/desktop.png' })
  await page.locator('.rhead').nth(0).click()
  await page.getByRole('button', { name: /Open full report/ }).click()
  await page.getByRole('dialog', { name: 'Full route report' }).waitFor(); ok('full report opens')
  const dlg = page.getByRole('dialog', { name: 'Full route report' })
  await dlg.getByText('Test Hospital').first().waitFor(); await dlg.getByText('Test Police Station').first().waitFor(); ok('report lists hospital and police with names')
  assert.ok(await dlg.locator('.strip-dot').count() >= 3); ok('route strip shows positions')
  assert.ok(await dlg.locator('.tag.demo').count() > 0); ok('demo rows carry a Demo tag')
  assert.ok(await dlg.getByRole('button', { name: /Print/ }).count() > 0); ok('print button present')
  await page.screenshot({ path: OUT + '/report.png' })
  await page.locator('.report-modal').click({ position: { x: 3, y: 3 } })
  await page.getByLabel('Map layers').click(); await page.getByLabel('Demo placeholders where no real data').uncheck()
  await page.getByRole('button', { name: /Open full report/ }).click()
  await dlg.getByText('CCTV coverage data unavailable').waitFor(); await dlg.getByText('Insufficient verified data').first().waitFor(); assert.equal(await dlg.locator('.tag.demo').count(), 0); ok('demo off: report falls back to honest "unavailable / insufficient"')
  await page.locator('.report-modal').click({ position: { x: 3, y: 3 } })
  await page.getByLabel('Methodology').click(); await page.getByText('How SurakshaSetu compares routes').waitFor(); ok('methodology modal opens')
  await page.keyboard.press('Escape'); await page.locator('.modal').click({ position: { x: 5, y: 5 } })
  await page.getByLabel('Community').click(); await page.getByText('Request community help').first().click(); await page.getByLabel('Feeling unsafe').check(); await page.getByLabel('Do not share location').check(); await page.getByText('Submit simulated request').click(); await page.getByText('SIMULATED').first().waitFor(); ok('simulated SOS flow still works')
  assert.deepEqual(errors, []); ok('no page errors')
  assert.ok(page.tileHosts.size > 0, 'no tile requests'); assert.deepEqual([...page.tileHosts], ['tile.openstreetmap.org']); ok('tiles requested only from tile.openstreetmap.org (no CARTO)')
  assert.equal(await page.locator('.leaflet-control-attribution').innerText().then(x => /OpenStreetMap/.test(x)), true); ok('OSM attribution visible')
  const box = await page.locator('.map').boundingBox(); assert.ok(box.width > 300 && box.height > 300); ok('map container has real size')
  await page.close()
}
// 2. Single route
{ mode = { osrm: 'single', overpass: 'ok' }
  const { page } = await newPage({ width: 1366, height: 800 }); await page.goto(APP)
  await page.getByText('Dighori → Wadi').click(); await page.waitForFunction(() => document.querySelectorAll('.rcard').length >= 2, null, { timeout: 20000 })
  ok('engine returned 1 route: extra real routes found via waypoint'); await page.close() }
{ mode = { osrm: 'single-noextra', overpass: 'ok' }
  const { page } = await newPage({ width: 1366, height: 800 }); await page.goto(APP)
  await page.getByText('Dighori → Wadi').click(); await page.waitForSelector('.rcard'); await page.getByText(/none were invented/).waitFor()
  assert.equal(await page.locator('.rcard').count(), 1); ok('no extra route available: nothing fabricated, user told'); await page.close() }
// user-supplied real data files override demo placeholders
{ mode = { osrm: 'ok', overpass: 'ok' }
  const { page } = await newPage({ width: 1366, height: 800 })
  await page.route('**/data/cctv.json', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify([{ lat: 21.125, lng: 79.102, name: 'Test cam', source: 'TEST survey' }]) }))
  await page.route('**/data/crime.json', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify([{ lat: 21.125, lng: 79.102, category: 'Test category', period: '2024', source: 'TEST police file' }]) }))
  await page.goto(APP); await page.getByText('Dighori → Sadar').click(); await page.waitForFunction(() => document.querySelectorAll('.rcard').length >= 3, null, { timeout: 20000 })
  await page.getByRole('button', { name: /Open full report/ }).click(); const dlg = page.getByRole('dialog', { name: 'Full route report' })
  await dlg.getByText('Test category').waitFor(); await dlg.getByText('TEST police file').waitFor(); await dlg.getByText(/Supplied data file/).waitFor()
  assert.equal(await dlg.locator('.tag.demo').count(), 0); ok('user-supplied CCTV/crime files shown as real (no Demo tag) with their source'); await page.close() }
// 3. No route
{ mode = { osrm: 'noroute', overpass: 'ok' }
  const { page } = await newPage({ width: 1366, height: 800 }); await page.goto(APP)
  await page.getByText('Dighori → Sitabuldi').click(); await page.getByRole('alert').getByText('No drivable road route').waitFor(); ok('NoRoute handled'); await page.close() }
// 4. Routing service down
{ mode = { osrm: 'down', overpass: 'ok' }
  const { page } = await newPage({ width: 1366, height: 800 }); await page.goto(APP)
  await page.getByText('Dighori → Sadar').click(); await page.getByText('Could not reach the service').waitFor(); ok('routing network failure handled'); await page.close() }
// 5. Overpass down: routes still shown
{ mode = { osrm: 'ok', overpass: 'down' }
  const { page, errors } = await newPage({ width: 1366, height: 800 }); await page.goto(APP)
  await page.getByText('Dighori → Sadar').click(); await page.waitForSelector('.rcard'); await page.getByRole('button', { name: 'Retry' }).waitFor({ timeout: 60000 })
  assert.equal(await page.locator('.state.warn, .notice.warn').count(), 0); assert.equal(await page.getByText('Insufficient data').count(), 0); assert.deepEqual(errors, []); ok('Overpass failure: slim retry line only, no yellow boxes, routes intact'); await page.close() }
// 5b. Overpass never answers: spinner must end, routes intact
{ mode = { osrm: 'ok', overpass: 'hang' }
  const { page } = await newPage({ width: 1366, height: 800 }); await page.goto(APP)
  await page.getByText('Dighori → Sadar').click(); await page.waitForSelector('.rcard')
  await page.getByRole('button', { name: 'Retry' }).waitFor({ timeout: 90000 })
  assert.equal(await page.locator('.skeleton').count(), 0); assert.equal(await page.locator('.spin').count(), 0)
  assert.equal(await page.locator('.state.warn, .notice.warn').count(), 0); await page.getByRole('tab', { name: 'Directions' }).click(); await page.getByText('Turn left onto Test Chowk Road').waitFor()
  ok('hung Overpass: loading ends via timeout, directions still work'); await page.close() }
// 5c. Only the optional road query hangs: analysis shows immediately
{ mode = { osrm: 'ok', overpass: 'hang-road' }
  const { page } = await newPage({ width: 1366, height: 800 }); await page.goto(APP)
  await page.getByText('Dighori → Sadar').click(); await page.waitForSelector('.rcard')
  await page.getByText('Partial evidence').waitFor({ timeout: 15000 }); assert.equal(await page.locator('.skeleton').count(), 0)
  ok('safety evidence shown without waiting for optional road data')
  await page.waitForFunction(() => !document.body.innerText.includes('Loading optional road details'), null, { timeout: 60000 }); ok('optional road loading finishes after timeouts'); await page.close() }
// 5d. Downloaded real-data snapshot is used instantly, even when live Overpass is down
{ mode = { osrm: 'ok', overpass: 'down' }
  const { page } = await newPage({ width: 1366, height: 800 })
  await page.route('**/data/osm-nagpur.json', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ fetchedAt: '2026-10-30T00:00:00Z', bbox: { south: 20, west: 78, north: 22, east: 80 }, elements: [
    { type: 'node', id: 11, lat: 21.12, lon: 79.10, tags: { amenity: 'police', name: 'Snapshot Police Station' } }, { type: 'node', id: 12, lat: 21.14, lon: 79.09, tags: { amenity: 'hospital', name: 'Snapshot Hospital' } } ] }) }))
  await page.goto(APP); await page.getByText('Dighori → Sadar').click(); await page.waitForFunction(() => document.querySelectorAll('.rcard').length >= 3, null, { timeout: 20000 })
  await page.getByRole('button', { name: /Open full report/ }).click(); const dlg = page.getByRole('dialog', { name: 'Full route report' })
  await dlg.getByText('Snapshot Hospital').first().waitFor(); await dlg.getByText('Snapshot Police Station').first().waitFor(); await dlg.getByText(/snapshot downloaded/).waitFor()
  assert.equal(await page.getByRole('button', { name: 'Retry' }).count(), 0); ok('snapshot data shown instantly with live Overpass down'); await page.close() }
// 6. Mobile + pick on map
{ mode = { osrm: 'ok', overpass: 'ok' }
  const { page } = await newPage({ width: 390, height: 800 }); await page.goto(APP)
  await page.getByLabel('Pick Start on map').click(); await page.locator('.map').click({ position: { x: 200, y: 200 } })
  await page.getByLabel('Pick Destination on map').click(); await page.locator('.map').click({ position: { x: 250, y: 260 } })
  await page.waitForSelector('.rcard'); ok('map-click origin/destination plans a route (mobile)')
  await page.screenshot({ path: OUT + '/mobile.png' })
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth); assert.equal(overflow, false); ok('no horizontal overflow on mobile'); await page.close() }
await browser.close()
console.log(`\n${results.length} checks passed`)
