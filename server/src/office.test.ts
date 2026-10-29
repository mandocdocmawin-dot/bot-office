import { test } from 'vite-plus/test'
import assert from 'node:assert/strict'
import { loadConfig, validateConfig } from './config.js'
import { Office } from './office.js'
import { ROOMS } from './protocol.js'
import { parsePacket } from './app.js'

const fixture = () => {
    let time = 1000
    const bubbles: string[] = []
    const config = loadConfig()
    const office = new Office(
        config,
        'multiplayer',
        (_id, _room, text) => bubbles.push(text),
        () => time
    )
    office.join({ id: '1', username: 'Test', avatar: null })
    return {
        office,
        config,
        bubbles,
        advance: (ms: number) => {
            time += ms
            office.tick(ms / 1000)
        }
    }
}
test('spawns in Front Office; speed is bounded and diagonal input is normalized', () => {
    const { office, config, advance } = fixture()
    const p = office.members.get('1')!
    assert.equal(p.room, 'Front Office')
    const start = { x: p.x, y: p.y }
    office.input('1', { type: 'input', dx: 1, dy: 1 })
    advance(50)
    const distance = Math.hypot(p.x - start.x, p.y - start.y)
    assert.ok(distance <= config.player_speed * 0.05 + 0.001 && distance > 0)
})
test('input expires, elapsed time is capped, wall collision blocks tunnelling', () => {
    const { office, advance } = fixture()
    const p = office.members.get('1')!
    Object.assign(p, { x: 940, y: 110 })
    office.input('1', { type: 'input', dx: 1, dy: 0 })
    for (let i = 0; i < 4; i++) {
        advance(50)
    }
    assert.ok(p.x <= 952)
    assert.ok(office.world.walkable(p.x, p.y))
    advance(1000)
    const after = p.x
    advance(50)
    assert.equal(p.x, after)
    const blocked = office.world.step({ x: 940, y: 110 }, 500, 0)
    assert.ok(blocked.x <= 952)
})
test('doors connect every room; server routes clicks around walls and obstacles', () => {
    const { office } = fixture()
    const target = office.world.spawn('Commons')
    for (const room of ROOMS) {
        const start = office.world.spawn(room)
        const path = office.world.path(start, target)
        assert.ok(path.length, `No path from ${room} to Commons`)
        let previous = start
        for (const waypoint of path) {
            assert.ok(office.world.clearLine(previous, waypoint), `Unsafe segment in ${room}`)
            previous = waypoint
        }
    }
    assert.deepEqual(office.world.path(target, { x: -1, y: -1 }), [])
})
test('server completes click-to-move through doors without crossing walls', () => {
    const { office, advance } = fixture()
    const target = office.world.spawn('Study Hall')
    const p = office.members.get('1')!
    office.input('1', { type: 'move_to', ...target })
    for (let i = 0; i < 600 && Math.hypot(p.x - target.x, p.y - target.y) > 3; i++) {
        advance(50)
        assert.ok(office.world.walkable(p.x, p.y))
    }
    assert.equal(p.room, 'Study Hall')
    assert.ok(Math.hypot(p.x - target.x, p.y - target.y) < 3)
})
test('ten minutes without input teleports to Nap Room; any input wakes', () => {
    const { office, config, advance } = fixture()
    advance(config.idle_timeout_ms)
    const p = office.members.get('1')!
    assert.equal(p.room, 'Nap Room')
    assert.equal(p.sleeping, true)
    office.input('1', { type: 'wake' })
    assert.equal(p.sleeping, false)
    assert.equal(p.room, 'Nap Room')
})
test('bubbles are transient, capped at 80 characters, and throttled', () => {
    const { office, bubbles, advance } = fixture()
    office.input('1', { type: 'chat', text: '🙂'.repeat(100) })
    assert.equal([...bubbles[0]].length, 80)
    assert.ok(!JSON.stringify(office.snapshot()).includes('🙂'))
    assert.ok(!JSON.stringify([...office.members.values()]).includes('🙂'))
    office.input('1', { type: 'chat', text: 'too fast' })
    assert.equal(bubbles.length, 1)
    advance(1000)
    office.input('1', { type: 'emote', index: 0 })
    assert.equal(bubbles[1], '👋')
})
test('packets reject position spoofing, invalid types, excessive chat, and invalid emotes', () => {
    for (const packet of [
        { type: 'position', x: 5000, y: 5000 },
        { type: 'input', dx: 99, dy: 0 },
        { type: 'input', dx: '1', dy: 0 },
        { type: 'move_to', x: -5, y: 10 },
        { type: 'chat', text: 'a'.repeat(81) },
        { type: 'emote', index: 5 },
        null
    ]) {
        assert.equal(parsePacket(JSON.stringify(packet)), undefined)
    }
    assert.equal(parsePacket('{broken'), undefined)
    assert.deepEqual(parsePacket('{"type":"wake"}'), { type: 'wake' })
})
test('configuration validates geometry and simulation bounds', () => {
    const config = loadConfig()
    assert.throws(() => validateConfig({ ...config, tick_rate: 1000 }))
    assert.throws(() => validateConfig({ ...config, rooms: [] }))
    assert.throws(() => validateConfig({ ...config, player_speed: -1 }))
})
