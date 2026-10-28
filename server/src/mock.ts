import type { Office } from './office.js';
import { ROOMS } from './protocol.js';
export function startMock(office: Office) {
  const names = ['Alex', 'Mika', 'Jordan', 'Sam', 'Nova', 'Charlie', 'Riley', 'Jun', 'Leo', 'Sage', 'Avery', 'Kai', 'Morgan', 'Robin', 'Em', 'Reese', 'Ash', 'Drew'];
  names.forEach((username, i) => {
    const room = ROOMS[i % ROOMS.length], id = `mock-${i}`;
    office.join({ id, username, avatar: `/avatars/${i % 12}.svg` }, { ...office.world.spawn(room, i), room, sleeping: room === 'Nap Room' });
    if (room === 'Nap Room') office.members.get(id)!.lastInput = Date.now() - office.config.idle_timeout_ms;
  });
  office.voiceMonitor = { state: 'connected', channelId: 'demo-call', channelName: 'Demo call', detail: 'Simulated speaking indicators — no Discord audio or microphone is used.' };
  for (const i of [0, 7]) office.discordVoiceState(`mock-${i}`, { channelId: 'demo-call', channelName: 'Demo call', muted: false });
  const speakingTimer = setInterval(() => {
    const phase = Date.now() % 6000;
    office.speaking('mock-0', phase < 2400);
    office.speaking('mock-7', phase > 3200 && phase < 5000);
  }, 200);
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
  return () => { clearInterval(timer); clearInterval(speakingTimer); };
}
