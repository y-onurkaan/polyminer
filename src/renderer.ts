import { Tile, TileType, RemotePlayerState, OreDefinition } from './types';
import {
  TILE_SIZE,
  GRID_WIDTH,
  GRID_HEIGHT,
  SURFACE_ROW,
  SAFE_LANDING_SPEED,
  getBiomeForDepth
} from './constants';
import { PlayerExtendedState, PLAYER_WIDTH, PLAYER_HEIGHT, MAX_FALL_SPEED, getBlockTier } from './player';
import { getWorldRenderVersion } from './world';
import { getDamageFlashAlpha, getBiomeBanner } from './effects';

let radarCacheCanvas: HTMLCanvasElement | null = null;
let radarCacheVersion = -1;
let radarCacheHeight = 0;

/**
 * Deterministic fast integer hash in [0, 1) for per-tile visual variety without allocation.
 */
function tileHash(x: number, y: number): number {
  let n = ((x * 374761393) + (y * 668265263)) | 0;
  n = (n ^ (n >>> 13)) * 1274126177;
  n = n ^ (n >>> 16);
  return (n >>> 0) / 4294967296;
}

function getBiomeHighlightColor(biomeId: string): string {
  switch (biomeId) {
    case 'quartz':
      return '#4a3d69';
    case 'basalt':
      return '#41524a';
    case 'magma':
      return '#6b2924';
    default:
      return '#785636';
  }
}

function isRevealedOpen(world: Tile[][], gx: number, gy: number): boolean {
  if (gy < 0 || gy >= world.length || gx < 0 || gx >= GRID_WIDTH) return false;
  const t = world[gy]?.[gx];
  return !!(t && t.revealed && t.type === TileType.EMPTY);
}

function isRevealedNeighbor(world: Tile[][], gx: number, gy: number): boolean {
  if (gy < 0 || gy >= world.length || gx < 0 || gx >= GRID_WIDTH) return false;
  return !!world[gy]?.[gx]?.revealed;
}

// Parallax background stars
const STARS = Array.from({ length: 48 }, () => ({
  x: Math.random() * (GRID_WIDTH * TILE_SIZE),
  y: Math.random() * (SURFACE_ROW * TILE_SIZE - 20),
  radius: 0.7 + Math.random() * 1.3,
  brightness: 0.4 + Math.random() * 0.6,
  speed: 0.08 + Math.random() * 0.15
}));

// Deterministic subterranean ambient motes (zero per-frame allocations)
const AMBIENT_MOTES = Array.from({ length: 18 }, (_, i) => ({
  nx: ((i * 73 + 19) % 97) / 97,
  ny: ((i * 137 + 41) % 101) / 101,
  driftX: ((i % 5) - 2) * 3.5,
  driftY: 6 + (i % 4) * 4,
  radius: 1.0 + (i % 3) * 0.55,
  phase: i * 0.9
}));

function getBiomeMoteRgb(biomeId: string): [number, number, number] {
  switch (biomeId) {
    case 'quartz':
      return [192, 132, 252];
    case 'basalt':
      return [163, 230, 53];
    case 'magma':
      return [251, 146, 60];
    default:
      return [217, 179, 130];
  }
}

function renderBiomeAmbientMotes(
  ctx: CanvasRenderingContext2D,
  cameraY: number,
  viewportWidth: number,
  viewportHeight: number,
  surfaceScreenY: number,
  nowMs: number
): void {
  const undergroundTop = Math.max(0, surfaceScreenY);
  if (undergroundTop >= viewportHeight) return;

  const viewCenterRow = Math.floor((cameraY + viewportHeight * 0.5) / TILE_SIZE);
  const biome = getBiomeForDepth(viewCenterRow);
  const [r, g, b] = getBiomeMoteRgb(biome.id);
  const t = nowMs * 0.001;
  const riseDir = biome.id === 'magma' ? -1 : 1;

  ctx.save();
  for (const m of AMBIENT_MOTES) {
    const px = (((m.nx * viewportWidth + t * m.driftX) % viewportWidth) + viewportWidth) % viewportWidth;
    const py = (((m.ny * viewportHeight - cameraY * 0.65 + t * m.driftY * riseDir) % viewportHeight) + viewportHeight) % viewportHeight;
    if (py < undergroundTop + 6) continue;

    const alpha = Math.max(0.08, 0.24 + 0.30 * Math.sin(t * 2.2 + m.phase));
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
    const size = m.radius * 2;
    ctx.fillRect(px, py, size, size);
  }
  ctx.restore();
}

// Drifting minimalist clouds (serene drift speed)
const CLOUDS = [
  { x: 60, y: 32, speed: 4.5, puffs: [{ dx: 0, dy: 0, r: 16 }, { dx: 18, dy: -6, r: 22 }, { dx: 38, dy: -2, r: 18 }, { dx: 54, dy: 4, r: 12 }] },
  { x: 360, y: 56, speed: 6.8, puffs: [{ dx: 0, dy: 0, r: 14 }, { dx: 16, dy: -8, r: 20 }, { dx: 36, dy: -4, r: 24 }, { dx: 60, dy: 2, r: 15 }] },
  { x: 680, y: 26, speed: 3.8, puffs: [{ dx: 0, dy: 0, r: 18 }, { dx: 22, dy: -6, r: 24 }, { dx: 45, dy: 0, r: 18 }] },
  { x: 960, y: 48, speed: 5.5, puffs: [{ dx: 0, dy: 0, r: 15 }, { dx: 20, dy: -7, r: 22 }, { dx: 42, dy: -3, r: 19 }, { dx: 62, dy: 3, r: 13 }] }
];

// 240-second (4-minute) continuous, relaxed Day / Night cycle
const CYCLE_DURATION = 240;

interface SkyKeyframe {
  t: number;
  top: [number, number, number];
  bottom: [number, number, number];
  night: number;   // 0.0 (day) -> 1.0 (night)
  sunset: number;  // 0.0 -> 1.0
}

const SKY_KEYFRAMES: SkyKeyframe[] = [
  // t=0.00: High Noon (Starts in daytime! Vibrant cerulean & cyan sky)
  { t: 0.00, top: [2, 132, 199], bottom: [125, 211, 252], night: 0.0, sunset: 0.0 }, // #0284c7 -> #7dd3fc
  // t=0.15: Afternoon
  { t: 0.15, top: [3, 105, 161], bottom: [186, 230, 253], night: 0.0, sunset: 0.1 }, // #0369a1 -> #bae6fd
  // t=0.22: Golden Hour
  { t: 0.22, top: [30, 58, 138], bottom: [251, 146, 60], night: 0.1, sunset: 0.7 },  // #1e3a8a -> #fb923c
  // t=0.28: Sunset / Dusk (Glowing ember horizon)
  { t: 0.28, top: [30, 27, 75], bottom: [234, 88, 12], night: 0.35, sunset: 1.0 },   // #1e1b4b -> #ea580c
  // t=0.36: Twilight / Deep Dusk
  { t: 0.36, top: [15, 23, 42], bottom: [124, 45, 18], night: 0.75, sunset: 0.4 },   // #0f172a -> #7c2d12
  // t=0.45: Deep Night
  { t: 0.45, top: [3, 7, 18], bottom: [15, 23, 42], night: 1.0, sunset: 0.0 },      // #030712 -> #0f172a
  // t=0.65: Midnight Apex
  { t: 0.65, top: [3, 7, 18], bottom: [15, 23, 42], night: 1.0, sunset: 0.0 },      // #030712 -> #0f172a
  // t=0.74: Pre-Dawn Sky
  { t: 0.74, top: [15, 23, 42], bottom: [88, 28, 135], night: 0.7, sunset: 0.2 },   // #0f172a -> #581c87
  // t=0.80: Sunrise / Morning Dawn
  { t: 0.80, top: [30, 27, 75], bottom: [251, 113, 133], night: 0.2, sunset: 0.9 }, // #1e1b4b -> #fb7185
  // t=0.88: Golden Morning
  { t: 0.88, top: [3, 105, 161], bottom: [254, 215, 170], night: 0.0, sunset: 0.3 },// #0369a1 -> #fed7aa
  // t=1.00: Back to High Noon
  { t: 1.00, top: [2, 132, 199], bottom: [125, 211, 252], night: 0.0, sunset: 0.0 }
];

function getSkyParameters(nowMs: number) {
  const cycleTime = ((nowMs / 1000) % CYCLE_DURATION) / CYCLE_DURATION;

  let k1 = SKY_KEYFRAMES[0];
  let k2 = SKY_KEYFRAMES[1];
  for (let i = 0; i < SKY_KEYFRAMES.length - 1; i++) {
    if (cycleTime >= SKY_KEYFRAMES[i].t && cycleTime <= SKY_KEYFRAMES[i + 1].t) {
      k1 = SKY_KEYFRAMES[i];
      k2 = SKY_KEYFRAMES[i + 1];
      break;
    }
  }

  const span = k2.t - k1.t;
  const factor = span > 0 ? (cycleTime - k1.t) / span : 0;

  const topR = Math.round(k1.top[0] + (k2.top[0] - k1.top[0]) * factor);
  const topG = Math.round(k1.top[1] + (k2.top[1] - k1.top[1]) * factor);
  const topB = Math.round(k1.top[2] + (k2.top[2] - k1.top[2]) * factor);

  const botR = Math.round(k1.bottom[0] + (k2.bottom[0] - k1.bottom[0]) * factor);
  const botG = Math.round(k1.bottom[1] + (k2.bottom[1] - k1.bottom[1]) * factor);
  const botB = Math.round(k1.bottom[2] + (k2.bottom[2] - k1.bottom[2]) * factor);

  const night = k1.night + (k2.night - k1.night) * factor;
  const sunset = k1.sunset + (k2.sunset - k1.sunset) * factor;

  return {
    cycleTime,
    topColor: `rgb(${topR}, ${topG}, ${topB})`,
    bottomColor: `rgb(${botR}, ${botG}, ${botB})`,
    night,
    sunset
  };
}

/**
 * Draws a mathematically precise regular polygon.
 */
