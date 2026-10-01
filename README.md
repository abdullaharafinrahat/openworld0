# Skybound

A browser-based, third-person adventure built with React, TypeScript, Three.js, Vite, and Tailwind CSS v4. The start screen uses original generated key art; the playable world, explorer, guardians, portal, scenery, and effects are rendered live in WebGL.

## The Expedition

Collect 12 sunshards across three floating islands to awaken the portal. Chain pickups for a multiplier up to 5x, dash through guardians for bonus points, and jump the broken bridges. Entering a portal awards 1,000 points, restores one heart, adds up to 35 seconds, and begins a harder realm. Falling returns the explorer to the most recent island at the cost of a heart.

Each run starts with three hearts and 100 seconds. A run ends when time or hearts run out, or when the player chooses **End expedition & save** in the pause menu. The ten best results are stored locally on the current device. Names and preferences are editable and persist when browser storage is available.

## Controls

| Action | Keyboard / Mouse | Touch |
| --- | --- | --- |
| Move | WASD or arrow keys | Left thumbstick |
| Jump / double jump | Space, press twice | Jump, tap twice |
| Dash attack | Shift or F | Dash |
| Rotate camera | Drag the world, or Q / E | Swipe the world |
| Pause / resume | Escape or P | Pause button |
| Instant restart | R | Restart button |
| Mute sound | M | Sound setting |

## Project Structure

- `src/App.tsx`: start, playing, pause, and results states; persistence and keyboard shortcuts.
- `src/game/engine.ts`: procedural 3D world, camera, movement, collision, combat, particles, and rendering.
- `src/game/GameCanvas.tsx`: React lifecycle and WebGL context handling.
- `src/game/audio.ts`: synthesized Web Audio feedback, unlocked by user interaction.
- `src/game/types.ts`: shared models, score validation, settings, and local storage.
- `src/components/`: HUD, multitouch controls, accessible dialogs, and shared interface elements.
- `src/index.css`: responsive visual system and motion, including reduced-motion support.
- `public/images/skybound-world.jpg`: start-screen art.

## Performance

The renderer uses instanced scenery, collectibles, glows, and a fixed particle pool. Render work stops while paused. The React HUD updates at approximately 12 Hz instead of on every frame. Bounded simulation substeps stabilize collisions, while adaptive pixel density, mobile shadow defaults, and a battery-saver setting reduce GPU load. Geometry, materials, textures, and WebGL contexts are released on exit. Fonts are bundled locally; there are no external gameplay services or model downloads.

The production build is checked using the project's existing build command. Actual 60fps performance and touch behavior should additionally be profiled on target physical devices; a successful build alone does not establish frame-rate performance.

## Manual Verification

1. Start with Enter or Begin adventure. Move forward and collect the first sunshards.
2. Jump and double-jump over the bridge gaps, then dash through a guardian.
3. Collect 12 sunshards and enter the illuminated portal to confirm progression and rewards.
4. Pause with Escape; confirm the clock is frozen. Resume, restart, and test automatic pause after changing tabs.
5. End the expedition from the pause menu, rename the explorer, and inspect High scores. Reload to confirm persistence.
6. Let the timer expire or lose three hearts; confirm the results screen and instant restart.
7. On a touch device, move and jump or dash simultaneously; rotate between portrait and landscape.
8. Toggle sound, screen shake, graphics quality, and fullscreen. Confirm that reduced-motion settings are respected.