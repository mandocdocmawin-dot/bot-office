import type { Member } from '../../server/src/protocol';

// Preserve stop events too: an older server snapshot must not relight the ring.
export class ActivitySpeaking {
  private states = new Map<string, { active: boolean; channelId: string }>();
  set(id: string, active: boolean, channelId: string) { this.states.set(id, { active, channelId }); }
  clear() { this.states.clear(); }
  apply(members: Member[]): Member[] {
    const ids = new Set(members.map(member => member.id));
    for (const id of this.states.keys()) if (!ids.has(id)) this.states.delete(id);
    return members.map(member => {
      const signal = this.states.get(member.id);
      if (!signal) return member;
      if (!member.inVoice || member.voiceChannelId !== signal.channelId || member.muted) {
        this.states.delete(member.id);
        return { ...member, speaking: false };
      }
      return { ...member, speaking: signal.active };
    });
  }
}
