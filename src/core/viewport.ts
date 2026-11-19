import Phaser from 'phaser';
import { DISPLAY } from '../config/display';

/**
 * Owns the canvas size. The canvas is always stretched by CSS to fill its
 * container; here we choose its backing resolution within the render budget
 * (see config/display.ts). Scenes read `Viewport` for sizes and listen to the
 * scale manager's 'resize' event.
 */
export interface ViewportInfo {
  /** Container size in CSS pixels. */
  cssWidth: number;
  cssHeight: number;
  /** Backing pixels per CSS pixel. */
  renderScale: number;
  /** Canvas backing size in pixels (what Phaser renders). */
  width: number;
  height: number;
}

export const Viewport: ViewportInfo = {
  cssWidth: 1,
  cssHeight: 1,
  renderScale: 1,
  width: 1,
  height: 1,
};

/** Compute the backing size for a container. Pure, so it is easy to test. */
export function computeViewport(cssWidth: number, cssHeight: number, dpr: number): ViewportInfo {
  const w = Math.max(1, cssWidth);
  const h = Math.max(1, cssHeight);
  let scale = Math.min(dpr || 1, DISPLAY.maxPixelRatio);
  const pixels = w * h * scale * scale;
  if (pixels > DISPLAY.maxRenderPixels) {
    scale = Math.sqrt(DISPLAY.maxRenderPixels / (w * h));
  }
  scale = Math.max(scale, DISPLAY.minRenderScale);
  return {
    cssWidth: w,
    cssHeight: h,
    renderScale: scale,
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
  };
}

function measure(container: HTMLElement): ViewportInfo {
  const rect = container.getBoundingClientRect();
  return computeViewport(rect.width, rect.height, window.devicePixelRatio);
}

/** Size the viewport before the game exists, so the first frame is already correct. */
export function initViewport(container: HTMLElement): ViewportInfo {
  Object.assign(Viewport, measure(container));
  return Viewport;
}

/** Keep the canvas matched to its container (window resize, rotation, browser bars). */
export function trackViewport(game: Phaser.Game, container: HTMLElement): void {
  let pending = false;
  const apply = () => {
    pending = false;
    const next = measure(container);
    if (
      next.width === Viewport.width &&
      next.height === Viewport.height &&
      next.renderScale === Viewport.renderScale
    ) {
      return;
    }
    Object.assign(Viewport, next);
    game.scale.resize(next.width, next.height);
  };
  const schedule = () => {
    if (!pending) {
      pending = true;
      requestAnimationFrame(apply);
    }
  };
  new ResizeObserver(schedule).observe(container);
  window.addEventListener('orientationchange', schedule);
  // DPR changes when a window moves between monitors or the page is zoomed.
  const watchDpr = () => {
    matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener(
      'change',
      () => {
        schedule();
        watchDpr();
      },
      { once: true },
    );
  };
  watchDpr();
}
