import Phaser from 'phaser'
import type { Member, RoomLayout } from '@office/shared/protocol'
import { TAMBAYAN_PODS, TAMBAYAN_SEATS_PER_POD, TAMBAYAN_PROPS, TAMBAYAN_PLANTS, tambayanSeats } from '@office/shared/rooms'
import { corners, polygon, project, slab } from './isometric'
import { preloadTambayanSprites, tambayanSprite, type TambayanSpriteId } from './tambayan-sprites'

/** The reference's three four-seat pods, assembled from independent alpha sprites. */
export class Tambayan {
    private chairs = new Map<string, Phaser.GameObjects.Image>()
    private count = 0
    readonly capacity = TAMBAYAN_PODS.length * TAMBAYAN_SEATS_PER_POD
    private overflow: Phaser.GameObjects.Text

    static preload(scene: Phaser.Scene) { preloadTambayanSprites(scene) }

    constructor(private scene: Phaser.Scene, private room: RoomLayout) {
        this.floor()
        const { x, y, h } = room
        for (const pod of TAMBAYAN_PODS) {
            this.shadow(x + pod.x, y + pod.y, 61, .16)
            tambayanSprite(scene, 'table-v2', x + pod.x, y + pod.y, 56, .23)
        }
        for (const prop of TAMBAYAN_PROPS) {
            this.shadow(x + prop.x, y + prop.y, prop.width, .16)
            tambayanSprite(scene, prop.id, x + prop.x, y + prop.y, prop.width, prop.inset)
        }
        for (const [dx, dy] of TAMBAYAN_PLANTS) {
            tambayanSprite(scene, 'plant-v2', x + dx, y + dy, 28, .21)
        }
        this.rails()
        const status = project(x + 277, y + h - 14, 4)
        this.overflow = scene.add.text(status.x, status.y, '', {
            fontFamily: 'Arial', fontSize: '11px', color: '#e4d7ff', backgroundColor: '#343047',
            padding: { x: 5, y: 3 }
        }).setOrigin(.5).setDepth(2999).setVisible(false)
        this.drawSeats()
    }

    setMembers(members: Member[]) {
        const count = members.filter(member => member.room === 'Commons').length
        if (count === this.count) return
        this.count = count
        // Standing space is honest overflow; extra furniture needs its own floor area.
        this.overflow.setText(`${Math.max(0, count - this.capacity)} standing · ${this.capacity} seats`)
            .setVisible(count > this.capacity)
    }

    private floor() {
        const { x, y, w, h } = this.room
        const g = this.scene.add.graphics().setDepth(2)
        polygon(g, corners(x + 5, y + 5, w - 10, h - 10), 0x56517d)
        for (let i = 0; i < 24; i++) {
            polygon(g, corners(x + 8 + i * (w - 16) / 24, y + 8, (w - 16) / 24 + .2, h - 16),
                0x9d8fd0, .055 * Math.sin((i / 24) * Math.PI))
        }
        const left = x + w / 2 - 38, right = x + w / 2 + 38
        // One continuous cross: overlapping translucent rectangles made a checkerboard.
        polygon(g, [[left, y + 6], [right, y + 6], [right, y + 204], [x + w - 6, y + 204],
            [x + w - 6, y + 280], [right, y + 280], [right, y + h - 6], [left, y + h - 6],
            [left, y + 280], [x + 6, y + 280], [x + 6, y + 204], [left, y + 204]]
            .map(([px, py]) => project(px, py)), 0x8d80c0, .32)
        for (const pod of TAMBAYAN_PODS) {
            this.roundedFloor(g, x + pod.x - 73, y + pod.y - 73, 146, 146, 12, 0x9986d0, .36)
        }
    }

