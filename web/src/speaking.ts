import type { Member } from '@office/shared/protocol'

// A local stop briefly masks in-flight snapshots, but must not suppress a
// later bot start forever if Discord misses or delays the next SDK event.
export class ActivitySpeaking {
    private states = new Map<string, { active: boolean; channelId: string; receivedAt: number; matched: boolean }>()
    constructor(private now = () => performance.now()) {}
    set(id: string, active: boolean, channelId: string) {
        this.states.set(id, { active, channelId, receivedAt: this.now(), matched: false })
    }
    clear() {
        this.states.clear()
    }
    apply(members: Member[]): Member[] {
        if (this.states.size === 0) {
            return members
        }
        const now = this.now()
        const ids = new Set(members.map((member) => member.id))
        for (const [id, signal] of this.states) {
            if (
                (!signal.active && now - signal.receivedAt >= 200) ||
                (!signal.matched && now - signal.receivedAt >= 1500) ||
                (!ids.has(id) && signal.matched)
            ) {
                this.states.delete(id)
            }
        }
        if (this.states.size === 0) {
            return members
        }
        return members.map((member) => {
            const signal = this.states.get(member.id)
            if (!signal) {
                return member
            }
            if (!member.inVoice || member.voiceChannelId !== signal.channelId || member.muted) {
                // A start can arrive before the first membership snapshot. Keep it
                // briefly so we don't need to wait for the next speaking start.
                if (signal.matched || member.muted) {
                    this.states.delete(member.id)
                }
                return member
            }
            signal.matched = true
            return { ...member, speaking: signal.active }
        })
    }
}
