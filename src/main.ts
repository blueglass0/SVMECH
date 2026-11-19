import Phaser from 'phaser';
import { DISPLAY } from './config/display';
import { initViewport, trackViewport } from './core/viewport';
import { BootScene } from './scenes/BootScene';
import { MapScene } from './scenes/MapScene';
import { HudScene } from './scenes/HudScene';
import { mountDomUi } from './ui/dom';

const container = document.getElementById('game')!;
document.getElementById('boot')?.remove();
const view = initViewport(container);

const game = new Phaser.Game({
  // WebGL where available, Canvas 2D fallback for old or blocklisted GPUs.
  type: Phaser.AUTO,
  parent: container,
  width: view.width,
  height: view.height,
  backgroundColor: DISPLAY.background,
  banner: false,
  disableContextMenu: true, // right click is a fire button on PC
  scale: { mode: Phaser.Scale.NONE },
  render: {
    antialias: true,
    // Don't ask laptops to wake the discrete GPU for a vector-graphics game.
    powerPreference: 'default',
  },
  input: { activePointers: 3 }, // two thumbs plus a spare
  // Phaser's delta smoothing clamps frames to 1/60 s when it thinks the window is unfocused,
  // which makes the game run in slow motion. Use real frame time; scenes clamp long frames.
  fps: { smoothStep: false },
  scene: [BootScene, MapScene, HudScene],
});

trackViewport(game, container);
mountDomUi(game, container);

if (import.meta.env.DEV) {
  (window as unknown as { game: Phaser.Game }).game = game;
}
