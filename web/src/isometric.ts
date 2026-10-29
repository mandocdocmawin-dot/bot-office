import Phaser from 'phaser'
import { WORLD_HEIGHT, WORLD_WIDTH, corners, project, unproject } from '@office/shared/math'

export { WORLD_WIDTH, WORLD_HEIGHT, project, unproject, corners }
export function polygon(g: Phaser.GameObjects.Graphics, points: { x: number; y: number }[], color: number, alpha = 1) {
    g.fillStyle(color, alpha).fillPoints(points, true)
}
export function slab(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    w: number,
    h: number,
    z: number,
    thickness: number,
    color: number
) {
    const top = corners(x, y, w, h, z)
    const bottom = corners(x, y, w, h, z - thickness)
    polygon(g, [top[1], top[2], bottom[2], bottom[1]], Phaser.Display.Color.IntegerToColor(color).darken(29).color)
    polygon(g, [top[2], top[3], bottom[3], bottom[2]], Phaser.Display.Color.IntegerToColor(color).darken(16).color)
    polygon(g, top, color)
}
export class Furnishing {
    constructor(private scene: Phaser.Scene) {}
    private graphics(x: number, y: number) {
        return this.scene.add.graphics().setDepth(1000 + project(x, y).y)
    }
    desk(x: number, y: number, accent: number, double = false) {
        const g = this.graphics(x + 68, y + 40)
        const width = double ? 126 : 86
        slab(g, x + 6, y + 5, 8, 40, 32, 32, 0x33_33_44)
        slab(g, x + width - 15, y + 5, 8, 40, 32, 32, 0x33_33_44)
        slab(g, x, y, width, 48, 35, 7, 0x8c7567)
        slab(g, x + 25, y + 13, 27, 16, 38, 3, 0x24_23_2e)
        slab(g, x + 34, y + 8, 5, 6, 53, 16, 0x3f_40_54)
        const a = project(x + 18, y + 5, 71)
        const b = project(x + 57, y + 5, 71)
        const c = project(x + 57, y + 5, 47)
        const d = project(x + 18, y + 5, 47)
        polygon(g, [a, b, c, d], 0x17_19_21)
        polygon(
            g,
            [
                { x: a.x + 3, y: a.y + 4 },
                { x: b.x - 3, y: b.y + 2 },
                { x: c.x - 3, y: c.y - 4 },
                { x: d.x + 3, y: d.y - 2 }
            ],
            accent,
            0.7
        )
        const screen = project(x + 27, y + 5, 61)
        g.lineStyle(2, 0xff_ff_ff, 0.5).lineBetween(screen.x, screen.y, screen.x + 17, screen.y + 8)
        slab(g, x + 25, y + 32, 31, 9, 38, 2, 0xb2aaa9)
        slab(g, x + width - 17, y + 15, 7, 7, 45, 10, 0xd8d0bc)
        this.chair(x + width / 2 - 12, y + 61, accent)
    }
    chair(x: number, y: number, color: number) {
        const g = this.graphics(x + 14, y + 17)
        const p = project(x + 13, y + 13)
        g.lineStyle(3, 0x4d4b5e)
            .lineBetween(p.x - 13, p.y + 2, p.x + 13, p.y + 2)
            .lineBetween(p.x, p.y - 5, p.x, p.y + 8)
        slab(g, x + 11, y + 10, 4, 4, 20, 20, 0x41_41_51)
        slab(g, x, y, 28, 26, 23, 7, 0x38_36_46)
        slab(g, x, y + 22, 28, 6, 44, 22, Phaser.Display.Color.IntegerToColor(color).darken(35).color)
    }
    plant(x: number, y: number, tall = false) {
        const g = this.graphics(x, y)
        const p = project(x, y)
        g.fillStyle(0x05060a, 0.35).fillEllipse(p.x, p.y + 5, 31, 13)
        slab(g, x - 10, y - 10, 20, 20, 20, 20, 0x62_58_4c)
        g.lineStyle(4, 0x53_68_42).lineBetween(p.x, p.y - 20, p.x, p.y - (tall ? 65 : 45))
        for (let i = 0; i < (tall ? 6 : 4); i++) {
            g.fillStyle(i % 2 ? 0x77ab70 : 0x4e_80_5a).fillEllipse(p.x + (i % 2 ? 1 : -1) * 8, p.y - 25 - i * 6, 20, 13)
        }
    }
    sofa(x: number, y: number, color: number, width = 110) {
        const g = this.graphics(x + width / 2, y + 26)
        slab(g, x + 5, y + 4, width - 10, 38, 8, 8, 0x26232e)
        slab(g, x, y, width, 44, 28, 22, color)
        slab(g, x, y, width, 9, 51, 24, Phaser.Display.Color.IntegerToColor(color).lighten(12).color)
        slab(g, x, y, 11, 44, 40, 13, color)
        slab(g, x + width - 11, y, 11, 44, 40, 13, color)
        for (let i = 0; i < 3; i++) {
            slab(
                g,
                x + 13 + (i * (width - 26)) / 3,
                y + 13,
                (width - 29) / 3,
                27,
                30,
                3,
                Phaser.Display.Color.IntegerToColor(color).lighten(6).color
            )
        }
    }
    bed(x: number, y: number, color: number) {
        const g = this.graphics(x + 28, y + 57)
        slab(g, x, y, 59, 100, 15, 12, 0x44404e)
        slab(g, x + 3, y + 3, 53, 94, 24, 9, 0xbb_b9_c9)
        slab(g, x + 3, y + 36, 53, 61, 28, 5, color)
        slab(g, x + 9, y + 9, 41, 23, 30, 7, 0xe0dbe8)
        slab(g, x, y - 3, 59, 6, 44, 31, 0x5a5269)
    }
    meeting(x: number, y: number, width: number, color: number) {
        const g = this.graphics(x + width / 2, y + 35)
        slab(g, x + 20, y + 10, 10, 50, 30, 30, 0x40404d)
        slab(g, x + width - 30, y + 10, 10, 50, 30, 30, 0x40404d)
        slab(g, x, y, width, 70, 36, 8, 0x73685f)
        slab(g, x + width / 2 - 13, y + 23, 26, 19, 40, 3, 0x252b3a)
        for (let i = 0; i < 4; i++) {
            this.chair(x + 12 + (i * (width - 35)) / 4, y - 32, color)
            this.chair(x + 12 + (i * (width - 35)) / 4, y + 80, color)
        }
    }
    shelf(x: number, y: number, color: number) {
        const g = this.graphics(x + 80, y + 10)
        slab(g, x, y, 112, 25, 65, 65, 0x39333d)
        for (let row = 0; row < 2; row++) {
            for (let i = 0; i < 9; i++) {
                slab(g, x + 6 + i * 11, y + 20, 7, 8, 28 + row * 29, 19 + (i % 3) * 3, i % 2 ? color : 0x8d756d)
            }
        }
        slab(g, x, y, 112, 27, 67, 4, 0x8a796b)
    }
    easel(x: number, y: number, color: number) {
        const g = this.graphics(x + 15, y + 20)
        slab(g, x + 1, y, 5, 9, 65, 65, 0x99_77_60)
        slab(g, x + 46, y, 5, 9, 65, 65, 0x99_77_60)
        polygon(g, [project(x, y, 81), project(x + 53, y, 81), project(x + 53, y, 34), project(x, y, 34)], 0xead9bf)
        const p = project(x + 25, y, 57)
        g.fillStyle(color).fillCircle(p.x, p.y, 13)
        g.fillStyle(0x8f78b8).fillTriangle(p.x - 17, p.y + 9, p.x + 14, p.y + 20, p.x - 2, p.y - 3)
    }
}
