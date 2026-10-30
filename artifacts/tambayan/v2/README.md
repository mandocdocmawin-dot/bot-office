# Tambayan visual refinement

These are actual localhost demo screenshots, not generated room mockups.

- `localhost-closeup.png`: isolated Tambayan focus view, entered through the real People control.
- `localhost-full-map.png`: Tambayan inside the full nine-room office.
- `mobile-focus.png`: focused room at 390 x 844.
- `mobile-fit.png`: full map restored through Fit at 390 x 844.

The approved reference remains `web/public/assets/tambayan/design-reference.png`. The v2 pass preserves the original central room footprint and twelve consistent-size chairs, improves individual furniture artwork and introduces room focus. It does not add adjacent overflow floor or Sit / Stand interactions.

Verification: 80 server tests passed; production build passed; browser checks passed for all ten textures, zero failed asset requests and zero page errors, stable chair objects/scales with thirty simulated members, room isolation and restoration, and mobile resizing. The screenshots are captured before the simulated crowd assertion; their shown people counts come from the live demo.

Rollback checkpoints:

- `c7826b1`: original implementation, concept assets and visual audit.
- `62a3c90`: fixed three four-chair pods; removed crowded 24-chair rings.
- `e6c6f96`: shaded sprite assets and initial room focus.
- The commit containing this file and these captures adds true rear chair views, continuous walkway color, lavender entry pads and isolated room presentation.

Rerun the visual checks with `node web/scripts/tambayan-visual-qa.cjs` from the repository root while `npm run mock` is running. The QA harness uses local Chrome and the bundled Playwright runtime; its scene-inspection hook exists only in the QA browser's intercepted module, not in production source.
