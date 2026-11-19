import type { ChassisMovement } from '../data/chassis';
import type { ControlScheme } from '../core/settings';
import type { Circle, CollisionWorld } from '../core/collision';
import { CRUSH_SLOWDOWN } from '../data/terrain';
import { DEG, approach, approachAngle, clamp, wrapAngle, type Vec } from '../core/math';

/**
 * Mech movement: legs with momentum and a ramped turn, plus a torso that
 * turns toward the aim point at its own rate. No rendering here.
 *
 * Angles are radians, 0 = facing right (+x), positive = clockwise on screen.
 */
export class MechMotor {
  pos: Vec;
  legAngle: number;
  /** Current leg angular velocity, rad/s. */
  legTurnVel = 0;
  /** Signed speed along the leg facing, units/s (negative = reversing). */
  speed = 0;
  torsoAngle: number;
  /** Advances by PI per footstep; drives the walk animation. */
  stridePhase = 0;
  /** Tonnage for crushing terrain by walking into it (see data/terrain.ts). */
  crushTonnage = 0;
  /** Leg damage multipliers on top speed and turn rate (1 = undamaged). */
  speedFactor = 1;
  turnFactor = 1;

  constructor(
    public move: ChassisMovement,
    public radius: number,
    x: number,
    y: number,
    angle: number,
  ) {
    this.pos = { x, y };
    this.legAngle = angle;
    this.torsoAngle = angle;
  }

  /**
   * Advance one frame. `input` is the movement vector from the input layer
   * (screen space). Returns true on the frame a foot lands.
   */
  update(
    dt: number,
    scheme: ControlScheme,
    input: Vec,
    aimTarget: Vec | null,
    world: CollisionWorld,
    bodies?: readonly Circle[],
    self?: Circle,
  ): boolean {
    const m = this.move;
    const turnRate = m.legTurnRate * DEG * this.turnFactor;
    const turnAccel = m.legTurnAccel * DEG * this.turnFactor;
    const maxSpeed = m.maxSpeed * this.speedFactor;

    let targetSpeed = 0;
    let targetTurnVel = 0;

    if (scheme === 'tank') {
      const throttle = clamp(-input.y, -1, 1);
      targetSpeed = throttle >= 0 ? throttle * maxSpeed : throttle * maxSpeed * m.reverseFactor;
      targetTurnVel = clamp(input.x, -1, 1) * turnRate;
    } else {
      const mag = Math.min(1, Math.hypot(input.x, input.y));
      if (mag > 0.01) {
        const diff = wrapAngle(Math.atan2(input.y, input.x) - this.legAngle);
        // Fastest turn that can still stop on the target heading without overshooting.
        targetTurnVel = Math.sign(diff) * Math.min(turnRate, Math.sqrt(2 * turnAccel * Math.abs(diff)));
        // Walk forward only, slower while still turning toward the direction.
        targetSpeed = maxSpeed * mag * Math.max(0, Math.cos(diff));
      }
    }

    this.legTurnVel = approach(this.legTurnVel, targetTurnVel, turnAccel * dt);
    this.legAngle = wrapAngle(this.legAngle + this.legTurnVel * dt);

    // Speeding up uses accel; easing off, braking or reversing direction uses decel.
    const speedingUp = Math.sign(targetSpeed) === Math.sign(this.speed) && Math.abs(targetSpeed) > Math.abs(this.speed);
    const rate = speedingUp || this.speed === 0 ? m.accel : m.decel;
    this.speed = approach(this.speed, targetSpeed, rate * dt);

    const fx = Math.cos(this.legAngle);
    const fy = Math.sin(this.legAngle);
    const ox = this.pos.x;
    const oy = this.pos.y;
    this.pos.x += fx * this.speed * dt;
    this.pos.y += fy * this.speed * dt;
    const blocked = world.resolveCircle(this.pos, this.radius, bodies, self, this.crushTonnage);
    // Crushing a tree or shed costs a little momentum.
    if (world.crushed > 0) this.speed *= Math.pow(CRUSH_SLOWDOWN, world.crushed);
    if (blocked && dt > 0) {
      // Walking into something kills the speed you couldn't use; sliding along a wall keeps some.
      const along = ((this.pos.x - ox) * fx + (this.pos.y - oy) * fy) / dt;
      if (Math.abs(along) < Math.abs(this.speed)) this.speed = along;
    }

    // Footsteps from distance walked, plus shuffling when turning on the spot.
    const moved = Math.hypot(this.pos.x - ox, this.pos.y - oy) + Math.abs(this.legTurnVel) * dt * this.radius * 0.6;
    const before = Math.floor(this.stridePhase / Math.PI);
    this.stridePhase += (moved / m.strideLength) * Math.PI;
    const stepped = Math.floor(this.stridePhase / Math.PI) !== before;

    if (aimTarget) {
      const want = Math.atan2(aimTarget.y - this.pos.y, aimTarget.x - this.pos.x);
      this.torsoAngle = wrapAngle(approachAngle(this.torsoAngle, want, m.torsoTurnRate * DEG * dt));
    }

    return stepped;
  }
}
