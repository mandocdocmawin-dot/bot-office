const { chromium } = require('C:/Users/Marwin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const assert = require('node:assert/strict')
require('node:fs').mkdirSync('.qa', { recursive: true })
;(async () => {
 const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
 try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 })
  const errors = [], badAssets = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('response', response => { if (response.url().includes('/assets/tambayan/') && !response.ok()) badAssets.push(response.url()) })
  await page.route('**/src/scene.ts*', async route => {
   const response = await route.fetch()
   await route.fulfill({ response, body: (await response.text()).replace('this.avatarManager =', 'window.__qaOffice = this; this.avatarManager =') })
  })
  await page.goto('http://127.0.0.1:5174/')
  await page.waitForFunction(() => window.__qaOffice?.tambayan && document.querySelector('#connection')?.textContent === 'Connected', { timeout: 30000 })
  await page.waitForTimeout(500)
  await page.screenshot({ path: '.qa/tambayan-v2-full-map.png' })
  // Use the actual accessible roster control to enter the new focus view.
  await page.getByRole('button', { name: 'Open people', exact: true }).click()
  await page.getByRole('button', { name: /^Tambayan/ }).click()
  await page.getByRole('button', { name: 'Close people', exact: true }).click()
  await page.waitForTimeout(200)
  await page.screenshot({ path: '.qa/tambayan-v2-closeup.png' })
  const result = await page.evaluate(() => {
   const scene = window.__qaOffice, room = scene.tambayan
   const chairsBefore = [...room.chairs.values()].map(chair => ({ chair, scale: chair.scaleX }))
   room.setMembers(Array.from({ length: 30 }, (_, i) => ({ id: `qa-${i}`, room: 'Commons' })))
   const unchanged = chairsBefore.every(({ chair, scale }, i) => chair === [...room.chairs.values()][i] && chair.scaleX === scale)
   const focus = scene.focusedRoom
   const hiddenOthers = [...scene.roomLabels.entries()].filter(([id]) => id !== 'Commons').every(([, label]) => !label.visible)
   const isolated = [...scene.roomObjects.entries()].filter(([id]) => id !== 'Commons')
    .every(([, objects]) => objects.every(object => !object.visible)) && scene.worldObjects.every(object => !object.visible)
   const textureCount = scene.textures.getTextureKeys().filter(key => key.startsWith('tambayan-v2:')).length
   return { capacity: room.capacity, chairCount: room.chairs.size, unchanged, overflow: room.overflow.text, focus, hiddenOthers, isolated, textureCount }
  })
  assert.equal(result.capacity, 12)
  assert.equal(result.chairCount, 12)
  assert.equal(result.unchanged, true)
  assert.equal(result.overflow, '18 standing · 12 seats')
  assert.equal(result.focus, 'Commons')
  assert.equal(result.hiddenOthers, true)
  assert.equal(result.isolated, true)
  assert.equal(result.textureCount, 10)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(250)
  await page.screenshot({ path: '.qa/tambayan-v2-mobile-focus.png' })
  await page.getByRole('button', { name: 'Fit', exact: true }).click()
  assert(await page.evaluate(() => [...window.__qaOffice.roomLabels.values()].every(label => label.visible)))
  assert(await page.evaluate(() => window.__qaOffice.worldObjects.every(object => object.visible)))
  assert(await page.evaluate(() => [...window.__qaOffice.roomObjects.values()].every(objects => objects.some(object => object.visible))))
  await page.screenshot({ path: '.qa/tambayan-v2-mobile-fit.png' })
  assert.deepEqual(errors, [])
  assert.deepEqual(badAssets, [])
  console.log(JSON.stringify({ ...result, errors, badAssets }))
 } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
