import Phaser from 'phaser'
import type { Member, RoomLayout } from '@office/shared/protocol'
import { TAMBAYAN_PODS, tambayanCapacity } from '@office/shared/rooms'
import { corners, polygon, project, slab } from './isometric'
import manifest from './tambayan-manifest.json'
import { addProp, preloadProps } from './tambayan-props'

type Point3 = { x: number; y: number; z: number }
const PURPLE = 0x8e60c1

/** Movable low-poly objects, not a flattened room illustration. */
export class Tambayan {
    private chairs = new Map<string, Phaser.GameObjects.Graphics>()
    private count = 0
    private capacity = 12
    private lowSince: number | undefined
    private nextCheck = 0
    private overflow: Phaser.GameObjects.Text

    static preload(scene: Phaser.Scene) { preloadProps(scene, manifest, '/assets/tambayan/') }

    constructor(private scene: Phaser.Scene, private room: RoomLayout) {
        const { x, y, w, h } = room
        const floor = scene.add.graphics().setDepth(2)
        polygon(floor, corners(x + 8, y + 8, w - 16, h - 16), 0x49446f)
        // Wide crossing stays usable from each of the existing doors.
        polygon(floor, corners(x + w / 2 - 41, y + 8, 82, h - 16), 0x635b96, .62)
        polygon(floor, corners(x + 8, y + 201, w - 16, 82), 0x635b96, .62)
        polygon(floor, corners(x + w / 2 - 64, y + 178, 128, 128), 0x7063ab, .35)
        for (const pod of TAMBAYAN_PODS) {
            polygon(floor, corners(x + pod.x - 73, y + pod.y - 73, 146, 146), 0x8170be, .52)
            this.table(x + pod.x, y + pod.y)
        }
        const prop = (id: string, dx: number, dy: number) => {
            const spec = manifest.find(item => item.id === id)!
            addProp(scene, spec, x + dx, y + dy)
        }
        prop('coffee-station', 30, 65)
        prop('notice-board', 130, 22)
        prop('media-screen', 300, 22)
        prop('navigation-kiosk', 469, 278)
        prop('game-shelf', 27, 129)
        for (const p of [[20, 20], [20, 187], [160, 22], [282, 22], [501, 20], [500, 190], [20, 418], [199, 416], [495, 418], [495, 330]]) {
            this.plant(x + p[0], y + p[1])
        }
        this.rails()
        const status = project(x + 277, y + h - 15, 4)
        this.overflow = scene.add.text(status.x, status.y, '', {
            fontFamily: 'Arial', fontSize: '12px', color: '#e4d7ff', backgroundColor: '#252137',
            padding: { x: 5, y: 3 }
        }).setOrigin(.5).setDepth(2999).setVisible(false)
        this.drawSeats()
    }

    setMembers(members: Member[]) { this.count = members.filter(member => member.room === 'Commons').length }

    update(now: number) {
        if (now < this.nextCheck) return
        this.nextCheck = now + 500
        const target = tambayanCapacity(this.count)
        if (target >= this.capacity) {
            this.lowSince = undefined
            if (target !== this.capacity) { this.capacity = target; this.drawSeats() }
        } else {
            this.lowSince ??= now
            if (now - this.lowSince >= 60_000) {
                this.capacity = target; this.lowSince = undefined; this.drawSeats()
            }
        }
        this.overflow.setText(`${Math.max(0, this.count - 24)} standing · 24 seats`).setVisible(this.count > 24)
    }

    private drawSeats() {
        const desired = new Set<string>()
        // Four cardinal seats first; diagonals extend each pod to six/eight.
        const angles = [0, Math.PI / 2, Math.PI, Math.PI * 1.5, Math.PI / 4, Math.PI * 1.25, Math.PI * .75, Math.PI * 1.75]
        for (let podIndex = 0; podIndex < TAMBAYAN_PODS.length; podIndex++) {
            const pod = TAMBAYAN_PODS[podIndex]
            for (let i = 0; i < this.capacity / 3; i++) {
                const id = `${podIndex}:${i}`
                desired.add(id)
                if (this.chairs.has(id)) continue
                const a = angles[i]
                this.chairs.set(id, this.armchair(this.room.x + pod.x + Math.cos(a) * 53,
                    this.room.y + pod.y + Math.sin(a) * 53, a - Math.PI / 2))
            }
        }
        for (const [id, chair] of this.chairs) {
            if (!desired.has(id)) { chair.destroy(); this.chairs.delete(id) }
            else {
                // Compact armchairs keep the eight-seat pods from crowding the table.
                const scale = this.capacity === 24 ? .76 : this.capacity === 18 ? .87 : 1
                const anchor = chair.getData('ground') as { x: number; y: number }
                chair.setScale(scale).setPosition(anchor.x * (1 - scale), anchor.y * (1 - scale))
            }
        }
    }

