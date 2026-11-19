import Phaser from 'phaser';
import { actions } from './actions';

type KeyMap = Record<'W' | 'A' | 'S' | 'D' | 'UP' | 'LEFT' | 'DOWN' | 'RIGHT' | 'Q' | 'E' | 'F', Phaser.Input.Keyboard.Key>;

/** Keyboard + mouse source. WASD/arrows move, mouse aims. */
export class KeyboardMouseSource {
  private keys?: KeyMap;

  constructor(scene: Phaser.Scene) {
    const kb = scene.input.keyboard;
    if (kb) {
      this.keys = kb.addKeys('W,A,S,D,UP,LEFT,DOWN,RIGHT,Q,E,F') as KeyMap;
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
      // Left button fires group 1, right button group 2.
      actions.fire1 = (p.buttons & 1) !== 0;
      actions.fire2 = (p.buttons & 2) !== 0;
    };
    scene.input.on(Phaser.Input.Events.POINTER_MOVE, onMouse);
    scene.input.on(Phaser.Input.Events.POINTER_DOWN, onMouse);
    scene.input.on(Phaser.Input.Events.POINTER_UP, onMouse);
    scene.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, onMouse);
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
    // Equipment actions: Q and E.
    actions.equip1 = k.Q.isDown;
    actions.equip2 = k.E.isDown;
    // Interact (field stations): F.
    actions.interact = k.F.isDown;
  }

  reset(): void {
    this.keys && Object.values(this.keys).forEach((key) => key.reset());
  }
}
