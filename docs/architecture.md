# Architecture

## Workspace Topology

```text
packages/shared/       Shared protocol contracts, rooms, isometric math
server/                Authoritative simulation, Discord bot, OAuth, WebSocket
web/                   Phaser 3 client, EventBus, texture manager, Activity SDK
```

## Core Subsystems

### 1. Deterministic Game Loop (`server/src/loop.ts`)

- Replaces unthrottled `setInterval` with fixed-timestep accumulator loop (20 ticks/sec).
- Prevents server frame drift and runaway updates under load.

### 2. Texture Manager (`web/src/avatar-manager.ts`)

- Manages dynamic avatar texture lifecycle.
- Checks texture cache, tracks active member references, cleans up stale WebGL textures on player departure.
- Eliminates memory leaks in long-running tabs.

### 3. Client Event Bus (`web/src/events.ts`)

- Strongly-typed `OfficeEventBus`.
- Decouples Phaser scene camera/movement events from DOM UI (chat, roster, buttons).

### 4. Authoritative Physics & Movement (`server/src/world.ts`)

- Server validates boundaries, obstacles, and door transitions.
- A* pathfinding calculates walking vectors broadcast via 20Hz snapshots.
