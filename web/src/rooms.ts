import config from '../../config.json'
import type { RoomLayout } from '@office/shared/protocol'

export { colorCSS, roomDisplayName } from '@office/shared/rooms'
export const rooms = config.rooms as RoomLayout[]
export const { doors } = config
