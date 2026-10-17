import { Tile, TileType } from './types';
import { TILE_SIZE, GRID_WIDTH, GRID_HEIGHT, SURFACE_ROW, getBiomeForDepth } from './constants';
import { PlayerExtendedState, PLAYER_WIDTH, PLAYER_HEIGHT } from './player';

// Parallax background stars
const STARS = Array.from({ length: 48 }, () => ({
  x: Math.random() * (GRID_WIDTH * TILE_SIZE),
  y: Math.random() * (SURFACE_ROW * TILE_SIZE - 20),
  radius: 0.7 + Math.random() * 1.3,
  brightness: 0.4 + Math.random() * 0.6,
  speed: 0.08 + Math.random() * 0.15
}));

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

/**
 * Renders the world grid with Fog of War (revealed tiles) and depth indicators.
 */
export function renderWorld(
  ctx: CanvasRenderingContext2D,
  world: Tile[][],
  cameraY: number,
  viewportWidth: number,
  viewportHeight: number,
  player?: PlayerExtendedState
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

    for (let x = 0; x < GRID_WIDTH; x++) {
      const tile = row[x];
      const screenX = x * TILE_SIZE;
      const biome = getBiomeForDepth(y);
      const now = performance.now();

      // FOG OF WAR (Subterranean Unrevealed Layer with Biome Tint)
      if (y > SURFACE_ROW && !tile.revealed) {
        // Mysterious unexplored dense earth / bedrock tinted by geological biome
        ctx.fillStyle = biome.fogColor;
        ctx.fillRect(screenX, screenY, TILE_SIZE, TILE_SIZE);

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(screenX, screenY, TILE_SIZE, TILE_SIZE);

        // Subtle dark grain pattern
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.fillRect(screenX + 10, screenY + 12, 3, 3);
        ctx.fillRect(screenX + 30, screenY + 28, 3, 3);
        continue; // Never draw ores or rocks on unrevealed tiles!
      }

      // REVEALED TILES
      switch (tile.type) {
        case TileType.EMPTY:
          if (y >= SURFACE_ROW) {
            ctx.fillStyle = '#121217';
            ctx.fillRect(screenX, screenY, TILE_SIZE, TILE_SIZE);
            ctx.strokeStyle = '#1b1b22';
            ctx.lineWidth = 0.5;
            ctx.strokeRect(screenX, screenY, TILE_SIZE, TILE_SIZE);

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
          ctx.fillStyle = biome.dirtColor;
          ctx.fillRect(screenX, screenY, TILE_SIZE, TILE_SIZE);

          ctx.strokeStyle = biome.dirtDarkColor;
          ctx.lineWidth = 1;
          ctx.strokeRect(screenX + 0.5, screenY + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);

          // Subtle natural mineral speckles
          ctx.fillStyle = biome.dirtDarkColor;
          ctx.fillRect(screenX + 8, screenY + 10, 4, 3);
          ctx.fillRect(screenX + 28, screenY + 26, 4, 3);
          break;
        }

        case TileType.ROCK: {
          ctx.fillStyle = '#334155';
          ctx.fillRect(screenX, screenY, TILE_SIZE, TILE_SIZE);

          ctx.strokeStyle = '#475569';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(screenX + 2, screenY + 2, TILE_SIZE - 4, TILE_SIZE - 4);

          ctx.strokeStyle = '#1e293b';
          ctx.beginPath();
          ctx.moveTo(screenX + 4, screenY + 4);
          ctx.lineTo(screenX + TILE_SIZE - 4, screenY + TILE_SIZE - 4);
          ctx.stroke();

          // Chisel indicator if player has drill level >= 4 (breakable!)
          if (player && player.upgrades.drill >= 4) {
            ctx.fillStyle = '#facc15';
            ctx.fillRect(screenX + TILE_SIZE - 8, screenY + 4, 4, 4);
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
          ctx.fillStyle = '#0369a1';
          ctx.fillRect(screenX, screenY, TILE_SIZE, TILE_SIZE);

          ctx.fillStyle = '#38bdf8';
          ctx.fillRect(screenX, screenY, TILE_SIZE, 6);

          ctx.fillStyle = '#f0f9ff';
          ctx.font = 'bold 11px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('FUEL', screenX + TILE_SIZE / 2, screenY + TILE_SIZE / 2);
          break;
        }

        case TileType.SHOP_PAD: {
          ctx.fillStyle = '#15803d';
          ctx.fillRect(screenX, screenY, TILE_SIZE, TILE_SIZE);

          ctx.fillStyle = '#4ade80';
          ctx.fillRect(screenX, screenY, TILE_SIZE, 6);

          ctx.fillStyle = '#f0fdf4';
          ctx.font = 'bold 11px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('SHOP', screenX + TILE_SIZE / 2, screenY + TILE_SIZE / 2);
          break;
        }

        case TileType.ORE: {
          ctx.fillStyle = biome.dirtColor;
          ctx.fillRect(screenX, screenY, TILE_SIZE, TILE_SIZE);

          ctx.strokeStyle = biome.dirtDarkColor;
          ctx.lineWidth = 1;
          ctx.strokeRect(screenX + 0.5, screenY + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);

          if (tile.ore) {
            const cx = screenX + TILE_SIZE / 2;
            const cy = screenY + TILE_SIZE / 2;
            const radius = TILE_SIZE * 0.33;

            // Rare Mineral Pulse for sides >= 6 (Gold, Emerald, Diamond)
            if (tile.ore.sides >= 6) {
              ctx.save();
              const pulse = 0.5 + 0.5 * Math.sin(now * 0.005 + (x * 7 + y * 11));
              ctx.shadowColor = tile.ore.color;
              ctx.shadowBlur = 6 + pulse * 10;

              drawPolygon(
                ctx,
                cx,
                cy,
                radius,
                tile.ore.sides,
                tile.ore.color,
                'rgba(255, 255, 255, 0.9)'
              );

              // Counter-rotating inner micro-polygon core
              drawPolygon(
                ctx,
                cx,
                cy,
                radius * 0.42,
                tile.ore.sides,
                '#ffffff',
                tile.ore.color,
                -now * 0.002
              );

              ctx.restore();
            } else {
              drawPolygon(
                ctx,
                cx,
                cy,
                radius,
                tile.ore.sides,
                tile.ore.color,
                'rgba(255, 255, 255, 0.6)'
              );
            }
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

          const cx = screenX + TILE_SIZE / 2;
          const cy = screenY + TILE_SIZE / 2;
          const pulse = 0.5 + 0.5 * Math.sin(now * 0.006);
          const coreHue = Math.floor((now * 0.07) % 360);

          ctx.save();
          // Dynamic chromatic rainbow halo
          ctx.shadowColor = `hsl(${coreHue}, 95%, 65%)`;
          ctx.shadowBlur = 12 + pulse * 14;

          // Main 12-Gon (Dodecagon) Body
          drawPolygon(
            ctx,
            cx,
            cy,
            TILE_SIZE * 0.42,
            12,
            `hsl(${coreHue}, 85%, 55%)`,
            '#ffffff',
            now * 0.001
          );

          // Counter-rotating sacred inner crystal core
          drawPolygon(
            ctx,
            cx,
            cy,
            TILE_SIZE * 0.20,
            12,
            '#ffffff',
            '#ec4899',
            -now * 0.003
          );

          ctx.restore();
          break;
        }

        case TileType.CHEST: {
          // Abandoned Miner's Supply Crate / Chest
          ctx.fillStyle = biome.dirtColor;
          ctx.fillRect(screenX, screenY, TILE_SIZE, TILE_SIZE);

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

      // Highlight block currently being drilled
      if (player?.isDrilling && player.drillTarget?.gx === x && player.drillTarget?.gy === y) {
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2;
        ctx.strokeRect(screenX + 1, screenY + 1, TILE_SIZE - 2, TILE_SIZE - 2);

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.beginPath();
        ctx.moveTo(screenX + 6, screenY + 6);
        ctx.lineTo(screenX + TILE_SIZE / 2, screenY + TILE_SIZE / 2);
        ctx.lineTo(screenX + TILE_SIZE - 8, screenY + 10);
        ctx.stroke();
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

  // Surface Ground Horizon Line
  if (surfaceScreenY >= 0 && surfaceScreenY <= viewportHeight) {
    ctx.strokeStyle = '#4ade80';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, surfaceScreenY);
    ctx.lineTo(viewportWidth, surfaceScreenY);
    ctx.stroke();
  }

  // 4. Vertical Mini-Radar Map (24x120 Grid Mini-Map on Right Side)
  if (player) {
    renderMiniRadar(ctx, world, player, cameraY, viewportWidth, viewportHeight);
  }
}

/**
 * Draws the vertical mini-radar map on the right edge of the screen.
 */
function renderMiniRadar(
  ctx: CanvasRenderingContext2D,
  world: Tile[][],
  player: PlayerExtendedState,
  cameraY: number,
  viewportWidth: number,
  viewportHeight: number
): void {
  const radarW = 54;
  const radarH = 252;
  const radarX = viewportWidth - radarW - 12;
  const radarY = viewportHeight - radarH - 12;
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
  ctx.fillText('RADAR 550m', radarX + radarW / 2, radarY + 11);

  // Map canvas inside card
  const mapX = radarX + 3;
  const mapY = radarY + 15;
  const scaleX = 2; // 24 cols * 2 = 48px
  const scaleY = (radarH - 22) / GRID_HEIGHT; // dynamically fits 280 rows

  // Surface sky line
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(mapX, mapY + SURFACE_ROW * scaleY);
  ctx.lineTo(mapX + 48, mapY + SURFACE_ROW * scaleY);
  ctx.stroke();

  // Draw discovered tiles & tunnels
  for (let y = SURFACE_ROW; y < GRID_HEIGHT; y += 1) {
    const row = world[y];
    if (!row) continue;
    const ty = mapY + y * scaleY;

    for (let x = 0; x < GRID_WIDTH; x += 1) {
      const tile = row[x];
      if (!tile || !tile.revealed) continue;
      const tx = mapX + x * scaleX;
      const tileH = Math.max(1, scaleY);

      if (tile.hasElevator) {
        ctx.fillStyle = '#06b6d4'; // Bright cyan elevator line
        ctx.fillRect(tx, ty, scaleX, tileH);
      } else if (tile.type === TileType.EMPTY) {
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(tx, ty, scaleX, tileH);
      } else if (tile.relicId) {
        ctx.fillStyle = '#f59e0b'; // Amber relic indicator
        ctx.fillRect(tx, ty, scaleX, tileH);
      } else if (tile.type === TileType.ORE && tile.ore) {
        ctx.fillStyle = tile.ore.color;
        ctx.fillRect(tx, ty, scaleX, tileH);
      } else if (tile.type === TileType.CHEST) {
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(tx, ty, scaleX, tileH);
      } else if (tile.type === TileType.MAGMA_ROCK) {
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(tx, ty, scaleX, tileH);
      } else if (tile.type === TileType.GAS_POCKET) {
        ctx.fillStyle = '#a3e635';
        ctx.fillRect(tx, ty, scaleX, tileH);
      }
    }
  }

  // Draw Endgame Ancient Core Target Indicator at center (12, GRID_HEIGHT - 4)
  const corePulse = Math.sin(now * 0.009) > 0;
  ctx.fillStyle = corePulse ? '#f43f5e' : '#ec4899';
  ctx.fillRect(mapX + 11 * scaleX, mapY + (GRID_HEIGHT - 4) * scaleY, scaleX * 2, Math.max(2, scaleY * 2));

  // Surface pads indicators
  ctx.fillStyle = '#0284c7';
  ctx.fillRect(mapX, mapY + SURFACE_ROW * scaleY - 1, 6, 2); // Fuel
  ctx.fillStyle = '#22c55e';
  ctx.fillRect(mapX + 42, mapY + SURFACE_ROW * scaleY - 1, 6, 2); // Shop

  // Viewport Camera Frame Box
  const camStartRow = Math.max(0, cameraY / TILE_SIZE);
  const camEndRow = Math.min(GRID_HEIGHT, (cameraY + viewportHeight) / TILE_SIZE);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.lineWidth = 1;
  ctx.strokeRect(mapX - 0.5, mapY + camStartRow * scaleY, 49, (camEndRow - camStartRow) * scaleY);

  // Blinking Cyan Player Dot
  const playerGx = (player.x + PLAYER_WIDTH / 2) / TILE_SIZE;
  const playerGy = (player.y + PLAYER_HEIGHT / 2) / TILE_SIZE;
  const pDotX = mapX + playerGx * scaleX;
  const pDotY = mapY + playerGy * scaleY;
  const pBlink = Math.sin(now * 0.012) > 0;
  ctx.fillStyle = pBlink ? '#38bdf8' : '#ffffff';
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

/**
 * Renders the Industrial Mecha Mining Rig Vehicle.
 */
export function renderPlayer(
  ctx: CanvasRenderingContext2D,
  player: PlayerExtendedState,
  cameraY: number
): void {
  const screenX = player.x;
  const screenY = player.y - cameraY;
  const gameTime = performance.now();

  ctx.save();

  // 0. Subterranean Headlight Cone (When underground)
  if (player.y >= SURFACE_ROW * TILE_SIZE) {
    const pcx = screenX + PLAYER_WIDTH / 2;
    const pcy = screenY + PLAYER_HEIGHT / 2;
    const beamLength = 155;

    ctx.save();
    if (player.facing === 'down') {
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
    } else if (player.facing === 'left') {
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
    } else if (player.facing === 'right') {
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
      player.facing === 'left' ? screenX + 3 : player.facing === 'right' ? screenX + PLAYER_WIDTH - 3 : pcx,
      player.facing === 'down' ? screenY + PLAYER_HEIGHT - 3 : pcy,
      3,
      0,
      Math.PI * 2
    );
    ctx.fill();
    ctx.restore();
  }

  // 1. Dual VTOL Rocket Lift Exhaust Flames (When Flying Upward)
  if (player.isThrusting) {
    const flameHeight = 14 + Math.random() * 9;
    const thrusterPositions = [screenX + 6, screenX + PLAYER_WIDTH - 14];

    for (const tx of thrusterPositions) {
      // Outer Cyan/Blue Plume
      ctx.fillStyle = '#06b6d4';
      ctx.beginPath();
      ctx.moveTo(tx, screenY + PLAYER_HEIGHT - 2);
      ctx.lineTo(tx + 4, screenY + PLAYER_HEIGHT + flameHeight);
      ctx.lineTo(tx + 8, screenY + PLAYER_HEIGHT - 2);
      ctx.closePath();
      ctx.fill();

      // Mid Orange Blast
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.moveTo(tx + 1.5, screenY + PLAYER_HEIGHT - 2);
      ctx.lineTo(tx + 4, screenY + PLAYER_HEIGHT + flameHeight * 0.7);
      ctx.lineTo(tx + 6.5, screenY + PLAYER_HEIGHT - 2);
      ctx.closePath();
      ctx.fill();

      // Inner Core Superheated Yellow
      ctx.fillStyle = '#fef08a';
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
  const drillLevel = player.upgrades.drill || 1;
  const palette = getDrillPalette(drillLevel);

  ctx.save();
  ctx.translate(centerX, centerY);

  // Rotation: default 'down' = 0, 'left' = +PI/2, 'right' = -PI/2
  let rotation = 0;
  if (player.facing === 'left') {
    rotation = Math.PI / 2;
  } else if (player.facing === 'right') {
    rotation = -Math.PI / 2;
  }
  ctx.rotate(rotation);

  // Rear Engine Nozzle & Directional Vector Boost
  ctx.fillStyle = '#1A1A1A';
  ctx.fillRect(-6, -16, 12, 4);

  if (player.isThrusting) {
    const flicker = Math.sin(gameTime * 0.05) * 3;
    // Directional outer flame
    ctx.beginPath();
    ctx.moveTo(-6, -15);
    ctx.lineTo(0, -25 - flicker);
    ctx.lineTo(6, -15);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255, 69, 0, 0.85)';
    ctx.fill();

    // Directional inner core
    ctx.beginPath();
    ctx.moveTo(-3, -15);
    ctx.lineTo(0, -20 - flicker * 0.6);
    ctx.lineTo(3, -15);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255, 215, 0, 0.95)';
    ctx.fill();
  }

  // Alarm & Damage state check (hull < 25%)
  const hullRatio = player.hull / player.maxHull;
  const isAlarmOn = hullRatio < 0.25 && (Math.floor(gameTime / 200) % 2 === 0);
  const baseGray = '#3E4A59';
  const accentColor = isAlarmOn ? '#ff3333' : '#FFD700';
  const cockpitColor = isAlarmOn ? '#ff0000' : '#49A6E9';

  // Caterpillar Tracks (Left & Right sides)
  ctx.fillStyle = '#1e242b';
  ctx.fillRect(-17, -13, 4, 22); // Left track
  ctx.fillRect(13, -13, 4, 22);  // Right track

  // Animated track tread notches
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 1.2;
  const isMoving = Math.abs(player.vx) > 5 || Math.abs(player.vy) > 5 || player.isThrusting || player.isDrilling;
  const trackOffset = isMoving ? (gameTime * (player.isThrusting ? 0.2 : 0.08)) % 5 : 0;
  for (let ty = -12; ty < 8; ty += 5) {
    const curY = ty + trackOffset;
    ctx.beginPath();
    ctx.moveTo(-17, curY);
    ctx.lineTo(-13, curY);
    ctx.moveTo(13, curY);
    ctx.lineTo(17, curY);
    ctx.stroke();
  }

  // Main Armored Tank Chassis
  ctx.fillStyle = baseGray;
  ctx.strokeStyle = player.isDrilling ? '#f59e0b' : '#1F2937';
  ctx.lineWidth = 2;

  ctx.beginPath();
  ctx.moveTo(-13, -12); // Sol arka
  ctx.lineTo(13, -12);  // Sağ arka
  ctx.lineTo(13, 3);    // Sağ ön-yan
  ctx.lineTo(7, 10);    // Sağ ön omuz
  ctx.lineTo(-7, 10);   // Sol ön omuz
  ctx.lineTo(-13, 3);   // Sol ön-yan
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Chassis Armor Plating & Grooves
  ctx.strokeStyle = '#2d3748';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-12, -2);
  ctx.lineTo(12, -2);
  ctx.moveTo(-7, 5);
  ctx.lineTo(7, 5);
  ctx.stroke();

  // Cockpit Visor (Angular Glass with Glint)
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

  // Dynamic Drill Bit with Level Palette, Overdrive & Shake
  const isOverdrive = (player.heat ?? 0) >= 75 && (player.heatLockoutTimer ?? 0) <= 0;
  ctx.save();
  let drillShakeX = 0;
  let drillShakeY = 0;
  if (player.isDrilling) {
    const intensity = player.isStruggling ? 3.0 : 1.5;
    drillShakeX = (Math.random() - 0.5) * intensity;
    drillShakeY = Math.sin(gameTime * (player.isStruggling ? 0.2 : 0.1)) * (player.isStruggling ? 2.2 : 1.2);
  }

  ctx.translate(drillShakeX, 10 + drillShakeY);

  // Drill Mount Collar
  ctx.fillStyle = '#475569';
  ctx.fillRect(-6, 0, 12, 3);

  // Glowing Aura for Level 4 & 5 or Thermal Overdrive
  if (isOverdrive) {
    ctx.shadowColor = '#f97316';
    ctx.shadowBlur = 12 + Math.sin(gameTime * 0.015) * 5;
  } else if (palette.aura) {
    ctx.shadowColor = palette.aura;
    ctx.shadowBlur = 8;
  }

  // Spiral / Serrated Conical Drill Bit with Level Color (or Overdrive incandescent tint)
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

  // Animated Spiral Grooves Narrowing Towards Tip
  const animOffset = player.isDrilling ? (gameTime * 0.04) % 6 : 0;
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

  // Sparkling Tip Glint (Superheated fiery core in Overdrive)
  ctx.fillStyle = isOverdrive ? '#ff4500' : palette.tipGlint;
  ctx.beginPath();
  ctx.arc(0, 14, isOverdrive ? 2.2 : 1.2, 0, Math.PI * 2);
  ctx.fill();

  // Violent sparks when struggling or in thermal overdrive
  if (player.isDrilling && (player.isStruggling || isOverdrive)) {
    const sparkCount = player.isStruggling ? 5 : 3;
    for (let s = 0; s < sparkCount; s++) {
      const angle = (Math.PI / 2) + (Math.random() - 0.5) * Math.PI * 0.8;
      const dist = 4 + Math.random() * (player.isStruggling ? 14 : 8);
      const spx = Math.cos(angle) * dist;
      const spy = 15 + Math.sin(angle) * dist;
      ctx.fillStyle = player.isStruggling ? (Math.random() > 0.5 ? '#facc15' : '#ef4444') : '#fb923c';
      ctx.fillRect(spx, spy, 1.5, 1.5);
    }
  }

  ctx.restore();

  // Low Hull / Critical Warning Outline (Flashing when hull < 25%)
  if (hullRatio < 0.25 && isAlarmOn) {
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.65)';
    ctx.lineWidth = 2;
    ctx.strokeRect(-18, -18, 36, 36);
  }

  ctx.restore(); // Restore vehicle translation & rotation

  // 3. Drilling Progress HUD Gauge & Warnings (Above vehicle)
  if (player.isDrilling) {
    const barWidth = PLAYER_WIDTH + 6;
    const barHeight = 4;
    const barX = screenX - 3;
    const barY = screenY - 9;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(barX, barY, barWidth, barHeight);

    const barColor = player.isStruggling ? '#f97316' : (isOverdrive ? '#fb923c' : palette.base);
    ctx.fillStyle = barColor;
    ctx.fillRect(barX, barY, barWidth * Math.min(1, player.drillProgress), barHeight);

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(barX, barY, barWidth, barHeight);

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

  // 4. Overheat Lockout Steam Vents & Warning Alert
  if ((player.heatLockoutTimer ?? 0) > 0) {
    const pcx = screenX + PLAYER_WIDTH / 2;

    ctx.save();
    // Billowing white/gray steam puffs venting out of chassis
    const steamCount = 5;
    for (let i = 0; i < steamCount; i++) {
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

    // Flashing red lockout aura box
    const lockoutBlink = Math.floor(gameTime / 150) % 2 === 0;
    ctx.strokeStyle = lockoutBlink ? '#ef4444' : '#f97316';
    ctx.lineWidth = 2;
    ctx.strokeRect(screenX - 2, screenY - 2, PLAYER_WIDTH + 4, PLAYER_HEIGHT + 4);

    // Floating lockout badge
    ctx.font = 'bold 9px monospace';
    ctx.fillStyle = lockoutBlink ? '#f87171' : '#ffffff';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#ef4444';
    ctx.shadowBlur = 6;
    ctx.fillText(`🔥 HARARET KİLİDİ (${player.heatLockoutTimer.toFixed(1)}s)`, pcx, screenY - 14);
    ctx.restore();
  }

  // 5. Electromagnetic Elevator Auto-Glide Visual FX
  if (player.elevatorAuto) {
    const pcx = screenX + PLAYER_WIDTH / 2;
    const pcy = screenY + PLAYER_HEIGHT / 2;
    const pulse = Math.sin(gameTime * 0.012) * 3;

    ctx.save();
    // Cyan electromagnetic energy halo
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 1.5;
    ctx.shadowColor = '#06b6d4';
    ctx.shadowBlur = 12;

    ctx.beginPath();
    ctx.arc(pcx, pcy, 24 + pulse, 0, Math.PI * 2);
    ctx.stroke();

    // Secondary inner pulse ring
    ctx.strokeStyle = 'rgba(6, 182, 212, 0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(pcx, pcy, 20 - pulse * 0.5, 0, Math.PI * 2);
    ctx.stroke();

    // Floating directional badge
    ctx.shadowBlur = 4;
    ctx.fillStyle = '#22d3ee';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    const textY = player.elevatorAuto === 'up' ? screenY - 12 - pulse : screenY + PLAYER_HEIGHT + 16 + pulse;
    const textStr = player.elevatorAuto === 'up' ? '▲ ASANSÖR (YUKARI)' : '▼ ASANSÖR (AŞAĞI)';
    ctx.fillText(textStr, pcx, textY);
    ctx.restore();
  }

  ctx.restore();
}
