export interface Vec {
  x: number;
  y: number;
}

export const DEG = Math.PI / 180;

/** Wrap an angle to (-PI, PI]. */
export function wrapAngle(a: number): number {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
}

/** Move `value` toward `target` by at most `maxStep`. */
export function approach(value: number, target: number, maxStep: number): number {
  if (value < target) return Math.min(value + maxStep, target);
  return Math.max(value - maxStep, target);
}

/** Rotate angle `a` toward `target` by at most `maxStep`, the short way round. */
export function approachAngle(a: number, target: number, maxStep: number): number {
  const diff = wrapAngle(target - a);
  if (Math.abs(diff) <= maxStep) return target;
  return a + Math.sign(diff) * maxStep;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Frame-rate independent smoothing factor for exponential follow. */
export function smoothing(ratePerSecond: number, dt: number): number {
  return 1 - Math.exp(-ratePerSecond * dt);
}
