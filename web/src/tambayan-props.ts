import Phaser from 'phaser'
import { project } from '@office/shared/math'

export type PropSpec = {
    id: string; label: string; file: string; width: number; height: number
    origin: number[]; footprint: number[]; action: string
}

/** In preload(): preloadProps(this, manifest, '/assets/tambayan/').
 * Copy the manifest's assets/ folder underneath that base URL.
 * SVG is rasterized by Phaser once at load time, then reused as a texture.
 */
export function preloadProps(scene: Phaser.Scene, manifest: PropSpec[], baseUrl: string) {
    for (const prop of manifest) {
        scene.load.svg(`tambayan:${prop.id}`, `${baseUrl.replace(/\/$/, '')}/${prop.file}`, {
            width: Math.ceil(prop.width * 2), height: Math.ceil(prop.height * 2)
        })
    }
}

/** Callers own navigation, proximity validation, panels and seat claims.
 * Destroy the returned object to remove listeners and the prop together.
 * For keyboard/touch accessibility also expose actions in the existing DOM UI.
 */
export function addProp(scene: Phaser.Scene, prop: PropSpec, x: number, y: number,
    onAction?: (action: string) => void): Phaser.GameObjects.Image {
    const ground = project(x, y)
    const front = project(x + prop.footprint[0] / 2, y + prop.footprint[1])
    const sprite = scene.add.image(ground.x, ground.y, `tambayan:${prop.id}`)
        .setOrigin(prop.origin[0], prop.origin[1])
        .setDisplaySize(prop.width, prop.height)
        .setDepth(1000 + front.y)
        .setName(prop.label)
    if (onAction) {
        sprite.setInteractive({ useHandCursor: true, pixelPerfect: true, alphaTolerance: 1 })
        sprite.on('pointerdown', (_pointer: Phaser.Input.Pointer, _x: number, _y: number,
            event: Phaser.Types.Input.EventData) => {
            event.stopPropagation()
            onAction(prop.action)
        })
    }
    return sprite
}
