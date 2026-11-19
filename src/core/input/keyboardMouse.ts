import Phaser from 'phaser';
import { actions } from './actions';

type KeyMap = Record<'W' | 'A' | 'S' | 'D' | 'UP' | 'LEFT' | 'DOWN' | 'RIGHT', Phaser.Input.Keyboard.Key>;

/** Keyboard + mouse source. WASD/arrows move, mouse aims. */
export class KeyboardMouseSource {
  private keys?: KeyMap;

  constructor(scene: Phaser.Scene) {
    const kb = scene.input.keyboard;
    if (kb) {
      this.keys = kb.addKeys('W,A,S,D,UP,LEFT,DOWN,RIGHT') as KeyMap;
      kb.on('keydown', () => {
        actions.device = 'kbm';
      });
    }
    const onMouse = (p: Phaser.Input.Pointer) => {
      if (p.wasTouch) return;
      actions.device = 'kbm';
      actions.aimMode = 'point';
      actions.aim.x = p.x;
      actions.aim.y = p.y;
    };
    scene.input.on(Phaser.Input.Events.POINTER_MOVE, onMouse);
    scene.input.on(Phaser.Input.Events.POINTER_DOWN, onMouse);
  }

  /** Called once per frame before game logic. */
  poll(): void {
    if (actions.device !== 'kbm' || !this.keys) return;
    const k = this.keys;
    let x = 0;
    let y = 0;
    if (k.A.isDown || k.LEFT.isDown) x -= 1;
    if (k.D.isDown || k.RIGHT.isDown) x += 1;
    if (k.W.isDown || k.UP.isDown) y -= 1;
    if (k.S.isDown || k.DOWN.isDown) y += 1;
    // Diagonals have length 1, like a stick at full tilt.
    if (x !== 0 && y !== 0) {
      x *= Math.SQRT1_2;
      y *= Math.SQRT1_2;
    }
    actions.move.x = x;
    actions.move.y = y;
  }

  reset(): void {
    this.keys && Object.values(this.keys).forEach((key) => key.reset());
  }
}
