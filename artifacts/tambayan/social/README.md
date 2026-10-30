# Collision, spacing and social movement

Actual localhost demo captures, produced by `web/scripts/tambayan-social-qa.cjs`:

- `seating-closeup.png`: corrected inward-facing chairs, a visible table gap, and an actual seated character.
- `seated-room.png`: complete room with a server-assigned occupied seat.
- `mention-approach.png`: the sender has stood and approached a mentioned member.
- `counter-collision.png`: the sender stops outside the coffee counter during sustained movement into it.

The shared layout provides sprite positions and collision footprints for all Tambayan furniture and plants. Chairs use a 44-unit radius, between the old loose 53-unit layout and the overly tight 36-unit adjustment. Rear sprite views are mapped by their actual visual orientation.

Server-authoritative reservations support twelve seats, safe walking approach points, seated snapshot state, manual standing, General-chat auto-sit and mention approach. Mentions move only the author. Discord mention IDs work without transmitting message previews; local room chat accepts unambiguous @Display Name references. Missing, self, offline and ambiguous targets do not redirect the sender. Duplicate seat claims are rejected; occupied/reserved seats release on cancellation and member removal/offline transitions. An approach expires after thirty seconds and manual movement cancels automation.

Live QA verified seating pose, auto-sit, mention approach and stopping outside the counter boundary during sustained inward movement (world x approximately 529–531, y approximately 364–366). Eighty-eight server tests passed, including twelve simultaneous occupants plus overflow, walkability, delayed input, privacy and cross-room routing checks. The localhost server was refreshed before live QA so the new protocol and authoritative geometry were active.
