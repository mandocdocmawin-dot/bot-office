# Tambayan — expanded general room concept kit

Recommended name: **Tambayan**. Friendly, easy to remember, and appropriate for a Filipino community's everyday general room. Other options: The Hub, Town Square, HQ Lounge, Community Hall. Subtitle: “Dito tayo magkita.” These are naming ideas; the live Commons room has not been renamed.

## Deliverables

- `room-concept.png`: initial expanded room direction.
- `dynamic-seating-concept.png`: revised direction with multiple seating pods and overflow ideas.
- `prop-reference.png`: AI-generated prop design reference, not a production sprite atlas.
- `assets/*.svg`: six separate, editable, transparent vector props matched to the project's 0.86 / 0.60 projection.
- `asset-manifest.json`: dimensions, ground-anchor origins, world footprints and suggested action IDs.
- `components/phaser-props.ts`: Phaser preload and placement helpers.
- `components/seating-planner.ts`: reusable, pure dynamic-capacity logic.
- `prompts.json`: complete prompts used with the built-in image generator.

The generated PNGs are concept art. Their exact furniture, entrance geometry, lettering and camera angle are illustrative. The supplied SVGs are simplified implementation assets, not extracts from those PNGs.

## Useful objects and actions

| Component | Purpose | Suggested interaction |
| --- | --- | --- |
| Modular chairs | Expand seating as members join | Explicit Sit / Stand; keep assigned seats stable |
| Notice board | Announcements, links and next gathering | Open an announcements panel |
| Navigation kiosk | Find members and other rooms | Open the existing room roster / directory |
| Media screen | Watch-party focal point | Open a shared link; synchronized playback needs separate implementation |
| Game shelf | Quick activity discovery | Open game links; avoid duplicating Game Lounge features |
| Coffee station | Social corner | Optional coffee reaction; decoration also works |

## Dynamic seating recommendation

Start with six seats. Add seats in batches of six, keeping two spare places when possible. Capacity is 6 / 12 / 18 / 24 according to available space. `SeatingPlanner` grows immediately, waits 60 seconds before shrinking, and always retains occupied valid seats. Retain the same planner instance and tick it even when the roster does not change. Pass seated users' occupied seat IDs separately; membership alone never auto-seats or teleports anyone. Use a monotonic clock such as `performance.now()`.

`createSeatSlots(room, obstacles)` places slots around the corners while leaving the center crossing clear. It requires at least 420 x 360 world units. Obstacles must include fixed prop footprints AND their approach space; filtered-out slots reduce capacity. Room dimensions already exclude walls. Call this once for a chosen layout; do not rebuild slots on each join. The pure planner does not implement collisions or reserve furniture space automatically.

For more than the available seats, show overflow / another gathering area. Do not keep spawning chairs into the walkway. Automatically making the room floor bigger requires coordinated edits to the shared map layout, doors, neighboring rooms, camera fit and server navigation. Prefer overflow first. The ghosted pods in the revised concept illustrate a future overflow area; the planner does not create extra floor.

Use a `Map<seatId, renderedChair>` to reconcile planner output: create only new IDs and destroy only removed IDs. Existing `Furnishing.chair` is a good procedural renderer. It currently returns void, so before integrating dynamic removal, have it return its Graphics object. Walking avatars keep the existing position-based depth sorting. Actual Sit / Stand needs authoritative server seat claims to prevent two members occupying one seat, release on disconnect, and movement cancellation / stand behavior. These are integration tasks, not implemented features in this output-only kit.

## SVG, PNG or procedural graphics?

**Procedural Phaser graphics for floor, rails, movable chairs and avatars.** This fits the existing renderer and allows simple animation and depth control. **SVG for fixed props and small icons.** These assets stay editable and rasterize into reusable Phaser textures at preload. **PNG for concept art or detailed decorative art.** Avoid replacing the live map with one flat PNG: movement, object occlusion and responsive expansion would be harder.

Copy the assets folder under `web/public/assets/tambayan/assets/`, then pass `/assets/tambayan/` to `preloadProps`. Place using world-space x/y, not screen pixels. Asset origins represent the projected back corner of the footprint; manifest dimensions are display sizes in the existing projection. `addProp` returns an Image for cleanup. Fixed SVG props have one depth each, like existing furnishings; split tall or wide props if characters must pass behind one part and in front of another.

The loader emits callbacks only. Wire callbacks into real UI, validate proximity on actual use, and provide equivalent keyboard-accessible DOM controls. No third-party services, announcements, synchronized media, seat persistence or live-room changes are included.

## Rebuild and validation

Run `python output/tambayan/build_assets.py` to rebuild the SVGs and manifest. TypeScript helpers were checked with the project's TypeScript compiler. Seating behavior was checked for growth, delayed shrink, occupied-seat retention, obstacle exclusions and overflow. SVG files were parsed and checked against their manifest dimensions and anchors. Before live integration, inspect props in the actual scene at Fit and zoomed views and verify walk paths and avatar occlusion.
