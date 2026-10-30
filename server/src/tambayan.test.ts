import { test } from 'vite-plus/test'
import assert from 'node:assert/strict'
import { TAMBAYAN_PODS, roomDisplayName } from '@office/shared/rooms'
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
