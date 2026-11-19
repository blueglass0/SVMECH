import Phaser from 'phaser';
import { CONTROLS } from '../../config/controls';
import { Viewport } from '../viewport';
import { actions, sticks, touchButtons, type StickView } from './actions';

interface StickTrack {
  pointerId: number | null;
  view: StickView;
}

/**
 * Touch source: a floating left stick (appears under the thumb, anywhere in
 * the left part of the screen) and a fixed right stick in the bottom-right,
 * where its buttons will sit around it.
 */
export class TouchSource {
  private left: StickTrack = { pointerId: null, view: sticks.left };
  private right: StickTrack = { pointerId: null, view: sticks.right };
  private swapPointer: number | null = null;
  private stickFiring = false;

  constructor(scene: Phaser.Scene) {
    const input = scene.input;
    input.on(Phaser.Input.Events.POINTER_DOWN, this.onDown, this);
    input.on(Phaser.Input.Events.POINTER_MOVE, this.onMove, this);
    input.on(Phaser.Input.Events.POINTER_UP, this.onUp, this);
    input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onUp, this);
    this.layout();
  }

  /** Keep inactive sticks at their home positions (call on resize). */
  layout(): void {
    const { x: rx, y: ry } = rightCentre();
    const r = this.right.view;
    r.baseX = r.knobX = rx;
    r.baseY = r.knobY = ry;
    touchButtons.swap.x = rx + CONTROLS.swapOffset.x;
    touchButtons.swap.y = ry + CONTROLS.swapOffset.y;
    if (this.right.pointerId !== null) this.reset();
    if (this.left.pointerId === null) {
      const l = this.left.view;
      l.baseX = l.knobX = CONTROLS.leftStickHome.x;
      l.baseY = l.knobY = Viewport.cssHeight - CONTROLS.leftStickHome.y;
    }
  }

  reset(): void {
    this.release(this.left);
    this.release(this.right);
    this.swapPointer = null;
    touchButtons.swap.pressed = false;
    this.setStickFire(false);
    this.layout();
  }

  private onDown(p: Phaser.Input.Pointer): void {
    if (!p.wasTouch) return;
    actions.device = 'touch';
    const x = p.x / Viewport.renderScale;
    const y = p.y / Viewport.renderScale;
    const R = CONTROLS.stickRadius;
    const rc = rightCentre();
    const b = touchButtons.swap;
    // Buttons take priority where they overlap the right stick's grab area.
    if (this.swapPointer === null && Math.hypot(x - b.x, y - b.y) <= CONTROLS.buttonRadius * 1.15) {
      // Tap to switch which weapon group the right stick fires.
      this.swapPointer = p.id;
      b.pressed = true;
      const firing = this.stickFiring;
      this.setStickFire(false);
      actions.stickGroup = actions.stickGroup === 1 ? 2 : 1;
      this.setStickFire(firing);
    } else if (this.right.pointerId === null && Math.hypot(x - rc.x, y - rc.y) <= R * CONTROLS.rightStickGrab) {
      this.right.pointerId = p.id;
      this.right.view.active = true;
      this.drag(this.right, x, y, false);
    } else if (this.left.pointerId === null && x < Viewport.cssWidth * CONTROLS.leftZoneWidth) {
      this.left.pointerId = p.id;
      const v = this.left.view;
      v.active = true;
      // Keep the whole stick on screen, with room so the thumb doesn't hit the phone's edge.
      const e = R + CONTROLS.stickEdgeMargin;
      v.baseX = Math.max(e, Math.min(x, Viewport.cssWidth - e));
      v.baseY = Math.max(e, Math.min(y, Viewport.cssHeight - e));
      this.drag(this.left, x, y, true);
    }
  }

  private onMove(p: Phaser.Input.Pointer): void {
    const x = p.x / Viewport.renderScale;
    const y = p.y / Viewport.renderScale;
    if (p.id === this.left.pointerId) this.drag(this.left, x, y, true);
    else if (p.id === this.right.pointerId) this.drag(this.right, x, y, false);
  }

  private onUp(p: Phaser.Input.Pointer): void {
    if (p.id === this.swapPointer) {
      this.swapPointer = null;
      touchButtons.swap.pressed = false;
    }
    if (p.id === this.left.pointerId) this.release(this.left);
    else if (p.id === this.right.pointerId) this.release(this.right);
    if (this.left.pointerId === null) this.layout();
  }

  /** Move a stick's knob to the finger. A floating stick's base follows a finger that goes past the rim. */
  private drag(s: StickTrack, x: number, y: number, floating: boolean): void {
    const R = CONTROLS.stickRadius;
    const v = s.view;
    let dx = x - v.baseX;
    let dy = y - v.baseY;
    let d = Math.hypot(dx, dy);
    if (d > R) {
      if (floating) {
        v.baseX = x - (dx / d) * R;
        v.baseY = y - (dy / d) * R;
      }
      dx = (dx / d) * R;
      dy = (dy / d) * R;
      d = R;
    }
    v.knobX = v.baseX + dx;
    v.knobY = v.baseY + dy;

    // Dead zone, then rescale so the output still reaches 1 at the rim.
    const mag = d / R;
    const dz = CONTROLS.stickDeadZone;
    const out = mag <= dz ? 0 : (mag - dz) / (1 - dz);
    const nx = d > 0 ? dx / d : 0;
    const ny = d > 0 ? dy / d : 0;
    if (s === this.left) {
      actions.move.x = nx * out;
      actions.move.y = ny * out;
    } else {
      // Aim keeps its last direction inside the dead zone, so the torso doesn't snap.
      if (out > 0) {
        actions.aimMode = 'direction';
        actions.aim.x = nx;
        actions.aim.y = ny;
      }
      this.setStickFire(out >= CONTROLS.fireThreshold);
    }
  }

  /** The right stick fires whichever group is selected with the swap button. */
  private setStickFire(on: boolean): void {
    this.stickFiring = on;
    actions.fire1 = on && actions.stickGroup === 1;
    actions.fire2 = on && actions.stickGroup === 2;
  }

  private release(s: StickTrack): void {
    s.pointerId = null;
    s.view.active = false;
    s.view.knobX = s.view.baseX;
    s.view.knobY = s.view.baseY;
    if (s === this.left) {
      actions.move.x = 0;
      actions.move.y = 0;
    } else {
      this.setStickFire(false);
    }
  }
}

function rightCentre(): { x: number; y: number } {
  return {
    x: Viewport.cssWidth - CONTROLS.rightStickInset.x,
    y: Viewport.cssHeight - CONTROLS.rightStickInset.y,
  };
}
