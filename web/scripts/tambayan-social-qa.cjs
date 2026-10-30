const { chromium } = require('C:/Users/Marwin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const assert = require('node:assert/strict')
require('node:fs').mkdirSync('.qa', { recursive: true })
;(async () => {
 const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
 try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => {
   const NativeSocket = window.WebSocket
   window.WebSocket = class extends NativeSocket {
    constructor(...args) { super(...args); window.__qaSocket = this; this.addEventListener('close', event => { window.__qaClose = { code: event.code, reason: event.reason } }) }
   }
  })
  await page.route('**/src/scene.ts*', async route => {
   const response = await route.fetch()
   await route.fulfill({ response, body: (await response.text()).replace('this.avatarManager =', 'window.__qaOffice = this; this.avatarManager =') })
  })
  await page.goto('http://127.0.0.1:5174/')
  try {
   await page.waitForFunction(() => window.__qaOffice?.tambayan && window.__qaSocket?.readyState === 1 && window.__qaOffice.selfId, { timeout: 12000 })
  } catch (error) {
   console.log(await page.evaluate(() => ({ scene: !!window.__qaOffice, socket: window.__qaSocket?.readyState, selfId: window.__qaOffice?.selfId, connection: document.querySelector('#connection')?.textContent, body: document.body.innerText.slice(0, 250) })))
   console.log(errors)
   throw error
  }
  await page.evaluate(() => window.__qaSocket.send(JSON.stringify({ type: 'sit', seatId: '0:2' })))
  try {
   await page.waitForFunction(() => { const s = window.__qaOffice; return s.people.get(s.selfId)?.member.seatId === '0:2' }, undefined, { timeout: 15000 })
  } catch (error) {
   console.log(await page.evaluate(() => { const s = window.__qaOffice, m = s.people.get(s.selfId)?.member; return { closed: window.__qaClose, socketUrl: window.__qaSocket.url, socketState: window.__qaSocket.readyState, own: m && { x: m.x, y: m.y, seatId: m.seatId, room: m.room, moving: m.moving }, connection: document.querySelector('#connection')?.textContent } }))
   throw error
  }
  await page.evaluate(() => window.__qaOffice.focusRoom('Commons'))
  await page.waitForTimeout(100)
  const seated = await page.evaluate(() => { const s = window.__qaOffice, p = s.people.get(s.selfId); return { seatId: p.member.seatId, legAngle: p.legs[0].angle, moving: p.member.moving } })
  assert.equal(seated.seatId, '0:2')
  assert.equal(Math.abs(seated.legAngle), 65)
  assert.equal(seated.moving, false)
  await page.screenshot({ path: '.qa/tambayan-seated.png' })
  await page.evaluate(() => {
   const s = window.__qaOffice, seat = s.seats.get('0:2')
   const x = seat.x + 44, y = seat.y
   s.cameras.main.setZoom(2.6).centerOn(900 + (x - y) * .86, 60 + (x + y) * .6 - 15)
   s.reportZoom()
  })
  await page.waitForTimeout(100)
  await page.screenshot({ path: '.qa/tambayan-seating-closeup.png' })
  await page.evaluate(() => window.__qaOffice.focusRoom('Commons'))
  await page.evaluate(() => window.__qaSocket.send(JSON.stringify({ type: 'stand' })))
  await page.waitForFunction(() => { const s = window.__qaOffice; return !s.people.get(s.selfId)?.member.seatId })
  await page.evaluate(() => window.__qaSocket.send(JSON.stringify({ type: 'chat', text: 'Hello General' })))
  await page.waitForFunction(() => { const s = window.__qaOffice; return !!s.people.get(s.selfId)?.member.seatId }, { timeout: 15000 })
  await page.waitForTimeout(1000)
  const friend = await page.evaluate(() => {
   const s = window.__qaOffice
   const candidates = [...s.people.values()].filter(p => p.member.id !== s.selfId && !p.member.sleeping && p.member.presence !== 'offline')
   candidates.sort((a, b) => Math.hypot(a.member.x - s.people.get(s.selfId).member.x, a.member.y - s.people.get(s.selfId).member.y) - Math.hypot(b.member.x - s.people.get(s.selfId).member.x, b.member.y - s.people.get(s.selfId).member.y))
   const friend = candidates[0].member
   window.__qaSocket.send(JSON.stringify({ type: 'chat', text: `@${friend.username} hello` }))
   return { id: friend.id, name: friend.username }
  })
  await page.waitForFunction(id => {
   const s = window.__qaOffice, own = s.people.get(s.selfId)?.member, friend = s.people.get(id)?.member
   return own && friend && !own.seatId && Math.hypot(own.x - friend.x, own.y - friend.y) <= 80
  }, friend.id, { timeout: 20000 })
  await page.screenshot({ path: '.qa/tambayan-mention-approach.png' })
  // Real server movement into the coffee footprint must stop at its boundary.
  await page.evaluate(() => window.__qaSocket.send(JSON.stringify({ type: 'move_to', x: 568, y: 364 })))
  await page.waitForFunction(() => { const s = window.__qaOffice, p = s.people.get(s.selfId)?.member; return p && Math.hypot(p.x - 568, p.y - 364) < 3 }, { timeout: 20000 })
  await page.evaluate(async () => {
   for (let i = 0; i < 35; i++) { window.__qaSocket.send(JSON.stringify({ type: 'input', dx: -1, dy: 0 })); await new Promise(resolve => setTimeout(resolve, 50)) }
   window.__qaSocket.send(JSON.stringify({ type: 'input', dx: 0, dy: 0 }))
  })
  await page.waitForTimeout(150)
  const stopped = await page.evaluate(() => { const s = window.__qaOffice, p = s.people.get(s.selfId).member; s.focusRoom('Commons'); return { x: p.x, y: p.y } })
  assert(stopped.x > 519, `Passed through counter: ${JSON.stringify(stopped)}`)
  await page.screenshot({ path: '.qa/tambayan-counter-collision.png' })
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ seated, autoSit: true, mention: friend.name, stopped, errors }))
 } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
