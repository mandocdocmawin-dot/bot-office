import config from '../../config.json';
import type { RoomLayout } from '../../server/src/protocol';
export const rooms = config.rooms as RoomLayout[];
export const doors = config.doors;
export const colorCSS = (color: number) => `#${color.toString(16).padStart(6, '0')}`;
