import Phaser from 'phaser'
import { project } from './isometric'
import manifest from './tambayan-sprites-v2.json'

export type TambayanSpriteId = keyof typeof manifest

export function preloadTambayanSprites(scene: Phaser.Scene) {
    for (const [id, spec] of Object.entries(manifest)) scene.load.image(`tambayan-v2:${id}`, spec.file)
}

/** Bounds measure opaque artwork, not the transparent canvas or baked glow.
 * Ground inset locates the center of the object's contact diamond above its feet.
 * Each sprite remains independently depth-sorted with the live avatars.
 */
export function tambayanSprite(scene: Phaser.Scene, id: TambayanSpriteId,
    x: number, y: number, width: number, groundInset = .2, z = 0) {
    const spec = manifest[id]
    const { bounds } = spec
    const ground = project(x, y, z)
    const scale = width / bounds.w
    return scene.add.image(ground.x, ground.y, `tambayan-v2:${id}`)
        .setOrigin((bounds.x + bounds.w / 2) / spec.width,
            (bounds.y + bounds.h - bounds.w * groundInset) / spec.height)
        .setScale(scale)
        .setDepth(1000 + project(x, y).y)
        .setName(`Tambayan ${id}`)
}