export function drawPolygon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  sides: number,
  fillColor: string,
  strokeColor?: string,
  rotation: number = 0
): void {
  if (sides < 3) return;

  ctx.save();
  ctx.beginPath();

  const angleStep = (Math.PI * 2) / sides;
  const initialOffset = -Math.PI / 2 + rotation;

  for (let i = 0; i < sides; i++) {
    const angle = initialOffset + i * angleStep;
    const x = cx + radius * Math.cos(angle);
    const y = cy + radius * Math.sin(angle);

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }

  ctx.closePath();
  ctx.fillStyle = fillColor;
  ctx.fill();

  if (strokeColor) {
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // Minimalist facet highlight
  if (radius > 8) {
    ctx.beginPath();
    const innerRadius = radius * 0.45;
    for (let i = 0; i < sides; i++) {
      const angle = initialOffset + i * angleStep;
      const x = cx + innerRadius * Math.cos(angle);
      const y = cy + innerRadius * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.fill();
  }

  ctx.restore();
}

export interface OreVisualStyle {
  material: 'metal' | 'precious_metal' | 'gem' | 'relic';
  spec: string;
  light: string;
  base: string;
  shadow: string;
  deep: string;
  veinColor: string;
  auraRgb?: string;
  sparkle: boolean;
  tableRatio: number;
}

const ORE_VISUAL_STYLES: Record<string, OreVisualStyle> = {
  copper: {
    material: 'metal',
    spec: '#fde68a',
    light: '#f59e0b',
    base: '#d97706',
    shadow: '#9a3412',
    deep: '#451a03',
    veinColor: 'rgba(217, 119, 6, 0.42)',
    sparkle: false,
    tableRatio: 0.44
  },
  iron: {
    material: 'metal',
    spec: '#f1f5f9',
    light: '#cbd5e1',
    base: '#94a3b8',
    shadow: '#475569',
    deep: '#1e293b',
    veinColor: 'rgba(148, 163, 184, 0.36)',
    sparkle: false,
    tableRatio: 0.44
  },
  silver: {
    material: 'precious_metal',
    spec: '#ffffff',
    light: '#f1f5f9',
    base: '#cbd5e1',
    shadow: '#64748b',
    deep: '#334155',
    veinColor: 'rgba(226, 232, 240, 0.42)',
    sparkle: true,
    tableRatio: 0.46
  },
  gold: {
    material: 'precious_metal',
    spec: '#fef9c3',
    light: '#fde047',
    base: '#eab308',
    shadow: '#a16207',
    deep: '#422006',
    veinColor: 'rgba(250, 204, 21, 0.46)',
    auraRgb: '250, 204, 21',
    sparkle: true,
    tableRatio: 0.46
  },
  emerald: {
    material: 'gem',
    spec: '#d1fae5',
    light: '#34d399',
    base: '#10b981',
    shadow: '#047857',
    deep: '#022c22',
    veinColor: 'rgba(16, 185, 129, 0.46)',
    auraRgb: '16, 185, 129',
    sparkle: true,
    tableRatio: 0.50
  },
  diamond: {
    material: 'gem',
    spec: '#ffffff',
    light: '#bae6fd',
    base: '#38bdf8',
    shadow: '#0284c7',
    deep: '#082f49',
    veinColor: 'rgba(56, 189, 248, 0.52)',
    auraRgb: '56, 189, 248',
    sparkle: true,
    tableRatio: 0.52
  },
  ancient_core: {
    material: 'relic',
    spec: '#fdf2f8',
    light: '#f472b6',
    base: '#ec4899',
    shadow: '#9d174d',
    deep: '#500724',
    veinColor: 'rgba(236, 72, 153, 0.55)',
    auraRgb: '236, 72, 153',
    sparkle: true,
    tableRatio: 0.48
  }
};

/**
 * Returns the 5-tone material & facet styling palette for a mineral ore ID.
 */
export function getOreVisualStyle(oreId: string, fallbackColor: string = '#cbd5e1'): OreVisualStyle {
  const found = ORE_VISUAL_STYLES[oreId];
  if (found) return found;
  return {
    material: 'metal',
    spec: '#f8fafc',
    light: fallbackColor,
    base: fallbackColor,
    shadow: '#475569',
    deep: '#0f172a',
    veinColor: 'rgba(203, 213, 225, 0.35)',
    sparkle: false,
    tableRatio: 0.46
  };
}

function fillSocketPolygon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  sides: number,
  rotation: number
): void {
  const step = (Math.PI * 2) / sides;
  const start = -Math.PI / 2 + rotation;
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const a = start + i * step;
    const px = cx + radius * Math.cos(a);
    const py = cy + radius * Math.sin(a);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = 'rgba(6, 9, 15, 0.48)';
  ctx.fill();
}

function drawFacetedPolygon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  sides: number,
  style: OreVisualStyle,
  rotation: number = 0,
  isSatellite: boolean = false
): void {
  if (sides < 3) return;
  const step = (Math.PI * 2) / sides;
  const startAngle = -Math.PI / 2 + rotation;
  const innerR = radius * style.tableRatio;

  const outerX: number[] = new Array(sides);
  const outerY: number[] = new Array(sides);
  const innerX: number[] = new Array(sides);
  const innerY: number[] = new Array(sides);

  for (let i = 0; i < sides; i++) {
    const a = startAngle + i * step;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    outerX[i] = cx + radius * ca;
    outerY[i] = cy + radius * sa;
    innerX[i] = cx + innerR * ca;
    innerY[i] = cy + innerR * sa;
  }

  ctx.save();

  // 1. Directional Low-Poly Outer Bevels (lit from top-left (-0.7071, -0.7071))
  for (let i = 0; i < sides; i++) {
    const next = (i + 1) % sides;
    const midAngle = startAngle + (i + 0.5) * step;
    const dot = -(Math.cos(midAngle) * 0.7071 + Math.sin(midAngle) * 0.7071);

    if (dot > 0.45) ctx.fillStyle = style.spec;
    else if (dot > 0.06) ctx.fillStyle = style.light;
    else if (dot > -0.35) ctx.fillStyle = style.base;
    else if (dot > -0.72) ctx.fillStyle = style.shadow;
    else ctx.fillStyle = style.deep;

    ctx.beginPath();
    ctx.moveTo(outerX[i], outerY[i]);
    ctx.lineTo(outerX[next], outerY[next]);
    ctx.lineTo(innerX[next], innerY[next]);
    ctx.lineTo(innerX[i], innerY[i]);
    ctx.closePath();
    ctx.fill();
  }

  // 2. Inner Crown Table
  const traceInnerTable = () => {
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
      if (i === 0) ctx.moveTo(innerX[i], innerY[i]);
      else ctx.lineTo(innerX[i], innerY[i]);
    }
    ctx.closePath();
  };

  traceInnerTable();
  ctx.fillStyle = style.material === 'gem' ? style.light : style.base;
  ctx.fill();

  if (!isSatellite) {
    // Upper-left specular wedge or diagonal metallic sheen clipped inside table
    ctx.save();
    traceInnerTable();
    ctx.clip();
    if (style.material === 'gem' || style.material === 'relic') {
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = style.spec;
      ctx.beginPath();
      ctx.moveTo(cx - innerR, cy - innerR);
      ctx.lineTo(cx + innerR * 0.55, cy - innerR);
      ctx.lineTo(cx - innerR, cy + innerR * 0.55);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = style.spec;
      ctx.beginPath();
      ctx.moveTo(cx - innerR * 0.95, cy + innerR * 0.10);
      ctx.lineTo(cx + innerR * 0.10, cy - innerR * 0.95);
      ctx.lineTo(cx + innerR * 0.55, cy - innerR * 0.50);
      ctx.lineTo(cx - innerR * 0.50, cy + innerR * 0.55);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // Gem internal star refraction spokes
    if (style.material === 'gem') {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.34)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      for (let i = 0; i < sides; i++) {
        ctx.moveTo(cx, cy);
        ctx.lineTo(innerX[i], innerY[i]);
      }
      ctx.stroke();
    }

    // Crisp facet ridge lines from outer to inner table vertices
    ctx.lineWidth = 0.8;
    for (let i = 0; i < sides; i++) {
      const va = startAngle + i * step;
      const dot = -(Math.cos(va) * 0.7071 + Math.sin(va) * 0.7071);
      ctx.strokeStyle = dot > 0 ? 'rgba(255, 255, 255, 0.28)' : 'rgba(0, 0, 0, 0.22)';
      ctx.beginPath();
      ctx.moveTo(outerX[i], outerY[i]);
      ctx.lineTo(innerX[i], innerY[i]);
      ctx.stroke();
    }
  }

  // 3. Crisp Deep Contrast Rim
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    if (i === 0) ctx.moveTo(outerX[i], outerY[i]);
    else ctx.lineTo(outerX[i], outerY[i]);
  }
  ctx.closePath();
  ctx.strokeStyle = style.deep;
  ctx.lineWidth = isSatellite ? 0.9 : 1.25;
  ctx.lineJoin = 'round';
  ctx.stroke();

  // 4. Top-Left Specular Edge Rim Accent
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.lineWidth = isSatellite ? 0.6 : 0.9;
  for (let i = 0; i < sides; i++) {
    const next = (i + 1) % sides;
    const midAngle = startAngle + (i + 0.5) * step;
    const dot = -(Math.cos(midAngle) * 0.7071 + Math.sin(midAngle) * 0.7071);
    if (dot > 0.18) {
      ctx.beginPath();
      ctx.moveTo(outerX[i], outerY[i]);
      ctx.lineTo(outerX[next], outerY[next]);
      ctx.stroke();
    }
  }

  ctx.restore();
}

function drawStarGlint(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  alpha: number,
  color: string
): void {
  if (alpha <= 0.02 || radius <= 0.5) return;
  const arm = radius;
  const waist = radius * 0.24;
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - arm);
  ctx.lineTo(x + waist, y - waist);
  ctx.lineTo(x + arm, y);
  ctx.lineTo(x + waist, y + waist);
  ctx.lineTo(x, y + arm);
  ctx.lineTo(x - waist, y + waist);
  ctx.lineTo(x - arm, y);
  ctx.lineTo(x - waist, y - waist);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function renderEmbeddedOreTile(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  x: number,
  y: number,
  ore: OreDefinition,
  now: number
): void {
  const style = getOreVisualStyle(ore.id, ore.color);
  const h1 = tileHash(x, y);
  const h2 = tileHash(x * 7 + 13, y * 11 + 5);
  const h3 = tileHash(x * 17 + 3, y * 19 + 7);

  const radius = TILE_SIZE * 0.33;
  const cx = screenX + TILE_SIZE * 0.5 + (h1 - 0.5) * 2.5;
  const cy = screenY + TILE_SIZE * 0.5 + (h2 - 0.5) * 2.0;
  const rot = (h3 - 0.5) * 0.22;

  // 1. Hairline Mineral Veins Radiating into Host Rock
  const veinCount = h3 > 0.45 ? 3 : 2;
  ctx.save();
  ctx.strokeStyle = style.veinColor;
  ctx.lineWidth = 1.2;
  ctx.lineCap = 'round';
  const baseVeinAngle = h1 * Math.PI * 2;
  for (let i = 0; i < veinCount; i++) {
    const va = baseVeinAngle + i * ((Math.PI * 2) / veinCount) + (h2 - 0.5) * 0.5;
    const midLen = radius * 0.95;
    const endLen = radius * (1.28 + (i % 2) * 0.22);
    const mx = Math.max(screenX + 3, Math.min(screenX + TILE_SIZE - 3, cx + Math.cos(va) * midLen));
    const my = Math.max(screenY + 3, Math.min(screenY + TILE_SIZE - 3, cy + Math.sin(va) * midLen));
    const ex = Math.max(screenX + 3, Math.min(screenX + TILE_SIZE - 3, cx + Math.cos(va + 0.18) * endLen));
    const ey = Math.max(screenY + 3, Math.min(screenY + TILE_SIZE - 3, cy + Math.sin(va + 0.18) * endLen));
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(va) * (radius * 0.55), cy + Math.sin(va) * (radius * 0.55));
    ctx.lineTo(mx, my);
    ctx.lineTo(ex, ey);
    ctx.stroke();
  }
  ctx.restore();

  // 2. Soft Alpha Aura for Rare Tiers (Zero Canvas shadowBlur overhead)
  if (style.auraRgb) {
    const pulse = 0.5 + 0.5 * Math.sin(now * 0.0045 + x * 5 + y * 9);
    ctx.fillStyle = `rgba(${style.auraRgb}, ${0.10 + pulse * 0.08})`;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 1.38, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = `rgba(${style.auraRgb}, ${0.14 + pulse * 0.10})`;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 1.05, 0, Math.PI * 2);
    ctx.fill();
  }

  // 3. Embedded Dark Socket Shadow Behind Single Crystal
  fillSocketPolygon(ctx, cx + 1.2, cy + 1.8, radius * 1.07, ore.sides, rot);

  // 4. Single Multi-Faceted Mineral Specimen
  drawFacetedPolygon(ctx, cx, cy, radius, ore.sides, style, rot, false);

  // 5. Periodic Desynchronized Specular Star Glint (Silver+)
  if (style.sparkle) {
    const twinkleWave = Math.sin(now * 0.0032 + h1 * 18 + h2 * 11);
    const twinkle = twinkleWave > 0 ? Math.pow(twinkleWave, 6) : 0;
    if (twinkle > 0.12) {
      const glintAngle = -Math.PI * 0.75 + rot * 0.5;
      const gx = cx + Math.cos(glintAngle) * (radius * 0.88);
      const gy = cy + Math.sin(glintAngle) * (radius * 0.88);
      const glintColor = ore.id === 'gold' ? '#fef9c3' : '#ffffff';
      drawStarGlint(ctx, gx, gy, 3.2 + twinkle * 2.4, Math.min(0.95, twinkle), glintColor);
    }
  }
}

/**
 * Renders the sky with dynamic Day/Night cycle, Sun/Moon orbits, drifting clouds, stars, and industrial horizon.
 */
