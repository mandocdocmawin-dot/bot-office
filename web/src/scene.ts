import Phaser from 'phaser'
import type { Member, Room, Snapshot } from '@office/shared/protocol'
import { AvatarTextureManager } from './avatar-manager'
import { robotStyle } from './character-styles'
import { eventBus } from './events'
import { colorCSS, doors, roomDisplayName, rooms } from './rooms'
import { Furnishing, corners, polygon, project, slab, unproject } from './isometric'
import { fitWorldViewport } from './viewport-fit'
import { Tambayan } from './tambayan'

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
    depth: number
}
type VisibleObject = Phaser.GameObjects.GameObject & { visible: boolean; setVisible(value: boolean): unknown }
export class OfficeScene extends Phaser.Scene {
    // Safe to assign before Phaser has booted and injected scene.events.
    onFrame: () => void = () => {}
    private people = new Map<string, Character>()
    private counts = new Map<Room, Phaser.GameObjects.Text>()
    private roomLabels = new Map<Room, Phaser.GameObjects.Text>()
    private pending?: Snapshot
    private built = false
    private fitZoom = 1
    private zoomFactor = 1
    private autoFit = true
    private viewportWidth = 0
    private viewportHeight = 0
    private selected?: Room
    private focusedRoom?: Room
    private roomObjects = new Map<Room, VisibleObject[]>()
    private worldObjects: VisibleObject[] = []
    private focusVisibility = new Map<VisibleObject, boolean>()
    private focusedFoundation?: Phaser.GameObjects.Graphics
    private outlines = new Map<Room, Phaser.GameObjects.Graphics>()
    private reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
    private selfId = ''
    private frozen = false
    private lastUpdate = 0
    private avatarManager!: AvatarTextureManager
    private tambayan?: Tambayan
    constructor() {
        super('office')
    }
    preload() {
        Tambayan.preload(this)
    }
    create() {
        this.avatarManager = new AvatarTextureManager(this.textures)
        this.built = true
        const base = this.add.graphics()
        slab(base, 0, 0, 1400, 1000, -5, 38, 0x17_16_22)
        polygon(base, corners(18, 18, 1364, 964, -4), 0x20_1d_2a)
        for (const door of doors) {
            polygon(base, corners(door.x, door.y, door.w, door.h), 0x49_41_57)
            const p = project(door.x + door.w / 2, door.y + door.h / 2)
            this.add.text(p.x, p.y, '◇', { fontSize: '20px', color: '#b9aacb' }).setOrigin(0.5).setDepth(4)
        }
        const furniture = new Furnishing(this)
        this.worldObjects = [...this.children.list] as VisibleObject[]
        for (const room of rooms) {
            const firstObject = this.children.list.length
            const { x, y, w, h, color, name } = room
            const g = this.add.graphics().setDepth(1)
            polygon(g, corners(x, y, w, h), 0x17_17_22)
            polygon(g, corners(x, y, w, h), color, 0.16)
            polygon(g, corners(x + 30, y + 50, w - 60, h - 85), color, name === 'Commons' ? 0.3 : 0.16)
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
            if (name !== 'Commons') {
                g.lineStyle(9, color, 0.06).strokePoints([wall[3], wall[0], wall[1]], false)
                g.lineStyle(3, color, 0.85).strokePoints([wall[3], wall[0], wall[1]], false)
            }
            g.lineStyle(2, color, 0.45).strokePoints([edge[1], edge[2], edge[3]], false)
            const labelPoint = project(x + 15, y + 8, 55)
            const title = this.add
                .text(labelPoint.x, labelPoint.y, roomDisplayName(name), {
                    fontFamily: 'Arial',
                    fontSize: '19px',
                    fontStyle: 'bold',
                    color: colorCSS(color),
                    backgroundColor: '#100e19',
                    padding: { x: 7, y: 4 }
                })
                .setOrigin(0, 1)
                .setDepth(3000)
            this.roomLabels.set(name, title)
            if (name === 'Commons') {
                title.setColor('#a8f0e8').setInteractive({ useHandCursor: true })
                title.on('pointerup', (_pointer: Phaser.Input.Pointer, _x: number, _y: number,
                    event: Phaser.Types.Input.EventData) => {
                    event.stopPropagation()
                    this.focusRoom('Commons')
                })
            }
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
            this.roomObjects.set(name, this.children.list.slice(firstObject) as VisibleObject[])
        }
        const commons = rooms.find(room => room.name === 'Commons')!
        this.focusedFoundation = this.add.graphics().setDepth(0).setVisible(false)
        slab(this.focusedFoundation, commons.x - 10, commons.y - 10, commons.w + 20, commons.h + 20,
            -4, 28, 0x292738)
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
        const onFocus = () => {
            for (const c of this.people.values()) {
                c.root.x = c.targetX
                c.root.y = c.targetY
            }
        }
        window.addEventListener('focus', onFocus)
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            canvas.removeEventListener('wheel', wheel)
            this.scale.off('resize', resize)
            window.removeEventListener('focus', onFocus)
        })
        this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
            if (!p.isDown) {
                return
            }
            if (Phaser.Math.Distance.Between(p.downX, p.downY, p.x, p.y) > 6) {
                this.autoFit = false
                if (this.focusedRoom) {
                    this.restoreRoomFocus()
                    this.focusedRoom = undefined
                    this.reportZoom()
                }
                this.cameras.main.stopFollow()
            }
            this.cameras.main.scrollX -= (p.x - p.prevPosition.x) / this.cameras.main.zoom
            this.cameras.main.scrollY -= (p.y - p.prevPosition.y) / this.cameras.main.zoom
        })
        this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
            if (!this.frozen && Phaser.Math.Distance.Between(p.downX, p.downY, p.x, p.y) < 6) {
                const world = this.cameras.main.getWorldPoint(p.x, p.y)
                const ground = unproject(world.x, world.y)
                if (this.focusedRoom) {
                    const room = rooms.find(room => room.name === this.focusedRoom)!
                    if (ground.x < room.x || ground.x > room.x + room.w || ground.y < room.y || ground.y > room.y + room.h) return
                }
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
        if (name === 'Commons') {
            this.tambayan = new Tambayan(this, rooms.find(room => room.name === name)!)
            return
        }
        f.plant(x + 20, y + 24, true)
        f.plant(x + w - 24, y + h - 22)
        if (name === 'Front Office') {
            f.desk(x + w - 180, y + 48, color, true)
            f.sofa(x + 35, y + h - 63, 0x6b_52_67, 105)
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
        this.onFrame()
        const now = performance.now()
        const realDelta = this.lastUpdate > 0 ? Math.min(now - this.lastUpdate, 250) : delta
        this.lastUpdate = now
        const effectiveDelta = Math.max(delta, realDelta)
        const snap = effectiveDelta >= 200
        for (const c of this.people.values()) {
            c.root.setVisible(!this.focusedRoom || c.member.room === this.focusedRoom)
            const own = c.member.id === this.selfId
            const previousX = c.root.x
            const previousY = c.root.y
            if (snap) {
                c.root.x = c.targetX
                c.root.y = c.targetY
            } else {
                const blend =
                    this.reducedMotion.matches || (own && !c.member.moving)
                        ? 1
                        : 1 - Math.exp(-effectiveDelta / (own ? 18 : 55))
                if (Math.abs(c.targetX - c.root.x) < 0.05) {
                    c.root.x = c.targetX
                } else {
                    c.root.x += (c.targetX - c.root.x) * blend
                }
                if (Math.abs(c.targetY - c.root.y) < 0.05) {
                    c.root.y = c.targetY
                } else {
                    c.root.y += (c.targetY - c.root.y) * blend
                }
            }
            const travelled = Math.hypot(c.root.x - previousX, c.root.y - previousY)
            const targetDepth = (c.bubble ? 4000 : 1000) + Math.round(c.root.y)
            if (c.depth !== targetDepth) {
                c.root.setDepth(targetDepth)
                c.depth = targetDepth
            }
            // Follow the rendered movement, including interpolation after a stop packet.
            // Distance-driven steps stay in sync at different speeds and frame rates.
            const walking = !this.frozen && (c.member.moving || travelled > 0.03)
            if (walking || c.walkPhase !== 0) {
                c.walkPhase = walking ? (c.walkPhase + (Math.min(travelled, 12) * Math.PI) / 19) % (Math.PI * 2) : 0
                const stride = Math.sin(c.walkPhase) * (this.reducedMotion.matches ? 0.35 : 1)
                c.legs[0].setPosition(-6 + stride * 2, -16 - Math.max(0, stride) * 5).setAngle(stride * 28)
                c.legs[1].setPosition(7 - stride * 2, -16 - Math.max(0, -stride) * 5).setAngle(-stride * 28)
                c.arms[0].setAngle(-stride * 20)
                c.arms[1].setAngle(stride * 20)
                const bounce = walking && !this.reducedMotion.matches
                c.body.y = bounce ? -Math.abs(stride) * 2 : 0
                c.body.angle = bounce ? stride * 2 : 0
            }
            const speaking = !this.frozen && Boolean(c.member.speaking)
            if (c.voiceRing.visible !== speaking) {
                c.voiceRing.setVisible(speaking)
            }
            const talkVisible = speaking && !c.bubble
            if (c.talk.visible !== talkVisible) {
                c.talk.setVisible(talkVisible)
            }
            if (speaking) {
                const animate = !this.reducedMotion.matches
                c.voiceRing.setScale(animate ? 1.05 + Math.sin(time / 100) * 0.08 : 1)
                c.talkBars.forEach((bar, i) =>
                    bar.setScale(1, animate ? 0.45 + Math.abs(Math.sin(time / 95 + i * 0.9)) * 0.65 : 0.7)
                )
                if (animate && !walking) {
                    c.body.y = Math.sin(time / 95) * 1.5
                    c.body.angle = Math.sin(time / 160) * 1.2
                }
            } else if (!walking) {
                c.body.y = 0
                c.body.angle = 0
            }
        }
    }
    fit() {
        if (!this.built) {
            return
        }
        this.autoFit = true
        this.restoreRoomFocus()
        this.focusedRoom = undefined
        this.viewportWidth = this.scale.width
        this.viewportHeight = this.scale.height
        const fitted = fitWorldViewport(this.scale.width, this.scale.height)
        this.fitZoom = fitted.zoom
        this.zoomFactor = 1
        this.cameras.main.setZoom(this.fitZoom).centerOn(fitted.centerX, fitted.centerY)
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
        if (this.focusedRoom) {
            this.focusRoom(this.focusedRoom)
            return
        }
        const camera = this.cameras.main
        const center = { x: camera.midPoint.x, y: camera.midPoint.y }
        this.viewportWidth = this.scale.width
        this.viewportHeight = this.scale.height
        this.fitZoom = fitWorldViewport(this.scale.width, this.scale.height).zoom
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
        this.restoreRoomFocus()
        this.focusedRoom = undefined
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
        // Room names remain readable when the entire world is fitted to the viewport.
        const labelScale = Math.max(1, (this.scale.width <= 480 ? 0.42 : 0.6) / this.cameras.main.zoom)
        for (const [room, label] of this.roomLabels) {
            const visible = !this.focusedRoom || room === this.focusedRoom
            label.setScale(labelScale).setVisible(visible)
            this.counts.get(room)?.setScale(labelScale).setX(label.x + label.displayWidth + 8)
                .setVisible(visible && this.scale.width > 480)
        }
        const zoom = Math.round(this.zoomFactor * 100)
        eventBus.emitEvent('office:zoom', { zoom })
        window.dispatchEvent(new CustomEvent('office-zoom', { detail: zoom }))
    }
    select(room?: Room) {
        if (this.focusedRoom && room !== this.focusedRoom) {
            this.restoreRoomFocus()
            this.focusedRoom = undefined
            this.reportZoom()
        }
        this.selected = room
        for (const [name, outline] of this.outlines) {
            outline.setVisible(name === room && !this.focusedRoom)
        }
    }
    focusRoom(name: Room) {
        if (!this.built) return
        if (name !== 'Commons') return
        const room = rooms.find(room => room.name === name)
        if (!room) return
        this.autoFit = false
        this.focusedRoom = name
        this.selected = name
        for (const [owner, objects] of this.roomObjects) {
            for (const object of objects) {
                if (!this.focusVisibility.has(object)) this.focusVisibility.set(object, object.visible)
                if (owner !== name) object.setVisible(false)
            }
        }
        for (const object of this.worldObjects) {
            if (!this.focusVisibility.has(object)) this.focusVisibility.set(object, object.visible)
            object.setVisible(false)
        }
        this.focusedFoundation?.setVisible(true)
        this.viewportWidth = this.scale.width
        this.viewportHeight = this.scale.height
        this.fitZoom = fitWorldViewport(this.scale.width, this.scale.height).zoom
        const width = (room.w + room.h) * .86
        const height = (room.w + room.h) * .6 + 100
        const zoom = Math.min((this.scale.width - 48) / width, (this.scale.height - 180) / height, 2)
        this.zoomFactor = zoom / this.fitZoom
        const center = project(room.x + room.w / 2, room.y + room.h / 2, 36)
        this.cameras.main.stopFollow().setZoom(zoom).centerOn(center.x, center.y)
        this.reportZoom()
    }
    private restoreRoomFocus() {
        for (const [object, visible] of this.focusVisibility) object.setVisible(visible)
        this.focusVisibility.clear()
        this.focusedFoundation?.setVisible(false)
        for (const character of this.people.values()) character.root.setVisible(true)
    }
    focus(id: string) {
        const c = this.people.get(id)
        if (c) {
            this.autoFit = false
            this.restoreRoomFocus()
            this.focusedRoom = undefined
            this.cameras.main.setZoom(Math.max(this.fitZoom * 1.8, this.cameras.main.zoom))
            this.zoomFactor = this.cameras.main.zoom / this.fitZoom
            this.reportZoom()
            this.cameras.main.startFollow(c.root, false, 0.12, 0.12)
        }
    }
    setSelf(id: string) {
        this.selfId = id
    }
    setSpeaking(id: string, speaking: boolean) {
        const c = this.people.get(id)
        if (c) {
            c.member = { ...c.member, speaking }
        }
    }
    setFrozen(value: boolean) {
        this.frozen = value
    }
    sync(state: Snapshot) {
        this.pending = state
        if (!this.built) {
            return
        }
        this.tambayan?.setMembers(state.members)
        const ownRoom = state.members.find((m) => m.id === this.selfId)?.room
        const previousOwnRoom = this.people.get(this.selfId)?.member.room
        if (this.focusedRoom && previousOwnRoom === this.focusedRoom && ownRoom && ownRoom !== this.focusedRoom) this.fit()
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
        const roomCounts = new Map<string, number>()
        for (let i = 0; i < state.members.length; i++) {
            const r = state.members[i].room
            roomCounts.set(r, (roomCounts.get(r) ?? 0) + 1)
        }
        for (const room of rooms) {
            this.counts.get(room.name)?.setText(String(roomCounts.get(room.name) ?? 0))
        }
        for (let i = 0; i < state.members.length; i++) {
            const m = state.members[i]
            const target = project(m.x, m.y)
            let c = this.people.get(m.id)
            if (c && c.member.character !== m.character) {
                this.avatarManager.release(c.member.id, c.member.avatar)
                const current = { x: c.root.x, y: c.root.y }
                this.tweens.killTweensOf(c.root)
                c.root.destroy()
                c = this.makeCharacter(m, current.x, current.y)
                this.people.set(m.id, c)
            }
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
            const compact = m.room === 'Commons'
            if (c.name.getData('compact') !== compact) {
                c.name.setData('compact', compact)
                c.root.setScale(compact ? .84 : 1)
                c.name.setStyle({
                    fontSize: compact ? '12px' : '14px',
                    backgroundColor: compact ? 'rgba(28,23,43,.62)' : '#13101e',
                    padding: { x: compact ? 3 : 5, y: compact ? 2 : 3 }
                })
            }
            if (avatarChanged) {
                this.loadAvatar(c, m)
            }
            c.name.setText(this.shortName(m.username) + (m.id === this.selfId ? ' (you)' : ''))
            c.status.setFillStyle(m.sleeping ? 0xc1afed : m.presence === 'offline' && !m.inVoice ? 0x9298a7 : 0x7ed7ad)
            // Invisible Discord presence must not fade the character you control.
            c.root.setAlpha(m.presence === 'offline' && m.id !== this.selfId && !m.inVoice ? 0.5 : 1)
            c.voiceName.setVisible(Boolean(m.inVoice))
            c.voiceName.setText(
                m.inVoice
                    ? `${m.muted ? 'Muted' : m.speaking ? 'Speaking' : 'Voice'} · ${this.shortName(m.voiceChannelName ?? '')}`
                    : ''
            )
            c.zzz.setVisible(m.sleeping)
            c.bubble?.setVisible(!m.sleeping && m.room === ownRoom && (!this.focusedRoom || m.room === this.focusedRoom))
        }
        this.select(this.selected)
    }
    private shortName(name: string) {
        const chars = [...name]
        return chars.length > 11 ? `${chars.slice(0, 10).join('')}…` : name
    }
    private makeCharacter(m: Member, x: number, y: number): Character {
        const seed = [...m.id].reduce((sum, char) => sum + char.charCodeAt(0), 0)
        const robot = robotStyle(m.character)
        const shirt = robot?.shirt ?? [0x77_cc_bb, 0xb2_96_dc, 0xdc_8c_a9, 0xd6_b8_7d, 0x78aee0, 0xab_a6_ed][seed % 6]
        const root = this.add.container(x, y).setSize(32, 64).setDepth(1000 + Math.round(y))
        const shadow = this.add.ellipse(0, 0, 33, 14, 0x02_03_08, 0.5)
        const body = this.add.container(0, 0)
        const person = this.add.graphics()
        person.fillStyle(shirt).fillRoundedRect(-12, -34, 25, 23, 4)
        person.fillStyle(Phaser.Display.Color.IntegerToColor(shirt).darken(20).color).fillRect(6, -30, 8, 17)
        if (m.character === 'blue') {
            person.fillStyle(0xe4e4f4).fillRect(-6, -31, 2, 8).fillRect(3, -31, 2, 8)
            person.fillStyle(0x2862b6).fillRect(-6, -20, 12, 5)
        } else if (m.character === 'orange') {
            person.fillStyle(0xffedcf).fillRect(-1, -32, 3, 20)
        } else if (m.character === 'lavender') {
            person.fillStyle(0xe2d1f7).fillTriangle(-8, -33, 0, -29, -4, -25).fillTriangle(8, -33, 0, -29, 4, -25)
            person.fillStyle(0x48304f).fillRect(-2, -29, 4, 11).fillTriangle(-3, -18, 3, -18, 0, -14)
        } else if (m.character === 'mint') {
            person.fillStyle(0xffedcf).fillRect(3, -27, 6, 8)
        }
        const leg = (x: number) =>
            this.add.container(x, -16, [
                this.add.rectangle(0, 0, 7, 13, robot?.limbs ?? 0x24_23_36).setOrigin(0.5, 0),
                this.add.rectangle(0, 12, 9, 4, robot?.shoes ?? 0xc9_c4_d9).setOrigin(0.5, 0)
            ])
        const legs: Character['legs'] = [leg(-6), leg(7)]
        const arm = (x: number, y: number) =>
            this.add.container(x, y, robot ? [
                this.add.rectangle(0, 0, 7, 9, shirt).setOrigin(0.5, 0),
                this.add.rectangle(0, 9, 6, 5, m.character === 'pink' || m.character === 'lavender' ? robot.shell : robot.limbs).setOrigin(0.5, 0)
            ] : [this.add.rectangle(0, 0, 6, 14, 0xc6_a3_8a).setOrigin(0.5, 0)])
        const arms: Character['arms'] = [arm(-14, -29), arm(14, -27)]
        const head = this.add.circle(0, -44, 15, 0x44_41_59).setStrokeStyle(2, 0xc7c0dc)
        head.setVisible(!robot)
        const robotHead = this.add.graphics()
        if (robot) {
            robotHead.fillStyle(Phaser.Display.Color.IntegerToColor(robot.shell).darken(15).color).fillRect(12, -60, 6, 29)
            robotHead.fillStyle(robot.shell).fillRoundedRect(-17, -62, 31, 30, 3)
            robotHead.fillStyle(0x242638).fillRoundedRect(-13, -58, 23, 22, 2)
            robotHead.fillStyle(robot.eyes).fillRect(-9, -52, 5, 7).fillRect(2, -52, 5, 7)
            if (m.character !== 'blue' && m.character !== 'orange') {
                robotHead.fillRect(-4, -41, 7, 2)
            }
            if (m.character === 'pink') {
                robotHead.fillStyle(0x7fdeb7).fillRect(-21, -55, 5, 17).fillRect(15, -55, 6, 17).fillRect(-17, -65, 35, 4)
                robotHead.fillStyle(0x303244).fillRect(15, -39, 3, 7).fillRect(5, -34, 12, 3)
                robotHead.fillStyle(0x7fdeb7).fillRect(3, -36, 5, 5)
            } else if (m.character === 'mint') {
                robotHead.fillStyle(0x244c4e).fillRect(6, -70, 3, 8)
                robotHead.fillStyle(0x79c9a2).fillRect(4, -74, 7, 5)
            } else {
                robotHead.fillStyle(shirt).fillRect(-21, -54, 5, 14).fillRect(16, -54, 5, 14)
            }
        }
        const voiceRing = this.add.circle(0, -44, 20, 0x71_e4_ac, 0.07).setStrokeStyle(3, 0x71e4ac).setVisible(false)
        const initial = this.add
            .text(0, -44, [...m.username][0] ?? '?', {
                fontSize: '16px',
                fontFamily: 'Arial',
                color: '#ffffff'
            })
            .setOrigin(0.5)
            .setVisible(!robot)
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
            .container(0, -77, [
                this.add.rectangle(0, -7, 35, 24, 0x14_2d_25).setStrokeStyle(1, 0x52_9f_77),
                ...talkBars
            ])
            .setVisible(false)
        body.add([voiceRing, ...legs, arms[0], person, arms[1], head, robotHead, initial, status])
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
            arms,
            depth: 1000 + Math.round(y)
        }
        this.loadAvatar(c, m)
        return c
    }
    private loadAvatar(c: Character, m: Member) {
        if (robotStyle(m.character)) {
            c.body.getByName('avatar')?.destroy()
            return
        }
        if (!m.avatar) {
            c.body.getByName('avatar')?.destroy()
            return
        }
        this.avatarManager.acquire(m.id, m.avatar, (key) => {
            if (!c.root.scene || c.member.avatar !== m.avatar || !this.textures.exists(key)) {
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
        if (/^https:\/\/images-ext-\d+\.discordapp\.net\//i.test(trimmed)) {
            return true
        }
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