    private roundedFloor(g: Phaser.GameObjects.Graphics, x: number, y: number,
        w: number, h: number, radius: number, color: number, alpha: number) {
        const points: { x: number; y: number }[] = []
        for (const [cx, cy, start] of [[x + w - radius, y + radius, -Math.PI / 2],
            [x + w - radius, y + h - radius, 0], [x + radius, y + h - radius, Math.PI / 2],
            [x + radius, y + radius, Math.PI]]) {
            for (let i = 0; i <= 6; i++) {
                const angle = start + i * Math.PI / 12
                points.push(project(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius))
            }
        }
        polygon(g, points, color, alpha)
    }

    private shadow(x: number, y: number, width: number, alpha: number) {
        const key = 'tambayan-contact-shadow-v2'
        if (!this.scene.textures.exists(key)) {
            const texture = this.scene.textures.createCanvas(key, 128, 64)!
            const ctx = texture.context
            ctx.scale(1, .5)
            const gradient = ctx.createRadialGradient(64, 64, 8, 64, 64, 62)
            gradient.addColorStop(0, 'rgba(12,8,28,.8)')
            gradient.addColorStop(.55, 'rgba(12,8,28,.3)')
            gradient.addColorStop(1, 'rgba(12,8,28,0)')
            ctx.fillStyle = gradient
            ctx.fillRect(0, 0, 128, 128)
            texture.refresh()
        }
        const ground = project(x + 3, y + 5)
        this.scene.add.image(ground.x, ground.y + 3, key).setDisplaySize(width, width * .48)
            .setAlpha(alpha).setDepth(5)
    }

    private drawSeats() {
        const views: TambayanSpriteId[] = ['chair-nw', 'chair-ne', 'chair-se', 'chair-sw']
        for (const seat of tambayanSeats(this.room)) {
            this.shadow(seat.x, seat.y, 49, .12)
            const chair = tambayanSprite(this.scene, views[seat.index], seat.x, seat.y, 58, .22)
            this.chairs.set(seat.id, chair)
        }
    }

    private rails() {
        const { x, y, w, h } = this.room
        const g = this.scene.add.graphics().setDepth(4)
        for (const [dx, dy, width, height] of [[230, -8, 64, 18], [230, h - 10, 64, 18],
            [-8, 210, 18, 64], [w - 10, 210, 18, 64]]) {
            slab(g, x + dx, y + dy, width, height, 1, 3, 0x9c8ad0)
        }
        const segments = [
            [0, 0, 230, 0], [294, 0, w, 0], [0, 0, 0, 210], [0, 274, 0, h],
            [w, 0, w, 210], [w, 274, w, h], [0, h, 230, h], [294, h, w, h]
        ]
        for (const [ax, ay, bx, by] of segments) {
            const wall = this.scene.add.graphics().setDepth(4)
            slab(wall, x + ax - 2, y + ay - 2, Math.max(4, bx - ax), Math.max(4, by - ay), 20, 20, 0x45415d)
            const a = project(x + ax, y + ay, 24), b = project(x + bx, y + by, 24)
            g.lineStyle(9, 0x6fe4ea, .035).lineBetween(a.x, a.y, b.x, b.y)
            g.lineStyle(5, 0x6fe4ea, .1).lineBetween(a.x, a.y, b.x, b.y)
            g.lineStyle(2.2, 0xb1f8f1, .95).lineBetween(a.x, a.y, b.x, b.y)
        }
        for (const [dx, dy] of [[0, 0], [w, 0], [w, h], [0, h], [230, 0], [294, 0],
            [0, 210], [0, 274], [w, 210], [w, 274], [230, h], [294, h]]) {
            const post = this.scene.add.graphics().setDepth(1000 + project(x + dx, y + dy).y)
            slab(post, x + dx - 7, y + dy - 7, 14, 14, 5, 5, 0x2e2b40)
            slab(post, x + dx - 6, y + dy - 6, 12, 12, 32, 28, 0x51476c)
            slab(post, x + dx - 8, y + dy - 8, 16, 16, 34, 3, 0x8e7baa)
            slab(post, x + dx - 6, y + dy - 6, 12, 12, 35, 1, 0xa490c3)
        }
    }
}