function renderAtmosphere(
  ctx: CanvasRenderingContext2D,
  cameraY: number,
  viewportWidth: number,
  viewportHeight: number,
  surfaceScreenY: number,
  nowMs: number,
  skyParams: ReturnType<typeof getSkyParameters>
): void {
  const skyBottom = Math.max(0, surfaceScreenY);

  if (skyBottom > 0) {
    // 1. Dynamic Sky Gradient
    const skyGrad = ctx.createLinearGradient(0, -cameraY * 0.4, 0, surfaceScreenY);
    skyGrad.addColorStop(0.0, skyParams.topColor);
    skyGrad.addColorStop(1.0, skyParams.bottomColor);

    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, viewportWidth, skyBottom);

    // 2. Celestial Body: SUN (Daytime: sunrise to sunset)
    let isSunVisible = false;
    let sunProgress = 0;
    if (skyParams.cycleTime >= 0.76) {
      isSunVisible = true;
      sunProgress = (skyParams.cycleTime - 0.76) / 0.52;
    } else if (skyParams.cycleTime <= 0.28) {
      isSunVisible = true;
      sunProgress = (0.24 + skyParams.cycleTime) / 0.52;
    }

    if (isSunVisible && surfaceScreenY > 20) {
      const sunX = viewportWidth * (0.12 + 0.76 * sunProgress);
      const sunAlt = Math.sin(sunProgress * Math.PI);
      const sunY = surfaceScreenY - 35 - sunAlt * Math.max(50, surfaceScreenY * 0.65);

      ctx.save();
      // Corona glow
      const sunGlow = ctx.createRadialGradient(sunX, sunY, 8, sunX, sunY, 52);
      sunGlow.addColorStop(0.0, 'rgba(254, 240, 138, 0.85)');
      sunGlow.addColorStop(0.35, 'rgba(245, 158, 11, 0.4)');
      sunGlow.addColorStop(1.0, 'rgba(245, 158, 11, 0.0)');
      ctx.fillStyle = sunGlow;
      ctx.beginPath();
      ctx.arc(sunX, sunY, 52, 0, Math.PI * 2);
      ctx.fill();

      // Sun Core Disc
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(sunX, sunY, 15, 0, Math.PI * 2);
      ctx.fill();

      // Solar Rays
      const rayPulse = 1.0 + 0.12 * Math.sin(nowMs * 0.004);
      ctx.strokeStyle = 'rgba(254, 240, 138, 0.45)';
      ctx.lineWidth = 1.6;
      for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
        const x1 = sunX + Math.cos(angle) * 19;
        const y1 = sunY + Math.sin(angle) * 19;
        const x2 = sunX + Math.cos(angle) * (28 * rayPulse);
        const y2 = sunY + Math.sin(angle) * (28 * rayPulse);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 3. Celestial Body: MOON (Nighttime: dusk to dawn)
    if (skyParams.cycleTime >= 0.28 && skyParams.cycleTime <= 0.76 && surfaceScreenY > 20) {
      const moonProgress = (skyParams.cycleTime - 0.28) / 0.48;
      const moonX = viewportWidth * (0.12 + 0.76 * moonProgress);
      const moonAlt = Math.sin(moonProgress * Math.PI);
      const moonY = surfaceScreenY - 35 - moonAlt * Math.max(50, surfaceScreenY * 0.65);

      ctx.save();
      // Ethereal Moon Halo
      const moonGlow = ctx.createRadialGradient(moonX, moonY, 6, moonX, moonY, 44);
      moonGlow.addColorStop(0.0, 'rgba(224, 242, 254, 0.55)');
      moonGlow.addColorStop(0.45, 'rgba(186, 230, 253, 0.2)');
      moonGlow.addColorStop(1.0, 'rgba(186, 230, 253, 0.0)');
      ctx.fillStyle = moonGlow;
      ctx.beginPath();
      ctx.arc(moonX, moonY, 44, 0, Math.PI * 2);
      ctx.fill();

      // Glowing Lunar Orb
      ctx.fillStyle = '#f8fafc';
      ctx.beginPath();
      ctx.arc(moonX, moonY, 13, 0, Math.PI * 2);
      ctx.fill();

      // Minimalist crater contours
      ctx.fillStyle = 'rgba(148, 163, 184, 0.35)';
      ctx.beginPath();
      ctx.arc(moonX - 3, moonY - 3, 3, 0, Math.PI * 2);
      ctx.arc(moonX + 4, moonY + 2, 2.5, 0, Math.PI * 2);
      ctx.arc(moonX - 2, moonY + 4, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 4. Parallax Minimalist Stars (Fade out in day, twinkle in night)
    if (skyParams.night > 0.05) {
      ctx.save();
      for (const star of STARS) {
        const starScreenY = star.y - cameraY * star.speed;
        if (starScreenY >= 0 && starScreenY <= surfaceScreenY) {
          const twinkle = 0.75 + 0.25 * Math.sin(nowMs * 0.003 + star.x);
          const starAlpha = star.brightness * skyParams.night * twinkle;
          if (starAlpha > 0.02) {
            ctx.fillStyle = `rgba(255, 255, 255, ${starAlpha})`;
            ctx.fillRect(star.x, starScreenY, star.radius, star.radius);
          }
        }
      }
      ctx.restore();
    }

    // 5. Drifting Clouds (Tinted by sunlight, dusk, and moonlight)
    ctx.save();
    const cr = Math.round(255 * (1 - skyParams.night * 0.85) - skyParams.sunset * 5);
    const cg = Math.round(255 * (1 - skyParams.night * 0.82) - skyParams.sunset * 35);
    const cb = Math.round(255 * (1 - skyParams.night * 0.75) - skyParams.sunset * 80);
    const ca = Math.max(0.25, 0.85 - skyParams.night * 0.5);
    ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, ${ca})`;

    for (const cloud of CLOUDS) {
      const cloudWrap = viewportWidth + 240;
      const cloudBaseX = ((cloud.x + (nowMs / 1000) * cloud.speed) % cloudWrap) - 100;
      const cloudScreenY = cloud.y - cameraY * 0.12;

      if (cloudScreenY > -30 && cloudScreenY < surfaceScreenY + 20) {
        ctx.beginPath();
        for (const puff of cloud.puffs) {
          ctx.arc(cloudBaseX + puff.dx, cloudScreenY + puff.dy, puff.r, 0, Math.PI * 2);
        }
        ctx.fill();
      }
    }
    ctx.restore();

    // 6. Distant Mountain & Refinery Silhouettes on Horizon
    if (surfaceScreenY >= -50 && surfaceScreenY <= viewportHeight + 100) {
      ctx.save();
      const mtnR = Math.round(14 * (1 - skyParams.night * 0.3) + skyParams.sunset * 25);
      const mtnG = Math.round(45 * (1 - skyParams.night * 0.7) + skyParams.sunset * 8);
      const mtnB = Math.round(75 * (1 - skyParams.night * 0.7) - skyParams.sunset * 10);
      const mtnA = 0.58 + skyParams.night * 0.25;
      ctx.fillStyle = `rgba(${mtnR}, ${mtnG}, ${mtnB}, ${mtnA})`;

      ctx.beginPath();
      ctx.moveTo(0, surfaceScreenY);

      // Low poly mountain peaks
      const peaks = [
        [0, 12], [80, 45], [170, 20], [280, 65], [390, 25],
        [480, 50], [600, 30], [740, 75], [880, 35], [1020, 60], [1152, 20]
      ];
      for (const [px, pHeight] of peaks) {
        ctx.lineTo(px, surfaceScreenY - pHeight);
      }
      ctx.lineTo(viewportWidth, surfaceScreenY);
      ctx.closePath();
      ctx.fill();

      // Industrial refinery towers & crane silhouettes
      ctx.fillStyle = '#0a0d17';
      // Crane near fuel station (left)
      ctx.fillRect(70, surfaceScreenY - 55, 4, 55);
      ctx.fillRect(50, surfaceScreenY - 55, 45, 3);
      ctx.fillRect(85, surfaceScreenY - 55, 3, 20);

      // Antenna mast near shop (right)
      ctx.fillRect(1060, surfaceScreenY - 70, 3, 70);
      ctx.beginPath();
      ctx.arc(1061, surfaceScreenY - 70, 6, 0, Math.PI * 2);
      ctx.fill();

      // Night Aviation Warning Beacons
      if (skyParams.night > 0.2) {
        const beaconBlink = Math.sin(nowMs * 0.005) > 0;
        // Crane red beacon
        ctx.fillStyle = beaconBlink ? '#ef4444' : '#7f1d1d';
        ctx.fillRect(69, surfaceScreenY - 58, 6, 4);

        // Antenna green beacon
        ctx.fillStyle = beaconBlink ? '#22c55e' : '#14532d';
        ctx.fillRect(1058, surfaceScreenY - 78, 6, 4);
      }

      ctx.restore();
    }
  }

  // 7. Subterranean Bedrock Backdrop
  if (surfaceScreenY < viewportHeight) {
    const undergroundTop = Math.max(0, surfaceScreenY);
    ctx.fillStyle = '#0d0e12';
    ctx.fillRect(0, undergroundTop, viewportWidth, viewportHeight - undergroundTop);
  }
}

/**
 * Draws industrial station buildings above surface pads.
 */
function renderSurfaceStations(
  ctx: CanvasRenderingContext2D,
  surfaceScreenY: number,
  nightIntensity: number = 0
): void {
  if (surfaceScreenY < -80 || surfaceScreenY > 900) return;

  ctx.save();

  // --- LEFT: FUEL DEPOT SILHOUETTE (Columns 0 to 2) ---
  const fuelX = 0;
  const depotBaseY = surfaceScreenY;

  // Dual cylindrical fuel tanks
  ctx.fillStyle = '#1e293b';
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 1;

  ctx.beginPath();
  ctx.roundRect(fuelX + 10, depotBaseY - 42, 45, 42, [6, 6, 0, 0]);
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.roundRect(fuelX + 60, depotBaseY - 52, 45, 52, [6, 6, 0, 0]);
  ctx.fill();
  ctx.stroke();

  // Fuel Pipe Manifold
  ctx.fillStyle = '#0284c7';
  ctx.fillRect(fuelX + 25, depotBaseY - 22, 70, 4);

  // Digital Pump Terminal
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(fuelX + 115, depotBaseY - 32, 20, 32);
  ctx.strokeStyle = '#0284c7';
  ctx.strokeRect(fuelX + 115, depotBaseY - 32, 20, 32);

  // Glowing cyan pump screen (glows in darkness)
  if (nightIntensity > 0.2) {
    ctx.shadowColor = '#38bdf8';
    ctx.shadowBlur = 8 * nightIntensity;
  }
  ctx.fillStyle = '#38bdf8';
  ctx.fillRect(fuelX + 119, depotBaseY - 26, 12, 8);
  ctx.shadowBlur = 0;

  // --- RIGHT: MINERAL SHOP HANGAR & ANTENNA (Columns 21 to 23) ---
  const shopX = (GRID_WIDTH - 3) * TILE_SIZE; // 1008px
  const shopW = 3 * TILE_SIZE; // 144px

  // Heavy steel hangar dome
  ctx.fillStyle = '#1e293b';
  ctx.strokeStyle = '#22c55e';
  ctx.lineWidth = 1;

  ctx.beginPath();
  ctx.moveTo(shopX + 12, depotBaseY);
  ctx.lineTo(shopX + 24, depotBaseY - 48);
  ctx.lineTo(shopX + shopW - 24, depotBaseY - 48);
  ctx.lineTo(shopX + shopW - 12, depotBaseY);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Hangar Gate
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(shopX + 48, depotBaseY - 28, 48, 28);
  ctx.strokeStyle = '#15803d';
  ctx.strokeRect(shopX + 48, depotBaseY - 28, 48, 28);

  // Communication Dish Antenna
  ctx.strokeStyle = '#4ade80';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(shopX + shopW - 35, depotBaseY - 60, 10, Math.PI * 0.8, Math.PI * 1.8);
  ctx.stroke();
  ctx.fillRect(shopX + shopW - 36, depotBaseY - 60, 2, 12);

  if (nightIntensity > 0.2) {
    ctx.fillStyle = '#4ade80';
    ctx.beginPath();
    ctx.arc(shopX + shopW - 35, depotBaseY - 60, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function renderTexturedDirtBlock(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  x: number,
  y: number,
  biome: ReturnType<typeof getBiomeForDepth>,
  now: number
): void {
  const h = tileHash(x, y);
  const h2 = tileHash(x * 3 + 7, y * 5 + 11);

  ctx.fillStyle = biome.dirtColor;
  ctx.fillRect(screenX, screenY, TILE_SIZE, TILE_SIZE);

  if (h > 0.62) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.fillRect(screenX, screenY, TILE_SIZE, TILE_SIZE);
  } else if (h < 0.32) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
    ctx.fillRect(screenX, screenY, TILE_SIZE, TILE_SIZE);
  }

  ctx.strokeStyle = biome.dirtDarkColor;
  ctx.lineWidth = 0.75;
  ctx.strokeRect(screenX + 0.5, screenY + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);

  // Hash-positioned natural mineral speckles
  ctx.fillStyle = biome.dirtDarkColor;
  ctx.fillRect(screenX + 6 + Math.floor(h * 12), screenY + 8 + Math.floor(h2 * 10), 4, 3);
  ctx.fillRect(screenX + 20 + Math.floor(h2 * 12), screenY + 25 + Math.floor(h * 10), 5, 3);

  // Biome geological flavor
  if (biome.id === 'quartz' && h > 0.45) {
    ctx.fillStyle = 'rgba(192, 132, 252, 0.32)';
    ctx.fillRect(screenX + TILE_SIZE - 10, screenY + 6, 3, 5);
    ctx.fillRect(screenX + 7, screenY + TILE_SIZE - 9, 4, 3);
  } else if (biome.id === 'basalt') {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
    ctx.fillRect(screenX + 3, screenY + Math.floor(TILE_SIZE * (0.35 + h * 0.3)), TILE_SIZE - 6, 2);
  } else if (biome.id === 'magma' && h > 0.35) {
    const glow = 0.20 + 0.16 * Math.sin(now * 0.005 + x * 2 + y);
    ctx.strokeStyle = `rgba(249, 115, 22, ${glow})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(screenX + 6, screenY + TILE_SIZE - 8);
    ctx.lineTo(screenX + TILE_SIZE * 0.6, screenY + TILE_SIZE * 0.55);
    ctx.stroke();
  }
}

function renderTunnelEdgeBevels(
  ctx: CanvasRenderingContext2D,
  world: Tile[][],
  x: number,
  y: number,
  screenX: number,
  screenY: number,
  biomeHighlight: string
): void {
  if (y > SURFACE_ROW && isRevealedOpen(world, x, y - 1)) {
    ctx.fillStyle = biomeHighlight;
    ctx.fillRect(screenX, screenY, TILE_SIZE, 3);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.fillRect(screenX, screenY, TILE_SIZE, 1);
  }
  if (isRevealedOpen(world, x, y + 1)) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.fillRect(screenX, screenY + TILE_SIZE - 4, TILE_SIZE, 4);
  }
  if (isRevealedOpen(world, x - 1, y)) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.fillRect(screenX, screenY, 2.5, TILE_SIZE);
  }
  if (isRevealedOpen(world, x + 1, y)) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
    ctx.fillRect(screenX + TILE_SIZE - 3, screenY, 3, TILE_SIZE);
  }
}

