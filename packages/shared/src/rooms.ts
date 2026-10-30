export const colorCSS = (color: number) => `#${color.toString(16).padStart(6, '0')}`

export const roomDisplayName = (name: string) => name === 'Commons' ? 'Tambayan' : name

// Local to Commons. Keeping pods off the central cross preserves all four doors.
export const TAMBAYAN_PODS = [{ x: 105, y: 335 }, { x: 416, y: 112 }, { x: 402, y: 344 }] as const
export const tambayanCapacity = (members: number) => members > 16 ? 24 : members > 10 ? 18 : 12
