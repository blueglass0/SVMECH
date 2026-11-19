import Phaser from 'phaser';
import { clearHeldActions } from './actions';
import { KeyboardMouseSource } from './keyboardMouse';
import { TouchSource } from './touch';

export { actions, sticks, touchButtons } from './actions';

/**
 * The one input layer. Owns the input sources; game code calls `update()`
 * once per frame and then reads `actions`.
 */
export class InputSystem {
  private kbm: KeyboardMouseSource;
  private touch: TouchSource;

  constructor(scene: Phaser.Scene) {
    this.kbm = new KeyboardMouseSource(scene);
    this.touch = new TouchSource(scene);
    const relayout = () => this.touch.layout();
    scene.scale.on(Phaser.Scale.Events.RESIZE, relayout);
    // Losing focus mid-press would otherwise leave keys or sticks stuck down.
    const release = () => this.reset();
    window.addEventListener('blur', release);
    document.addEventListener('visibilitychange', release);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('blur', release);
      document.removeEventListener('visibilitychange', release);
      scene.scale.off(Phaser.Scale.Events.RESIZE, relayout);
    });
  }

  update(): void {
    this.kbm.poll();
  }

  reset(): void {
    this.kbm.reset();
    this.touch.reset();
    clearHeldActions();
  }
}
