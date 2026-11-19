import type { Vec } from '../math';
import type { InputDevice } from '../settings';

/**
 * The abstract action state. Game code reads only this; input sources
 * (keyboard+mouse, touch) are the only things that write it.
 */
export interface Actions {
  /** The device the player used most recently. Decides control scheme and HUD. */
  device: InputDevice;
  /** Movement input in screen space (x right, y down), each axis -1..1, length <= 1. */
  move: Vec;
  /**
   * 'point': aim at a screen position (mouse), `aim` in canvas pixels.
   * 'direction': aim along a screen direction (stick), `aim` is a unit vector.
   * 'none': no aim input yet.
   */
  aimMode: 'none' | 'point' | 'direction';
  aim: Vec;
  fire1: boolean;
  fire2: boolean;
  equip1: boolean;
  equip2: boolean;
  interact: boolean;
}

export const actions: Actions = {
  device: matchMedia('(pointer: coarse)').matches ? 'touch' : 'kbm',
  move: { x: 0, y: 0 },
  aimMode: 'none',
  aim: { x: 0, y: 0 },
  fire1: false,
  fire2: false,
  equip1: false,
  equip2: false,
  interact: false,
};

/** On-screen stick state in CSS pixels, for the HUD to draw. */
export interface StickView {
  active: boolean;
  baseX: number;
  baseY: number;
  knobX: number;
  knobY: number;
}

export const sticks: { left: StickView; right: StickView } = {
  left: { active: false, baseX: 0, baseY: 0, knobX: 0, knobY: 0 },
  right: { active: false, baseX: 0, baseY: 0, knobX: 0, knobY: 0 },
};

export function clearHeldActions(): void {
  actions.move.x = 0;
  actions.move.y = 0;
  actions.fire1 = actions.fire2 = actions.equip1 = actions.equip2 = actions.interact = false;
}
