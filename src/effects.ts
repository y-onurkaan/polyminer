import { FloatingText, ShockwaveEffect } from './types';

let nextTextId = 1;
let nextShockwaveId = 1;

const floatingTexts: FloatingText[] = [];
const shockwaves: ShockwaveEffect[] = [];

/**
 * Adds an animated floating combat/mining text on canvas.
 */
export function addFloatingText(
  x: number,
  y: number,
  text: string,
  color: string = '#f8fafc',
  lifetime: number = 1.2
): void {
  floatingTexts.push({
    id: nextTextId++,
    x,
    y,
    text,
    color,
    alpha: 1.0,
    vy: -35 - Math.random() * 15, // float upwards px/s
    lifetime,
    maxLifetime: lifetime
  });
}

/**
 * Adds an expanding seismic shockwave ring on canvas.
 */
export function addShockwave(
  x: number,
  y: number,
  maxRadius: number = 85,
  color: string = '#facc15'
): void {
  shockwaves.push({
    id: nextShockwaveId++,
    x,
    y,
    radius: 4,
    maxRadius,
    color,
    alpha: 1.0
  });
}

/**
 * Updates lifetimes and animations of all active visual effects.
 */
export function updateEffects(dt: number): void {
  // 1. Update Floating Texts
  for (let i = floatingTexts.length - 1; i >= 0; i--) {
    const ft = floatingTexts[i];
    ft.lifetime -= dt;
    ft.y += ft.vy * dt;
    ft.vy *= 0.96; // slight deceleration
    ft.alpha = Math.max(0, ft.lifetime / ft.maxLifetime);

    if (ft.lifetime <= 0) {
      floatingTexts.splice(i, 1);
    }
  }

  // 2. Update Shockwaves
  for (let i = shockwaves.length - 1; i >= 0; i--) {
    const sw = shockwaves[i];
    sw.radius += (sw.maxRadius - sw.radius) * 12 * dt;
    sw.alpha -= 2.2 * dt;

    if (sw.alpha <= 0 || sw.radius >= sw.maxRadius * 0.95) {
      shockwaves.splice(i, 1);
    }
  }
}

/**
 * Renders floating texts and shockwaves to the game canvas.
 */
export function renderEffects(ctx: CanvasRenderingContext2D, cameraY: number): void {
  ctx.save();

  // 1. Render Shockwaves
  for (const sw of shockwaves) {
    const screenY = sw.y - cameraY;
    ctx.strokeStyle = sw.color;
    ctx.globalAlpha = Math.max(0, Math.min(1, sw.alpha));
    ctx.lineWidth = 3;

    ctx.beginPath();
    ctx.arc(sw.x, screenY, Math.max(1, sw.radius), 0, Math.PI * 2);
    ctx.stroke();

    // Inner second ring for seismic wave feel
    if (sw.radius > 15) {
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(sw.x, screenY, Math.max(1, sw.radius * 0.65), 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // 2. Render Floating Texts
  ctx.font = 'bold 13px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (const ft of floatingTexts) {
    const screenY = ft.y - cameraY;
    ctx.globalAlpha = Math.max(0, Math.min(1, ft.alpha));

    // Crisp dark outline / drop shadow
    ctx.fillStyle = '#09090b';
    ctx.fillText(ft.text, ft.x + 1, screenY + 1);
    ctx.fillText(ft.text, ft.x - 1, screenY - 1);
    ctx.fillText(ft.text, ft.x + 1, screenY - 1);
    ctx.fillText(ft.text, ft.x - 1, screenY + 1);

    // Main colored text
    ctx.fillStyle = ft.color;
    ctx.fillText(ft.text, ft.x, screenY);
  }

  ctx.restore();
}

/**
 * Clears all active effects (e.g. on respawn/teleport).
 */
export function clearEffects(): void {
  floatingTexts.length = 0;
  shockwaves.length = 0;
}
