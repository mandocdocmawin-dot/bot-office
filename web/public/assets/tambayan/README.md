# Tambayan assets

`design-reference.png` is the approved generated visual reference. It is not used as a flattened room backdrop.

`assets/` contains editable, transparent SVG props. The live Phaser scene loads the coffee station, notice board, media screen, game shelf and navigation kiosk through `web/src/tambayan-manifest.json` and `web/src/tambayan-props.ts`.

The room itself, block plants, cyan rail posts, coffee tables and directional purple armchairs are drawn in `web/src/tambayan.ts` using the existing world projection. Chairs are added as independent Graphics objects with stable pod IDs: 12 initially, 18 for 11–16 members, 24 for 17+ members. Removal waits 60 seconds after the count falls. Layout is visual seating; it does not add a server Sit / Stand action. Above 24 members, the central walkway remains open rather than filling with additional furniture.

Three 146 x 146 seating zones are reserved in `config.json`, including space for maximum chair capacity. Character navigation routes around the pods and fixed props. All four existing room doors remain connected by the central cross. Internal `Commons` identity is preserved for Discord mapping; the displayed name is Tambayan.

The SVG modular-chair is also available as an optional static prop; live seats use the more detailed procedural armchair renderer.