function renderUnifiedSurfacePads(
  ctx: CanvasRenderingContext2D,
  surfaceScreenY: number,
  viewportHeight: number,
  now: number
): void {
  if (surfaceScreenY < -TILE_SIZE || surfaceScreenY > viewportHeight + TILE_SIZE) return;

  // Layered turf rim only across natural dirt between pads
  const turfStartX = 3 * TILE_SIZE;
  const turfWidth = Math.max(0, (GRID_WIDTH - 6) * TILE_SIZE);
  if (turfWidth > 0) {
    ctx.fillStyle = '#22c55e';
    ctx.fillRect(turfStartX, surfaceScreenY - 2, turfWidth, 4);
    ctx.fillStyle = '#4ade80';
    ctx.fillRect(turfStartX, surfaceScreenY - 2, turfWidth, 1.5);
  }

  const drawPadOverlay = (padStartCol: number, label: string, accentColor: string) => {
    const padX = padStartCol * TILE_SIZE;
    const centerTileX = (padStartCol + 1) * TILE_SIZE;

    // Centered nameplate across the 3-tile platform
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(centerTileX - 7, surfaceScreenY + 15, TILE_SIZE + 14, 16);
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(centerTileX - 7, surfaceScreenY + 15, TILE_SIZE + 14, 16);

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, centerTileX + TILE_SIZE / 2, surfaceScreenY + 23);

    // Sequential animated landing guide LEDs
    const activeLed = Math.floor(now / 280) % 3;
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i === activeLed ? accentColor : '#334155';
      ctx.beginPath();
      ctx.arc(padX + (i + 0.5) * TILE_SIZE, surfaceScreenY + TILE_SIZE - 7, 2.3, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  drawPadOverlay(0, 'İKMAL', '#38bdf8');
  drawPadOverlay(GRID_WIDTH - 3, 'ATÖLYE', '#4ade80');
}

/**
 * Renders the world grid with Fog of War (revealed tiles) and depth indicators.
 */
export function renderWorld(
  ctx: CanvasRenderingContext2D,
  world: Tile[][],
  cameraY: number,
  viewportWidth: number,
  viewportHeight: number,
  player?: PlayerExtendedState,
  remotePlayers?: Map<string, RemotePlayerState>,
  includeMiniRadar: boolean = true
): void {
  const surfaceScreenY = SURFACE_ROW * TILE_SIZE - cameraY;
  const now = performance.now();
  const skyParams = getSkyParameters(now);

  // 1. Atmosphere, celestial cycle (Sun / Moon), drifting clouds, stars, and industrial skyline
  renderAtmosphere(ctx, cameraY, viewportWidth, viewportHeight, surfaceScreenY, now, skyParams);

  // 2. Surface Station Architecture Silhouettes
  renderSurfaceStations(ctx, surfaceScreenY, skyParams.night);

  const startRow = Math.max(0, Math.floor(cameraY / TILE_SIZE));
  const endRow = Math.min(GRID_HEIGHT, Math.ceil((cameraY + viewportHeight) / TILE_SIZE) + 1);

  // 3. Tile Grid
  for (let y = startRow; y < endRow; y++) {
    const row = world[y];
    if (!row) continue;

    const screenY = y * TILE_SIZE - cameraY;
    const biome = getBiomeForDepth(y);

    for (let x = 0; x < GRID_WIDTH; x++) {
      const tile = row[x];
      const screenX = x * TILE_SIZE;

      // FOG OF WAR (Subterranean Unrevealed Layer with Soft Edge Feathering)
      if (y > SURFACE_ROW && !tile.revealed) {
        ctx.fillStyle = biome.fogColor;
        ctx.fillRect(screenX, screenY, TILE_SIZE, TILE_SIZE);

        const nearTop = y === SURFACE_ROW + 1 || isRevealedNeighbor(world, x, y - 1);
        const nearBottom = isRevealedNeighbor(world, x, y + 1);
        const nearLeft = isRevealedNeighbor(world, x - 1, y);
        const nearRight = isRevealedNeighbor(world, x + 1, y);

        if (nearTop || nearBottom || nearLeft || nearRight) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.045)';
          if (nearTop) ctx.fillRect(screenX, screenY, TILE_SIZE, 5);
          if (nearBottom) ctx.fillRect(screenX, screenY + TILE_SIZE - 5, TILE_SIZE, 5);
          if (nearLeft) ctx.fillRect(screenX, screenY, 5, TILE_SIZE);
          if (nearRight) ctx.fillRect(screenX + TILE_SIZE - 5, screenY, 5, TILE_SIZE);
        }
        continue; // Never draw ores or rocks on unrevealed tiles!
      }

      // REVEALED TILES
      switch (tile.type) {
        case TileType.EMPTY:
          if (y >= SURFACE_ROW) {
            ctx.fillStyle = '#0f1016';
            ctx.fillRect(screenX, screenY, TILE_SIZE, TILE_SIZE);
            ctx.strokeStyle = 'rgba(148, 163, 184, 0.06)';
            ctx.lineWidth = 0.5;
            ctx.strokeRect(screenX, screenY, TILE_SIZE, TILE_SIZE);

            // Subtle subterranean backwall strata
            ctx.fillStyle = 'rgba(255, 255, 255, 0.025)';
            ctx.fillRect(screenX + 4, screenY + 10, TILE_SIZE - 8, 2);
            ctx.fillRect(screenX + 10, screenY + TILE_SIZE * 0.65, TILE_SIZE - 20, 2);

            // Industrial Steel Elevator Shaft & Glowing Cyan Power Line
            if (tile.hasElevator) {
              // 1. Steel lattice guide rails (Left & Right beams)
              ctx.fillStyle = '#334155';
              ctx.fillRect(screenX + 4, screenY, 4, TILE_SIZE);
              ctx.fillRect(screenX + TILE_SIZE - 8, screenY, 4, TILE_SIZE);

              // 2. Diagonal cross-struts / metal lattice truss
              ctx.strokeStyle = 'rgba(71, 85, 105, 0.65)';
              ctx.lineWidth = 1.2;
              ctx.beginPath();
              // Top diagonal cross
              ctx.moveTo(screenX + 8, screenY + 4);
              ctx.lineTo(screenX + TILE_SIZE - 8, screenY + TILE_SIZE / 2);
              ctx.moveTo(screenX + TILE_SIZE - 8, screenY + 4);
              ctx.lineTo(screenX + 8, screenY + TILE_SIZE / 2);
              // Bottom diagonal cross
              ctx.moveTo(screenX + 8, screenY + TILE_SIZE / 2);
              ctx.lineTo(screenX + TILE_SIZE - 8, screenY + TILE_SIZE - 4);
              ctx.moveTo(screenX + TILE_SIZE - 8, screenY + TILE_SIZE / 2);
              ctx.lineTo(screenX + 8, screenY + TILE_SIZE - 4);
              ctx.stroke();

              // 3. Central Glowing Cyan Electromagnetic Energy Cable
              const cablePulse = 0.5 + 0.5 * Math.sin(now * 0.008 + y * 0.5);
              ctx.save();
              ctx.shadowColor = '#06b6d4';
              ctx.shadowBlur = 6 + cablePulse * 6;
              ctx.strokeStyle = '#22d3ee';
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.moveTo(screenX + TILE_SIZE / 2, screenY);
              ctx.lineTo(screenX + TILE_SIZE / 2, screenY + TILE_SIZE);
              ctx.stroke();

              // Super-bright core pulse node
              ctx.fillStyle = '#cffafe';
              ctx.beginPath();
              ctx.arc(screenX + TILE_SIZE / 2, screenY + TILE_SIZE / 2, 2.2, 0, Math.PI * 2);
              ctx.fill();
              ctx.restore();

              // Metallic structural joint rivets
              ctx.fillStyle = '#94a3b8';
              ctx.fillRect(screenX + 5, screenY + 2, 2, 2);
              ctx.fillRect(screenX + TILE_SIZE - 7, screenY + 2, 2, 2);
              ctx.fillRect(screenX + 5, screenY + TILE_SIZE - 4, 2, 2);
              ctx.fillRect(screenX + TILE_SIZE - 7, screenY + TILE_SIZE - 4, 2, 2);
            }
          }
          break;

        case TileType.DIRT: {
          renderTexturedDirtBlock(ctx, screenX, screenY, x, y, biome, now);
          break;
        }

        case TileType.ROCK: {
          const rockHash = tileHash(x, y);
          ctx.fillStyle = rockHash > 0.5 ? '#354357' : '#2e3b4e';
          ctx.fillRect(screenX, screenY, TILE_SIZE, TILE_SIZE);

          ctx.strokeStyle = '#4b5b73';
          ctx.lineWidth = 1.4;
          ctx.strokeRect(screenX + 1.5, screenY + 1.5, TILE_SIZE - 3, TILE_SIZE - 3);

          ctx.strokeStyle = '#1e293b';
          ctx.beginPath();
          if (rockHash > 0.35) {
            ctx.moveTo(screenX + 5, screenY + 5);
            ctx.lineTo(screenX + TILE_SIZE - 5, screenY + TILE_SIZE - 5);
          } else {
            ctx.moveTo(screenX + TILE_SIZE - 6, screenY + 6);
            ctx.lineTo(screenX + 10, screenY + TILE_SIZE - 8);
          }
          ctx.moveTo(screenX + TILE_SIZE * 0.5, screenY + TILE_SIZE * 0.5);
          ctx.lineTo(screenX + TILE_SIZE - 6, screenY + TILE_SIZE * 0.35);
          ctx.stroke();

          // Chisel indicator based on real biome-tier drill rule
          if (player) {
            const rockTier = getBlockTier(tile, y);
            const drillTier = player.upgrades.drill || 1;
            if (drillTier >= rockTier) {
              ctx.fillStyle = '#4ade80';
              ctx.fillRect(screenX + TILE_SIZE - 8, screenY + 4, 4, 4);
            } else if (drillTier === rockTier - 1) {
              ctx.fillStyle = '#facc15';
              ctx.fillRect(screenX + TILE_SIZE - 8, screenY + 4, 4, 4);
            }
          }
          break;
        }

        case TileType.GAS_POCKET: {
          // Dangerous Gas Pocket: Olive/slate crust with pulsating toxic green/yellow fissures
          ctx.fillStyle = '#1e2922';
          ctx.fillRect(screenX, screenY, TILE_SIZE, TILE_SIZE);

          const gasPulse = 0.5 + 0.5 * Math.sin(now * 0.006 + (x * 7 + y * 13));
          ctx.strokeStyle = `rgba(163, 230, 53, ${0.4 + gasPulse * 0.5})`; // Lime fissure
          ctx.lineWidth = 2;

          ctx.beginPath();
          ctx.moveTo(screenX + 8, screenY + TILE_SIZE / 2);
          ctx.lineTo(screenX + TILE_SIZE / 2, screenY + 12);
          ctx.lineTo(screenX + TILE_SIZE - 10, screenY + TILE_SIZE - 12);
          ctx.stroke();

          // Gas Bubble / Hazard Core
          ctx.fillStyle = `rgba(234, 179, 8, ${0.6 + gasPulse * 0.4})`;
          ctx.beginPath();
          ctx.arc(screenX + TILE_SIZE / 2, screenY + TILE_SIZE / 2, 5 + gasPulse * 2, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = '#14532d';
          ctx.lineWidth = 1;
          ctx.strokeRect(screenX + 0.5, screenY + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
          break;
        }

        case TileType.MAGMA_ROCK: {
          // Volcanic Magma Rock: Obsidian crust with throbbing orange/red lava veins
          ctx.fillStyle = '#240a0a';
          ctx.fillRect(screenX, screenY, TILE_SIZE, TILE_SIZE);

          const magmaPulse = 0.5 + 0.5 * Math.sin(now * 0.007 + (x * 5 + y * 11));
          ctx.strokeStyle = `rgba(239, 68, 68, ${0.5 + magmaPulse * 0.5})`;
          ctx.lineWidth = 2.5;

          // Glowing cross magma veins
          ctx.beginPath();
          ctx.moveTo(screenX + 6, screenY + 10);
          ctx.lineTo(screenX + TILE_SIZE - 6, screenY + TILE_SIZE - 10);
          ctx.moveTo(screenX + TILE_SIZE - 8, screenY + 8);
          ctx.lineTo(screenX + 8, screenY + TILE_SIZE - 8);
          ctx.stroke();

          // Molten Center Core
          ctx.fillStyle = `rgba(249, 115, 22, ${0.7 + magmaPulse * 0.3})`;
          ctx.beginPath();
          ctx.arc(screenX + TILE_SIZE / 2, screenY + TILE_SIZE / 2, 6 + magmaPulse * 2, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = '#450a0a';
          ctx.lineWidth = 1;
          ctx.strokeRect(screenX + 0.5, screenY + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
          break;
        }

        case TileType.FUEL_PAD: {
          ctx.fillStyle = '#1e293b';
          ctx.fillRect(screenX, screenY, TILE_SIZE, TILE_SIZE);
          ctx.fillStyle = '#0284c7';
          ctx.fillRect(screenX, screenY, TILE_SIZE, 4);
          ctx.fillStyle = '#0c4a6e';
          ctx.fillRect(screenX, screenY + 4, TILE_SIZE, 5);
          ctx.fillStyle = '#38bdf8';
          for (let k = 0; k < 3; k++) {
            ctx.fillRect(screenX + k * 16 + 2, screenY + 5, 6, 3);
          }
          break;
        }

        case TileType.SHOP_PAD: {
          ctx.fillStyle = '#1e293b';
          ctx.fillRect(screenX, screenY, TILE_SIZE, TILE_SIZE);
          ctx.fillStyle = '#16a34a';
          ctx.fillRect(screenX, screenY, TILE_SIZE, 4);
          ctx.fillStyle = '#14532d';
          ctx.fillRect(screenX, screenY + 4, TILE_SIZE, 5);
          ctx.fillStyle = '#4ade80';
          for (let k = 0; k < 3; k++) {
            ctx.fillRect(screenX + k * 16 + 2, screenY + 5, 6, 3);
          }
          break;
        }

        case TileType.ORE: {
          renderTexturedDirtBlock(ctx, screenX, screenY, x, y, biome, now);

          if (tile.ore) {
            renderEmbeddedOreTile(ctx, screenX, screenY, x, y, tile.ore, now);
          }
          break;
        }

        case TileType.ANCIENT_CORE: {
          // Sacred 120m Altar Tile
          ctx.fillStyle = '#180718';
          ctx.fillRect(screenX, screenY, TILE_SIZE, TILE_SIZE);

          ctx.strokeStyle = '#f43f5e';
          ctx.lineWidth = 1.8;
          ctx.strokeRect(screenX + 0.5, screenY + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);

          // Etched geometric corner brackets & faint altar ring
          ctx.strokeStyle = 'rgba(244, 63, 94, 0.55)';
          ctx.lineWidth = 1.2;
          const br = 7;
          ctx.beginPath();
          ctx.moveTo(screenX + 4, screenY + 4 + br);
          ctx.lineTo(screenX + 4, screenY + 4);
          ctx.lineTo(screenX + 4 + br, screenY + 4);
          ctx.moveTo(screenX + TILE_SIZE - 4 - br, screenY + 4);
          ctx.lineTo(screenX + TILE_SIZE - 4, screenY + 4);
          ctx.lineTo(screenX + TILE_SIZE - 4, screenY + 4 + br);
          ctx.moveTo(screenX + 4, screenY + TILE_SIZE - 4 - br);
          ctx.lineTo(screenX + 4, screenY + TILE_SIZE - 4);
          ctx.lineTo(screenX + 4 + br, screenY + TILE_SIZE - 4);
          ctx.moveTo(screenX + TILE_SIZE - 4 - br, screenY + TILE_SIZE - 4);
          ctx.lineTo(screenX + TILE_SIZE - 4, screenY + TILE_SIZE - 4);
          ctx.lineTo(screenX + TILE_SIZE - 4, screenY + TILE_SIZE - 4 - br);
          ctx.stroke();

          const cx = screenX + TILE_SIZE / 2;
          const cy = screenY + TILE_SIZE / 2;
          const pulse = 0.5 + 0.5 * Math.sin(now * 0.006);
          const coreHue = Math.floor((now * 0.07) % 360);

          ctx.strokeStyle = 'rgba(236, 72, 153, 0.28)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(cx, cy, TILE_SIZE * 0.40, 0, Math.PI * 2);
          ctx.stroke();

          ctx.save();
          // Dynamic chromatic rainbow halo (single entity on map)
          ctx.shadowColor = `hsl(${coreHue}, 95%, 65%)`;
          ctx.shadowBlur = 12 + pulse * 14;

          // Faceted 12-Gon Chromatic Outer Crown
          const outerR = TILE_SIZE * 0.41;
          const innerR = outerR * 0.48;
          const rot = now * 0.001;
          const step = (Math.PI * 2) / 12;
          const ox: number[] = [];
          const oy: number[] = [];
          const ix: number[] = [];
          const iy: number[] = [];

          for (let i = 0; i < 12; i++) {
            const a = -Math.PI / 2 + rot + i * step;
            ox.push(cx + outerR * Math.cos(a));
            oy.push(cy + outerR * Math.sin(a));
            ix.push(cx + innerR * Math.cos(a));
            iy.push(cy + innerR * Math.sin(a));
          }

          for (let i = 0; i < 12; i++) {
            const next = (i + 1) % 12;
            const midA = -Math.PI / 2 + rot + (i + 0.5) * step;
            const dot = -(Math.cos(midA) * 0.7071 + Math.sin(midA) * 0.7071);
            const hue = (coreHue + i * 18) % 360;
            const light = dot > 0.35 ? 74 : dot > -0.15 ? 58 : 38;
            ctx.fillStyle = `hsl(${hue}, 90%, ${light}%)`;
            ctx.beginPath();
            ctx.moveTo(ox[i], oy[i]);
            ctx.lineTo(ox[next], oy[next]);
            ctx.lineTo(ix[next], iy[next]);
            ctx.lineTo(ix[i], iy[i]);
            ctx.closePath();
            ctx.fill();
          }

          // Inner Chromatic Table
          ctx.beginPath();
          for (let i = 0; i < 12; i++) {
            if (i === 0) ctx.moveTo(ix[i], iy[i]);
            else ctx.lineTo(ix[i], iy[i]);
          }
          ctx.closePath();
          ctx.fillStyle = `hsl(${coreHue}, 85%, 65%)`;
          ctx.fill();

          // Dark Contrast Rim + Top-Left Specular Rim
          ctx.beginPath();
          for (let i = 0; i < 12; i++) {
            if (i === 0) ctx.moveTo(ox[i], oy[i]);
            else ctx.lineTo(ox[i], oy[i]);
          }
          ctx.closePath();
          ctx.strokeStyle = '#500724';
          ctx.lineWidth = 1.4;
          ctx.stroke();

          ctx.strokeStyle = '#fdf2f8';
          ctx.lineWidth = 1.0;
          for (let i = 0; i < 12; i++) {
            const next = (i + 1) % 12;
            const midA = -Math.PI / 2 + rot + (i + 0.5) * step;
            const dot = -(Math.cos(midA) * 0.7071 + Math.sin(midA) * 0.7071);
            if (dot > 0.25) {
              ctx.beginPath();
              ctx.moveTo(ox[i], oy[i]);
              ctx.lineTo(ox[next], oy[next]);
              ctx.stroke();
            }
          }

          ctx.shadowBlur = 0;

          // Counter-rotating sacred faceted inner crystal core
          const relicStyle = getOreVisualStyle('ancient_core');
          drawFacetedPolygon(ctx, cx, cy, TILE_SIZE * 0.19, 12, relicStyle, -now * 0.003, true);

          // Pulsing 4-point specular glint on crown
          const glintAngle = -Math.PI * 0.75 + rot * 0.4;
          drawStarGlint(
            ctx,
            cx + Math.cos(glintAngle) * (outerR * 0.85),
            cy + Math.sin(glintAngle) * (outerR * 0.85),
            4.5 + pulse * 2.0,
            0.75 + pulse * 0.25,
            '#ffffff'
          );

          ctx.restore();
          break;
        }

        case TileType.CHEST: {
          // Abandoned Miner's Supply Crate / Chest
          renderTexturedDirtBlock(ctx, screenX, screenY, x, y, biome, now);

          const pad = 6;
          const cw = TILE_SIZE - pad * 2;
          const ch = TILE_SIZE - pad * 2;
          const cx = screenX + pad;
          const cy = screenY + pad;

          // Reinforced bronze/wooden chest body
          ctx.fillStyle = '#78350f';
          ctx.fillRect(cx, cy, cw, ch);

          // Golden/brass reinforced corners and trim
          ctx.strokeStyle = '#f59e0b';
          ctx.lineWidth = 2;
          ctx.strokeRect(cx, cy, cw, ch);

          // Horizontal metal band
          ctx.fillStyle = '#b45309';
          ctx.fillRect(cx, cy + ch * 0.42, cw, 4);

          // Brass Keyhole / Clasp
          ctx.fillStyle = '#fef08a';
          ctx.fillRect(cx + cw / 2 - 3, cy + ch * 0.42 - 1, 6, 6);

          // Subtle mysterious golden beacon glow
          const chestPulse = 0.5 + 0.5 * Math.sin(now * 0.005 + (x * 3 + y * 7));
          ctx.strokeStyle = `rgba(250, 204, 21, ${0.3 + chestPulse * 0.4})`;
          ctx.lineWidth = 1;
          ctx.strokeRect(cx - 2, cy - 2, cw + 4, ch + 4);
          break;
        }
      }

      // Autotiling edge bevels & ambient shadows against open subterranean tunnels
      if (
        y >= SURFACE_ROW &&
        tile.type !== TileType.EMPTY &&
        tile.type !== TileType.FUEL_PAD &&
        tile.type !== TileType.SHOP_PAD &&
        tile.type !== TileType.ANCIENT_CORE
      ) {
        renderTunnelEdgeBevels(ctx, world, x, y, screenX, screenY, getBiomeHighlightColor(biome.id));
      }

      // Render Rare Archaeological Relic / Fossil glyph if present in revealed tile
      if (tile.relicId && (tile.type === TileType.DIRT || tile.type === TileType.ROCK)) {
        const cx = screenX + TILE_SIZE / 2;
        const cy = screenY + TILE_SIZE / 2;
        const relicPulse = 0.5 + 0.5 * Math.sin(now * 0.006 + (x * 5 + y * 13));

        ctx.save();
        ctx.shadowColor = '#f59e0b';
        ctx.shadowBlur = 8 + relicPulse * 10;

        // Amber matrix fossil nodule
        ctx.fillStyle = `rgba(245, 158, 11, ${0.28 + relicPulse * 0.25})`;
        ctx.beginPath();
        ctx.arc(cx, cy, 13, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#fef08a';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Archeological emblem glyph (golden spiral ammonite / fossil)
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(cx, cy, 7, 0, Math.PI * 1.5);
        ctx.arc(cx, cy, 4, Math.PI * 1.5, Math.PI * 3);
        ctx.stroke();

        // Center golden glint
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(cx, cy, 2, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      }

      // Progressive 3-stage fracture overlay on block currently being drilled
      if (player?.isDrilling && player.drillTarget?.gx === x && player.drillTarget?.gy === y) {
        const p = Math.max(0, Math.min(1, player.drillProgress || 0));
        const crackAlpha = 0.25 + p * 0.65;
        const jx = p > 0.68 ? (Math.random() - 0.5) * 1.6 : 0;
        const jy = p > 0.68 ? (Math.random() - 0.5) * 1.6 : 0;

        ctx.save();
        ctx.strokeStyle = `rgba(245, 158, 11, ${0.4 + p * 0.6})`;
        ctx.lineWidth = 1.5 + p;
        ctx.strokeRect(screenX + 1, screenY + 1, TILE_SIZE - 2, TILE_SIZE - 2);

        if (p > 0.05) {
          ctx.strokeStyle = `rgba(255, 255, 255, ${crackAlpha * 0.7})`;
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(screenX + 8 + jx, screenY + 8 + jy);
          ctx.lineTo(screenX + TILE_SIZE * 0.52 + jx, screenY + TILE_SIZE * 0.5 + jy);
          ctx.lineTo(screenX + TILE_SIZE - 10 + jx, screenY + TILE_SIZE * 0.3 + jy);
          ctx.stroke();
        }

        if (p > 0.35) {
          ctx.strokeStyle = `rgba(255, 255, 255, ${crackAlpha * 0.85})`;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(screenX + TILE_SIZE * 0.52 + jx, screenY + TILE_SIZE * 0.5 + jy);
          ctx.lineTo(screenX + 10 + jx, screenY + TILE_SIZE - 10 + jy);
          ctx.moveTo(screenX + TILE_SIZE * 0.45 + jx, screenY + TILE_SIZE * 0.48 + jy);
          ctx.lineTo(screenX + TILE_SIZE - 8 + jx, screenY + TILE_SIZE - 9 + jy);
          ctx.stroke();
        }

        if (p > 0.68) {
          const glowColor = player.isStruggling
            ? '#ef4444'
            : tile.ore?.color || '#f59e0b';
          ctx.strokeStyle = glowColor;
          ctx.lineWidth = 2.0;
          ctx.beginPath();
          ctx.moveTo(screenX + TILE_SIZE * 0.5 + jx, screenY + 6 + jy);
          ctx.lineTo(screenX + TILE_SIZE * 0.5 + jx, screenY + TILE_SIZE - 6 + jy);
          ctx.moveTo(screenX + 7 + jx, screenY + TILE_SIZE * 0.5 + jy);
          ctx.lineTo(screenX + TILE_SIZE - 7 + jx, screenY + TILE_SIZE * 0.5 + jy);
          ctx.stroke();

          ctx.fillStyle = `rgba(254, 240, 138, ${Math.min(0.65, (p - 0.68) * 2)})`;
          ctx.beginPath();
          ctx.arc(screenX + TILE_SIZE / 2 + jx, screenY + TILE_SIZE / 2 + jy, 4 + p * 3, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    }

    // Depth label on the margin
    if (y >= SURFACE_ROW && (y - SURFACE_ROW) % 5 === 0) {
      const depthMeters = (y - SURFACE_ROW) * 2;
      ctx.fillStyle = 'rgba(148, 163, 184, 0.35)';
      ctx.font = '10px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(`${depthMeters}m`, 4, screenY + 3);
    }
  }

  // Surface Landing Platforms (İKMAL / ATÖLYE) & Layered Horizon Rim
  renderUnifiedSurfacePads(ctx, surfaceScreenY, viewportHeight, now);

  // 4. Subterranean Ambient Biome Motes
  if (surfaceScreenY < viewportHeight) {
    renderBiomeAmbientMotes(ctx, cameraY, viewportWidth, viewportHeight, surfaceScreenY, now);
  }

  // 5. Vertical Mini-Radar Map (decoupled when called outside camera shake transform)
  if (includeMiniRadar && player) {
    renderMiniRadar(ctx, world, player, cameraY, viewportWidth, viewportHeight, remotePlayers);
  }
}

/**
 * Draws the vertical mini-radar map on the left edge of the screen.
 */
export function renderMiniRadar(
  ctx: CanvasRenderingContext2D,
  world: Tile[][],
  player: PlayerExtendedState,
  cameraY: number,
  viewportWidth: number,
  viewportHeight: number,
  remotePlayers?: Map<string, RemotePlayerState>
): void {
  const radarW = 54;
  const radarH = 252;
  const radarX = 12;
  
  // Sol kenarda konumlandırma: Masaüstünde sol-altta, mobilde dokunmatik D-pad'in hemen üzerinde
  let radarY = viewportHeight - radarH - 12;
  if (viewportWidth <= 900 && radarY + radarH > viewportHeight - 130) {
    radarY = Math.max(48, viewportHeight - radarH - 130);
  }
  const now = performance.now();

  ctx.save();

  // Glassmorphic dark card
  ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.roundRect(radarX, radarY, radarW, radarH, 5);
  ctx.fill();
  ctx.stroke();

  // Header Title
  ctx.font = 'bold 8px monospace';
  ctx.fillStyle = '#38bdf8';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('RADAR 550m', radarX + radarW / 2, radarY + 5);

  // Map canvas inside card
  const mapX = radarX + 3;
  const mapY = radarY + 18;
  const cacheW = 48;
  const cacheH = radarH - 23;
  const scaleX = 2; // 24 cols * 2 = 48px
  const scaleY = cacheH / GRID_HEIGHT; // dynamically fits 280 rows
  const currentWorldVersion = getWorldRenderVersion();

  if (
    typeof document !== 'undefined' &&
    (!radarCacheCanvas || radarCacheVersion !== currentWorldVersion || radarCacheHeight !== cacheH)
  ) {
    if (!radarCacheCanvas) {
      radarCacheCanvas = document.createElement('canvas');
    }
    if (radarCacheCanvas.width !== cacheW) radarCacheCanvas.width = cacheW;
    if (radarCacheCanvas.height !== cacheH) radarCacheCanvas.height = cacheH;

    const cCtx = radarCacheCanvas.getContext('2d');
    if (cCtx) {
      cCtx.clearRect(0, 0, cacheW, cacheH);

      // Surface sky line
      cCtx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
      cCtx.lineWidth = 0.8;
      cCtx.beginPath();
      cCtx.moveTo(0, SURFACE_ROW * scaleY);
      cCtx.lineTo(cacheW, SURFACE_ROW * scaleY);
      cCtx.stroke();

      // Subtle Geological Biome Zones & Depth Dividers (Quartz 116m, Basalt 256m, Magma 406m)
      const biomeBands = [
        { startRow: 61, endRow: 131, label: '116', line: 'rgba(192, 132, 252, 0.32)', tint: 'rgba(45, 38, 64, 0.28)' },
        { startRow: 131, endRow: 206, label: '256', line: 'rgba(163, 230, 53, 0.30)', tint: 'rgba(44, 53, 49, 0.28)' },
        { startRow: 206, endRow: GRID_HEIGHT, label: '406', line: 'rgba(249, 115, 22, 0.34)', tint: 'rgba(61, 24, 24, 0.30)' }
      ];
      for (const band of biomeBands) {
        const by = band.startRow * scaleY;
        const bh = Math.max(1, (band.endRow - band.startRow) * scaleY);
        cCtx.fillStyle = band.tint;
        cCtx.fillRect(0, by, cacheW, bh);

        cCtx.strokeStyle = band.line;
        cCtx.lineWidth = 0.7;
        cCtx.beginPath();
        cCtx.moveTo(0, by);
        cCtx.lineTo(cacheW, by);
        cCtx.stroke();

        cCtx.fillStyle = band.line;
        cCtx.font = '6px monospace';
        cCtx.textAlign = 'right';
        cCtx.textBaseline = 'top';
        cCtx.fillText(band.label, cacheW - 1, by + 1);
      }

      // Static discovered tiles & tunnels
      const tileH = Math.max(1, scaleY);
      for (let y = SURFACE_ROW; y < GRID_HEIGHT; y += 1) {
        const row = world[y];
        if (!row) continue;
        const ty = y * scaleY;

        for (let x = 0; x < GRID_WIDTH; x += 1) {
          const tile = row[x];
          if (!tile || !tile.revealed) continue;
          const tx = x * scaleX;

          if (tile.hasElevator) {
            cCtx.fillStyle = '#06b6d4';
            cCtx.fillRect(tx, ty, scaleX, tileH);
          } else if (tile.type === TileType.EMPTY) {
            cCtx.fillStyle = '#1e293b';
            cCtx.fillRect(tx, ty, scaleX, tileH);
          } else if (tile.relicId) {
            cCtx.fillStyle = '#f59e0b';
            cCtx.fillRect(tx, ty, scaleX, tileH);
          } else if (tile.type === TileType.ORE && tile.ore) {
            cCtx.fillStyle = tile.ore.color;
            cCtx.fillRect(tx, ty, scaleX, tileH);
          } else if (tile.type === TileType.CHEST) {
            cCtx.fillStyle = '#f59e0b';
            cCtx.fillRect(tx, ty, scaleX, tileH);
          } else if (tile.type === TileType.MAGMA_ROCK) {
            cCtx.fillStyle = '#ef4444';
            cCtx.fillRect(tx, ty, scaleX, tileH);
          } else if (tile.type === TileType.GAS_POCKET) {
            cCtx.fillStyle = '#a3e635';
            cCtx.fillRect(tx, ty, scaleX, tileH);
          }
        }
      }

      // Surface pads indicators
      cCtx.fillStyle = '#0284c7';
      cCtx.fillRect(0, SURFACE_ROW * scaleY - 1, 6, 2); // Fuel
      cCtx.fillStyle = '#22c55e';
      cCtx.fillRect(42, SURFACE_ROW * scaleY - 1, 6, 2); // Shop
    }
    radarCacheVersion = currentWorldVersion;
    radarCacheHeight = cacheH;
  }

  if (radarCacheCanvas) {
    ctx.drawImage(radarCacheCanvas, mapX, mapY);
  }

  // Draw Endgame Ancient Core Target Indicator at center (12, GRID_HEIGHT - 4)
  const corePulse = Math.sin(now * 0.009) > 0;
  ctx.fillStyle = corePulse ? '#f43f5e' : '#ec4899';
  ctx.fillRect(mapX + 11 * scaleX, mapY + (GRID_HEIGHT - 4) * scaleY, scaleX * 2, Math.max(2, scaleY * 2));

  // Viewport Camera Frame Box
  const camStartRow = Math.max(0, cameraY / TILE_SIZE);
  const camEndRow = Math.min(GRID_HEIGHT, (cameraY + viewportHeight) / TILE_SIZE);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.lineWidth = 1;
  ctx.strokeRect(mapX - 0.5, mapY + camStartRow * scaleY, 49, (camEndRow - camStartRow) * scaleY);

  // Blinking Remote Players Dots
  if (remotePlayers && remotePlayers.size > 0) {
    const curTime = Date.now();
    for (const rp of remotePlayers.values()) {
      if (curTime - rp.lastSeen > 8000) continue;
      const rGx = ((rp.renderX ?? rp.x) + PLAYER_WIDTH / 2) / TILE_SIZE;
      const rGy = ((rp.renderY ?? rp.y) + PLAYER_HEIGHT / 2) / TILE_SIZE;
      const rDotX = mapX + rGx * scaleX;
      const rDotY = mapY + rGy * scaleY;
      const seed = rp.id.charCodeAt(rp.id.length - 1) || 0;
      const rBlink = Math.sin(now * 0.012 + seed) > 0;
      ctx.fillStyle = rBlink ? (rp.color || '#ff7b00') : '#ffffff';
      ctx.fillRect(rDotX - 1.5, rDotY - 1.5, 3, 3);
    }
  }

  // Blinking Local Player Dot
  const playerGx = (player.x + PLAYER_WIDTH / 2) / TILE_SIZE;
  const playerGy = (player.y + PLAYER_HEIGHT / 2) / TILE_SIZE;
  const pDotX = mapX + playerGx * scaleX;
  const pDotY = mapY + playerGy * scaleY;
  const pBlink = Math.sin(now * 0.012) > 0;
  ctx.fillStyle = pBlink ? (player.color || '#38bdf8') : '#ffffff';
  ctx.fillRect(pDotX - 1.5, pDotY - 1.5, 3, 3);

  ctx.restore();
}

export interface DrillPalette {
  name: string;
  base: string;
  stroke: string;
  groove: string;
  tipGlint: string;
  aura?: string;
}

export function getDrillPalette(level: number = 1): DrillPalette {
  switch (level) {
    case 1:
      return {
        name: 'Standart Çelik',
        base: '#8E9AA6',
        stroke: '#334155',
        groove: '#4A5568',
        tipGlint: '#E2E8F0'
      };
    case 2:
      return {
        name: 'Titanyum Bronz',
        base: '#d97706',
        stroke: '#78350f',
        groove: '#92400e',
        tipGlint: '#fef08a'
      };
    case 3:
      return {
        name: 'Kobalt Safir',
        base: '#0284c7',
        stroke: '#0c4a6e',
        groove: '#0369a1',
        tipGlint: '#bae6fd'
      };
    case 4:
      return {
        name: 'Tungsten Kaya Kırıcı',
        base: '#eab308',
        stroke: '#713f12',
        groove: '#a16207',
        tipGlint: '#ffffff',
        aura: 'rgba(250, 204, 21, 0.55)'
      };
    case 5:
      return {
        name: 'Kozmik Ultra Elmas',
        base: '#d946ef',
        stroke: '#4a044e',
        groove: '#86198f',
        tipGlint: '#fdf4ff',
        aura: 'rgba(236, 72, 153, 0.7)'
      };
    default:
      return {
        name: 'Standart Çelik',
        base: '#8E9AA6',
        stroke: '#334155',
        groove: '#4A5568',
        tipGlint: '#E2E8F0'
      };
  }
}

interface MiningRigRenderParams {
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 'left' | 'right' | 'down' | 'up';
  isDrilling: boolean;
  drillProgress: number;
  isThrusting: boolean;
  drillTier: number;
  color: string;
  hullRatio?: number;
  hullLevel?: number;
  engineLevel?: number;
  radarLevel?: number;
  cargoRatio?: number;
  isStruggling?: boolean;
  isOverdrive?: boolean;
  drillBarColorOverride?: string;
}

/**
 * Shared Mecha Mining Rig renderer used for both local and remote Co-op players.
 */
function renderMiningRig(
  ctx: CanvasRenderingContext2D,
  rig: MiningRigRenderParams,
  cameraY: number,
  gameTime: number
): void {
  const screenX = rig.x;
  const screenY = rig.y - cameraY;
  const palette = getDrillPalette(rig.drillTier || 1);
  const customColor = rig.color || '#00f2fe';
  const hullRatio = rig.hullRatio ?? 1.0;
  const hullLevel = rig.hullLevel ?? 1;
  const engineLevel = rig.engineLevel ?? 1;
  const radarLevel = rig.radarLevel ?? 1;
  const cargoRatio = rig.cargoRatio;
  const isStruggling = !!rig.isStruggling;
  const isOverdrive = !!rig.isOverdrive;

  ctx.save();

  // 0. Subterranean Headlight Cone (When underground)
  if (rig.y >= SURFACE_ROW * TILE_SIZE && rig.facing !== 'up') {
    const pcx = screenX + PLAYER_WIDTH / 2;
    const pcy = screenY + PLAYER_HEIGHT / 2;
    const beamLength = 155;

    ctx.save();
    if (rig.facing === 'down') {
      const originY = screenY + PLAYER_HEIGHT - 2;
      const grad = ctx.createRadialGradient(pcx, originY, 8, pcx, originY, beamLength);
      grad.addColorStop(0.0, 'rgba(254, 240, 138, 0.38)');
      grad.addColorStop(0.3, 'rgba(254, 240, 138, 0.20)');
      grad.addColorStop(0.7, 'rgba(254, 240, 138, 0.06)');
      grad.addColorStop(1.0, 'rgba(254, 240, 138, 0.00)');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(pcx - 10, originY);
      ctx.lineTo(pcx - 72, originY + beamLength);
      ctx.lineTo(pcx + 72, originY + beamLength);
      ctx.lineTo(pcx + 10, originY);
      ctx.closePath();
      ctx.fill();
    } else if (rig.facing === 'left') {
      const originX = screenX + 2;
      const grad = ctx.createRadialGradient(originX, pcy, 8, originX, pcy, beamLength);
      grad.addColorStop(0.0, 'rgba(254, 240, 138, 0.38)');
      grad.addColorStop(0.3, 'rgba(254, 240, 138, 0.20)');
      grad.addColorStop(0.7, 'rgba(254, 240, 138, 0.06)');
      grad.addColorStop(1.0, 'rgba(254, 240, 138, 0.00)');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(originX, pcy - 10);
      ctx.lineTo(originX - beamLength, pcy - 68);
      ctx.lineTo(originX - beamLength, pcy + 68);
      ctx.lineTo(originX, pcy + 10);
      ctx.closePath();
      ctx.fill();
    } else if (rig.facing === 'right') {
      const originX = screenX + PLAYER_WIDTH - 2;
      const grad = ctx.createRadialGradient(originX, pcy, 8, originX, pcy, beamLength);
      grad.addColorStop(0.0, 'rgba(254, 240, 138, 0.38)');
      grad.addColorStop(0.3, 'rgba(254, 240, 138, 0.20)');
      grad.addColorStop(0.7, 'rgba(254, 240, 138, 0.06)');
      grad.addColorStop(1.0, 'rgba(254, 240, 138, 0.00)');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(originX, pcy - 10);
      ctx.lineTo(originX + beamLength, pcy - 68);
      ctx.lineTo(originX + beamLength, pcy + 68);
      ctx.lineTo(originX, pcy + 10);
      ctx.closePath();
      ctx.fill();
    }

    // Small headlight bulb glint
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#fef08a';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(
      rig.facing === 'left' ? screenX + 3 : rig.facing === 'right' ? screenX + PLAYER_WIDTH - 3 : pcx,
      rig.facing === 'down' ? screenY + PLAYER_HEIGHT - 3 : pcy,
      3,
      0,
      Math.PI * 2
    );
    ctx.fill();
    ctx.restore();
  }

  // 1. Dual VTOL Rocket Lift Exhaust Flames (Scale & shift to plasma cyan at engine Lv.3+)
  if (rig.isThrusting) {
    const flameHeight = 14 + (engineLevel - 1) * 2.5 + Math.random() * 9;
    const isPlasma = engineLevel >= 3;
    const isCorePlasma = engineLevel >= 5;
    const thrusterPositions = [screenX + 6, screenX + PLAYER_WIDTH - 14];

    for (const tx of thrusterPositions) {
      ctx.fillStyle = isCorePlasma ? '#22d3ee' : isPlasma ? '#38bdf8' : '#06b6d4';
      ctx.beginPath();
      ctx.moveTo(tx, screenY + PLAYER_HEIGHT - 2);
      ctx.lineTo(tx + 4, screenY + PLAYER_HEIGHT + flameHeight);
      ctx.lineTo(tx + 8, screenY + PLAYER_HEIGHT - 2);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = isPlasma ? '#bae6fd' : '#f97316';
      ctx.beginPath();
      ctx.moveTo(tx + 1.5, screenY + PLAYER_HEIGHT - 2);
      ctx.lineTo(tx + 4, screenY + PLAYER_HEIGHT + flameHeight * 0.7);
      ctx.lineTo(tx + 6.5, screenY + PLAYER_HEIGHT - 2);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = isPlasma ? '#ffffff' : '#fef08a';
      ctx.beginPath();
      ctx.moveTo(tx + 2.5, screenY + PLAYER_HEIGHT - 2);
      ctx.lineTo(tx + 4, screenY + PLAYER_HEIGHT + flameHeight * 0.4);
      ctx.lineTo(tx + 5.5, screenY + PLAYER_HEIGHT - 2);
      ctx.closePath();
      ctx.fill();
    }
  }

  // 2. Centered & Rotated Mecha Mining Rig Vehicle
  const centerX = screenX + PLAYER_WIDTH / 2;
  const centerY = screenY + PLAYER_HEIGHT / 2;

  ctx.save();
  ctx.translate(centerX, centerY);

  let rotation = 0;
  if (rig.facing === 'left') {
    rotation = Math.PI / 2;
  } else if (rig.facing === 'right') {
    rotation = -Math.PI / 2;
  }
  ctx.rotate(rotation);

  // Rear Engine Nozzle (wider & lit core at higher engine levels) & Directional Vector Boost
  const nozzleW = 12 + (engineLevel - 1) * 1.5;
  ctx.fillStyle = engineLevel >= 4 ? '#334155' : '#1A1A1A';
  ctx.fillRect(-nozzleW / 2, -16, nozzleW, 4);
  if (engineLevel >= 3) {
    ctx.fillStyle = engineLevel >= 5 ? '#38bdf8' : '#f59e0b';
    ctx.fillRect(-nozzleW / 2 + 2, -15, nozzleW - 4, 2);
  }

  if (rig.isThrusting) {
    const flicker = Math.sin(gameTime * 0.05) * 3;
    const isPlasma = engineLevel >= 3;
    ctx.beginPath();
    ctx.moveTo(-6, -15);
    ctx.lineTo(0, -25 - flicker - (engineLevel - 1) * 1.5);
    ctx.lineTo(6, -15);
    ctx.closePath();
    ctx.fillStyle = isPlasma ? 'rgba(56, 189, 248, 0.88)' : 'rgba(255, 69, 0, 0.85)';
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(-3, -15);
    ctx.lineTo(0, -20 - flicker * 0.6);
    ctx.lineTo(3, -15);
    ctx.closePath();
    ctx.fillStyle = isPlasma ? 'rgba(224, 242, 254, 0.96)' : 'rgba(255, 215, 0, 0.95)';
    ctx.fill();
  }

  // Roof Radar Antenna (Lv.3+ & active pulse arc at Lv.4-5)
  if (radarLevel >= 3) {
    ctx.save();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-7, -12);
    ctx.lineTo(-10, -21);
    ctx.stroke();

    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.arc(-10, -21, 2, 0, Math.PI * 2);
    ctx.fill();

    if (radarLevel >= 4) {
      const radarPulse = 0.5 + 0.5 * Math.sin(gameTime * 0.008);
      ctx.strokeStyle = `rgba(56, 189, 248, ${0.25 + radarPulse * 0.4})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(-10, -21, 4 + radarPulse * 4, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Alarm & Damage state check (hull < 25%)
  const isAlarmOn = hullRatio < 0.25 && (Math.floor(gameTime / 200) % 2 === 0);
  const accentColor = isAlarmOn ? '#ff3333' : customColor;
  const cockpitColor = isAlarmOn ? '#ff0000' : '#49A6E9';

  // Caterpillar Tracks
  ctx.fillStyle = '#1e242b';
  ctx.fillRect(-17, -13, 4, 22);
  ctx.fillRect(13, -13, 4, 22);

  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 1.2;
  const isMoving = Math.abs(rig.vx) > 5 || Math.abs(rig.vy) > 5 || rig.isThrusting || rig.isDrilling;
  const trackOffset = isMoving ? (gameTime * (rig.isThrusting ? 0.2 : 0.08)) % 5 : 0;
  for (let ty = -12; ty < 8; ty += 5) {
    const curY = ty + trackOffset;
    ctx.beginPath();
    ctx.moveTo(-17, curY);
    ctx.lineTo(-13, curY);
    ctx.moveTo(13, curY);
    ctx.lineTo(17, curY);
    ctx.stroke();
  }

  // Bolted Side Armor Plates & Shoulder Bumper (Hull Lv.2+)
  if (hullLevel >= 2) {
    const plateW = hullLevel >= 4 ? 5 : 3.5;
    ctx.fillStyle = hullLevel >= 4 ? '#64748b' : '#475569';
    ctx.strokeStyle = hullLevel >= 5 ? '#facc15' : '#94a3b8';
    ctx.lineWidth = 1;
    ctx.fillRect(-16 - (plateW - 3), -10, plateW, 14);
    ctx.strokeRect(-16 - (plateW - 3), -10, plateW, 14);
    ctx.fillRect(13, -10, plateW, 14);
    ctx.strokeRect(13, -10, plateW, 14);
    if (hullLevel >= 3) {
      ctx.fillStyle = hullLevel >= 5 ? '#facc15' : '#94a3b8';
      ctx.fillRect(-13, -13, 26, 2);
    }
  }

  // Main Armored Tank Chassis
  ctx.fillStyle = '#3E4A59';
  ctx.strokeStyle = rig.isDrilling ? '#f59e0b' : '#1F2937';
  ctx.lineWidth = 2;

  ctx.beginPath();
  ctx.moveTo(-13, -12);
  ctx.lineTo(13, -12);
  ctx.lineTo(13, 3);
  ctx.lineTo(7, 10);
  ctx.lineTo(-7, 10);
  ctx.lineTo(-13, 3);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Chassis Custom Color Plate
  ctx.fillStyle = customColor;
  ctx.fillRect(-10, -2, 20, 3);

  // Cargo Fill LEDs (3 miniature indicators below chassis plate)
  if (cargoRatio !== undefined) {
    const clampedRatio = Math.max(0, Math.min(1, cargoRatio));
    const litCount = clampedRatio <= 0.05 ? 0 : clampedRatio < 0.45 ? 1 : clampedRatio < 0.8 ? 2 : 3;
    const cargoLedColor =
      clampedRatio >= 0.9
        ? (Math.floor(gameTime / 180) % 2 === 0 ? '#ef4444' : '#7f1d1d')
        : clampedRatio >= 0.6
          ? '#facc15'
          : '#22c55e';
    [-4, 0, 4].forEach((lx, idx) => {
      ctx.fillStyle = idx < litCount ? cargoLedColor : '#1e293b';
      ctx.fillRect(lx - 1.2, 5.5, 2.4, 2.4);
    });
  }

  // Chassis Armor Plating & Grooves
  ctx.strokeStyle = '#2d3748';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-12, -2);
  ctx.lineTo(12, -2);
  ctx.moveTo(-7, 5);
  ctx.lineTo(7, 5);
  ctx.stroke();

  // Cockpit Visor
  ctx.fillStyle = cockpitColor;
  ctx.beginPath();
  ctx.moveTo(-5, -6);
  ctx.lineTo(5, -6);
  ctx.lineTo(7, 1);
  ctx.lineTo(-7, 1);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Visor reflection shine
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.beginPath();
  ctx.moveTo(-3, -4);
  ctx.lineTo(4, 0);
  ctx.stroke();

  // Headlights / Hazard Beacons
  ctx.fillStyle = accentColor;
  ctx.beginPath();
  ctx.arc(-9, 5, 1.8, 0, Math.PI * 2);
  ctx.arc(9, 5, 1.8, 0, Math.PI * 2);
  ctx.fill();

  // Dynamic Drill Bit
  ctx.save();
  let drillShakeX = 0;
  let drillShakeY = 0;
  if (rig.isDrilling) {
    const intensity = isStruggling ? 3.0 : 1.5;
    drillShakeX = (Math.random() - 0.5) * intensity;
    drillShakeY = Math.sin(gameTime * (isStruggling ? 0.2 : 0.1)) * (isStruggling ? 2.2 : 1.2);
  }
  ctx.translate(drillShakeX, 10 + drillShakeY);

  ctx.fillStyle = '#475569';
  ctx.fillRect(-6, 0, 12, 3);

  if (isOverdrive) {
    ctx.shadowColor = '#f97316';
    ctx.shadowBlur = 12 + Math.sin(gameTime * 0.015) * 5;
  } else if (palette.aura) {
    ctx.shadowColor = palette.aura;
    ctx.shadowBlur = 8;
  }

  ctx.fillStyle = isOverdrive ? '#ea580c' : palette.base;
  ctx.strokeStyle = isOverdrive ? '#c2410c' : palette.stroke;
  ctx.lineWidth = 1;

  ctx.beginPath();
  ctx.moveTo(-5, 3);
  ctx.lineTo(0, 15);
  ctx.lineTo(5, 3);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  const animOffset = rig.isDrilling ? (gameTime * 0.04) % 6 : 0;
  ctx.strokeStyle = isOverdrive ? '#fef08a' : palette.groove;
  ctx.lineWidth = 1.4;
  for (let i = 4; i < 12; i += 3) {
    const yPos = i + animOffset;
    if (yPos < 14) {
      const ratio = (15 - yPos) / 12;
      const width = 5 * ratio;
      ctx.beginPath();
      ctx.moveTo(-width, yPos);
      ctx.lineTo(width, yPos + 1);
      ctx.stroke();
    }
  }

  ctx.fillStyle = isOverdrive ? '#ff4500' : palette.tipGlint;
  ctx.beginPath();
  ctx.arc(0, 14, isOverdrive ? 2.2 : 1.2, 0, Math.PI * 2);
  ctx.fill();

  if (rig.isDrilling && (isStruggling || isOverdrive)) {
    const sparkCount = isStruggling ? 5 : 3;
    for (let s = 0; s < sparkCount; s++) {
      const angle = (Math.PI / 2) + (Math.random() - 0.5) * Math.PI * 0.8;
      const dist = 4 + Math.random() * (isStruggling ? 14 : 8);
      const spx = Math.cos(angle) * dist;
      const spy = 15 + Math.sin(angle) * dist;
      ctx.fillStyle = isStruggling ? (Math.random() > 0.5 ? '#facc15' : '#ef4444') : '#fb923c';
      ctx.fillRect(spx, spy, 1.5, 1.5);
    }
  }

  ctx.restore();

  if (hullRatio < 0.25 && isAlarmOn) {
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.65)';
    ctx.lineWidth = 2;
    ctx.strokeRect(-18, -18, 36, 36);
  }

  ctx.restore();

  // 3. Drilling Progress Gauge
  if (rig.isDrilling) {
    const barWidth = PLAYER_WIDTH + 6;
    const barHeight = 4;
    const barX = screenX - 3;
    const barY = screenY - 9;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(barX, barY, barWidth, barHeight);

    const barColor =
      rig.drillBarColorOverride ??
      (isStruggling ? '#f97316' : isOverdrive ? '#fb923c' : palette.base);
    ctx.fillStyle = barColor;
    ctx.fillRect(barX, barY, barWidth * Math.min(1, rig.drillProgress), barHeight);

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(barX, barY, barWidth, barHeight);
  }

  ctx.restore();
}

/**
 * Renders the Local Industrial Mecha Mining Rig Vehicle & local status overlays.
 */
export function renderPlayer(
  ctx: CanvasRenderingContext2D,
  player: PlayerExtendedState,
  cameraY: number
): void {
  const screenX = player.x;
  const screenY = player.y - cameraY;
  const gameTime = performance.now();
  const isOverdrive = (player.heat ?? 0) >= 75 && (player.heatLockoutTimer ?? 0) <= 0;

  renderMiningRig(
    ctx,
    {
      x: player.x,
      y: player.y,
      vx: player.vx,
      vy: player.vy,
      facing: player.facing,
      isDrilling: player.isDrilling,
      drillProgress: player.drillProgress,
      isThrusting: player.isThrusting,
      drillTier: player.upgrades.drill || 1,
      color: player.color || '#00f2fe',
      hullRatio: player.hull / player.maxHull,
      hullLevel: player.upgrades.hull || 1,
      engineLevel: player.upgrades.engine || 1,
      radarLevel: player.upgrades.radar || 1,
      cargoRatio: player.maxCargo > 0 ? player.cargo.length / player.maxCargo : 0,
      isStruggling: player.isStruggling,
      isOverdrive
    },
    cameraY,
    gameTime
  );

  // Airborne Fall Speed Wind Streaks & Retro-Brake Visual Cue
  if (!player.isGrounded && !player.isInElevator && !player.elevatorAuto) {
    const pcx = screenX + PLAYER_WIDTH / 2;
    if (player.vy > SAFE_LANDING_SPEED) {
      const span = Math.max(1, MAX_FALL_SPEED - SAFE_LANDING_SPEED);
      const fallRatio = Math.min(1, (player.vy - SAFE_LANDING_SPEED) / span);
      const streakLen = 10 + fallRatio * 18;
      const alpha = 0.35 + fallRatio * 0.5;
      const dangerColor = fallRatio >= 0.45 ? `rgba(239, 68, 68, ${alpha})` : `rgba(250, 204, 21, ${alpha})`;

      ctx.save();
      ctx.strokeStyle = dangerColor;
      ctx.lineWidth = 1.6;
      const leftOffsets = [-7, -2, PLAYER_WIDTH + 2, PLAYER_WIDTH + 7];
      for (let i = 0; i < leftOffsets.length; i++) {
        const phase = ((gameTime * 0.015 + i * 0.37) % 1) * 14;
        const sx = screenX + leftOffsets[i];
        const sy = screenY + PLAYER_HEIGHT - phase;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx, sy - streakLen);
        ctx.stroke();
      }
      ctx.restore();
    }

    if (player.isThrusting && player.vy > 120) {
      ctx.save();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2.2;
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(pcx, screenY + PLAYER_HEIGHT + 2, 18, Math.PI * 0.12, Math.PI * 0.88);
      ctx.stroke();
      ctx.restore();
    }
  }

  // Local drilling warning text (struggle / overdrive)
  if (player.isDrilling) {
    const barY = screenY - 9;
    if (player.isStruggling) {
      ctx.font = 'bold 8px monospace';
      ctx.fillStyle = '#f97316';
      ctx.textAlign = 'center';
      ctx.fillText('⚠️ ZORLANIYOR (%50 HIZ)', screenX + PLAYER_WIDTH / 2, barY - 3);
    } else if (isOverdrive) {
      ctx.font = 'bold 8px monospace';
      ctx.fillStyle = '#fb923c';
      ctx.textAlign = 'center';
      ctx.fillText('⚡ OVERDRIVE +%25', screenX + PLAYER_WIDTH / 2, barY - 3);
    }
  }

  // Overheat Lockout Steam Vents & Warning Alert
  if ((player.heatLockoutTimer ?? 0) > 0) {
    const pcx = screenX + PLAYER_WIDTH / 2;

    ctx.save();
    for (let i = 0; i < 5; i++) {
      const seed = (gameTime * 0.003 + i * 1.6) % 1.0;
      const sx = pcx + (Math.sin(i * 3 + gameTime * 0.003) * 12);
      const sy = screenY - seed * 26;
      const sr = 3 + seed * 7;
      const sAlpha = (1 - seed) * 0.42;
      ctx.fillStyle = `rgba(226, 232, 240, ${sAlpha})`;
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fill();
    }

    const lockoutBlink = Math.floor(gameTime / 150) % 2 === 0;
    ctx.strokeStyle = lockoutBlink ? '#ef4444' : '#f97316';
    ctx.lineWidth = 2;
    ctx.strokeRect(screenX - 2, screenY - 2, PLAYER_WIDTH + 4, PLAYER_HEIGHT + 4);

    ctx.font = 'bold 9px monospace';
    ctx.fillStyle = lockoutBlink ? '#f87171' : '#ffffff';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#ef4444';
    ctx.shadowBlur = 6;
    ctx.fillText(`🔥 HARARET KİLİDİ (${player.heatLockoutTimer.toFixed(1)}s)`, pcx, screenY - 14);
    ctx.restore();
  }

  // Electromagnetic Elevator Auto-Glide Visual FX
  if (player.elevatorAuto) {
    const pcx = screenX + PLAYER_WIDTH / 2;
    const pcy = screenY + PLAYER_HEIGHT / 2;
    const pulse = Math.sin(gameTime * 0.012) * 3;

    ctx.save();
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 1.5;
    ctx.shadowColor = '#06b6d4';
    ctx.shadowBlur = 12;

    ctx.beginPath();
    ctx.arc(pcx, pcy, 24 + pulse, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(6, 182, 212, 0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(pcx, pcy, 20 - pulse * 0.5, 0, Math.PI * 2);
    ctx.stroke();

    ctx.shadowBlur = 4;
    ctx.fillStyle = '#22d3ee';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    const textY = player.elevatorAuto === 'up' ? screenY - 12 - pulse : screenY + PLAYER_HEIGHT + 16 + pulse;
    const textStr = player.elevatorAuto === 'up' ? '▲ ASANSÖR (YUKARI)' : '▼ ASANSÖR (AŞAĞI)';
    ctx.fillText(textStr, pcx, textY);
    ctx.restore();
  }
}

/**
 * Renders all remote co-op players with smooth interpolation and offscreen edge indicators.
 */
export function renderRemotePlayers(
  ctx: CanvasRenderingContext2D,
  remotePlayers: Map<string, RemotePlayerState>,
  cameraY: number,
  viewportHeight: number = 740,
  dt: number = 0.016
): void {
  if (!remotePlayers || remotePlayers.size === 0) return;
  const gameTime = performance.now();
  const now = Date.now();
  const interpAlpha = 1 - Math.exp(-16 * Math.min(0.05, Math.max(0.001, dt)));

  for (const rp of remotePlayers.values()) {
    if (now - rp.lastSeen > 8000) continue;

    // Frame-rate independent position interpolation (snap on >200px teleports)
    if (rp.renderX === undefined || rp.renderY === undefined) {
      rp.renderX = rp.x;
      rp.renderY = rp.y;
    } else {
      const dx = rp.x - rp.renderX;
      const dy = rp.y - rp.renderY;
      if (dx * dx + dy * dy > 200 * 200) {
        rp.renderX = rp.x;
        rp.renderY = rp.y;
      } else {
        rp.renderX += dx * interpAlpha;
        rp.renderY += dy * interpAlpha;
      }
    }

    const drawX = rp.renderX;
    const drawY = rp.renderY;
    const screenY = drawY - cameraY;
    const centerX = drawX + PLAYER_WIDTH / 2;
    const customColor = rp.color || '#00f2fe';
    const depthMeters = Math.max(0, Math.floor(((drawY + PLAYER_HEIGHT / 2) / TILE_SIZE - SURFACE_ROW) * 2));

    // Offscreen Teammate Edge Indicator Pill
    if (screenY < -PLAYER_HEIGHT - 20 || screenY > viewportHeight + 20) {
      const isAbove = screenY < -PLAYER_HEIGHT - 20;
      const arrow = isAbove ? '▲' : '▼';
      const labelText = `${arrow} ${rp.name || 'Madenci'} · ${depthMeters}m`;

      ctx.save();
      ctx.font = 'bold 9px monospace';
      const textWidth = ctx.measureText(labelText).width;
      const pillW = textWidth + 12;
      const pillH = 15;
      const pillX = Math.max(12, Math.min(ctx.canvas.width - pillW - 12, centerX - pillW / 2));
      const pillY = isAbove ? 8 : viewportHeight - pillH - 8;

      ctx.fillStyle = 'rgba(15, 23, 42, 0.90)';
      ctx.strokeStyle = customColor;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.roundRect(pillX, pillY, pillW, pillH, 4);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#f8fafc';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(labelText, pillX + pillW / 2, pillY + pillH / 2);
      ctx.restore();
      continue;
    }

    renderMiningRig(
      ctx,
      {
        x: drawX,
        y: drawY,
        vx: rp.vx,
        vy: rp.vy,
        facing: rp.facing,
        isDrilling: rp.isDrilling,
        drillProgress: rp.drillProgress,
        isThrusting: rp.isThrusting,
        drillTier: rp.drillTier || 1,
        color: customColor,
        drillBarColorOverride: customColor
      },
      cameraY,
      gameTime
    );

    // Floating Nametag Pill [Name - Depth]
    const labelText = `${rp.name || 'Madenci'} - ${depthMeters}m`;
    ctx.save();
    ctx.font = 'bold 9px monospace';
    const textWidth = ctx.measureText(labelText).width;
    const pillPaddingX = 6;
    const pillW = textWidth + pillPaddingX * 2;
    const pillH = 14;
    const pillX = centerX - pillW / 2;
    const pillY = screenY - (rp.isDrilling ? 24 : 16);

    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.strokeStyle = customColor;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(pillX, pillY, pillW, pillH, 4);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#f8fafc';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(labelText, centerX, pillY + pillH / 2);
    ctx.restore();
  }
}

/**
 * Renders HUD-level screen overlays outside the camera shake transform:
 * critical edge pulse, damage vignette flash, and biome transition banner.
 */
export function renderScreenOverlays(
  ctx: CanvasRenderingContext2D,
  viewportWidth: number,
  viewportHeight: number,
  player: PlayerExtendedState
): void {
  const cx = viewportWidth / 2;
  const cy = viewportHeight / 2;
  const innerR = Math.min(viewportWidth, viewportHeight) * 0.32;
  const outerR = Math.hypot(viewportWidth, viewportHeight) * 0.55;

  // 1. Critical Warning Breathing Edge Glow (hull < 25%, heat >= 80 / lockout, or low underground fuel)
  const hullCrit = player.maxHull > 0 && player.hull / player.maxHull < 0.25;
  const heatCrit = (player.heat ?? 0) >= 80 || (player.heatLockoutTimer ?? 0) > 0;
  const isUnderground = player.y > (SURFACE_ROW + 0.5) * TILE_SIZE;
  const fuelCrit = isUnderground && player.maxFuel > 0 && player.fuel / player.maxFuel < 0.18;

  if (hullCrit || heatCrit || fuelCrit) {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const pulse = 0.06 + 0.08 * (0.5 + 0.5 * Math.sin(now * 0.007));
    const rgb = hullCrit
      ? '239, 68, 68'
      : heatCrit
        ? '249, 115, 22'
        : '245, 158, 11';

    ctx.save();
    const grad = ctx.createRadialGradient(cx, cy, innerR, cx, cy, outerR);
    grad.addColorStop(0, `rgba(${rgb}, 0)`);
    grad.addColorStop(1, `rgba(${rgb}, ${pulse})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, viewportWidth, viewportHeight);
    ctx.restore();
  }

  // 2. Impact / Thermal Damage Vignette Flash
  const flashAlpha = getDamageFlashAlpha();
  if (flashAlpha > 0.01) {
    ctx.save();
    const grad = ctx.createRadialGradient(cx, cy, innerR * 0.9, cx, cy, outerR);
    grad.addColorStop(0, 'rgba(239, 68, 68, 0)');
    grad.addColorStop(1, `rgba(220, 38, 38, ${flashAlpha})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, viewportWidth, viewportHeight);
    ctx.restore();
  }

  // 3. Top Biome Transition Banner
  const banner = getBiomeBanner();
  if (banner) {
    const elapsed = banner.maxTimer - banner.timer;
    const fadeIn = Math.min(1, elapsed / 0.35);
    const fadeOut = Math.min(1, banner.timer / 0.65);
    const alpha = Math.max(0, Math.min(1, Math.min(fadeIn, fadeOut)));
    if (alpha > 0.01) {
      const label = `◆ ${banner.name.toUpperCase()} · KATMAN ${banner.tier}`;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = 'bold 12px monospace';
      const textW = ctx.measureText(label).width;
      const pillW = Math.max(210, textW + 34);
      const pillH = 28;
      const pillX = (viewportWidth - pillW) / 2;
      const pillY = 14;

      ctx.fillStyle = 'rgba(15, 23, 42, 0.90)';
      ctx.strokeStyle = banner.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(pillX, pillY, pillW, pillH, 6);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = banner.color;
      ctx.fillRect(pillX + 10, pillY + pillH - 3, pillW - 20, 2);

      ctx.fillStyle = '#f8fafc';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, viewportWidth / 2, pillY + pillH / 2 - 1);
      ctx.restore();
    }
  }
}
