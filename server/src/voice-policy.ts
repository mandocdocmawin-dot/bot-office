export interface VoiceCandidate {
    id: string
    humans: number
}
// A single bot can monitor one voice channel per guild. Keep an occupied
// channel stable instead of interrupting calls whenever somebody joins elsewhere.
export function selectVoiceChannel(
    channels: VoiceCandidate[],
    currentId: string | undefined,
    preferredId: string,
    generalId: string
) {
    const occupied = channels.filter((c) => c.humans > 0)
    if (preferredId) {
        return occupied.find((c) => c.id === preferredId)?.id
    }
    if (occupied.some((c) => c.id === currentId)) {
        return currentId
    }
    if (occupied.some((c) => c.id === generalId)) {
        return generalId
    }
    return [...occupied].sort((a, b) => b.humans - a.humans || a.id.localeCompare(b.id))[0]?.id
}
