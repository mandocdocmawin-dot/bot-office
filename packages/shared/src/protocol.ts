export const ROOMS = [
    'Front Office',
    'Commons',
    'Study Hall',
    'Tech Lab',
    'Game Lounge',
    'Studio',
    'Showcase',
    'Meeting Room',
    'Nap Room'
] as const

export type Room = (typeof ROOMS)[number]

export interface Point {
    x: number
    y: number
}

export interface Rect extends Point {
    w: number
    h: number
}

export interface RoomLayout extends Rect {
    name: Room
    color: number
    subtitle: string
    icon: string
}

export interface Identity {
    id: string
    username: string
    avatar: string | null
}

export interface Member extends Identity, Point {
    character?: CharacterStyle
    room: Room
    sleeping: boolean
    moving: boolean
    seatId?: string
    source?: 'discord'
    presence?: 'online' | 'idle' | 'dnd' | 'offline'
    inVoice?: boolean
    voiceChannelName?: string
    voiceChannelId?: string
    muted?: boolean
    speaking?: boolean
}

export interface VoiceMonitorStatus {
    state: 'disabled' | 'idle' | 'connecting' | 'connected' | 'error'
    detail: string
    channelId?: string
    channelName?: string
    signals?: number
}

export interface DiscordStatus {
    state: 'disabled' | 'missing_token' | 'connecting' | 'connected' | 'error'
    detail: string
}

export interface PublicConfig {
    serverName: string
    bubbleEnabled: boolean
    bubbleDurationMs: number
    hybridControls?: boolean
}

export interface Snapshot {
    members: Member[]
    config: PublicConfig
    mode: 'mock' | 'multiplayer'
    ready: boolean
    discord?: DiscordStatus
    voiceMonitor?: VoiceMonitorStatus
}

export type ClientPacket =
    | { type: 'sit'; seatId?: string }
    | { type: 'stand' }
    | { type: 'character'; style: CharacterStyle }
    | { type: 'input'; dx: number; dy: number }
    | { type: 'move_to'; x: number; y: number }
    | { type: 'chat'; text: string }
    | { type: 'emote'; index: number }
    | { type: 'wake' }

export const CHARACTER_STYLES = ['default', 'blue', 'pink', 'mint', 'orange', 'lavender'] as const
export type CharacterStyle = (typeof CHARACTER_STYLES)[number]
export function isCharacterStyle(value: unknown): value is CharacterStyle {
    return typeof value === 'string' && (CHARACTER_STYLES as readonly string[]).includes(value)
}

export type Packet =
    | { type: 'snapshot'; selfId: string; state: Snapshot; at: number }
    | { type: 'state'; state: Snapshot; at: number }
    | { type: 'bubble'; memberId: string; text: string; room: Room; duration: number }
    | { type: 'error'; message: string }
