import { test } from 'vite-plus/test'
import assert from 'node:assert/strict'
import { TAMBAYAN_PODS, roomDisplayName, tambayanObstacles } from '@office/shared/rooms'
import { loadConfig } from './config.js'
import { World } from './world.js'

test('Tambayan retains Commons identity and leaves a clear cross through all four doors', () => {
    assert.equal(roomDisplayName('Commons'), 'Tambayan')
    const config = loadConfig()
    const room = config.rooms.find(room => room.name === 'Commons')!
    const world = new World(config)
    const center = { x: room.x + room.w / 2, y: room.y + 242 }
    const entrances = [
        { x: room.x + room.w / 2, y: room.y - 14 },
        { x: room.x + room.w / 2, y: room.y + room.h + 14 },
        { x: room.x - 14, y: room.y + 242 },
        { x: room.x + room.w + 14, y: room.y + 242 }
    ]
    for (const entrance of entrances) {
        assert.ok(world.walkable(entrance.x, entrance.y))
        assert.ok(world.clearLine(center, entrance), `Blocked Tambayan entrance: ${JSON.stringify(entrance)}`)
    }
    for (const pod of TAMBAYAN_PODS) {
        assert.equal(world.walkable(room.x + pod.x, room.y + pod.y), false, 'Tables and seating pods reserve collision space')
    }
})

test('all rendered Tambayan objects block walking and clicks, including coffee and plants', () => {
    const config = loadConfig()
    const room = config.rooms.find(room => room.name === 'Commons')!
    const world = new World(config)
    const start = { x: room.x + 262, y: room.y + 242 }
    for (const obstacle of tambayanObstacles(room)) {
        const center = { x: obstacle.x + obstacle.w / 2, y: obstacle.y + obstacle.h / 2 }
        assert.equal(world.walkable(center.x, center.y), false)
        assert.deepEqual(world.path(start, center), [])
    }
    const stopped = world.step({ x: room.x + 130, y: room.y + 119 }, -300, 0)
    assert.ok(stopped.x > room.x + 81, 'manual movement must stop at the coffee counter')
    assert.ok(world.walkable(stopped.x, stopped.y))
    assert.ok(world.walkable(room.x + 105 + 59, room.y + 335 + 59), 'rug corners remain usable')
})
