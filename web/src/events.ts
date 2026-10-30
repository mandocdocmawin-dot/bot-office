import Phaser from 'phaser'

export interface OfficeEvents {
    'office:move': (point: { x: number; y: number }) => void
    'office:sit': (seatId: string) => void
    'office:zoom': (data: { zoom: number }) => void
}

class OfficeEventBus extends Phaser.Events.EventEmitter {
    emitEvent<K extends keyof OfficeEvents>(event: K, ...args: Parameters<OfficeEvents[K]>): boolean {
        return this.emit(event, ...args)
    }

    onEvent<K extends keyof OfficeEvents>(event: K, fn: OfficeEvents[K], context?: unknown): this {
        return this.on(event, fn, context)
    }

    offEvent<K extends keyof OfficeEvents>(event: K, fn?: OfficeEvents[K], context?: unknown): this {
        return this.off(event, fn, context)
    }
}

export const eventBus = new OfficeEventBus()
