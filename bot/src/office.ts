import type { Config } from './config.js';
import type { EventName, Member, Presence, Room, Snapshot, WireEvent } from './protocol.js';
interface Internal extends Member { lastActivity: number; returnAt: number | null; voiceRoom: Room | null }
export class Office {
  members = new Map<string, Internal>();
  ready = false;
  constructor(public config: Config, public mode: 'mock' | 'discord', public optedOut: Set<string>, private emit: (event: WireEvent) => void, private now = () => Date.now()) {}
  snapshot(): Snapshot {
    return {
      members: [...this.members.values()].filter(m => !this.optedOut.has(m.id) && (this.config.offline_behavior === 'grey' || m.presence !== 'offline'))
        .map(({ id, username, avatar, presence, room, inVoice, sleeping }) => ({ id, username, avatar, presence, room, inVoice, sleeping })),
      config: { serverName: this.config.server_name, bubbleEnabled: this.config.bubble_enabled, bubbleDurationMs: this.config.bubble_duration_ms, offlineBehavior: this.config.offline_behavior }, mode: this.mode, ready: this.ready
    };
  }
  publish(type: EventName = 'state_update', id?: string, bubble?: string) {
    // Opt-outs never leak identity or message content in event metadata either.
    const member = id && !this.optedOut.has(id) ? this.members.get(id) : undefined;
    const visible = member && (member.presence !== 'offline' || this.config.offline_behavior === 'grey');
    const leaving = type === 'member_leave' && id && !this.optedOut.has(id);
    this.emit({ type, at: this.now(), ...(visible ? { memberId: id, room: member.room, ...(bubble ? { bubble } : {}) } : leaving ? { memberId: id } : {}), state: this.snapshot() });
  }
  add(member: Pick<Member, 'id' | 'username' | 'avatar' | 'presence'>, joined = false) {
    const previous = this.members.get(member.id);
    this.members.set(member.id, { room: 'Commons', inVoice: false, sleeping: false, lastActivity: this.now(), returnAt: null, voiceRoom: null, ...previous, ...member,
      ...(joined ? { room: 'Front Office' as Room, inVoice: false, voiceRoom: null, sleeping: false, lastActivity: this.now(), returnAt: this.now() + this.config.new_member_stay_ms } : {}) });
    if (joined) this.publish('member_join', member.id);
  }
  remove(id: string) { this.members.delete(id); this.publish('member_leave', id); }
  textRoom(channelId: string, parentId?: string | null): Room {
    return this.config.channels.find(c => c.id === channelId || c.id === parentId)?.room ?? this.config.default_room_for_unmapped_channel;
  }
  voiceRoom(channelId: string, categoryName?: string | null): Room {
    if (channelId === this.config.main_general_voice_channel_id) return 'Commons';
    if (categoryName === this.config.dynamic_voice_category_name) return 'Meeting Room';
    return this.textRoom(channelId);
  }
  activity(id: string, room: Room, kind: 'message' | 'thread_create', content?: string) {
    const m = this.members.get(id); if (!m) return;
    m.lastActivity = this.now(); m.sleeping = false;
    m.room = m.voiceRoom ?? room;
    m.returnAt = m.voiceRoom ? null : this.now() + this.config.message_stay_ms;
    const bubble = this.config.bubble_enabled && content ? Array.from(content.replace(/\s+/g, ' ').trim()).slice(0, this.config.bubble_max_chars).join('') : undefined;
    this.publish(kind, id, bubble);
  }
  voice(id: string, room: Room | null) {
    const m = this.members.get(id); if (!m) return;
    m.lastActivity = this.now(); m.sleeping = false; m.voiceRoom = room; m.inVoice = !!room;
    m.room = room ?? 'Commons'; m.returnAt = null;
    this.publish(room ? 'voice_join' : 'voice_leave', id);
  }
  presence(id: string, presence: Presence) {
    const m = this.members.get(id); if (!m) return;
    // Coming online and an actual presence change count as activity; duplicate updates don't.
    if (m.presence !== presence && presence !== 'offline') {
      m.lastActivity = this.now(); m.sleeping = false;
      m.room = m.voiceRoom ?? 'Commons'; m.returnAt = null;
    }
    m.presence = presence; this.publish('presence_update', id);
  }
  tick() {
    let changed = false;
    for (const m of this.members.values()) {
      if (m.inVoice) continue;
      if (this.now() - m.lastActivity >= this.config.idle_timeout_ms) {
        if (!m.sleeping) { m.room = 'Nap Room'; m.sleeping = true; m.returnAt = null; changed = true; }
      } else if (m.returnAt !== null && this.now() >= m.returnAt) {
        m.room = 'Commons'; m.returnAt = null; changed = true;
      }
    }
    if (changed) this.publish();
  }
}
