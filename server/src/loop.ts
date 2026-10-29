export class GameLoop {
    private accumulator = 0
    private lastTime = performance.now()
    private timer: NodeJS.Timeout | null = null
    private readonly fixedStepSec: number
    private readonly fixedStepMs: number

    constructor(
        private readonly tickRate: number,
        private readonly onTick: (dtSec: number) => void,
        private readonly onBroadcast: () => void
    ) {
        this.fixedStepSec = 1 / tickRate
        this.fixedStepMs = 1000 / tickRate
    }

    start(): void {
        this.lastTime = performance.now()
        const intervalMs = Math.max(5, Math.floor(this.fixedStepMs / 2))
        this.timer = setInterval(() => {
            const now = performance.now()
            let elapsed = now - this.lastTime
            this.lastTime = now

            if (elapsed > 250) {
                elapsed = 250
            }
            this.accumulator += elapsed

            let ticked = false
            while (this.accumulator >= this.fixedStepMs) {
                this.onTick(this.fixedStepSec)
                this.accumulator -= this.fixedStepMs
                ticked = true
            }

            if (ticked) {
                this.onBroadcast()
            }
        }, intervalMs)
        this.timer.unref()
    }

    stop(): void {
        if (this.timer) {
            clearInterval(this.timer)
            this.timer = null
        }
    }
}
