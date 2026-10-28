import Phaser from 'phaser';
import type { Member, Room, Snapshot } from '../../bot/src/protocol';
import { WIDTH, HEIGHT, rooms } from './rooms';
interface Character { root: Phaser.GameObjects.Container; name: Phaser.GameObjects.Text; status: Phaser.GameObjects.Arc; bubble?: Phaser.GameObjects.Container; zzz: Phaser.GameObjects.Text; member: Member; slot: string }
export class OfficeScene extends Phaser.Scene {
  private people = new Map<string, Character>();
  private counts = new Map<Room, Phaser.GameObjects.Text>();
  private pending?: Snapshot;
  private built = false;
  private fitZoom = 1;
  private zoomFactor = 1;
  private selected?: Room;
  private outlines = new Map<Room, Phaser.GameObjects.Graphics>();
  constructor() { super('office'); }
  create() {
    this.built = true;
    const g = this.add.graphics();
    // A quiet dotted ground makes the room footprint read like an office plan.
    g.fillStyle(0x252c38, 0.5);
    for (let x = 12; x < WIDTH; x += 24) for (let y = 12; y < HEIGHT; y += 24) g.fillCircle(x, y, 1);
    g.lineStyle(18, 0x1d2430, 1);
    g.lineBetween(220, 470, 1170, 470); g.lineBetween(700, 125, 700, 850);
    for (const room of rooms) {
      const { x, y, w, h, color, name, subtitle } = room;
      g.fillStyle(0x171e2b); g.fillRoundedRect(x, y, w, h, 12);
      g.fillStyle(color, 0.035); g.fillRoundedRect(x, y, w, h, 12);
      g.lineStyle(2, color, 0.65); g.strokeRoundedRect(x, y, w, h, 12);
      g.fillStyle(color, 0.9); g.fillRoundedRect(x + 20, y + 23, 4, 23, 2);
      this.add.text(x + 36, y + 21, name, { fontFamily: 'Arial', fontSize: '21px', color: '#eef1f8', fontStyle: 'bold' });
      this.add.text(x + 36, y + 51, subtitle, { fontFamily: 'Arial', fontSize: '13px', color: '#939eaf' });
      this.counts.set(name, this.add.text(x + w - 22, y + 24, '0', { fontFamily: 'Arial', fontSize: '17px', color: '#b2bdce' }).setOrigin(1, 0));
      this.furniture(g, room.name, x, y, w, h, color);
      const hit = this.add.zone(x, y, w, h).setOrigin(0).setInteractive();
      hit.on('pointerup', (pointer: Phaser.Input.Pointer) => {
        if (Phaser.Math.Distance.Between(pointer.downX, pointer.downY, pointer.x, pointer.y) < 6) window.dispatchEvent(new CustomEvent('office-room', { detail: name }));
      });
      const outline = this.add.graphics(); outline.lineStyle(4, color, 0.9); outline.strokeRoundedRect(x - 4, y - 4, w + 8, h + 8, 15); outline.setVisible(false);
      this.outlines.set(name, outline);
    }
    this.fit();
    this.scale.on('resize', () => this.fit());
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => this.zoom(dy > 0 ? -0.15 : 0.15));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.isDown) return;
      this.cameras.main.scrollX -= (p.x - p.prevPosition.x) / this.cameras.main.zoom;
      this.cameras.main.scrollY -= (p.y - p.prevPosition.y) / this.cameras.main.zoom;
    });
    if (this.pending) this.sync(this.pending);
  }
  private furniture(g: Phaser.GameObjects.Graphics, name: Room, x: number, y: number, w: number, h: number, color: number) {
    const desk = (dx: number, dy: number, width = 65) => {
      g.fillStyle(0x2a3544); g.fillRoundedRect(dx, dy, width, 22, 4);
      g.fillStyle(color, 0.22); g.fillRoundedRect(dx + 6, dy + 4, 24, 13, 2);
      g.fillStyle(0x101824); g.fillRoundedRect(dx + 9, dy + 5, 18, 9, 1);
      g.lineStyle(2, 0x405064); g.strokeCircle(dx + width / 2, dy - 12, 8);
    };
    if (name === 'Commons') {
      g.fillStyle(0x292f49); g.fillRoundedRect(x + 115, y + h - 67, 114, 28, 8); g.fillRoundedRect(x + 285, y + h - 67, 114, 28, 8);
      g.fillStyle(0x394158); g.fillRoundedRect(x + 239, y + h - 71, 36, 36, 8);
      this.add.text(x + w / 2, y + h - 19, 'Good company, wherever you are.', { fontSize: '12px', fontFamily: 'Arial', color: '#6f7b91' }).setOrigin(0.5);
    } else if (name === 'Nap Room') {
      for (let i = 0; i < 3; i++) { g.fillStyle(0x343248); g.fillRoundedRect(x + 45 + i * 100, y + h - 55, 67, 30, 6); g.fillStyle(0x67627d); g.fillRoundedRect(x + 49 + i * 100, y + h - 51, 17, 22, 4); }
    } else if (name === 'Meeting Room') {
      g.fillStyle(0x293a48); g.fillRoundedRect(x + w / 2 - 100, y + h - 62, 200, 30, 15);
      for (let i = 0; i < 5; i++) { g.fillStyle(0x405064); g.fillCircle(x + w / 2 - 75 + i * 38, y + h - 72, 7); }
    } else if (name === 'Front Office') {
      g.fillStyle(0x4b4137); g.fillRoundedRect(x + w - 155, y + h - 38, 118, 14, 3);
    } else { desk(x + 45, y + h - 40); desk(x + w - 112, y + h - 40); }
    // Small planters anchor the far corners, outside the character area.
    g.fillStyle(0x374738); g.fillCircle(x + 19, y + h - 20, 9); g.fillStyle(0x6b9b7f); g.fillEllipse(x + 16, y + h - 25, 8, 14); g.fillEllipse(x + 23, y + h - 22, 10, 8);
  }
  fit() {
    if (!this.built) return;
    this.fitZoom = Math.min(this.scale.width / WIDTH, this.scale.height / HEIGHT) * 0.97;
    this.zoomFactor = 1;
    this.cameras.main.setZoom(this.fitZoom).centerOn(WIDTH / 2, HEIGHT / 2);
    this.reportZoom();
  }
  zoom(delta: number) {
    this.zoomFactor = Phaser.Math.Clamp(this.zoomFactor + delta, 0.65, 3);
    this.cameras.main.setZoom(this.fitZoom * this.zoomFactor); this.reportZoom();
  }
  private reportZoom() { window.dispatchEvent(new CustomEvent('office-zoom', { detail: Math.round(this.zoomFactor * 100) })); }
  select(room?: Room) { this.selected = room; for (const [name, outline] of this.outlines) outline.setVisible(name === room); }
  sync(state: Snapshot) {
    this.pending = state; if (!this.built) return;
    const ids = new Set(state.members.map(m => m.id));
    for (const [id, c] of this.people) if (!ids.has(id)) { this.tweens.killTweensOf(c.root); c.root.destroy(); this.people.delete(id); }
    for (const room of rooms) {
      const members = state.members.filter(m => m.room === room.name).sort((a, b) => a.id.localeCompare(b.id));
      this.counts.get(room.name)?.setText(String(members.length));
      const availableW = room.w - 50, availableH = room.h - 135;
      const cols = Math.max(1, Math.ceil(Math.sqrt(members.length * availableW / Math.max(availableH, 50))));
      const rows = Math.max(1, Math.ceil(members.length / cols));
      const cellW = availableW / cols, cellH = availableH / rows;
      const size = Math.min(1, cellW / 88, cellH / 65);
      members.forEach((m, i) => {
        let c = this.people.get(m.id);
        const tx = room.x + 25 + cellW * (i % cols + 0.5), ty = room.y + 87 + cellH * (Math.floor(i / cols) + 0.5);
        if (!c) {
          c = this.makeCharacter(m, tx, ty); this.people.set(m.id, c);
        }
        const slot = `${tx}:${ty}:${size}`;
        if (c.slot !== slot) {
          this.tweens.killTweensOf(c.root);
          const distance = Phaser.Math.Distance.Between(c.root.x, c.root.y, tx, ty);
          this.tweens.add({ targets: c.root, x: tx, y: ty, scale: size, duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : Phaser.Math.Clamp(distance * 3, 500, 2600), ease: 'Sine.easeInOut' });
          c.slot = slot;
        }
        if (c.member.avatar !== m.avatar) this.loadAvatar(c, m);
        c.member = m; c.name.setText(this.shortName(m.username));
        c.root.setAlpha(m.presence === 'offline' ? 0.35 : 1);
        c.status.setFillStyle(m.inVoice ? 0x6ed7b0 : m.presence === 'dnd' ? 0xe27f89 : m.presence === 'idle' ? 0xe2bf78 : 0x7ed7ad);
        c.zzz.setVisible(m.sleeping); if (m.sleeping) c.bubble?.setVisible(false);
      });
    }
    this.select(this.selected);
  }
  private shortName(name: string) { const chars = Array.from(name); return chars.length > 11 ? chars.slice(0, 10).join('') + '…' : name; }
  private makeCharacter(m: Member, x: number, y: number): Character {
    const root = this.add.container(x, y).setDepth(10);
    const ring = this.add.circle(0, 0, 22, 0x303d51).setStrokeStyle(2, 0x7a8ba3);
    const initial = this.add.text(0, 0, Array.from(m.username)[0] ?? '?', { fontSize: '20px', fontFamily: 'Arial', color: '#ffffff' }).setOrigin(0.5);
    const name = this.add.text(0, 32, this.shortName(m.username), { fontFamily: 'Arial', fontSize: '14px', color: '#e4e9f3', backgroundColor: '#171e2b', padding: { x: 3, y: 2 } }).setOrigin(0.5);
    const status = this.add.circle(16, 15, 5, 0x7ed7ad).setStrokeStyle(2, 0x171e2b);
    const zzz = this.add.text(15, -43, 'Zzz', { fontFamily: 'Arial', fontSize: '18px', color: '#bcb6e3', fontStyle: 'italic' }).setVisible(m.sleeping);
    root.add([ring, initial, name, status, zzz]);
    const c = { root, name, status, zzz, member: m, slot: '' }; this.loadAvatar(c, m); return c;
  }
  private loadAvatar(c: Character, m: Member) {
    if (!m.avatar) return;
    const key = `avatar:${m.id}:${m.avatar}`;
    const show = () => {
      if (!c.root.scene || c.member.avatar !== m.avatar) return;
      const old = c.root.getByName('avatar'); old?.destroy();
      const picture = this.add.image(0, 0, key).setDisplaySize(40, 40).setName('avatar');
      c.root.addAt(picture, 2);
    };
    if (this.textures.exists(key)) { show(); return; }
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (!this.sys.isActive()) return;
      if (!this.textures.exists(key)) {
        const texture = this.textures.createCanvas(key, 64, 64); if (!texture) return;
        const ctx = texture.context; ctx.save(); ctx.beginPath(); ctx.arc(32, 32, 32, 0, Math.PI * 2); ctx.clip(); ctx.drawImage(img, 0, 0, 64, 64); ctx.restore(); texture.refresh();
      }
      show();
    };
    img.src = m.avatar;
  }
  speak(id: string, content: string, duration: number) {
    const c = this.people.get(id); if (!c) return;
    c.bubble?.destroy();
    const text = this.add.text(0, 0, content, { fontFamily: 'Arial', fontSize: '14px', color: '#17202e', wordWrap: { width: 180 }, align: 'center', padding: { x: 10, y: 8 } }).setOrigin(0.5, 1);
    const bg = this.add.graphics().fillStyle(0xe5eaf3).fillRoundedRect(-text.width / 2, -text.height, text.width, text.height, 7).fillTriangle(-5, 0, 5, 0, 0, 6);
    const bubble = this.add.container(0, -32, [bg, text]); c.root.add(bubble); c.bubble = bubble;
    // Bring the speaking character above neighbours only for the bubble lifetime.
    c.root.setDepth(20);
    this.time.delayedCall(duration, () => { if (c.bubble === bubble) { bubble.destroy(); c.bubble = undefined; c.root.setDepth(10); } });
  }
  clearBubbles() { for (const c of this.people.values()) { c.bubble?.destroy(); c.bubble = undefined; } }
}
