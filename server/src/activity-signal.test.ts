import { expect, test } from 'vite-plus/test'
import { createActivitySignal } from '../../web/src/activity-signal'

test('typing a 500-character link and keyboard events share one throttled activity signal', () => {
    let now = 0
    let sent = 0
    const signal = createActivitySignal(
        () => sent++,
        () => now
    )
    for (let character = 0; character < 500; character++) {
        signal()
        signal()
    }
    expect(sent).toBe(1)
    now = 899
    signal()
    expect(sent).toBe(1)
    now = 900
    signal()
    expect(sent).toBe(2)
})
