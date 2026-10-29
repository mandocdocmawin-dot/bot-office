import { test } from 'vite-plus/test'
import assert from 'node:assert/strict'
import { GameLoop } from './loop.js'

test('GameLoop runs fixed ticks and dispatches broadcast', async () => {
    let ticks = 0
    let broadcasts = 0
    let lastDt = 0

    const loop = new GameLoop(
        20, // 20 Hz = 50ms fixed step
        (dt) => {
            ticks++
            lastDt = dt
        },
        () => {
            broadcasts++
        }
    )

    loop.start()
    await new Promise((resolve) => setTimeout(resolve, 125))
    loop.stop()

    assert.ok(ticks >= 2, `Expected at least 2 ticks, got ${ticks}`)
    assert.equal(lastDt, 0.05)
    assert.ok(broadcasts >= 2, `Expected at least 2 broadcasts, got ${broadcasts}`)

    const ticksAfterStop = ticks
    await new Promise((resolve) => setTimeout(resolve, 60))
    assert.equal(ticks, ticksAfterStop, 'Loop must stop ticking after stop() is called')
})
