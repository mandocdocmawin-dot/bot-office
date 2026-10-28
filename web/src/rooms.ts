import type { Room } from '../../bot/src/protocol';
export interface RoomLayout { name: Room; x: number; y: number; w: number; h: number; color: number; subtitle: string; icon: string }
export const WIDTH = 1400, HEIGHT = 1000;
export const rooms: RoomLayout[] = [
  { name: 'Front Office', x: 438, y: 35, w: 524, h: 180, color: 0xe9bc79, subtitle: 'A warm welcome starts here', icon: '⌂' },
  { name: 'Study Hall', x: 35, y: 35, w: 375, h: 280, color: 0x78b6db, subtitle: 'A little focus, a little progress', icon: '▤' },
  { name: 'Tech Lab', x: 990, y: 35, w: 375, h: 280, color: 0x68cbb5, subtitle: 'Build. Break. Ship. Repeat.', icon: '⌘' },
  { name: 'Commons', x: 438, y: 245, w: 524, h: 445, color: 0xa3abf7, subtitle: 'The heart of the server', icon: '◉' },
  { name: 'Game Lounge', x: 35, y: 345, w: 375, h: 280, color: 0xd99acd, subtitle: 'One more round?', icon: '✥' },
  { name: 'Studio', x: 990, y: 345, w: 375, h: 280, color: 0xe5a385, subtitle: 'Make something worth sharing', icon: '◈' },
  { name: 'Showcase', x: 35, y: 655, w: 375, h: 310, color: 0xb5bd7b, subtitle: 'Small projects. Big ideas.', icon: '◇' },
  { name: 'Meeting Room', x: 438, y: 720, w: 524, h: 245, color: 0x7fbbdf, subtitle: 'Pull up a chair', icon: '◌' },
  { name: 'Nap Room', x: 990, y: 655, w: 375, h: 310, color: 0x9c98c7, subtitle: 'Away, but still part of the office', icon: '☾' }
];
export const colorCSS = (color: number) => `#${color.toString(16).padStart(6, '0')}`;
