import { FloatingText, ShockwaveEffect, Particle } from './types';

export const MAX_PARTICLES = 180;

let nextTextId = 1;
let nextShockwaveId = 1;

const floatingTexts: FloatingText[] = [];
const shockwaves: ShockwaveEffect[] = [];
const particles: Particle[] = [];

// Pure-dt Screen Shake state
let shakeIntensity = 0;
let shakeDuration = 0;
let shakeRemaining = 0;

// Damage Vignette Flash state
let damageFlashAlpha = 0;

export interface BiomeBannerState {
  name: string;
  tier: number;
  color: string;
  timer: number;
  maxTimer: number;
}

let biomeBanner: BiomeBannerState | null = null;

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
 * Spawns a single pooled particle with FIFO eviction once MAX_PARTICLES is reached.
 */
export function spawnParticle(opts: {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  lifetime: number;
  gravity?: number;
  shape?: 'square' | 'circle' | 'spark';
}): void {
  if (opts.lifetime <= 0) return;
  if (particles.length >= MAX_PARTICLES) {
    particles.shift();
  }
  particles.push({
    x: opts.x,
    y: opts.y,
    vx: opts.vx,
    vy: opts.vy,
    size: opts.size,
    color: opts.color,
    alpha: 1.0,
    lifetime: opts.lifetime,
    maxLifetime: opts.lifetime,
    gravity: opts.gravity ?? 280,
    shape: opts.shape ?? 'square'
  });
}

/**
 * Emits angular block debris chunks + small radial dust upon breaking a tile.
 */
export function spawnBlockBreakBurst(
  x: number,
  y: number,
  color: string,
  count: number = 10
): void {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 45 + Math.random() * 125;
    const isDust = i >= Math.ceil(count * 0.7);
    spawnParticle({
      x: x + (Math.random() - 0.5) * 14,
      y: y + (Math.random() - 0.5) * 14,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 45,
      size: isDust ? 2 + Math.random() * 2 : 3 + Math.random() * 3.5,
      color,
      lifetime: isDust ? 0.35 + Math.random() * 0.2 : 0.42 + Math.random() * 0.28,
      gravity: isDust ? 90 : 340,
      shape: isDust ? 'circle' : 'square'
    });
  }
}

/**
 * Emits bright radial/rising sparks for ores, explosives, shields, and upgrades.
 */
export function spawnSparkBurst(
  x: number,
  y: number,
  color: string,
  count: number = 12,
  speed: number = 140
): void {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const mag = speed * (0.4 + Math.random() * 0.8);
    spawnParticle({
      x: x + (Math.random() - 0.5) * 8,
      y: y + (Math.random() - 0.5) * 8,
      vx: Math.cos(angle) * mag,
      vy: Math.sin(angle) * mag - 25,
      size: 2.2 + Math.random() * 2.4,
      color,
      lifetime: 0.32 + Math.random() * 0.32,
      gravity: 90,
      shape: 'spark'
    });
  }
}

/**
 * Emits soft slow drifting dust/steam puffs for thruster takeoff, hard landings, and overheat.
 */
export function spawnDustPuff(
  x: number,
  y: number,
  color: string = '#94a3b8',
  count: number = 6
): void {
  for (let i = 0; i < count; i++) {
    spawnParticle({
      x: x + (Math.random() - 0.5) * 18,
      y: y + (Math.random() - 0.5) * 6,
      vx: (Math.random() - 0.5) * 70,
      vy: -18 - Math.random() * 36,
      size: 2.5 + Math.random() * 3.5,
      color,
      lifetime: 0.38 + Math.random() * 0.25,
      gravity: -25,
      shape: 'circle'
    });
  }
}

/**
 * Triggers frame-rate-independent screen shake while preserving stronger remaining impulses.
 */
export function addScreenShake(intensity: number, duration: number): void {
  if (intensity <= 0 || duration <= 0) return;
  const currentEffective = shakeDuration > 0 ? shakeIntensity * (shakeRemaining / shakeDuration) : 0;
  shakeIntensity = Math.max(currentEffective, intensity);
  shakeDuration = Math.max(shakeRemaining, duration);
  shakeRemaining = shakeDuration;
}

/**
 * Returns the active damped jitter offset for the world camera transform.
 */
export function getScreenShakeOffset(): { x: number; y: number } {
  if (shakeRemaining <= 0 || shakeDuration <= 0) {
    return { x: 0, y: 0 };
  }
  const mag = shakeIntensity * (shakeRemaining / shakeDuration);
  return {
    x: (Math.random() * 2 - 1) * mag,
    y: (Math.random() * 2 - 1) * mag
  };
}

