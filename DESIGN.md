# Discord Office visual system

The existing nine-room layout is a miniature isometric office on a raised cutaway platform, matching the supplied game-office reference. Neon rear rails identify rooms; door openings and corridor diamonds show where to walk. Desks have monitors and chairs; the studio has easels, the study has bookshelves, and Nap Room has beds. Geometry and colors come from config.json. No raster backdrop substitutes for the live map.

The existing dark shell, Manrope headings, DM Sans controls, camera, search and grouped roster remain. Character bodies use simple block geometry with each Discord avatar as the face. Depth sorting follows projected ground position. Interpolated server positions and a small walking bob communicate movement. Reduced-motion preference removes the bob and positional interpolation.

The map is the primary interface. Expand makes it fill the browser; Find me and roster names follow a player. Mouse/touch click-to-move supports smaller screens. Room chat is a small transient input panel, not a message history. Login explains exactly what profile data appears and that chat is never stored.
