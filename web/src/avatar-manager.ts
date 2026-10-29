import Phaser from 'phaser'

export class AvatarTextureManager {
    private activeReferences = new Map<string, number>()

    constructor(private textures: Phaser.Textures.TextureManager) {}

    acquire(id: string, avatarUrl: string | null, onReady: (key: string) => void): string | undefined {
        if (!avatarUrl) {
            return undefined
        }
        const key = `avatar:${id}:${avatarUrl}`
        this.activeReferences.set(key, (this.activeReferences.get(key) ?? 0) + 1)

        if (this.textures.exists(key)) {
            onReady(key)
            return key
        }

        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => {
            if (!this.textures.exists(key)) {
                const texture = this.textures.createCanvas(key, 64, 64)
                if (texture) {
                    const ctx = texture.context
                    ctx.save()
                    ctx.beginPath()
                    ctx.arc(32, 32, 32, 0, Math.PI * 2)
                    ctx.clip()
                    ctx.drawImage(img, 0, 0, 64, 64)
                    ctx.restore()
                    texture.refresh()
                }
            }
            onReady(key)
        }
        img.src = avatarUrl
        return key
    }

    release(id: string, avatarUrl: string | null): void {
        if (!avatarUrl) {
            return
        }
        const key = `avatar:${id}:${avatarUrl}`
        const count = this.activeReferences.get(key)
        if (!count) {
            return
        }

        if (count <= 1) {
            this.activeReferences.delete(key)
            if (this.textures.exists(key)) {
                const texture = this.textures.get(key)
                texture.destroy()
                this.textures.remove(key)
            }
        } else {
            this.activeReferences.set(key, count - 1)
        }
    }
}