/**
 * Triggers a decaying red screen-edge damage vignette flash.
 */
export function addDamageFlash(intensity: number = 0.35): void {
  if (intensity <= 0) return;
  damageFlashAlpha = Math.min(0.55, Math.max(damageFlashAlpha, intensity));
}

export function getDamageFlashAlpha(): number {
  return damageFlashAlpha;
}

/**
 * Displays a non-blocking HUD biome transition pill at the top of the viewport.
 */
export function showBiomeBanner(
  name: string,
  tier: number,
  color: string,
  duration: number = 2.8
): void {
  if (duration <= 0) return;
  biomeBanner = {
    name,
    tier,
    color,
    timer: duration,
    maxTimer: duration
  };
}

export function getBiomeBanner(): BiomeBannerState | null {
  return biomeBanner;
}

/**
 * Updates lifetimes and animations of all active visual effects.
 */
export function updateEffects(dt: number): void {
  if (dt <= 0) return;

  // 1. Update Floating Texts
  for (let i = floatingTexts.length - 1; i >= 0; i--) {
    const ft = floatingTexts[i];
    ft.lifetime -= dt;
    ft.y += ft.vy * dt;
    ft.vy *= Math.pow(0.96, dt * 60); // frame-rate independent deceleration
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

  // 3. Update Particles
  const drag = Math.pow(0.95, dt * 60);
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.lifetime -= dt;
    if (p.lifetime <= 0) {
      particles.splice(i, 1);
      continue;
    }
    p.vy += p.gravity * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= drag;
    p.alpha = Math.max(0, p.lifetime / p.maxLifetime);
  }

  // 4. Decay Screen Shake, Damage Flash, and Biome Banner
  if (shakeRemaining > 0) {
    shakeRemaining = Math.max(0, shakeRemaining - dt);
    if (shakeRemaining === 0) {
      shakeIntensity = 0;
      shakeDuration = 0;
    }
  }

  if (damageFlashAlpha > 0) {
    damageFlashAlpha = Math.max(0, damageFlashAlpha - 2.2 * dt);
  }

  if (biomeBanner) {
    biomeBanner.timer -= dt;
    if (biomeBanner.timer <= 0) {
      biomeBanner = null;
    }
  }
}

/**
 * Renders shockwaves, pooled particles, and floating texts to the game canvas.
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

  // 2. Render Particles
  for (const p of particles) {
    const screenY = p.y - cameraY;
    ctx.globalAlpha = Math.max(0, Math.min(1, p.alpha));
    ctx.fillStyle = p.color;

    if (p.shape === 'circle') {
      ctx.beginPath();
      ctx.arc(p.x, screenY, Math.max(0.5, p.size * 0.6), 0, Math.PI * 2);
      ctx.fill();
    } else if (p.shape === 'spark') {
      const half = p.size * 0.85;
      ctx.beginPath();
      ctx.moveTo(p.x, screenY - half * 1.4);
      ctx.lineTo(p.x + half * 0.7, screenY);
      ctx.lineTo(p.x, screenY + half * 1.4);
      ctx.lineTo(p.x - half * 0.7, screenY);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(p.x - 0.8, screenY - 0.8, 1.6, 1.6);
    } else {
      const half = p.size / 2;
      ctx.fillRect(p.x - half, screenY - half, p.size, p.size);
    }
  }

  // 3. Render Floating Texts
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
 * Clears all active effects (e.g. on respawn/teleport/test reset).
 */
export function clearEffects(): void {
  floatingTexts.length = 0;
  shockwaves.length = 0;
  particles.length = 0;
  shakeIntensity = 0;
  shakeDuration = 0;
  shakeRemaining = 0;
  damageFlashAlpha = 0;
  biomeBanner = null;
}

/**
 * Returns live counters and state flags for unit verification.
 */
export function getEffectsDebugStats(): {
  particleCount: number;
  floatingTextCount: number;
  shockwaveCount: number;
  shakeActive: boolean;
  damageFlashAlpha: number;
  hasBiomeBanner: boolean;
} {
  return {
    particleCount: particles.length,
    floatingTextCount: floatingTexts.length,
    shockwaveCount: shockwaves.length,
    shakeActive: shakeRemaining > 0,
    damageFlashAlpha,
    hasBiomeBanner: biomeBanner !== null
  };
}
