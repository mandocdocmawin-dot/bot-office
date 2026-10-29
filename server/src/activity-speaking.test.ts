import { describe, expect, test } from 'vite-plus/test'
import { ActivitySpeaking } from '../../web/src/speaking'
import type { Member } from '@office/shared/protocol'

const member = (changes: Partial<Member> = {}): Member => ({
    id: '1',
    username: 'Speaker',
    avatar: null,
    x: 0,
    y: 0,
    room: 'Commons',
    sleeping: false,
    moving: false,
    inVoice: true,
    voiceChannelId: 'general',
    muted: false,
    speaking: false,
    ...changes
})

describe('activity-speaking', () => {
    test('Activity start survives server updates; stop only briefly masks a bot signal', () => {
        let now = 0
        const signals = new ActivitySpeaking(() => now)
        const serverMember = member({ speaking: true })
        signals.set('1', true, 'general')
        expect(signals.apply([member()])[0].speaking).toBe(true)
        expect(signals.apply([member()])[0].speaking).toBe(true)
        signals.set('1', false, 'general')
        expect(signals.apply([serverMember])[0].speaking).toBe(false)
        expect(serverMember.speaking).toBe(true)
        now = 199
        expect(signals.apply([serverMember])[0].speaking).toBe(false)
        now = 200
        expect(signals.apply([serverMember])[0].speaking).toBe(true)
        signals.clear()
        expect(signals.apply([member()])[0].speaking).toBe(false)
        expect(signals.apply([member({ speaking: true })])[0].speaking).toBe(true)
    })

    test('mute, leave, channel changes and removed members discard old Activity signals', () => {
        for (const changes of [{ muted: true }, { inVoice: false }, { voiceChannelId: 'other' }]) {
            const signals = new ActivitySpeaking()
            signals.set('1', true, 'general')
            signals.apply([member()])
            expect(signals.apply([member(changes)])[0].speaking).toBe(false)
            expect(signals.apply([member(changes)])[0].speaking).toBe(false)
        }
        const signals = new ActivitySpeaking()
        signals.set('1', true, 'general')
        signals.apply([member()])
        signals.apply([])
        expect(signals.apply([member()])[0].speaking).toBe(false)
    })

    test('a start arriving before membership lights up on the first matching snapshot', () => {
        let now = 0
        const signals = new ActivitySpeaking(() => now)
        signals.set('1', true, 'general')
        signals.apply([])
        expect(signals.apply([member({ inVoice: false, voiceChannelId: undefined })])[0].speaking).toBe(false)
        now = 1000
        expect(signals.apply([member()])[0].speaking).toBe(true)
    })

    test('an unmatched early start expires and cannot light up a later call', () => {
        let now = 0
        const signals = new ActivitySpeaking(() => now)
        signals.set('1', true, 'general')
        signals.apply([])
        now = 1500
        expect(signals.apply([member()])[0].speaking).toBe(false)
    })

    test('members without Activity signals keep their bot speaking state', () => {
        const signals = new ActivitySpeaking()
        signals.set('1', true, 'general')
        expect(signals.apply([member({ id: '2', speaking: true })])[0].speaking).toBe(true)
    })
})
