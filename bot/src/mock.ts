import type { Office } from './office.js';
import { ROOMS, type Room } from './protocol.js';
export function startMock(office: Office) {
  const names = ['Alex', 'Mika', 'Jordan', 'Sam', 'Nova', 'Charlie', 'Riley', 'Jun', 'Leo', 'Sage', 'Avery', 'Kai', 'Morgan', 'Robin', 'Em', 'Reese', 'Ash', 'Drew', 'Jules', 'Taylor', 'Quinn', 'Finley', 'Blake', 'Sky'];
  const spread: Room[] = ['Commons', 'Tech Lab', 'Study Hall', 'Commons', 'Studio', 'Game Lounge', 'Showcase', 'Meeting Room', 'Nap Room', 'Front Office'];
  names.forEach((username, i) => {
    const id = `mock-${i}`;
    office.add({ id, username, avatar: `/avatars/${i % 12}.svg`, presence: i === 22 ? 'offline' : i % 9 === 0 ? 'idle' : 'online' });
    const m = office.members.get(id)!;
    m.room = spread[i % spread.length]; m.sleeping = m.room === 'Nap Room';
    if (m.sleeping) m.lastActivity = Date.now() - office.config.idle_timeout_ms;
    if (m.room === 'Meeting Room') { m.voiceRoom = m.room; m.inVoice = true; }
  });
  office.ready = true; office.publish();
  let step = 0;
  const lines = ['Anyone up for a quick game?', 'Just shipped the new project!', 'Coffee break, anyone?', 'That looks incredible', 'Working on something fun', 'See you in the call', 'One more chapter to go'];
  const timer = setInterval(() => {
    const id = `mock-${(step * 7 + 2) % names.length}`;
    const room = ROOMS[(step + 2) % (ROOMS.length - 1)];
    if (step % 6 === 2) office.voice(id, 'Meeting Room');
    else if (step % 6 === 3) office.voice(id, null);
    else if (step % 11 === 8) office.presence(id, 'idle');
    else office.activity(id, room, room === 'Showcase' ? 'thread_create' : 'message', lines[step % lines.length]);
    step++;
  }, 3400);
  return () => clearInterval(timer);
}
