import type { Office } from './office.js';
import { ROOMS } from './protocol.js';
export function startMock(office: Office) {
  const names = ['Alex', 'Mika', 'Jordan', 'Sam', 'Nova', 'Charlie', 'Riley', 'Jun', 'Leo', 'Sage', 'Avery', 'Kai', 'Morgan', 'Robin', 'Em', 'Reese', 'Ash', 'Drew'];
  names.forEach((username, i) => {
    const room = ROOMS[i % ROOMS.length], id = `mock-${i}`;
    office.join({ id, username, avatar: `/avatars/${i % 12}.svg` }, { ...office.world.spawn(room, i), room, sleeping: room === 'Nap Room' });
    if (room === 'Nap Room') office.members.get(id)!.lastInput = Date.now() - office.config.idle_timeout_ms;
  });
  let step = 0;
  const timer = setInterval(() => {
    const id = `mock-${step % names.length}`, player = office.members.get(id)!;
    if (player.room !== 'Nap Room') {
      const room = ROOMS[(Math.floor(step / names.length) + step + 1) % (ROOMS.length - 1)];
      office.input(id, { type: 'move_to', ...office.world.spawn(room, step) });
      if (step % 4 === 0) office.input(id, { type: 'emote', index: step % 5 });
    }
    step++;
  }, 900);
  return () => clearInterval(timer);
}
