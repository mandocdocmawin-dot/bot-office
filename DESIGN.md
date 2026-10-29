# Discord Office visual system

Nine-room isometric office on raised cutaway platform. Neon rails mark room bounds; doors and corridor diamonds mark walkable paths. Desks have monitors and chairs; studio has easels; study has bookshelves; Nap Room has beds. All geometry and colors load from `config.json`. Live map uses procedural drawing; no static raster backdrop.

Dark shell, Manrope headings, DM Sans controls, camera pan/zoom, search, and grouped roster. Character bodies use block geometry with Discord avatars for faces. Depth sort follows projected ground coordinate (`y`). Server positions interpolate with walking bob. Reduced-motion disables bob and position interpolation.

Map is primary UI. Expand fills browser; Find Me and roster names follow target player. Click/tap moves character. Room chat transient; no message history stored. Login details visible profile data; chat never logged.

Keyboard transitions send immediately, with held input renewed separately. Screen diagonals use the inverse projection and normalized world speed. Own-avatar interpolation uses an 18ms time constant, remote avatars retain 55ms, and an authoritative stop removes the own-avatar interpolation tail. Reduced motion continues to use authoritative positions directly.

Hybrid movement combines Discord destinations with manual takeover. Walking uses independent leg/arm strides driven by rendered travel distance, including the interpolation after the final movement snapshot. Steps alternate and reset at rest. A separate green head ring and animated bars indicate monitored speaking; connected/muted voice labels remain distinct. Own-avatar opacity stays full even with invisible Discord presence. Reduced motion uses smaller limb strides without body bounce or sway and freezes ring movement while preserving the state indicator.
