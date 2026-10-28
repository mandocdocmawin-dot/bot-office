export const ROOMS = ['Front Office', 'Commons', 'Study Hall', 'Tech Lab', 'Game Lounge', 'Studio', 'Showcase', 'Meeting Room', 'Nap Room'] as const;
export type Room = typeof ROOMS[number];
export type Presence = 'online' | 'idle' | 'dnd' | 'offline';
export interface Member {
  id: string; username: string; avatar: string | null; presence: Presence;
  room: Room; inVoice: boolean; sleeping: boolean;
}
export interface PublicConfig { serverName: string; bubbleEnabled: boolean; bubbleDurationMs: number; offlineBehavior: 'hide' | 'grey' }
export interface Snapshot { members: Member[]; config: PublicConfig; mode: 'mock' | 'discord'; ready: boolean }
export type EventName = 'member_join' | 'member_leave' | 'message' | 'thread_create' | 'voice_join' | 'voice_leave' | 'presence_update' | 'state_update';
export interface WireEvent { type: EventName; at: number; memberId?: string; room?: Room; bubble?: string; state: Snapshot }
export type Packet = WireEvent | { type: 'snapshot'; state: Snapshot };
