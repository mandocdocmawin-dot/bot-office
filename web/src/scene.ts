import Phaser from 'phaser';
import type { Member, Room, Snapshot } from '../../server/src/protocol';
import { rooms, colorCSS, doors } from './rooms';
import { WORLD_WIDTH, WORLD_HEIGHT, project, unproject, corners, polygon, slab, Furnishing } from './isometric';
interface Character {
  root: Phaser.GameObjects.Container; body: Phaser.GameObjects.Container;
  name: Phaser.GameObjects.Text; status: Phaser.GameObjects.Arc;
  bubble?: Phaser.GameObjects.Container; zzz: Phaser.GameObjects.Text;
  member: Member; seed: number; targetX: number; targetY: number;
}
export class OfficeScene extends Phaser.Scene {
  private people = new Map<string, Character>();
  private counts = new Map<Room, Phaser.GameObjects.Text>();
  private pending?: Snapshot;
  private built = false;
  private fitZoom = 1;
  private zoomFactor = 1;
  private selected?: Room;
  private outlines = new Map<Room, Phaser.GameObjects.Graphics>();
  private reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  private selfId = '';
  private frozen = false;
  constructor() { super('office'); }
  create() {
    this.built = true;
    const base = this.add.graphics();
    slab(base, 0, 0, 1400, 1000, -5, 38, 0x171622);
    polygon(base, corners(18, 18, 1364, 964, -4), 0x201d2a);
    for (const door of doors) {
      polygon(base, corners(door.x, door.y, door.w, door.h), 0x494157);
      const p = project(door.x + door.w / 2, door.y + door.h / 2);
      this.add.text(p.x, p.y, '◇', { fontSize: '20px', color: '#b9aacb' }).setOrigin(.5).setDepth(4);
    }
    const furniture = new Furnishing(this);
    for (const room of rooms) {
      const { x, y, w, h, color, name } = room;
      const g = this.add.graphics().setDepth(1);
      polygon(g, corners(x, y, w, h), 0x171722);
      polygon(g, corners(x, y, w, h), color, 0.10);
      polygon(g, corners(x + 30, y + 50, w - 60, h - 85), color, name === 'Commons' ? 0.24 : 0.10);
      g.lineStyle(1, 0xffffff, 0.025);
      for (let line = 35; line < w; line += 32) {
        const a = project(x + line, y + 5), b = project(x + line, y + h - 5); g.lineBetween(a.x, a.y, b.x, b.y);
      }
      const edge = corners(x, y, w, h), wall = corners(x, y, w, h, 29);
      polygon(g, [edge[3], edge[0], wall[0], wall[3]], color, 0.09);
      polygon(g, [edge[0], edge[1], wall[1], wall[0]], color, 0.10);
      g.lineStyle(9, color, 0.06).strokePoints([wall[3], wall[0], wall[1]], false);
      g.lineStyle(3, color, 0.85).strokePoints([wall[3], wall[0], wall[1]], false);
      g.lineStyle(2, color, 0.45).strokePoints([edge[1], edge[2], edge[3]], false);
      const labelPoint = project(x + 15, y + 8, 55);
      const title = this.add.text(labelPoint.x, labelPoint.y, name, { fontFamily: 'Arial', fontSize: '19px', fontStyle: 'bold', color: colorCSS(color), backgroundColor: '#100e19', padding: { x: 7, y: 4 } }).setOrigin(0, 1).setDepth(3000);
      this.counts.set(name, this.add.text(labelPoint.x + title.width + 8, labelPoint.y - 5, '0', { fontFamily: 'Arial', fontSize: '16px', color: '#ada6c1' }).setOrigin(0, 1).setDepth(3000));
      // Mask wall rails at actual doors, so visual openings match collision geometry.
      for (const door of doors) {
        const crossesLeft = door.x < x && door.x + door.w > x;
        const crossesRight = door.x < x + w && door.x + door.w > x + w;
        const crossesTop = door.y < y && door.y + door.h > y;
        const crossesBottom = door.y < y + h && door.y + door.h > y + h;
        const alongY = door.y >= y && door.y + door.h <= y + h;
        const alongX = door.x >= x && door.x + door.w <= x + w;
        const wallX = crossesLeft ? x : x + w, wallY = crossesTop ? y : y + h;
        if ((crossesLeft || crossesRight) && alongY) polygon(g, [project(wallX, door.y, 30), project(wallX, door.y + door.h, 30), project(wallX, door.y + door.h), project(wallX, door.y)], 0x25232f);
        if ((crossesTop || crossesBottom) && alongX) polygon(g, [project(door.x, wallY, 30), project(door.x + door.w, wallY, 30), project(door.x + door.w, wallY), project(door.x, wallY)], 0x25232f);
      }
      const outline = this.add.graphics().setDepth(3);
      outline.lineStyle(14, color, 0.12).strokePoints(edge, true); outline.lineStyle(4, color, 1).strokePoints(edge, true); outline.setVisible(false);
      this.outlines.set(name, outline);
      this.furnish(furniture, name, x, y, w, h, color);
    }
    const hub = project(485, 508), beacon = this.add.graphics().setDepth(1000 + hub.y);
    beacon.fillStyle(0x64e3d3, 0.06).fillEllipse(hub.x, hub.y, 110, 55);
    slab(beacon, 468, 490, 35, 35, 15, 15, 0x39384d);
    beacon.fillStyle(0x7de7db, 0.13).fillCircle(hub.x, hub.y - 40, 30);
    beacon.fillStyle(0x73d6d1).fillCircle(hub.x, hub.y - 40, 19); beacon.fillStyle(0xb8fff0).fillEllipse(hub.x - 6, hub.y - 47, 10, 12);
    this.fit(); this.scale.on('resize', () => this.fit());
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => this.zoom(dy > 0 ? -0.15 : 0.15));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.isDown) return;
      if (Phaser.Math.Distance.Between(p.downX, p.downY, p.x, p.y) > 6) this.cameras.main.stopFollow();
      this.cameras.main.scrollX -= (p.x - p.prevPosition.x) / this.cameras.main.zoom;
      this.cameras.main.scrollY -= (p.y - p.prevPosition.y) / this.cameras.main.zoom;
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (!this.frozen && Phaser.Math.Distance.Between(p.downX, p.downY, p.x, p.y) < 6) {
        const world = this.cameras.main.getWorldPoint(p.x, p.y);
        const ground = unproject(world.x, world.y);
        // Clicking the empty stage is a camera interaction, not invalid input.
        if (ground.x >= 0 && ground.x <= 1400 && ground.y >= 0 && ground.y <= 1000) window.dispatchEvent(new CustomEvent('office-move', { detail: ground }));
      }
    });
    if (this.pending) this.sync(this.pending);
  }
  private furnish(f: Furnishing, name: Room, x: number, y: number, w: number, h: number, color: number) {
    f.plant(x + 20, y + 24, true); f.plant(x + w - 24, y + h - 22);
    if (name === 'Front Office') {
      f.desk(x + w - 180, y + 48, color, true); f.sofa(x + 35, y + h - 63, 0x6b5267, 105);
    } else if (name === 'Commons') {
      f.sofa(x + 135, y + h - 84, 0x6b559b, 120); f.sofa(x + 295, y + h - 84, 0x6b559b, 120);
      const g = this.add.graphics().setDepth(1000 + project(x + 268, y + h - 60).y);
      slab(g, x + 265, y + h - 85, 28, 42, 21, 18, 0x806f65); f.desk(x + w - 120, y + 20, color);
    } else if (name === 'Meeting Room') f.meeting(x + 125, y + h - 115, 250, color);
    else if (name === 'Nap Room') { for (let i = 0; i < 3; i++) f.bed(x + 50 + i * 100, y + h - 133, color); }
    else if (name === 'Studio') {
      f.easel(x + w - 85, y + 60, 0xf0a172); f.easel(x + w - 155, y + 35, 0xd37ccf);
      f.desk(x + 40, y + h - 95, color); f.desk(x + w - 142, y + h - 95, color);
    } else if (name === 'Showcase') {
      f.easel(x + w - 80, y + 50, color); f.shelf(x + 55, y + 20, color);
      f.desk(x + 38, y + h - 98, color); f.desk(x + w - 142, y + h - 98, color);
    } else {
      f.desk(x + 42, y + h - 100, color); f.desk(x + w - 142, y + h - 100, color);
      if (name === 'Study Hall') f.shelf(x + w - 155, y + 20, color);
      if (name === 'Tech Lab') {
        const g = this.add.graphics().setDepth(1000 + project(x + w - 40, y + 53).y);
        for (let i = 0; i < 2; i++) {
          slab(g, x + w - 72 + i * 25, y + 18, 20, 30, 63, 63, 0x343745);
          for (let j = 0; j < 5; j++) { const p = project(x + w - 58 + i * 25, y + 49, 12 + j * 10); g.fillStyle(color, 0.8).fillRect(p.x, p.y, 5, 2); }
        }
      }
      if (name === 'Game Lounge') f.sofa(x + w - 150, y + 28, 0x954d7d);
    }
  }
  update(time: number, delta: number) {
    for (const c of this.people.values()) {
      const blend = this.reducedMotion.matches ? 1 : 1 - Math.exp(-delta / 55);
      c.root.x += (c.targetX - c.root.x) * blend; c.root.y += (c.targetY - c.root.y) * blend;
      c.root.setDepth((c.bubble ? 4000 : 1000) + c.root.y);
      const walking = !this.frozen && !this.reducedMotion.matches && c.member.moving;
      c.body.y = walking ? -Math.abs(Math.sin(time / 85 + c.seed)) * 4 : 0;
      c.body.angle = walking ? Math.sin(time / 100 + c.seed) * 3 : 0;
    }
  }
  fit() {
    if (!this.built) return;
    this.fitZoom = Math.min(this.scale.width / WORLD_WIDTH, this.scale.height / WORLD_HEIGHT) * 0.96; this.zoomFactor = 1;
    this.cameras.main.setZoom(this.fitZoom).centerOn(WORLD_WIDTH / 2 - 25, WORLD_HEIGHT / 2 - 12); this.reportZoom();
    this.cameras.main.stopFollow();
  }
  zoom(delta: number) { this.zoomFactor = Phaser.Math.Clamp(this.zoomFactor + delta, 0.65, 4); this.cameras.main.setZoom(this.fitZoom * this.zoomFactor); this.reportZoom(); }
  private reportZoom() { window.dispatchEvent(new CustomEvent('office-zoom', { detail: Math.round(this.zoomFactor * 100) })); }
  select(room?: Room) { this.selected = room; for (const [name, outline] of this.outlines) outline.setVisible(name === room); }
  focus(id: string) { const c = this.people.get(id); if (c) { this.cameras.main.setZoom(Math.max(this.fitZoom * 1.8, this.cameras.main.zoom)); this.zoomFactor = this.cameras.main.zoom / this.fitZoom; this.reportZoom(); this.cameras.main.startFollow(c.root, false, .12, .12); } }
  setSelf(id: string) { this.selfId = id; }
  setFrozen(value: boolean) { this.frozen = value; }
  sync(state: Snapshot) {
    this.pending = state; if (!this.built) return;
    const ownRoom = state.members.find(m => m.id === this.selfId)?.room;
    const ids = new Set(state.members.map(m => m.id));
    for (const [id, c] of this.people) if (!ids.has(id)) { this.tweens.killTweensOf(c.root); c.bubble = undefined; c.root.destroy(); this.people.delete(id); }
    for (const room of rooms) {
      const members = state.members.filter(m => m.room === room.name).sort((a, b) => a.id.localeCompare(b.id));
      this.counts.get(room.name)?.setText(String(members.length));
      members.forEach(m => {
        const target = project(m.x, m.y);
        let c = this.people.get(m.id);
        if (!c) { c = this.makeCharacter(m, target.x, target.y); this.people.set(m.id, c); }
        // Interpolate authoritative 20 Hz snapshots; never trust browser positions.
        if (Math.hypot(c.root.x - target.x, c.root.y - target.y) > 250) c.root.setPosition(target.x, target.y);
        c.targetX = target.x; c.targetY = target.y;
        const avatarChanged = c.member.avatar !== m.avatar; c.member = m; if (avatarChanged) this.loadAvatar(c, m);
        c.name.setText(this.shortName(m.username) + (m.id === this.selfId ? ' (you)' : ''));
        c.status.setFillStyle(m.sleeping ? 0xc1afed : 0x7ed7ad);
        c.zzz.setVisible(m.sleeping); c.bubble?.setVisible(!m.sleeping && m.room === ownRoom);
      });
    }
    this.select(this.selected);
  }
  private shortName(name: string) { const chars = Array.from(name); return chars.length > 11 ? chars.slice(0, 10).join('') + '…' : name; }
  private makeCharacter(m: Member, x: number, y: number): Character {
    const seed = [...m.id].reduce((sum, char) => sum + char.charCodeAt(0), 0), shirt = [0x77ccbb, 0xb296dc, 0xdc8ca9, 0xd6b87d, 0x78aee0, 0xaba6ed][seed % 6];
    const root = this.add.container(x, y), shadow = this.add.ellipse(0, 0, 33, 14, 0x020308, 0.5), body = this.add.container(0, 0), person = this.add.graphics();
    person.fillStyle(0x242336).fillRect(-9, -16, 7, 15).fillRect(3, -16, 7, 15);
    person.fillStyle(0xbbb4cc).fillRect(-10, -4, 8, 4).fillRect(3, -4, 9, 4);
    person.fillStyle(shirt).fillRoundedRect(-12, -34, 25, 23, 4);
    person.fillStyle(Phaser.Display.Color.IntegerToColor(shirt).darken(20).color).fillRect(6, -30, 8, 17);
    person.fillStyle(0xc6a38a).fillRect(-16, -29, 6, 14).fillRect(12, -26, 5, 13);
    const head = this.add.circle(0, -44, 15, 0x444159).setStrokeStyle(2, 0xc7c0dc);
    const initial = this.add.text(0, -44, Array.from(m.username)[0] ?? '?', { fontSize: '16px', fontFamily: 'Arial', color: '#ffffff' }).setOrigin(0.5);
    const name = this.add.text(0, 12, this.shortName(m.username), { fontFamily: 'Arial', fontSize: '14px', color: '#e9e4f8', backgroundColor: '#13101e', padding: { x: 5, y: 3 } }).setOrigin(0.5, 0);
    const status = this.add.circle(13, -35, 4, 0x7ed7ad).setStrokeStyle(1.5, 0x171321);
    const zzz = this.add.text(12, -78, 'Zzz', { fontFamily: 'Arial', fontSize: '19px', color: '#c1afed', fontStyle: 'italic' }).setVisible(m.sleeping);
    body.add([person, head, initial, status]); root.add([shadow, body, name, zzz]);
    const c: Character = { root, body, name, status, zzz, member: m, seed, targetX: x, targetY: y }; this.loadAvatar(c, m); return c;
  }
  private loadAvatar(c: Character, m: Member) {
    if (!m.avatar) { c.body.getByName('avatar')?.destroy(); return; }
    const key = `avatar:${m.id}:${m.avatar}`;
    const show = () => {
      if (!c.root.scene || c.member.avatar !== m.avatar) return;
      c.body.getByName('avatar')?.destroy(); c.body.addAt(this.add.image(0, -44, key).setDisplaySize(27, 27).setName('avatar'), 3);
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
    }; img.src = m.avatar;
  }
  speak(id: string, content: string, duration: number) {
    const c = this.people.get(id); if (!c) return; c.bubble?.destroy();
    const text = this.add.text(0, 0, content, { fontFamily: 'Arial', fontSize: '15px', color: '#20192d', wordWrap: { width: 185 }, align: 'center', padding: { x: 11, y: 8 } }).setOrigin(0.5, 1);
    const bg = this.add.graphics().fillStyle(0xeee8fa).fillRoundedRect(-text.width / 2, -text.height, text.width, text.height, 7).fillTriangle(-5, 0, 5, 0, 0, 7);
    const bubble = this.add.container(0, -72, [bg, text]); c.root.add(bubble); c.bubble = bubble;
    this.time.delayedCall(duration, () => { if (c.bubble === bubble) { bubble.destroy(); c.bubble = undefined; } });
  }
  clearBubbles() { for (const c of this.people.values()) { c.bubble?.destroy(); c.bubble = undefined; } }
}