    private armchair(x: number, y: number, angle: number) {
        const g = this.scene.add.graphics().setDepth(1000 + project(x, y).y)
        g.setData('ground', project(x, y))
        const transform = (p: Point3) => ({
            x: x + p.x * Math.cos(angle) - p.y * Math.sin(angle),
            y: y + p.x * Math.sin(angle) + p.y * Math.cos(angle), z: p.z
        })
        const faces: { points: Point3[]; color: number; depth: number }[] = []
        const box = (bx: number, by: number, w: number, h: number, z: number, t: number, color: number) => {
            const top = [{ x: bx, y: by, z }, { x: bx + w, y: by, z }, { x: bx + w, y: by + h, z }, { x: bx, y: by + h, z }].map(transform)
            const bottom = top.map(p => ({ ...p, z: p.z - t }))
            for (let i = 0; i < 4; i++) {
                const j = (i + 1) % 4
                const points = [top[i], top[j], bottom[j], bottom[i]]
                const shade = Phaser.Display.Color.IntegerToColor(color).darken(i % 2 ? 29 : 17).color
                faces.push({ points, color: shade, depth: points.reduce((s, p) => s + p.x + p.y + p.z * .04, 0) / 4 })
            }
            faces.push({ points: top, color, depth: top.reduce((s, p) => s + p.x + p.y + p.z * .04, 0) / 4 + .01 })
        }
        const shadow = project(x + 4, y + 4)
        g.fillStyle(0x181527, .3).fillEllipse(shadow.x, shadow.y + 5, 52, 24)
        for (const bx of [-13, 9]) for (const by of [-13, 9]) box(bx, by, 4, 4, 8, 8, 0x292532)
        box(-17, -17, 34, 34, 17, 10, 0x64408e)
        box(-12, -11, 24, 26, 22, 6, PURPLE)
        box(-17, -17, 34, 7, 43, 26, 0x9164c7)
        box(-18, -11, 6, 29, 29, 15, 0x986cc9)
        box(12, -11, 6, 29, 29, 15, 0x986cc9)
        // Soft square pillow, folded into two distinct lit faces.
        const pillow = [transform({ x: -8, y: -9, z: 35 }), transform({ x: 7, y: -9, z: 35 }),
            transform({ x: 7, y: -2, z: 23 }), transform({ x: -8, y: -2, z: 23 })]
        faces.push({ points: pillow, color: 0xbb86eb, depth: x + y + 6 })
        faces.sort((a, b) => a.depth - b.depth)
        for (const face of faces) polygon(g, face.points.map(p => project(p.x, p.y, p.z)), face.color)
        return g
    }

    private table(x: number, y: number) {
        const g = this.scene.add.graphics().setDepth(1000 + project(x + 10, y + 10).y)
        for (const dx of [-16, 12]) for (const dy of [-16, 12]) slab(g, x + dx, y + dy, 4, 4, 20, 20, 0x40333a)
        slab(g, x - 21, y - 21, 42, 42, 26, 6, 0xad8968)
        slab(g, x + 7, y - 11, 10, 14, 29, 3, 0x627c94)
        slab(g, x + 6, y - 12, 10, 14, 31, 2, 0x9c80c1)
        this.plant(x - 7, y - 4, true, 27)
    }

    private plant(x: number, y: number, small = false, z = 0) {
        const s = small ? .45 : 1
        const g = this.scene.add.graphics().setDepth(1000 + project(x + 5, y + 5).y)
        slab(g, x - 10 * s, y - 10 * s, 20 * s, 20 * s, z + 18 * s, 18 * s, 0x99714d)
        slab(g, x - 8 * s, y - 8 * s, 16 * s, 16 * s, z + 19 * s, 2 * s, 0x473e39)
        slab(g, x - 2 * s, y - 2 * s, 4 * s, 4 * s, z + 38 * s, 20 * s, 0x678545)
        for (const [dx, dy, height] of [[-7, 0, 36], [4, 3, 41], [-1, -6, 48], [-8, -5, 48], [3, -6, 55]]) {
            slab(g, x + dx * s - 5 * s, y + dy * s - 5 * s, 12 * s, 12 * s, z + height * s, 6 * s, height % 2 ? 0x99ce73 : 0x72b660)
        }
    }

    private rails() {
        const { x, y, w, h } = this.room
        const g = this.scene.add.graphics().setDepth(4)
        const segments = [
            [0, 0, 230, 0], [294, 0, w, 0], [0, 0, 0, 210], [0, 274, 0, h],
            [w, 0, w, 210], [w, 274, w, h], [0, h, 230, h], [294, h, w, h]
        ]
        for (const [ax, ay, bx, by] of segments) {
            const a = project(x + ax, y + ay, 24), b = project(x + bx, y + by, 24)
            g.lineStyle(7, 0x78e6e2, .1).lineBetween(a.x, a.y, b.x, b.y)
            g.lineStyle(2.5, 0xa2f4ee, .95).lineBetween(a.x, a.y, b.x, b.y)
        }
        for (const [dx, dy] of [[0, 0], [w, 0], [w, h], [0, h], [230, 0], [294, 0], [0, 210], [0, 274], [w, 210], [w, 274], [230, h], [294, h]]) {
            const post = this.scene.add.graphics().setDepth(1000 + project(x + dx, y + dy).y)
            slab(post, x + dx - 6, y + dy - 6, 12, 12, 31, 31, 0x49415e)
            slab(post, x + dx - 8, y + dy - 8, 16, 16, 33, 3, 0x84729f)
        }
    }
}
