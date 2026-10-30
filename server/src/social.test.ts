import { test } from 'vite-plus/test'
import assert from 'node:assert/strict'
import { Office } from './office.js'
import { loadConfig } from './config.js'
import { parsePacket } from './app.js'

function fixture() {
    let now = 1000
    const office = new Office(loadConfig(), 'multiplayer', () => {}, () => now)
    const tick = (steps = 1) => { for (let i = 0; i < steps; i++) { now += 50; office.tick(.05) } }
    const join = (id: string, username = id) => {
        office.upsertDiscord({ id, username, avatar: null }, 'online')
        return office.members.get(id)!
    }
    return { office, tick, join }
}

test('General messages walk to a reserved chair, sit on arrival, and release on manual movement', () => {
    const { office, tick, join } = fixture()
    const player = join('alice', 'Alice')
    office.discordMessage(player.id, 'Commons', 'hello')
    assert.equal(player.seatId, undefined, 'must walk rather than teleport into a chair')
    assert.ok(player.path.length)
    tick(400)
    assert.ok(player.seatId)
    assert.equal(player.room, 'Commons')
    assert.equal(player.moving, false)
    assert.equal(office.snapshot().members[0].seatId, player.seatId)
    const occupied = player.seatId
    tick(2450)
    assert.equal(player.seatId, occupied, 'General seating must survive the unrelated two-minute room-return timer')
    office.input(player.id, { type: 'input', dx: 0, dy: 0 })
    assert.ok(player.seatId, 'stale key-up must not stand the seated member')
    office.input(player.id, { type: 'input', dx: 1, dy: 0 })
    assert.equal(player.seatId, undefined)
    assert.ok(office.world.walkable(player.x, player.y), 'stand at a safe chair approach point')
})

test('twelve simultaneous requests have exclusive seats, overflow stands, and disconnect frees a claim', () => {
    const { office, tick, join } = fixture()
    for (let i = 0; i < 13; i++) { join(`person-${i}`); office.discordMessage(`person-${i}`, 'Commons', 'hello') }
    tick(700)
    const seated = [...office.members.values()].filter(member => member.seatId)
    assert.equal(seated.length, 12)
    assert.equal(new Set(seated.map(member => member.seatId)).size, 12)
    const first = seated[0], seatId = first.seatId!
    office.forgetDiscordMember(first.id)
    const overflow = [...office.members.values()].find(member => !member.seatId)!
    office.input(overflow.id, { type: 'sit', seatId })
    tick(400)
    assert.equal(overflow.seatId, seatId)
})

test('a mention approaches the tracked friend, frees a seated sender, and never moves the friend', () => {
    const { office, tick, join } = fixture()
    const alice = join('alice', 'Alice'), bob = join('bob', 'Bob')
    office.discordMessage(alice.id, 'Commons', 'hello')
    tick(300)
    assert.ok(alice.seatId)
    const bobBefore = { x: bob.x, y: bob.y }
    office.config.discord!.message_previews = false
    office.discordMessage(alice.id, 'Commons', undefined, [bob.id])
    assert.equal(alice.seatId, undefined)
    tick(500)
    assert.ok(Math.hypot(alice.x - bob.x, alice.y - bob.y) <= 80)
    assert.deepEqual({ x: bob.x, y: bob.y }, bobBefore)
    assert.equal(alice.seatId, undefined)
})

test('local @name mentions work; ambiguous, self and unavailable mentions do not redirect', () => {
    const { office, tick, join } = fixture()
    const alice = join('alice', 'Alice'), bob = join('bob', 'Bob')
    Object.assign(alice, office.world.spawn('Commons'), { room: 'Commons' })
    office.input(alice.id, { type: 'chat', text: '@Bob hello' })
    tick(400)
    assert.ok(Math.hypot(alice.x - bob.x, alice.y - bob.y) <= 80)
    assert.equal(alice.seatId, undefined)
    assert.deepEqual(parsePacket('{"type":"sit","seatId":"0:0","memberId":"bob"}'), { type: 'sit', seatId: '0:0' })
    assert.equal(parsePacket('{"type":"sit","seatId":"999:0"}'), undefined)
})

test('manual walking cancels mention approach and expired targets cannot keep a follower moving', () => {
    const { office, tick, join } = fixture()
    const alice = join('alice'), bob = join('bob')
    office.discordMessage(alice.id, 'Commons', undefined, [bob.id])
    office.input(alice.id, { type: 'input', dx: 1, dy: 0 })
    assert.equal(alice.path.length, 0)
    tick(2)
    office.discordMessage(alice.id, 'Commons', undefined, [bob.id])
    office.forgetDiscordMember(bob.id)
    tick(2)
    assert.equal(alice.path.length, 0)
})

test('ambiguous, self and offline mentions keep the General sender seated instead of chasing', () => {
    const { office, tick, join } = fixture()
    const alice = join('alice', 'Alice')
    join('bob', 'Bob'); join('bob-2', 'Bob')
    Object.assign(alice, office.world.spawn('Commons'), { room: 'Commons' })
    office.input(alice.id, { type: 'chat', text: '@Bob hello' })
    tick(300)
    assert.ok(alice.seatId)
    office.discordMessage(alice.id, 'Commons', '@Alice hello', [alice.id])
    assert.ok(alice.seatId)
    office.discordPresence('bob', 'offline')
    office.discordMessage(alice.id, 'Commons', undefined, ['bob'])
    assert.ok(alice.seatId)
})

test('approaching a seated friend uses an open point outside furniture', () => {
    const { office, tick, join } = fixture()
    const alice = join('alice'), bob = join('bob')
    office.discordMessage(bob.id, 'Commons', 'hello')
    tick(300)
    assert.ok(bob.seatId)
    office.discordMessage(alice.id, 'Commons', undefined, [bob.id])
    tick(300)
    assert.equal(alice.seatId, undefined)
    assert.ok(office.world.walkable(alice.x, alice.y))
    assert.ok(Math.hypot(alice.x - bob.x, alice.y - bob.y) < 80)
})
