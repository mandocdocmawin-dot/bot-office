# Tambayan production assets, v2

The approved visual reference is `design-reference.png`. It is not used as a flattened backdrop.

`sprites-v2/` contains ten independent transparent WebP sprites: four armchair views, coffee counter with water dispenser, illuminated notice board, media console, orb kiosk, coffee table and plant. The built-in image generator produced the artwork using the approved room as style reference. Complete prompts and source provenance are saved in `output/tambayan/sprite-sources-v2.json`.

`web/src/tambayan-sprites-v2.json` records each texture's canvas size and opaque artwork bounds. `web/src/tambayan-sprites.ts` places and scales these sprites from world-space ground anchors. Transparency is preserved; the assets are normalized to at most 640 pixels per edge and encoded with high-quality WebP. Each object is depth-sorted independently from avatars.

`web/src/tambayan.ts` builds the room from these textures plus procedural lavender flooring, rounded gathering rugs, soft contact shadows, low walls and cyan rail posts. It uses the shared 0.86 / 0.60 world projection. Earlier SVG props remain in `assets/` for rollback; the live Tambayan no longer loads them.

The layout has three four-chair pods, twelve chairs total. Chairs face their tables with a 44-world-unit center radius, leaving a gap between the chair and tabletop. Member count never shrinks or packs chairs. Renderer placement, chair centers, plants and collision footprints share `packages/shared/src/rooms.ts`; the server derives Tambayan obstacles from that module rather than duplicating them in `config.json`. Only furniture blocks movement; rug corners remain accessible.

Seats are server-controlled. Click a free chair to walk to it and sit; click your own occupied chair or walk manually to stand. General-channel Discord messages and local Tambayan chat walk to a free seat. Explicit Discord mentions and local `@Display Name` mentions approach the referenced tracked member instead. Only the sender moves. Seat reservations prevent double booking and release on cancellation, removal/offline presence and idle transitions. Ambiguous or unavailable mentions fall back to General seating. Twelve full seats leave additional members standing safely; the map does not spawn furniture into the walkway. The board, screen and coffee station remain visual amenities rather than live content panels or synchronized media.

Click the Tambayan title or choose Tambayan in People to focus the room. This view isolates its objects and occupants on a raised room platform; Fit restores all office rooms and labels. Panning, zooming or following someone also returns to the world view. Walking your own character out of Tambayan restores the full map. Clicks outside the isolated room are ignored. Internal `Commons` identity and the surrounding rooms remain intact.

Rebuild normalization with `node output/tambayan/prepare-sprites-v2.cjs`; it uses the local bundled Sharp library and generated source files recorded in the provenance manifest. Final WebP files are committed, so this step is not required for an ordinary build.

Run `node web/scripts/tambayan-visual-qa.cjs` from the repository root with the localhost demo running to check texture loading, stable twelve-seat layout under a simulated thirty-member roster, room isolation, full-map restoration and mobile focus. The script saves fresh captures under `.qa/`. Final reviewed captures are retained under `artifacts/tambayan/v2/`.

`node web/scripts/tambayan-social-qa.cjs` exercises actual WebSocket seat commands, chat-triggered seating, mention approach and movement into the coffee counter. It records authoritative state and saves fresh seated/collision screenshots. Unit tests cover all twelve concurrent seat claims and safe approach/stand positions. Social chat content is not retained in the movement controller.
