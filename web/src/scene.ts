import Phaser from 'phaser'
import type { Member, Room, Snapshot } from '@office/shared/protocol'
import { AvatarTextureManager } from './avatar-manager'
import { eventBus } from './events'
import { colorCSS, doors, rooms } from './rooms'
import { Furnishing, WORLD_HEIGHT, WORLD_WIDTH, corners, polygon, project, slab, unproject } from './isometric'

interface Character {
    root: Phaser.GameObjects.Container
    body: Phaser.GameObjects.Container
    name: Phaser.GameObjects.Text
    status: Phaser.GameObjects.Arc
    bubble?: Phaser.GameObjects.Container | Phaser.GameObjects.DOMElement
    zzz: Phaser.GameObjects.Text
    member: Member
    walkPhase: number
    targetX: number
    targetY: number
    voiceRing: Phaser.GameObjects.Arc
    talk: Phaser.GameObjects.Container
    talkBars: Phaser.GameObjects.Rectangle[]
    voiceName: Phaser.GameObjects.Text
    legs: [Phaser.GameObjects.Container, Phaser.GameObjects.Container]
    arms: [Phaser.GameObjects.Container, Phaser.GameObjects.Container]
}
export class OfficeScene extends Phaser.Scene {
    private people = new Map<string, Character>()
    private counts = new Map<Room, Phaser.GameObjects.Text>()
    private pending?: Snapshot
    private built = false
    private fitZoom = 1
    private zoomFactor = 1
    private autoFit = true
    private viewportWidth = 0
    private viewportHeight = 0
    private selected?: Room
    private outlines = new Map<Room, Phaser.GameObjects.Graphics>()
    private reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
    private selfId = ''
    private frozen = false
    private avatarManager!: AvatarTextureManager
    constructor() {
        super('office')
    }
    create() {
        this.avatarManager = new AvatarTextureManager(this.textures)
        this.built = true
        const base = this.add.graphics()
        slab(base, 0, 0, 1400, 1000, -5, 38, 0x17_16_22)
        polygon(base, corners(18, 18, 1364, 964, -4), 0x201d2a)
        for (const door of doors) {
            polygon(base, corners(door.x, door.y, door.w, door.h), 0x49_41_57)
            const p = project(door.x + door.w / 2, door.y + door.h / 2)
            this.add.text(p.x, p.y, '◇', { fontSize: '20px', color: '#b9aacb' }).setOrigin(0.5).setDepth(4)
        }
        const furniture = new Furnishing(this)
        for (const room of rooms) {
            const { x, y, w, h, color, name } = room
            const g = this.add.graphics().setDepth(1)
            polygon(g, corners(x, y, w, h), 0x17_17_22)
            polygon(g, corners(x, y, w, h), color, 0.1)
            polygon(g, corners(x + 30, y + 50, w - 60, h - 85), color, name === 'Commons' ? 0.24 : 0.1)
            g.lineStyle(1, 0xff_ff_ff, 0.025)
            for (let line = 35; line < w; line += 32) {
                const a = project(x + line, y + 5)
                const b = project(x + line, y + h - 5)
                g.lineBetween(a.x, a.y, b.x, b.y)
            }
            const edge = corners(x, y, w, h)
            const wall = corners(x, y, w, h, 29)
            polygon(g, [edge[3], edge[0], wall[0], wall[3]], color, 0.09)
            polygon(g, [edge[0], edge[1], wall[1], wall[0]], color, 0.1)
            g.lineStyle(9, color, 0.06).strokePoints([wall[3], wall[0], wall[1]], false)
            g.lineStyle(3, color, 0.85).strokePoints([wall[3], wall[0], wall[1]], false)
            g.lineStyle(2, color, 0.45).strokePoints([edge[1], edge[2], edge[3]], false)
            const labelPoint = project(x + 15, y + 8, 55)
            const title = this.add
                .text(labelPoint.x, labelPoint.y, name, {
                    fontFamily: 'Arial',
                    fontSize: '19px',
                    fontStyle: 'bold',
                    color: colorCSS(color),
                    backgroundColor: '#100e19',
                    padding: { x: 7, y: 4 }
                })
                .setOrigin(0, 1)
                .setDepth(3000)
            this.counts.set(
                name,
                this.add
                    .text(labelPoint.x + title.width + 8, labelPoint.y - 5, '0', {
                        fontFamily: 'Arial',
                        fontSize: '16px',
                        color: '#ada6c1'
                    })
                    .setOrigin(0, 1)
                    .setDepth(3000)
            )
            // Mask wall rails at actual doors, so visual openings match collision geometry.
            for (const door of doors) {
                const crossesLeft = door.x < x && door.x + door.w > x
                const crossesRight = door.x < x + w && door.x + door.w > x + w
                const crossesTop = door.y < y && door.y + door.h > y
                const crossesBottom = door.y < y + h && door.y + door.h > y + h
                const alongY = door.y >= y && door.y + door.h <= y + h
                const alongX = door.x >= x && door.x + door.w <= x + w
                const wallX = crossesLeft ? x : x + w
                const wallY = crossesTop ? y : y + h
                if ((crossesLeft || crossesRight) && alongY) {
                    polygon(
                        g,
                        [
                            project(wallX, door.y, 30),
                            project(wallX, door.y + door.h, 30),
                            project(wallX, door.y + door.h),
                            project(wallX, door.y)
                        ],
                        0x25_23_2f
                    )
                }
                if ((crossesTop || crossesBottom) && alongX) {
                    polygon(
                        g,
                        [
                            project(door.x, wallY, 30),
                            project(door.x + door.w, wallY, 30),
                            project(door.x + door.w, wallY),
                            project(door.x, wallY)
                        ],
                        0x25_23_2f
                    )
                }
            }
            const outline = this.add.graphics().setDepth(3)
            outline.lineStyle(14, color, 0.12).strokePoints(edge, true)
            outline.lineStyle(4, color, 1).strokePoints(edge, true)
            outline.setVisible(false)
            this.outlines.set(name, outline)
            this.furnish(furniture, name, x, y, w, h, color)
        }
        const hub = project(485, 508)
        const beacon = this.add.graphics().setDepth(1000 + hub.y)
        beacon.fillStyle(0x64_e3_d3, 0.06).fillEllipse(hub.x, hub.y, 110, 55)
        slab(beacon, 468, 490, 35, 35, 15, 15, 0x39_38_4d)
        beacon.fillStyle(0x7d_e7_db, 0.13).fillCircle(hub.x, hub.y - 40, 30)
        beacon.fillStyle(0x73d6d1).fillCircle(hub.x, hub.y - 40, 19)
        beacon.fillStyle(0xb8fff0).fillEllipse(hub.x - 6, hub.y - 47, 10, 12)
        this.fit()
        const resize = () => this.resizeView()
        this.scale.on('resize', resize)
        // Own the canvas wheel event so the page cannot scroll or browser-zoom
        // instead of moving the office camera. Trackpads use small pixel deltas.
        const { canvas } = this.game
        const wheel = (event: WheelEvent) => {
            if (!event.deltaY) {
                return
            }
            event.preventDefault()
            const bounds = canvas.getBoundingClientRect()
            const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? bounds.height : 1)
            const change = -Math.sign(pixels) * Math.min(0.4, Math.max(0.025, Math.abs(pixels) * 0.002))
            this.zoom(change, {
                x: ((event.clientX - bounds.left) * this.scale.width) / bounds.width,
                y: ((event.clientY - bounds.top) * this.scale.height) / bounds.height
            })
        }
        canvas.addEventListener('wheel', wheel, { passive: false })
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            canvas.removeEventListener('wheel', wheel)
            this.scale.off('resize', resize)
        })
        this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
            if (!p.isDown) {
                return
            }
            if (Phaser.Math.Distance.Between(p.downX, p.downY, p.x, p.y) > 6) {
                this.autoFit = false
                this.cameras.main.stopFollow()
            }
            this.cameras.main.scrollX -= (p.x - p.prevPosition.x) / this.cameras.main.zoom
            this.cameras.main.scrollY -= (p.y - p.prevPosition.y) / this.cameras.main.zoom
        })
        this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
            if (!this.frozen && Phaser.Math.Distance.Between(p.downX, p.downY, p.x, p.y) < 6) {
                const world = this.cameras.main.getWorldPoint(p.x, p.y)
                const ground = unproject(world.x, world.y)
                // Clicking the empty stage is a camera interaction, not invalid input.
                if (ground.x >= 0 && ground.x <= 1400 && ground.y >= 0 && ground.y <= 1000) {
                    eventBus.emitEvent('office:move', ground)
                    window.dispatchEvent(new CustomEvent('office-move', { detail: ground }))
                }
            }
        })
        if (this.pending) {
            this.sync(this.pending)
        }
    }
    private furnish(f: Furnishing, name: Room, x: number, y: number, w: number, h: number, color: number) {
        f.plant(x + 20, y + 24, true)
        f.plant(x + w - 24, y + h - 22)
        if (name === 'Front Office') {
            f.desk(x + w - 180, y + 48, color, true)
            f.sofa(x + 35, y + h - 63, 0x6b_52_67, 105)
        } else if (name === 'Commons') {
            f.sofa(x + 135, y + h - 84, 0x6b_55_9b, 120)
            f.sofa(x + 295, y + h - 84, 0x6b559b, 120)
            const g = this.add.graphics().setDepth(1000 + project(x + 268, y + h - 60).y)
            slab(g, x + 265, y + h - 85, 28, 42, 21, 18, 0x806f65)
            f.desk(x + w - 120, y + 20, color)
        } else if (name === 'Meeting Room') {
            f.meeting(x + 125, y + h - 115, 250, color)
        } else if (name === 'Nap Room') {
            for (let i = 0; i < 3; i++) {
                f.bed(x + 50 + i * 100, y + h - 133, color)
            }
        } else if (name === 'Studio') {
            f.easel(x + w - 85, y + 60, 0xf0_a1_72)
            f.easel(x + w - 155, y + 35, 0xd3_7c_cf)
            f.desk(x + 40, y + h - 95, color)
            f.desk(x + w - 142, y + h - 95, color)
        } else if (name === 'Showcase') {
            f.easel(x + w - 80, y + 50, color)
            f.shelf(x + 55, y + 20, color)
            f.desk(x + 38, y + h - 98, color)
            f.desk(x + w - 142, y + h - 98, color)
        } else {
            f.desk(x + 42, y + h - 100, color)
            f.desk(x + w - 142, y + h - 100, color)
            if (name === 'Study Hall') {
                f.shelf(x + w - 155, y + 20, color)
            }
            if (name === 'Tech Lab') {
                const g = this.add.graphics().setDepth(1000 + project(x + w - 40, y + 53).y)
                for (let i = 0; i < 2; i++) {
                    slab(g, x + w - 72 + i * 25, y + 18, 20, 30, 63, 63, 0x34_37_45)
                    for (let j = 0; j < 5; j++) {
                        const p = project(x + w - 58 + i * 25, y + 49, 12 + j * 10)
                        g.fillStyle(color, 0.8).fillRect(p.x, p.y, 5, 2)
                    }
                }
            }
            if (name === 'Game Lounge') {
                f.sofa(x + w - 150, y + 28, 0x95_4d_7d)
            }
        }
    }
    update(time: number, delta: number) {
        for (const c of this.people.values()) {
            const own = c.member.id === this.selfId
            const blend =
                this.reducedMotion.matches || (own && !c.member.moving) ? 1 : 1 - Math.exp(-delta / (own ? 18 : 55))
            const previousX = c.root.x
            const previousY = c.root.y
            c.root.x += (c.targetX - c.root.x) * blend
            c.root.y += (c.targetY - c.root.y) * blend
            const travelled = Math.hypot(c.root.x - previousX, c.root.y - previousY)
            c.root.setDepth((c.bubble ? 4000 : 1000) + c.root.y)
            // Follow the rendered movement, including interpolation after a stop packet.
            // Distance-driven steps stay in sync at different speeds and frame rates.
            const walking = !this.frozen && (c.member.moving || travelled > 0.03)
            c.walkPhase = walking ? (c.walkPhase + (Math.min(travelled, 12) * Math.PI) / 19) % (Math.PI * 2) : 0
            const stride = Math.sin(c.walkPhase) * (this.reducedMotion.matches ? 0.35 : 1)
            c.legs[0].setPosition(-6 + stride * 2, -16 - Math.max(0, stride) * 5).setAngle(stride * 28)
            c.legs[1].setPosition(7 - stride * 2, -16 - Math.max(0, -stride) * 5).setAngle(-stride * 28)
            c.arms[0].setAngle(-stride * 20)
            c.arms[1].setAngle(stride * 20)
            const bounce = walking && !this.reducedMotion.matches
            c.body.y = bounce ? -Math.abs(stride) * 2 : 0
            c.body.angle = bounce ? stride * 2 : 0
            const speaking = !this.frozen && Boolean(c.member.speaking)
            c.voiceRing.setVisible(speaking)
            c.talk.setVisible(speaking && !c.bubble)
            const animate = speaking && !this.reducedMotion.matches
            c.voiceRing.setScale(animate ? 1.05 + Math.sin(time / 100) * 0.08 : 1)
            c.talkBars.forEach((bar, i) =>
                bar.setScale(1, animate ? 0.45 + Math.abs(Math.sin(time / 95 + i * 0.9)) * 0.65 : 0.7)
            )
            if (animate && !walking) {
                c.body.y = Math.sin(time / 95) * 1.5
                c.body.angle = Math.sin(time / 160) * 1.2
            }
        }
    }
    fit() {
        if (!this.built) {
            return
        }
        this.autoFit = true
        this.viewportWidth = this.scale.width
        this.viewportHeight = this.scale.height
        this.fitZoom = Math.min(this.scale.width / WORLD_WIDTH, this.scale.height / WORLD_HEIGHT) * 0.96
        this.zoomFactor = 1
        this.cameras.main.setZoom(this.fitZoom).centerOn(WORLD_WIDTH / 2 - 25, WORLD_HEIGHT / 2 - 12)
        this.reportZoom()
        this.cameras.main.stopFollow()
    }
    private resizeView() {
        if (!this.built || (this.viewportWidth === this.scale.width && this.viewportHeight === this.scale.height)) {
            return
        }
        if (this.autoFit) {
            this.fit()
            return
        }
        const camera = this.cameras.main
        const center = { x: camera.midPoint.x, y: camera.midPoint.y }
        this.viewportWidth = this.scale.width
        this.viewportHeight = this.scale.height
        this.fitZoom = Math.min(this.scale.width / WORLD_WIDTH, this.scale.height / WORLD_HEIGHT) * 0.96
        camera.setZoom(this.fitZoom * this.zoomFactor).centerOn(center.x, center.y)
        this.reportZoom()
    }
    zoom(delta: number, anchor?: { x: number; y: number }) {
        if (!this.built || !Number.isFinite(delta)) {
            return
        }
        const camera = this.cameras.main
        const oldZoom = camera.zoom
        this.autoFit = false
        camera.stopFollow()
        this.zoomFactor = Phaser.Math.Clamp(this.zoomFactor + delta, 0.5, 6)
        const nextZoom = this.fitZoom * this.zoomFactor
        camera.setZoom(nextZoom)
        if (anchor) {
            camera.scrollX += (anchor.x - camera.width / 2) * (1 / oldZoom - 1 / nextZoom)
            camera.scrollY += (anchor.y - camera.height / 2) * (1 / oldZoom - 1 / nextZoom)
        }
        this.reportZoom()
    }
    private reportZoom() {
        const zoom = Math.round(this.zoomFactor * 100)
        eventBus.emitEvent('office:zoom', { zoom })
        window.dispatchEvent(new CustomEvent('office-zoom', { detail: zoom }))
    }
    select(room?: Room) {
        this.selected = room
        for (const [name, outline] of this.outlines) {
            outline.setVisible(name === room)
        }
    }
    focus(id: string) {
        const c = this.people.get(id)
        if (c) {
            this.autoFit = false
            this.cameras.main.setZoom(Math.max(this.fitZoom * 1.8, this.cameras.main.zoom))
            this.zoomFactor = this.cameras.main.zoom / this.fitZoom
            this.reportZoom()
            this.cameras.main.startFollow(c.root, false, 0.12, 0.12)
        }
    }
    setSelf(id: string) {
        this.selfId = id
    }
    setFrozen(value: boolean) {
        this.frozen = value
    }
    sync(state: Snapshot) {
        this.pending = state
        if (!this.built) {
            return
        }
        const ownRoom = state.members.find((m) => m.id === this.selfId)?.room
        const ids = new Set(state.members.map((m) => m.id))
        for (const [id, c] of this.people) {
            if (!ids.has(id)) {
                this.tweens.killTweensOf(c.root)
                c.bubble = undefined
                this.avatarManager.release(c.member.id, c.member.avatar)
                c.root.destroy()
                this.people.delete(id)
            }
        }
        for (const room of rooms) {
            const members = state.members.filter((m) => m.room === room.name).sort((a, b) => a.id.localeCompare(b.id))
            this.counts.get(room.name)?.setText(String(members.length))
            members.forEach((m) => {
                const target = project(m.x, m.y)
                let c = this.people.get(m.id)
                if (!c) {
                    c = this.makeCharacter(m, target.x, target.y)
                    this.people.set(m.id, c)
                }
                // Interpolate authoritative 20 Hz snapshots; never trust browser positions.
                if (Math.hypot(c.root.x - target.x, c.root.y - target.y) > 250) {
                    c.root.setPosition(target.x, target.y)
                }
                c.targetX = target.x
                c.targetY = target.y
                const avatarChanged = c.member.avatar !== m.avatar
                if (avatarChanged) {
                    this.avatarManager.release(c.member.id, c.member.avatar)
                }
                c.member = m
                if (avatarChanged) {
                    this.loadAvatar(c, m)
                }
                c.name.setText(this.shortName(m.username) + (m.id === this.selfId ? ' (you)' : ''))
                c.status.setFillStyle(
                    m.sleeping ? 0xc1afed : m.presence === 'offline' && !m.inVoice ? 0x9298a7 : 0x7ed7ad
                )
                // Invisible Discord presence must not fade the character you control.
                c.root.setAlpha(m.presence === 'offline' && m.id !== this.selfId && !m.inVoice ? 0.5 : 1)
                c.voiceName.setVisible(Boolean(m.inVoice))
                c.voiceName.setText(
                    m.inVoice
                        ? `${m.muted ? 'Muted' : m.speaking ? 'Speaking' : 'Voice'} · ${this.shortName(m.voiceChannelName ?? '')}`
                        : ''
                )
                c.zzz.setVisible(m.sleeping)
                c.bubble?.setVisible(!m.sleeping && m.room === ownRoom)
            })
        }
        this.select(this.selected)
    }
    private shortName(name: string) {
        const chars = [...name]
        return chars.length > 11 ? `${chars.slice(0, 10).join('')}…` : name
    }
    private makeCharacter(m: Member, x: number, y: number): Character {
        const seed = [...m.id].reduce((sum, char) => sum + char.charCodeAt(0), 0)
        const shirt = [0x77_cc_bb, 0xb296dc, 0xdc_8c_a9, 0xd6_b8_7d, 0x78aee0, 0xab_a6_ed][seed % 6]
        const root = this.add.container(x, y)
        const shadow = this.add.ellipse(0, 0, 33, 14, 0x02_03_08, 0.5)
        const body = this.add.container(0, 0)
        const person = this.add.graphics()
        person.fillStyle(shirt).fillRoundedRect(-12, -34, 25, 23, 4)
        person.fillStyle(Phaser.Display.Color.IntegerToColor(shirt).darken(20).color).fillRect(6, -30, 8, 17)
        const leg = (x: number) =>
            this.add.container(x, -16, [
                this.add.rectangle(0, 0, 7, 13, 0x24_23_36).setOrigin(0.5, 0),
                this.add.rectangle(0, 12, 9, 4, 0xc9_c4_d9).setOrigin(0.5, 0)
            ])
        const legs: Character['legs'] = [leg(-6), leg(7)]
        const arm = (x: number, y: number) =>
            this.add.container(x, y, [this.add.rectangle(0, 0, 6, 14, 0xc6_a3_8a).setOrigin(0.5, 0)])
        const arms: Character['arms'] = [arm(-14, -29), arm(14, -27)]
        const head = this.add.circle(0, -44, 15, 0x44_41_59).setStrokeStyle(2, 0xc7c0dc)
        const voiceRing = this.add.circle(0, -44, 20, 0x71_e4_ac, 0.07).setStrokeStyle(3, 0x71e4ac).setVisible(false)
        const initial = this.add
            .text(0, -44, [...m.username][0] ?? '?', {
                fontSize: '16px',
                fontFamily: 'Arial',
                color: '#ffffff'
            })
            .setOrigin(0.5)
        const name = this.add
            .text(0, 12, this.shortName(m.username), {
                fontFamily: 'Arial',
                fontSize: '14px',
                color: '#e9e4f8',
                backgroundColor: '#13101e',
                padding: { x: 5, y: 3 }
            })
            .setOrigin(0.5, 0)
        const status = this.add.circle(13, -35, 4, 0x7e_d7_ad).setStrokeStyle(1.5, 0x17_13_21)
        const zzz = this.add
            .text(12, -78, 'Zzz', {
                fontFamily: 'Arial',
                fontSize: '19px',
                color: '#c1afed',
                fontStyle: 'italic'
            })
            .setVisible(m.sleeping)
        const voiceName = this.add
            .text(0, 34, '', {
                fontFamily: 'Arial',
                fontSize: '11px',
                color: '#9ddbbb',
                backgroundColor: '#131c1b',
                padding: { x: 4, y: 2 }
            })
            .setOrigin(0.5, 0)
            .setVisible(false)
        const talkBars = [0, 1, 2].map((i) => this.add.rectangle(-8 + i * 8, 0, 4, 15, 0x8cf0b5).setOrigin(0.5, 1))
        const talk = this.add
            .container(0, -77, [this.add.rectangle(0, -7, 35, 24, 0x142d25).setStrokeStyle(1, 0x52_9f_77), ...talkBars])
            .setVisible(false)
        body.add([voiceRing, ...legs, arms[0], person, arms[1], head, initial, status])
        root.add([shadow, body, name, zzz, voiceName, talk])
        const c: Character = {
            root,
            body,
            name,
            status,
            zzz,
            member: m,
            walkPhase: 0,
            targetX: x,
            targetY: y,
            voiceRing,
            talk,
            talkBars,
            voiceName,
            legs,
            arms
        }
        this.loadAvatar(c, m)
        return c
    }
    private loadAvatar(c: Character, m: Member) {
        if (!m.avatar) {
            c.body.getByName('avatar')?.destroy()
            return
        }
        this.avatarManager.acquire(m.id, m.avatar, (key) => {
            if (!c.root.scene || c.member.avatar !== m.avatar) {
                return
            }
            c.body.getByName('avatar')?.destroy()
            c.body.add(this.add.image(0, -44, key).setDisplaySize(27, 27).setName('avatar'))
            c.body.bringToTop(c.status)
        })
    }
    speak(id: string, content: string, duration: number) {
        const c = this.people.get(id)
        if (!c) {
            return
        }
        c.bubble?.destroy()
        c.bubble = undefined

        if (this.isMediaUrl(content)) {
            this.createMediaBubble(c, content.trim(), duration)
            return
        }
        this.createTextBubble(c, content, duration)
    }

    private isMediaUrl(text: string): boolean {
        const trimmed = text.trim()
        if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
            return false
        }
        if (/\.(gif|webp|png|jpe?g)(\?.*)?$/i.test(trimmed)) {
            return true
        }
        if (/klipy\.com\/(gifs|stickers)\//i.test(trimmed)) {
            return true
        }
        if (/giphy\.com\/gifs\//i.test(trimmed)) {
            return true
        }
        if (/tenor\.com\/view\//i.test(trimmed)) {
            return true
        }
        if (/(static|media)[0-9]*\.(klipy|giphy|tenor)\.com\//i.test(trimmed)) {
            return true
        }
        if (/cdn\.discordapp\.com\/attachments\//i.test(trimmed)) {
            return true
        }
        if (/^https:\/\/images-ext-\d+\.discordapp\.net\//i.test(trimmed)) return true
        return false
    }

    private createTextBubble(c: Character, content: string, duration: number) {
        const text = this.add
            .text(0, 0, content, {
                fontFamily: 'Arial',
                fontSize: '15px',
                color: '#20192d',
                wordWrap: { width: 185 },
                align: 'center',
                padding: { x: 11, y: 8 }
            })
            .setOrigin(0.5, 1)
        const bg = this.add
            .graphics()
            .fillStyle(0xeee8fa)
            .fillRoundedRect(-text.width / 2, -text.height, text.width, text.height, 7)
            .fillTriangle(-5, 0, 5, 0, 0, 7)
        const bubble = this.add.container(0, -72, [bg, text])
        c.root.add(bubble)
        c.bubble = bubble
        this.time.delayedCall(duration, () => {
            if (c.bubble === bubble) {
                bubble.destroy()
                c.bubble = undefined
            }
        })
    }

    private createMediaBubble(c: Character, url: string, duration: number) {
        const wrap = document.createElement('div')
        wrap.className = 'chat-bubble-media'
        wrap.style.cssText =
            'pointer-events:none;display:inline-flex;flex-direction:column;align-items:center;line-height:0;filter:drop-shadow(0 4px 10px rgba(0,0,0,0.45));'

        const box = document.createElement('div')
        box.style.cssText =
            'background:#eee8fa;padding:3px;border-radius:6px;display:flex;align-items:center;justify-content:center;box-sizing:border-box;'

        const img = document.createElement('img')
        img.alt = 'Chat media'
        img.style.cssText =
            'max-width:76px;max-height:68px;min-width:28px;min-height:28px;border-radius:4px;display:block;object-fit:contain;'

        const arrow = document.createElement('div')
        arrow.style.cssText =
            'width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:6px solid #eee8fa;margin-top:-1px;'

        box.append(img)
        wrap.append(box)
        wrap.append(arrow)

        const dom = this.add.dom(0, -68, wrap).setOrigin(0.5, 1)
        dom.pointerEvents = 'none'
        const unavailable = () => {
            if (c.bubble === dom) {
                expiry.remove()
                console.warn('[office] media_load_failed')
                dom.destroy()
                c.bubble = undefined
                this.createTextBubble(c, 'GIF unavailable', duration)
            }
        }
        let expiry = this.time.delayedCall(12000, unavailable)

        img.onload = () => {
            if (c.bubble === dom) {
                expiry.remove()
                dom.updateSize()
                expiry = this.time.delayedCall(duration, () => {
                    if (c.bubble === dom) {
                        dom.destroy()
                        c.bubble = undefined
                    }
                })
            }
        }
        img.onerror = unavailable

        c.root.add(dom)
        c.bubble = dom
        // Keep the image on the Activity origin so Discord's CSP allows it.
        img.src = `/api/media/image?url=${encodeURIComponent(url)}`
    }
    clearBubbles() {
        for (const c of this.people.values()) {
            c.bubble?.destroy()
            c.bubble = undefined
        }
    }
}
