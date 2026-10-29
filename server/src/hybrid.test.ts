import { test } from 'vite-plus/test'
import assert from 'node:assert/strict'
import { loadConfig } from './config.js'
import { Office } from './office.js'
import { selectVoiceChannel } from './voice-policy.js'

function fixture() {
    let now = 1000
    const config = loadConfig()
    config.discord!.hybrid_controls = true
    const office = new Office(
        config,
        'multiplayer',
        () => {},
        () => now
    )
    office.upsertDiscord({ id: '1', username: 'Hybrid', avatar: null }, 'online')
    const tick = (ms = 50) => {
        now += ms
        office.tick(ms / 1000)
    }
    return { office, p: office.members.get('1')!, config, tick }
}
test('hybrid accepts manual movement for Discord members and still enforces speed and walls', () => {
    const { office, p, config, tick } = fixture()
    const start = { x: p.x, y: p.y }
    office.input(p.id, { type: 'input', dx: 1, dy: 0 })
    tick()
    assert.ok(p.x > start.x)
    assert.ok(Math.hypot(p.x - start.x, p.y - start.y) <= config.player_speed * 0.05 + 0.001)
    Object.assign(p, { x: 940, y: 110 })
    for (let i = 0; i < 50; i++) {
        office.input(p.id, { type: 'input', dx: 1, dy: 0 })
        tick()
    }
    assert.ok(p.x <= 952)
    assert.ok(office.world.walkable(p.x, p.y))
})
test('manual walking takes over a Discord path; the next Discord activity sets a new destination', () => {
    const { office, p, tick } = fixture()
    office.discordMessage(p.id, 'Study Hall')
    assert.ok(p.path.length)
    office.input(p.id, { type: 'input', dx: 1, dy: 0 })
    assert.equal(p.path.length, 0)
    tick()
    office.discordMessage(p.id, 'Tech Lab')
    assert.ok(p.path.length)
    assert.equal(p.dx, 0)
    const last = p.path.at(-1)!
    assert.equal(office.world.roomAt(last.x, last.y), 'Tech Lab')
    // A delayed key-release must not cancel this new automatic trip.
    office.input(p.id, { type: 'input', dx: 0, dy: 0 })
    assert.ok(p.path.length)
})
test('manual click cancels a pending Discord return and renews the idle timer', () => {
    const { office, p, config, tick } = fixture()
    office.discordMessage(p.id, 'Study Hall')
    const target = office.world.spawn('Studio')
    office.input(p.id, { type: 'move_to', ...target })
    for (let i = 0; i < 2000 && p.path.length > 0; i++) {
        tick()
    }
    assert.equal(p.room, 'Studio')
    tick(120_000)
    assert.equal(p.room, 'Studio')
    assert.equal(p.path.length, 0)
    tick(config.idle_timeout_ms)
    assert.equal(p.sleeping, true)
    office.input(p.id, { type: 'wake' })
    assert.equal(p.sleeping, false)
    tick()
    assert.equal(p.sleeping, false)
})
test('hybrid can wander while in voice; next voice/chat event routes to its voice room', () => {
    const { office, p } = fixture()
    office.discordVoice(p.id, 'Commons', {
        channelId: 'general',
        channelName: 'General',
        muted: false
    })
    office.input(p.id, { type: 'move_to', ...office.world.spawn('Studio') })
    assert.equal(office.world.roomAt(p.path.at(-1)!.x, p.path.at(-1)!.y), 'Studio')
    office.discordMessage(p.id, 'Study Hall')
    assert.equal(office.world.roomAt(p.path.at(-1)!.x, p.path.at(-1)!.y), 'Commons')
})
test('speaking is independent of room, clears on mute/leave, and expires after lost events', () => {
    const { office, p, tick } = fixture()
    office.speaking(p.id, true)
    assert.ok(!p.speaking)
    office.discordVoice(p.id, 'Commons', {
        channelId: 'general',
        channelName: 'General',
        muted: false
    })
    office.speaking(p.id, true)
    assert.equal(office.snapshot().members[0].speaking, true)
    office.input(p.id, { type: 'input', dx: 1, dy: 0 })
    tick()
    assert.equal(p.speaking, true)
    tick(800)
    assert.equal(p.speaking, false)
    office.speaking(p.id, true)
    office.discordVoiceState(p.id, { channelId: 'general', channelName: 'General', muted: true })
    assert.equal(p.speaking, false)
    const position = { x: p.x, y: p.y }
    const { path } = p
    office.discordVoiceState(p.id, { channelId: 'general', channelName: 'General', muted: false })
    assert.deepEqual({ x: p.x, y: p.y }, position)
    assert.equal(p.path, path)
    office.discordVoiceState(p.id, { channelId: 'general', channelName: 'General', muted: true })
    office.speaking(p.id, true)
    tick()
    assert.equal(p.speaking, false)
    office.discordVoiceState(p.id, { channelId: 'general', channelName: 'General', muted: false })
    office.speaking(p.id, true)
    office.discordVoice(p.id, null)
    assert.equal(p.speaking, false)
    assert.equal(p.inVoice, false)
})
test('voice monitor chooses a stable occupied channel and honors an explicit selection', () => {
    const channels = [
        { id: 'general', humans: 1 },
        { id: 'other', humans: 3 },
        { id: 'empty', humans: 0 }
    ]
    assert.equal(selectVoiceChannel(channels, undefined, '', 'general'), 'general')
    assert.equal(selectVoiceChannel(channels, 'other', '', 'general'), 'other')
    assert.equal(selectVoiceChannel(channels, 'general', 'other', 'general'), 'other')
    assert.equal(selectVoiceChannel(channels, undefined, 'empty', 'general'), undefined)
    assert.equal(selectVoiceChannel([], 'general', '', 'general'), undefined)
})
test('click-to-move escapes the narrow strip between reception desk and wall', () => {
    const { office, p, tick } = fixture()
    Object.assign(p, { x: 848, y: 205 })
    assert.ok(office.world.walkable(p.x, p.y))
    const target = { x: 675, y: 445 }
    office.input(p.id, { type: 'move_to', ...target })
    assert.ok(p.path.length)
    for (let i = 0; i < 2000 && p.path.length > 0; i++) {
        tick()
        assert.ok(office.world.walkable(p.x, p.y))
    }
    assert.equal(p.room, 'Commons')
    assert.ok(Math.hypot(p.x - target.x, p.y - target.y) < 3)
})
