import { PlayerState, Tile, TileType, OreDefinition, ConsumableInventory } from './types';
import {
  TILE_SIZE,
  GRID_WIDTH,
  GRID_HEIGHT,
  SURFACE_ROW,
  DEFAULT_RADAR_RADIUS,
  SAFE_LANDING_SPEED,
  FALL_DAMAGE_MAX_BASE,
  FALL_DAMAGE_EXPONENT,
  FALL_BRAKE_MULTIPLIER,
  CONSUMABLES,
  BASE_ELEVATOR_SPEED,
  RELIC_DEFINITIONS,
  MAGMA_NO_RAIL_START_ROW,
  GAS_POCKET_BASE_DAMAGE,
  GAS_POCKET_HEAT_SPIKE,
  MAGMA_ROCK_BASE_DAMAGE,
  MAGMA_ROCK_HEAT_SPIKE,
  MAGMA_PROXIMITY_HEAT_RATE,
  MAGMA_AMBIENT_HEAT_RATE,
  getBiomeForDepth,
  getBiomeTier,
  getUpgradeLevelValue,
  getMaxFlySpeed
} from './constants';
import { revealTilesAround, revealAdjacentTiles, markWorldDirty } from './world';
import { sounds } from './audio';
import {
  addFloatingText,
  addShockwave,
  spawnBlockBreakBurst,
  spawnSparkBurst,
  spawnDustPuff,
  addScreenShake,
  addDamageFlash,
  spawnParticle
} from './effects';
import { checkAndTriggerFallingRock } from './boulders';
import { emitGameEvent } from './events';

let drillChipTimer = 0;
let thrustDustTimer = 0;
let lastRailWarnTime = 0;

function getTileParticleColor(tile: Tile, gy: number): string {
  switch (tile.type) {
    case TileType.ROCK:
      return '#64748b';
    case TileType.BEDROCK:
      return '#334155';
    case TileType.ORE:
      return tile.ore?.color || '#facc15';
    case TileType.GAS_POCKET:
      return '#a3e635';
    case TileType.MAGMA_ROCK:
      return '#f97316';
    case TileType.CHEST:
      return '#f59e0b';
    case TileType.ANCIENT_CORE:
      return '#ec4899';
    default:
      return getBiomeForDepth(gy).dirtColor;
  }
}

export const PLAYER_WIDTH = 38;
export const PLAYER_HEIGHT = 38;

export const GRAVITY = 600; // px/s^2
export const MOVE_SPEED = 190; // px/s
export const MAX_FALL_SPEED = 760; // px/s (10-block cliff terminal velocity: sqrt(2 * 600 * 480px) = 758.9 px/s)
export const MAX_FLY_SPEED = -280; // px/s
export const BASE_THRUSTER_POWER = 1500; // px/s^2
export const THRUST_FUEL_DRAIN = 4.2; // fuel/sec
export const DRILL_FUEL_DRAIN = 2.4; // fuel/sec
export const IDLE_FUEL_DRAIN = 0.35; // subterranean idle fuel/sec

export type FacingDirection = 'left' | 'right' | 'down';

export interface UpgradeTiers {
  drill: number;
  fuelTank: number;
  cargo: number;
  engine: number;
  radar: number;
  hull: number;
  radiator: number;
}

export interface PlayerExtendedState extends PlayerState {
  isGrounded: boolean;
  facing: FacingDirection;
  isThrusting: boolean;
  upgrades: UpgradeTiers;
  startDrillX: number;
  startDrillY: number;
  lastValidX: number;
  lastValidY: number;
  elevatorAuto?: 'up' | 'down' | null;
  elevatorCol?: number;
  isInElevator?: boolean;
}

export function createPlayer(): PlayerExtendedState {
  const startGx = Math.floor(GRID_WIDTH / 2);
  const startX = startGx * TILE_SIZE + (TILE_SIZE - PLAYER_WIDTH) / 2;
  const startY = (SURFACE_ROW - 1) * TILE_SIZE + (TILE_SIZE - PLAYER_HEIGHT);
  const initialFuel = getUpgradeLevelValue('fuelTank', 1);

  return {
    x: startX,
    y: startY,
    vx: 0,
    vy: 0,
    fuel: initialFuel,
    maxFuel: initialFuel,
    hull: 100,
    maxHull: 100,
    cargo: [] as OreDefinition[],
    maxCargo: 10,
    money: 0,
    drillSpeed: 1.25,
    thrusterPower: BASE_THRUSTER_POWER,
    radarRadius: DEFAULT_RADAR_RADIUS,
    isDrilling: false,
    drillProgress: 0,
    drillTarget: null,
    isGrounded: true,
    facing: 'down',
    isThrusting: false,
    upgrades: {
      drill: 1,
      fuelTank: 1,
      cargo: 1,
      engine: 1,
      radar: 1,
      hull: 1,
      radiator: 1
    },
    inventory: {
      fuelCanister: 0,
      repairKit: 0,
      teleporter: 0,
      dynamite: 0,
      elevatorRails: 0
    },
    heat: 0,
    maxHeat: 100,
    heatLockoutTimer: 0,
    isStruggling: false,
    discoveredRelics: [],
    museumRewardClaimed: false,
    elevatorAuto: null,
    elevatorCol: undefined,
    isInElevator: false,
    startDrillX: startX,
    startDrillY: startY,
    lastValidX: startX,
    lastValidY: startY
  };
}

/**
 * Awards a unique museum relic and plays ceremonial fanfare.
 */
export function awardRelic(player: PlayerExtendedState, relicId: string): void {
  if (!player.discoveredRelics) player.discoveredRelics = [];

  const def = RELIC_DEFINITIONS[relicId];
  if (!def) return;

  if (player.discoveredRelics.includes(relicId)) {
    // Duplicate fossil found! Give cash reward and feedback
    const duplicateBonus = 350;
    player.money += duplicateBonus;
    sounds.playSellSound();
    addFloatingText(
      player.x + PLAYER_WIDTH / 2,
      player.y - 20,
      `🏛️ Çift Fosil (${def.name})! +$${duplicateBonus} (Müzeye Satıldı)`,
      '#f59e0b'
    );
    addShockwave(player.x + PLAYER_WIDTH / 2, player.y + PLAYER_HEIGHT / 2, 35, '#f59e0b');
    emitGameEvent('polyminer:wallet-changed', {
      changeAmount: duplicateBonus,
      reason: `Çift Fosil (${def.name})`
    });
    return;
  }

  // First-time discovery!
  const firstFindBonus = 500;
  player.money += firstFindBonus;
  player.discoveredRelics.push(relicId);
  sounds.playRelicFound();
  addFloatingText(
    player.x + PLAYER_WIDTH / 2,
    player.y - 20,
    `🏛️ ${def.name}! +$${firstFindBonus} & ${def.buffLabel}`,
    def.color
  );
  addShockwave(player.x + PLAYER_WIDTH / 2, player.y + PLAYER_HEIGHT / 2, 50, def.color);
  spawnSparkBurst(player.x + PLAYER_WIDTH / 2, player.y + PLAYER_HEIGHT / 2, def.color, 18, 150);
  emitGameEvent('polyminer:relic-discovered', { relicId });
  emitGameEvent('polyminer:wallet-changed', {
    changeAmount: firstFindBonus,
    reason: `${def.name} Keşfi`
  });
}

/**
 * Checks if mined tile contains a pre-seeded archaeological relic (lottery removed).
 */
export function checkAndAwardRelicAt(player: PlayerExtendedState, tile: Tile, _gy: number): void {
  if (tile.relicId) {
    awardRelic(player, tile.relicId);
    delete tile.relicId;
  }
}

/**
 * Deploys an industrial elevator rail in current empty cell (disabled in Magma Biome 4 thermal zone).
 */
export function deployElevatorRail(player: PlayerExtendedState, world: Tile[][]): boolean {
  if (player.inventory.elevatorRails <= 0) {
    addFloatingText(player.x + PLAYER_WIDTH / 2, player.y - 14, 'Asansör Rayı Yok!', '#ef4444');
    return false;
  }

  const pMidGx = Math.floor((player.x + PLAYER_WIDTH / 2) / TILE_SIZE);
  const pMidGy = Math.floor((player.y + PLAYER_HEIGHT / 2) / TILE_SIZE);

  if (pMidGy < SURFACE_ROW || pMidGy >= GRID_HEIGHT || pMidGx < 0 || pMidGx >= GRID_WIDTH) {
    return false;
  }

  if (pMidGy >= MAGMA_NO_RAIL_START_ROW) {
    const now = performance.now();
    if (now - lastRailWarnTime > 900) {
      lastRailWarnTime = now;
      sounds.playClank();
      addFloatingText(
        player.x + PLAYER_WIDTH / 2,
        player.y - 16,
        '🌋 MAGMA ISISINDA RAY ERİR! (4. Katmanda Kurulamaz)',
        '#f97316'
      );
    }
    return false;
  }

  const tile = world[pMidGy]?.[pMidGx];
  if (!tile) return false;

  if (tile.type !== TileType.EMPTY) {
    addFloatingText(player.x + PLAYER_WIDTH / 2, player.y - 14, 'Yalnızca Boş Tünele Kurulabilir!', '#facc15');
    return false;
  }

  if (tile.hasElevator) {
    return false;
  }

  tile.hasElevator = true;
  player.inventory.elevatorRails--;
  markWorldDirty();
  sounds.playElevatorDeploy();
  addFloatingText(player.x + PLAYER_WIDTH / 2, player.y - 14, '🔩 ASANSÖR RAYI KURULDU!', '#06b6d4');
  addShockwave(pMidGx * TILE_SIZE + TILE_SIZE / 2, pMidGy * TILE_SIZE + TILE_SIZE / 2, 28, '#06b6d4');

  emitGameEvent('polyminer:tile-changed', {
    gx: pMidGx,
    gy: pMidGy,
    tileType: TileType.EMPTY,
    hasElevator: true
  });
  return true;
}

/**
 * Calculates armor damage reduction multiplier based on hull upgrade level (1-5).
 * Level 1: 1.0 (100% damage)
 * Level 2: 0.90 (-10% damage)
 * Level 3: 0.80 (-20% damage)
 * Level 4: 0.70 (-30% damage)
 * Level 5: 0.60 (-40% damage)
 */
export function getDamageReductionFactor(hullLevel: number = 1): number {
  return Math.max(0.60, 1.0 - (Math.max(1, hullLevel) - 1) * 0.10);
}

/**
 * Computes fall damage using a smooth power curve above SAFE_LANDING_SPEED,
 * scaled by hull armor upgrades and the Obsidian Tablet relic.
 */
export function computeFallDamage(
  impactSpeed: number,
  hullLevel: number = 1,
  hasObsidianTablet: boolean = false
): number {
  if (impactSpeed <= SAFE_LANDING_SPEED) return 0;
  const span = Math.max(1, MAX_FALL_SPEED - SAFE_LANDING_SPEED);
  const ratio = Math.min(1, (impactSpeed - SAFE_LANDING_SPEED) / span);
  const baseDamage = FALL_DAMAGE_MAX_BASE * Math.pow(ratio, FALL_DAMAGE_EXPONENT);
  const armorFactor = getDamageReductionFactor(hullLevel) * (hasObsidianTablet ? 0.75 : 1.0);
  return Math.round(baseDamage * armorFactor);
}

/**
 * Active cooling rates and heat absorption resistance for Radiator tiers (1-5).
 */
export function getRadiatorSpecs(level: number = 1): {
  coolingRate: number;
  heatAbsorptionMult: number;
  name: string;
} {
  switch (level) {
    case 1:
      return { coolingRate: 20, heatAbsorptionMult: 1.0, name: 'Standart Fan' };
    case 2:
      return { coolingRate: 28, heatAbsorptionMult: 0.90, name: 'Çift Sıvı Soğutma' };
    case 3:
      return { coolingRate: 38, heatAbsorptionMult: 0.80, name: 'Termoelektrik Radyatör' };
    case 4:
      return { coolingRate: 50, heatAbsorptionMult: 0.70, name: 'Kriyojenik Kalkan' };
    case 5:
      return { coolingRate: 65, heatAbsorptionMult: 0.60, name: 'Plazma Isı Emici' };
    default:
      return { coolingRate: 20, heatAbsorptionMult: 1.0, name: 'Standart Fan' };
  }
}

export function isSolidTile(world: Tile[][], gx: number, gy: number): boolean {
  if (gx < 0 || gx >= GRID_WIDTH) return true;
  if (gy < 0) return false;
  if (gy >= GRID_HEIGHT) return true;

  const row = world[gy];
  if (!row) return true;
  const tile = row[gx];
  if (!tile) return true;

  return tile.type !== TileType.EMPTY;
}

export function checkCollision(world: Tile[][], x: number, y: number, w: number, h: number): boolean {
  const left = Math.floor(x / TILE_SIZE);
  const right = Math.floor((x + w - 0.01) / TILE_SIZE);
  const top = Math.floor(y / TILE_SIZE);
  const bottom = Math.floor((y + h - 0.01) / TILE_SIZE);

  for (let gy = top; gy <= bottom; gy++) {
    for (let gx = left; gx <= right; gx++) {
      if (isSolidTile(world, gx, gy)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Detects if the player is within or adjacent to an active elevator rail shaft.
 */
export function findNearbyElevatorTile(player: PlayerState, world: Tile[][]): { gx: number; gy: number } | null {
  const w = PLAYER_WIDTH;
  const h = PLAYER_HEIGHT;

  // 1. Center of player
  const midGx = Math.floor((player.x + w / 2) / TILE_SIZE);
  const midGy = Math.floor((player.y + h / 2) / TILE_SIZE);
  if (world[midGy]?.[midGx]?.hasElevator) {
    return { gx: midGx, gy: midGy };
  }

  // 2. Overlapping tiles (corners with small inset)
  const left = Math.floor((player.x + 3) / TILE_SIZE);
  const right = Math.floor((player.x + w - 3) / TILE_SIZE);
  const top = Math.floor((player.y + 3) / TILE_SIZE);
  const bottom = Math.floor((player.y + h - 3) / TILE_SIZE);
  for (let r = top; r <= bottom; r++) {
    for (let c = left; c <= right; c++) {
      if (world[r]?.[c]?.hasElevator) {
        return { gx: c, gy: r };
      }
    }
  }

  // 3. Directly under player's feet (e.g. standing on ground right above or in elevator)
  const footGy = Math.floor((player.y + h + 2) / TILE_SIZE);
  if (world[footGy]?.[midGx]?.hasElevator) {
    return { gx: midGx, gy: footGy };
  }

  // 4. Directly above player's head
  const headGy = Math.floor((player.y - 2) / TILE_SIZE);
  if (world[headGy]?.[midGx]?.hasElevator) {
    return { gx: midGx, gy: headGy };
  }

  return null;
}

/**
 * Triggers automatic hands-free elevator gliding along the rail shaft.
 */
export function startElevatorAutoGlide(
  player: PlayerExtendedState,
  world: Tile[][],
  direction: 'up' | 'down'
): boolean {
  const elev = findNearbyElevatorTile(player, world);
  if (!elev) {
    return false;
  }

  const targetCol = elev.gx;
  const currentGy = Math.floor((player.y + PLAYER_HEIGHT / 2) / TILE_SIZE);

  if (direction === 'up') {
    if (currentGy <= SURFACE_ROW && player.y <= SURFACE_ROW * TILE_SIZE) {
      addFloatingText(player.x + PLAYER_WIDTH / 2, player.y - 14, 'Zaten Yüzeydesiniz!', '#facc15');
      return false;
    }
  } else {
    const nextGy = currentGy + 1;
    if (nextGy >= GRID_HEIGHT || (isSolidTile(world, targetCol, nextGy) && !world[nextGy]?.[targetCol]?.hasElevator)) {
      addFloatingText(player.x + PLAYER_WIDTH / 2, player.y - 14, 'Aşağı Hat Kapalı!', '#ef4444');
      return false;
    }
  }

  player.elevatorAuto = direction;
  player.elevatorCol = targetCol;

  // Center vehicle horizontally inside the elevator shaft
  const shaftCenterX = targetCol * TILE_SIZE + (TILE_SIZE - PLAYER_WIDTH) / 2;
  player.x = shaftCenterX;
  player.vx = 0;
  player.isDrilling = false;
  player.drillTarget = null;
  player.isThrusting = false;
  sounds.stopThrust();
  sounds.stopDrill();

  sounds.playElevatorChime('start');
  sounds.startElevatorHum();

  const text = direction === 'up' ? '▲ OTOMATİK ASANSÖR (YUKARI)' : '▼ OTOMATİK ASANSÖR (AŞAĞI)';
  addFloatingText(player.x + PLAYER_WIDTH / 2, player.y - 16, text, '#22d3ee');
  addShockwave(player.x + PLAYER_WIDTH / 2, player.y + PLAYER_HEIGHT / 2, 35, '#22d3ee');
  return true;
}

export function openChest(
  player: PlayerExtendedState,
  world: Tile[][],
  gx: number,
  gy: number
): void {
  const targetTile = world[gy]?.[gx];
  if (!targetTile || targetTile.type !== TileType.CHEST) return;

  const isBasaltOrDeeper = gy >= 130;
  const minCash = isBasaltOrDeeper ? 400 : 150;
  const maxCash = isBasaltOrDeeper ? 750 : 300;
  const cashReward = Math.floor(Math.random() * (maxCash - minCash + 1)) + minCash;
  player.money += cashReward;

  const pool = ['repairKit', 'dynamite', 'teleporter', 'fuelCanister'] as const;
  const granted = pool[Math.floor(Math.random() * pool.length)];
  player.inventory[granted]++;

  sounds.playVictoryFanfare();
  const chestX = gx * TILE_SIZE + TILE_SIZE / 2;
  const chestY = gy * TILE_SIZE + TILE_SIZE / 2;
  spawnSparkBurst(chestX, chestY, '#facc15', 18, 160);
  addScreenShake(2.5, 0.12);
  addFloatingText(
    chestX,
    chestY - 12,
    `📦 TERK EDİLMİŞ SANDIK! +$${cashReward}`,
    '#facc15'
  );
  addFloatingText(
    chestX,
    chestY + 8,
    `+1 ${CONSUMABLES[granted].name}`,
    '#4ade80'
  );

  // Clear block
  targetTile.type = TileType.EMPTY;
  delete targetTile.ore;
  targetTile.hardness = 0;
  targetTile.revealed = true;
  markWorldDirty();

  revealAdjacentTiles(world, gx, gy);
  checkAndTriggerFallingRock(world, gx, gy);

  emitGameEvent('polyminer:wallet-changed', {
    changeAmount: cashReward,
    reason: 'Terk Edilmiş Sandık'
  });
  emitGameEvent('polyminer:tile-changed', {
    gx,
    gy,
    tileType: TileType.EMPTY
  });
}

/**
 * Calculates the required tier (1-5) for a given block based on Biome depth and material.
 * Rocks are always Biome Tier + 1. Ancient Core is Tier 5.
 */
export function getBlockTier(tile: Tile, gy: number): number {
  if (tile.type === TileType.ANCIENT_CORE) {
    return 5;
  }
  const biomeTier = getBiomeTier(gy);
  if (tile.type === TileType.ROCK) {
    return biomeTier + 1;
  }
  return biomeTier;
}

export function canDrillBlock(tile: Tile | null | undefined, drillLevel: number, gy?: number): boolean {
  if (
    !tile ||
    tile.type === TileType.EMPTY ||
    tile.type === TileType.FUEL_PAD ||
    tile.type === TileType.SHOP_PAD ||
    !Number.isFinite(tile.hardness)
  ) {
    return false;
  }
  if (gy === undefined) return true;
  const blockTier = getBlockTier(tile, gy);
  // Condition C: drillLevel < blockTier - 1 is locked.
  // Drill can mine if drillLevel >= blockTier - 1 (Condition B struggle or Condition A normal/bonus).
  return drillLevel >= (blockTier - 1);
}

/**
 * Triggers engine overheat lockout (2.5s), rolls back any active drill, and applies armor-scaled hull damage.
 */
export function triggerOverheatLockout(player: PlayerExtendedState): void {
  if (player.isDrilling) {
    player.x = player.startDrillX;
    player.y = player.startDrillY;
  }
  player.heat = 100;
  player.heatLockoutTimer = 2.5;
  const tabletMult = player.discoveredRelics?.includes('obsidian_tablet') ? 0.75 : 1.0;
  const damage = Math.max(1, Math.round(15 * getDamageReductionFactor(player.upgrades.hull) * tabletMult));
  player.hull = Math.max(0, player.hull - damage);
  sounds.playSteamSizzle();
  sounds.playImpactSound(damage);
  addFloatingText(
    player.x + PLAYER_WIDTH / 2,
    player.y - 18,
    `🔥 MOTOR HARARET YAPTI! -${damage} CAN`,
    '#ef4444'
  );
  addShockwave(player.x + PLAYER_WIDTH / 2, player.y + PLAYER_HEIGHT / 2, 40, '#ef4444');
  addScreenShake(5.5, 0.24);
  addDamageFlash(0.35);
  spawnDustPuff(player.x + PLAYER_WIDTH / 2, player.y, '#e2e8f0', 8);
  player.isDrilling = false;
  player.isStruggling = false;
  player.drillProgress = 0;
  player.drillTarget = null;
  player.isThrusting = false;
  sounds.stopDrill();
  sounds.stopThrust();
}

export function updatePlayer(
  player: PlayerExtendedState,
  world: Tile[][],
  keys: Record<string, boolean>,
  dt: number,
  disableInput: boolean = false
): void {
  const w = PLAYER_WIDTH;
  const h = PLAYER_HEIGHT;

  // Unstuck safeguard: If inside solid geometry while not drilling, rollback to last valid empty space
  if (!player.isDrilling) {
    if (checkCollision(world, player.x, player.y, w, h)) {
      if (!checkCollision(world, player.lastValidX, player.lastValidY, w, h)) {
        player.x = player.lastValidX;
        player.y = player.lastValidY;
        player.vx = 0;
        player.vy = 0;
      } else {
        towPlayerToSurface(player, 'stuck');
        return;
      }
    } else {
      player.lastValidX = player.x;
      player.lastValidY = player.y;
    }
  }

  // Active Radar Revelation around player
  revealTilesAround(world, player.x + w / 2, player.y + h / 2, player.radarRadius, TILE_SIZE);

  if (disableInput) {
    player.vx = 0;
    player.vy = 0;
    if (player.isThrusting) {
      player.isThrusting = false;
      sounds.stopThrust();
    }
    if (player.isDrilling) {
      player.x = player.startDrillX;
      player.y = player.startDrillY;
      player.isDrilling = false;
      player.isStruggling = false;
      player.drillProgress = 0;
      player.drillTarget = null;
      sounds.stopDrill();
    }
    if (player.elevatorAuto) {
      player.elevatorAuto = null;
      sounds.stopElevatorHum();
    }
    return;
  }

  const upKey = !!(keys['ArrowUp'] || keys['KeyW'] || keys['w'] || keys['W']);
  const downKey = !!(keys['ArrowDown'] || keys['KeyS'] || keys['s'] || keys['S']);
  const leftKey = !!(keys['ArrowLeft'] || keys['KeyA'] || keys['a'] || keys['A']);
  const rightKey = !!(keys['ArrowRight'] || keys['KeyD'] || keys['d'] || keys['D']);

  // 1. DRILLING STATE MACHINE
  if (player.isDrilling && player.drillTarget) {
    const { gx, gy } = player.drillTarget;
    const targetTile = world[gy]?.[gx];

    let keyStillHeld = false;
    if (player.facing === 'down' && downKey) keyStillHeld = true;
    if (player.facing === 'left' && leftKey) keyStillHeld = true;
    if (player.facing === 'right' && rightKey) keyStillHeld = true;

    // SAFE ABORT: Instant rollback to starting empty tile
    if (upKey || !keyStillHeld || player.fuel <= 0 || player.heatLockoutTimer > 0 || !canDrillBlock(targetTile, player.upgrades.drill, gy)) {
      player.x = player.startDrillX;
      player.y = player.startDrillY;
      player.isDrilling = false;
      player.isStruggling = false;
      player.drillProgress = 0;
      player.drillTarget = null;
      sounds.stopDrill();
      return;
    }

    // Keep drill sound playing
    sounds.startDrill();

    const targetCenterPxX = gx * TILE_SIZE + (TILE_SIZE - w) / 2;
    const targetCenterPxY = gy * TILE_SIZE + (TILE_SIZE - h) / 2;
    const lerpSpeed = Math.min(1, dt * 5.0);

    player.x += (targetCenterPxX - player.x) * lerpSpeed;
    player.y += (targetCenterPxY - player.y) * lerpSpeed;
    player.vx = 0;
    player.vy = 0;

    const amberMult = player.discoveredRelics?.includes('amber') ? 0.85 : 1.0;
    player.fuel = Math.max(0, player.fuel - DRILL_FUEL_DRAIN * amberMult * dt);

    const hardness = Math.max(0.5, targetTile!.hardness || 1.0);
    const relicDrillMult = player.discoveredRelics?.includes('trilobite') ? 1.10 : 1.0;

    // MATKAP SEVİYESİ VS. BİYOM KATMANI DENKLEMİ:
    const blockTier = getBlockTier(targetTile!, gy);
    const drillTier = player.upgrades.drill || 1;
    const isStruggling = (drillTier === blockTier - 1);
    player.isStruggling = isStruggling;

    // Durum A: drillTier >= blockTier -> 1.0 + (drillTier - blockTier) * 0.25
    // Durum B: drillTier === blockTier - 1 -> 0.50 (50% Hız)
    const tierMult = isStruggling ? 0.50 : (1.0 + (drillTier - blockTier) * 0.25);

    // Termal Overdrive (%75 - %99 Hararet): +%25 Hız Bonusu!
    const overdriveMult = (player.heat >= 75 && player.heat < 100) ? 1.25 : 1.0;

    player.drillProgress += ((player.drillSpeed * relicDrillMult * tierMult * overdriveMult) / hardness) * dt;

    // AKTİF HARARET ÜRETİMİ (KAZI SIRASINDA):
    const currentBiomeTier = getBiomeTier(gy);
    const ambientHeatFactor = 1.0 + (currentBiomeTier - 1) * 0.35;
    const struggleHeatMult = isStruggling ? 2.5 : 1.0;
    const radiatorSpecs = getRadiatorSpecs(player.upgrades.radiator || 1);
    const coreShardAbsorption = player.discoveredRelics?.includes('core_shard') ? 0.80 : 1.0;
    const drillHeatRate = 14.0 * ambientHeatFactor * struggleHeatMult * radiatorSpecs.heatAbsorptionMult * coreShardAbsorption;
    player.heat = Math.min(100, player.heat + drillHeatRate * dt);

    if (player.heat >= 100) {
      triggerOverheatLockout(player);
      return;
    }

    sounds.updateDrillModulation(player.drillProgress, isStruggling, overdriveMult > 1);
    drillChipTimer += dt;
    if (drillChipTimer >= 0.075) {
      drillChipTimer = 0;
      const chipColor = getTileParticleColor(targetTile!, gy);
      const contactX =
        player.facing === 'left'
          ? player.x - 2
          : player.facing === 'right'
            ? player.x + w + 2
            : player.x + w / 2;
      const contactY = player.facing === 'down' ? player.y + h + 2 : player.y + h / 2;
      for (let i = 0; i < 2; i++) {
        spawnParticle({
          x: contactX + (Math.random() - 0.5) * 8,
          y: contactY + (Math.random() - 0.5) * 8,
          vx: (Math.random() - 0.5) * 90,
          vy: -40 - Math.random() * 60,
          size: 2 + Math.random() * 2,
          color: chipColor,
          lifetime: 0.28 + Math.random() * 0.18,
          gravity: 320,
          shape: isStruggling ? 'spark' : 'square'
        });
      }
    }

    // Zorlanarak kazıda anlık görsel ve metinsel geri bildirim
    if (isStruggling && Math.random() < 0.04) {
      addFloatingText(player.x + PLAYER_WIDTH / 2, player.y - 14, '⚠️ ZORLANIYOR (%50 HIZ)', '#facc15');
      addShockwave(player.x + PLAYER_WIDTH / 2, player.y + PLAYER_HEIGHT / 2, 20, '#facc15');
    }

    if (player.drillProgress >= 1.0) {
      sounds.stopDrill();
      player.isStruggling = false;

      const tileCenterX = gx * TILE_SIZE + TILE_SIZE / 2;
      const tileCenterY = gy * TILE_SIZE + TILE_SIZE / 2;
      let conqueredAncientCore = false;

      // 0. Plain DIRT shatter
      if (targetTile!.type === TileType.DIRT) {
        sounds.playBlockBreak('dirt');
        spawnBlockBreakBurst(tileCenterX, tileCenterY, getBiomeForDepth(gy).dirtColor, 8);
      }
      // 1. ORE Collection
      else if (targetTile!.type === TileType.ORE && targetTile!.ore) {
        sounds.playBlockBreak('ore');
        spawnBlockBreakBurst(tileCenterX, tileCenterY, getBiomeForDepth(gy).dirtColor, 6);
        spawnSparkBurst(tileCenterX, tileCenterY, targetTile!.ore.color, 10);
        if (player.cargo.length < player.maxCargo) {
          player.cargo.push(targetTile!.ore);
          sounds.playGemCollect(targetTile!.ore.sides);
          addFloatingText(
            player.x + PLAYER_WIDTH / 2,
            player.y - 14,
            `+1 ${targetTile!.ore.name} (${targetTile!.ore.sides}G)`,
            targetTile!.ore.color
          );
        } else {
          addFloatingText(player.x + PLAYER_WIDTH / 2, player.y - 14, 'KARGO DOLU!', '#ef4444');
        }
      }
      // 2. GAS POCKET Hazard Detonation
      else if (targetTile!.type === TileType.GAS_POCKET) {
        const tabletMult = player.discoveredRelics?.includes('obsidian_tablet') ? 0.75 : 1.0;
        const damage = Math.max(
          1,
          Math.round(GAS_POCKET_BASE_DAMAGE * getDamageReductionFactor(player.upgrades.hull) * tabletMult)
        );
        player.hull = Math.max(0, player.hull - damage);
        player.vy = -250; // Stronger recoil blast upwards
        player.vx = player.facing === 'left' ? 160 : player.facing === 'right' ? -160 : 0;
        const hazardRad = getRadiatorSpecs(player.upgrades.radiator || 1);
        const hazardCoreAbsorb = player.discoveredRelics?.includes('core_shard') ? 0.80 : 1.0;
        player.heat = Math.min(100, player.heat + GAS_POCKET_HEAT_SPIKE * hazardRad.heatAbsorptionMult * hazardCoreAbsorb);
        addFloatingText(player.x + PLAYER_WIDTH / 2, player.y - 16, `-${damage} GAZ PATLAMASI!`, '#ef4444');
        sounds.playExplosion();
        spawnSparkBurst(tileCenterX, tileCenterY, '#a3e635', 16, 170);
        addScreenShake(7.5, 0.28);
        addDamageFlash(0.42);
      }
      // 3. MAGMA ROCK Thermal Burn (no cash payout)
      else if (targetTile!.type === TileType.MAGMA_ROCK) {
        const tabletMult = player.discoveredRelics?.includes('obsidian_tablet') ? 0.75 : 1.0;
        const damage = Math.max(
          1,
          Math.round(MAGMA_ROCK_BASE_DAMAGE * getDamageReductionFactor(player.upgrades.hull) * tabletMult)
        );
        player.hull = Math.max(0, player.hull - damage);
        const hazardRad = getRadiatorSpecs(player.upgrades.radiator || 1);
        const hazardCoreAbsorb = player.discoveredRelics?.includes('core_shard') ? 0.80 : 1.0;
        player.heat = Math.min(100, player.heat + MAGMA_ROCK_HEAT_SPIKE * hazardRad.heatAbsorptionMult * hazardCoreAbsorb);
        addFloatingText(player.x + PLAYER_WIDTH / 2, player.y - 16, `-${damage} MAGMA YANIĞI! +ISI`, '#ef4444');
        sounds.playSteamSizzle();
        spawnSparkBurst(tileCenterX, tileCenterY, '#f97316', 16, 150);
        addScreenShake(6.5, 0.24);
        addDamageFlash(0.38);
      }
      // 4. Broken Hard Rock
      else if (targetTile!.type === TileType.ROCK) {
        addFloatingText(player.x + PLAYER_WIDTH / 2, player.y - 14, 'KAYA PARÇALANDI!', '#94a3b8');
        sounds.playBlockBreak('rock');
        sounds.playImpactSound(200);
        spawnBlockBreakBurst(tileCenterX, tileCenterY, '#64748b', 14);
        addScreenShake(3.2, 0.14);
      }
      // 5. ANCIENT CORE Boss / Endgame Victory!
      else if (targetTile!.type === TileType.ANCIENT_CORE) {
        player.money += 50000;
        if (targetTile!.ore && player.cargo.length < player.maxCargo) {
          player.cargo.push(targetTile!.ore);
        }
        sounds.playVictoryFanfare();
        spawnSparkBurst(tileCenterX, tileCenterY, '#ec4899', 28, 220);
        addScreenShake(12, 0.50);
        addFloatingText(player.x + PLAYER_WIDTH / 2, player.y - 20, '🏆 KADİM ÇEKİRDEK FETHEDİLDİ! +$50,000', '#ec4899');
        player.hasWon = true;
        conqueredAncientCore = true;
        emitGameEvent('polyminer:wallet-changed', {
          changeAmount: 50000,
          reason: 'Kadim Çekirdek Fethi'
        });
      }
      // 6. ANCIENT CHEST / SUPPLY VAULT
      else if (targetTile!.type === TileType.CHEST) {
        openChest(player, world, gx, gy);
        player.x = targetCenterPxX;
        player.y = targetCenterPxY;
        player.lastValidX = targetCenterPxX;
        player.lastValidY = targetCenterPxY;
        player.isDrilling = false;
        player.drillProgress = 0;
        player.drillTarget = null;
        return;
      }

      // Check for Rare Archaeological Relic discovery!
      checkAndAwardRelicAt(player, targetTile!, gy);

      // Clear block and reveal its immediate neighbors
      targetTile!.type = TileType.EMPTY;
      delete targetTile!.ore;
      targetTile!.hardness = 0;
      targetTile!.revealed = true;
      markWorldDirty();
      revealAdjacentTiles(world, gx, gy);

      emitGameEvent('polyminer:tile-changed', { gx, gy, tileType: TileType.EMPTY });
      if (conqueredAncientCore) {
        emitGameEvent('polyminer:victory', { winnerName: player.name || 'Madenci' });
      }

      // Check if rock above is now unsupported and should fall!
      checkAndTriggerFallingRock(world, gx, gy);

      // Snap safely into cleared tile
      player.x = targetCenterPxX;
      player.y = targetCenterPxY;
      player.lastValidX = targetCenterPxX;
      player.lastValidY = targetCenterPxY;
      player.isDrilling = false;
      player.drillProgress = 0;
      player.drillTarget = null;

      if (player.heat >= 100 && player.heatLockoutTimer <= 0) {
        triggerOverheatLockout(player);
      }
    }
    return;
  } else {
    sounds.stopDrill();
  }

  // 2. ACTIVE HARARET (OVERHEAT) VE TERMAL YÖNETİM MEKANİĞİ
  const radiator = getRadiatorSpecs(player.upgrades.radiator || 1);
  const coreShardBonusCool = player.discoveredRelics?.includes('core_shard') ? 15 : 0;
  const coreShardAbsorption = player.discoveredRelics?.includes('core_shard') ? 0.80 : 1.0;
  const currentDepthRow = Math.floor((player.y + h / 2) / TILE_SIZE);
  const currentBiomeTier = getBiomeTier(currentDepthRow);

  // Subterranean idle fuel drain when underground and not on elevator
  const isUnderground = player.y > (SURFACE_ROW + 0.5) * TILE_SIZE;
  if (isUnderground && !player.isInElevator && !player.elevatorAuto) {
    const amberMult = player.discoveredRelics?.includes('amber') ? 0.85 : 1.0;
    player.fuel = Math.max(0, player.fuel - IDLE_FUEL_DRAIN * amberMult * dt);
  }

  // Magma Rock proximity detection (3x3 around player center)
  const pCheckGx = Math.floor((player.x + w / 2) / TILE_SIZE);
  const pCheckGy = Math.floor((player.y + h / 2) / TILE_SIZE);
  let nearMagma = false;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (world[pCheckGy + dy]?.[pCheckGx + dx]?.type === TileType.MAGMA_ROCK) {
        nearMagma = true;
        break;
      }
    }
    if (nearMagma) break;
  }

  // Forced Cooldown if in Overheat Lockout (2.5s)
  if (player.heatLockoutTimer > 0) {
    player.heatLockoutTimer = Math.max(0, player.heatLockoutTimer - dt);
    const forcedCoolingRate = 40.0; // Cools down ~100% in 2.5s
    player.heat = Math.max(0, player.heat - forcedCoolingRate * dt);
    if (player.heatLockoutTimer <= 0) {
      sounds.playElevatorChime('stop');
      addFloatingText(player.x + w / 2, player.y - 14, '❄️ MOTOR SOĞUDU', '#22d3ee');
    }
  } else {
    let passiveHeatRate = 0;
    if (currentBiomeTier >= 4 && !player.isInElevator && !player.elevatorAuto) {
      passiveHeatRate += MAGMA_AMBIENT_HEAT_RATE * radiator.heatAbsorptionMult * coreShardAbsorption;
    }
    if (nearMagma) {
      passiveHeatRate += MAGMA_PROXIMITY_HEAT_RATE * radiator.heatAbsorptionMult * coreShardAbsorption;
    }

    let coolingRate = 0;
    if (!player.isDrilling && !player.isThrusting) {
      const depthPenalty = (currentBiomeTier - 1) * 4.0;
      coolingRate = Math.max(8, (radiator.coolingRate + coreShardBonusCool) - depthPenalty);
      if (player.isInElevator || player.elevatorAuto) {
        coolingRate *= 1.6; // Superconducting cooled elevator shaft
      }
    }

    player.heat = Math.max(0, Math.min(100, player.heat + (passiveHeatRate - coolingRate) * dt));
  }

  // 100% Overheat Lockout Trigger
  if (player.heat >= 100 && player.heatLockoutTimer <= 0) {
    triggerOverheatLockout(player);
  }

  // --- ELEVATOR LOGIC (AUTO-GLIDE & MANUAL) ---
  const nearbyElevator = findNearbyElevatorTile(player, world);
  player.isInElevator = !!nearbyElevator;

  const alienGearMult = player.discoveredRelics?.includes('alien_gear') ? 1.20 : 1.0;
  const elevatorSpeed = BASE_ELEVATOR_SPEED * alienGearMult;

  // A. AUTO-GLIDE MODE (Triggered by double-tap W/Up or S/Down)
  if (player.elevatorAuto) {
    let interrupted = false;
    if (player.elevatorAuto === 'up' && (downKey || leftKey || rightKey || keys['Space'] || keys[' '])) {
      interrupted = true;
    } else if (player.elevatorAuto === 'down' && (upKey || leftKey || rightKey || keys['Space'] || keys[' '])) {
      interrupted = true;
    }

    if (interrupted) {
      player.elevatorAuto = null;
      sounds.stopElevatorHum();
      sounds.playElevatorChime('stop');
      addFloatingText(player.x + w / 2, player.y - 14, '⏹ ASANSÖR DURDURULDU', '#94a3b8');
    } else {
      if (player.isThrusting) {
        player.isThrusting = false;
        sounds.stopThrust();
      }
      sounds.startElevatorHum();

      const elevCol = player.elevatorCol ?? (nearbyElevator ? nearbyElevator.gx : Math.floor((player.x + w / 2) / TILE_SIZE));
      player.elevatorCol = elevCol;
      const targetCenterX = elevCol * TILE_SIZE + (TILE_SIZE - w) / 2;
      player.x = targetCenterX;
      player.vx = 0;

      if (player.elevatorAuto === 'up') {
        player.vy = -elevatorSpeed;

        if (player.y <= (SURFACE_ROW - 0.5) * TILE_SIZE) {
          player.elevatorAuto = null;
          player.y = (SURFACE_ROW - 1) * TILE_SIZE + (TILE_SIZE - PLAYER_HEIGHT);
          player.vy = 0;
          player.isGrounded = true;
          sounds.stopElevatorHum();
          sounds.playElevatorChime('stop');
          addFloatingText(player.x + w / 2, player.y - 14, '🏠 YÜZEYE ULAŞILDI!', '#22d3ee');
          addShockwave(player.x + w / 2, player.y + h / 2, 30, '#22d3ee');
        } else {
          const checkGy = Math.floor((player.y - 4) / TILE_SIZE);
          const tileAbove = world[checkGy]?.[elevCol];
          if (checkGy >= SURFACE_ROW && (!tileAbove || !tileAbove.hasElevator || isSolidTile(world, elevCol, checkGy))) {
            player.elevatorAuto = null;
            player.vy = 0;
            sounds.stopElevatorHum();
            sounds.playElevatorChime('stop');
            addFloatingText(player.x + w / 2, player.y - 14, '⚓ ASANSÖR HATTININ ZİRVESİ', '#22d3ee');
          }
        }
      } else if (player.elevatorAuto === 'down') {
        player.vy = elevatorSpeed;

        const checkGy = Math.floor((player.y + h + 4) / TILE_SIZE);
        const tileBelow = world[checkGy]?.[elevCol];
        if (checkGy >= GRID_HEIGHT || !tileBelow || !tileBelow.hasElevator || isSolidTile(world, elevCol, checkGy)) {
          player.elevatorAuto = null;
          player.vy = 0;
          sounds.stopElevatorHum();
          sounds.playElevatorChime('stop');
          addFloatingText(player.x + w / 2, player.y - 14, '⚓ ASANSÖR HATTININ DİBİ', '#22d3ee');
        }
      }
    }
  }

  // B. MANUAL ELEVATOR SÜRÜŞ / HOVER (When not in auto mode)
  if (!player.elevatorAuto) {
    if (player.isInElevator) {
      // ZERO GRAVITY: Hover safely in mid-air inside the elevator shaft
      if (player.isThrusting) {
        player.isThrusting = false;
        sounds.stopThrust();
      }

      if (upKey) {
        player.vy = -elevatorSpeed;
        sounds.startElevatorHum();
        if (nearbyElevator) {
          const targetCenterX = nearbyElevator.gx * TILE_SIZE + (TILE_SIZE - w) / 2;
          player.x += (targetCenterX - player.x) * Math.min(1.0, 14 * dt);
        }
      } else if (downKey) {
        player.vy = elevatorSpeed;
        sounds.startElevatorHum();
        if (nearbyElevator) {
          const targetCenterX = nearbyElevator.gx * TILE_SIZE + (TILE_SIZE - w) / 2;
          player.x += (targetCenterX - player.x) * Math.min(1.0, 14 * dt);
        }
      } else {
        player.vy = 0; // Float / hover motionless
        sounds.stopElevatorHum();
      }
    } else {
      sounds.stopElevatorHum();

      const amberMult = player.discoveredRelics?.includes('amber') ? 0.85 : 1.0;

      if (upKey && player.fuel > 0 && player.heatLockoutTimer <= 0) {
        if (player.isGrounded && player.vy >= 0) {
          player.vy = -140; // Immediate liftoff impulse
        }
        const isBrakingFall = player.vy > 120;
        const effectiveThrust = isBrakingFall
          ? player.thrusterPower * FALL_BRAKE_MULTIPLIER
          : player.thrusterPower;
        player.vy -= effectiveThrust * dt;
        const maxFlySpeed = getMaxFlySpeed(player.upgrades.engine || 1);
        if (player.vy < maxFlySpeed) {
          player.vy = maxFlySpeed;
        }
        player.fuel = Math.max(0, player.fuel - THRUST_FUEL_DRAIN * amberMult * dt);
        player.heat = Math.min(100, player.heat + 10.0 * dt); // Rocket thrust builds heat
        player.isThrusting = true;
        sounds.startThrust();
        thrustDustTimer += dt;
        if (thrustDustTimer >= 0.06) {
          thrustDustTimer = 0;
          spawnParticle({
            x: player.x + w / 2 + (Math.random() - 0.5) * 14,
            y: player.y + h + 4,
            vx: (Math.random() - 0.5) * 45,
            vy: 55 + Math.random() * 45,
            size: isBrakingFall ? 3 + Math.random() * 1.5 : 2.5 + Math.random() * 2,
            color: isBrakingFall
              ? (Math.random() > 0.45 ? '#38bdf8' : '#facc15')
              : (Math.random() > 0.4 ? '#f97316' : '#94a3b8'),
            lifetime: 0.28,
            gravity: 40,
            shape: 'circle'
          });
        }
      } else {
        if (player.isThrusting) {
          player.isThrusting = false;
          sounds.stopThrust();
        }
        player.vy += GRAVITY * dt;
        if (player.vy > MAX_FALL_SPEED) {
          player.vy = MAX_FALL_SPEED;
        }
      }
    }
  }

  let targetVx = 0;
  const baseMoveSpeed = MOVE_SPEED * alienGearMult;
  if (!player.elevatorAuto) {
    if (leftKey) {
      targetVx = -baseMoveSpeed;
      player.facing = 'left';
    } else if (rightKey) {
      targetVx = baseMoveSpeed;
      player.facing = 'right';
    } else {
      targetVx = 0;
    }
    const accel = player.isGrounded ? 22.0 : 10.0;
    player.vx += (targetVx - player.vx) * Math.min(1, dt * accel);
  } else {
    targetVx = 0;
    player.vx = 0;
  }

  // 3. COLLISION RESOLUTION (AABB) & FALL DAMAGE
  // --- X Axis ---
  player.x += player.vx * dt;
  if (player.vx > 0) {
    const rightCol = Math.floor((player.x + w) / TILE_SIZE);
    const topRow = Math.floor(player.y / TILE_SIZE);
    const bottomRow = Math.floor((player.y + h - 0.1) / TILE_SIZE);

    let hit = false;
    for (let r = topRow; r <= bottomRow; r++) {
      if (isSolidTile(world, rightCol, r)) {
        hit = true;
        break;
      }
    }
    if (hit) {
      player.x = rightCol * TILE_SIZE - w;
      player.vx = 0;
    }
  } else if (player.vx < 0) {
    const leftCol = Math.floor(player.x / TILE_SIZE);
    const topRow = Math.floor(player.y / TILE_SIZE);
    const bottomRow = Math.floor((player.y + h - 0.1) / TILE_SIZE);

    let hit = false;
    for (let r = topRow; r <= bottomRow; r++) {
      if (isSolidTile(world, leftCol, r)) {
        hit = true;
        break;
      }
    }
    if (hit) {
      player.x = (leftCol + 1) * TILE_SIZE;
      player.vx = 0;
    }
  }

  if (player.x < 0) {
    player.x = 0;
    player.vx = 0;
  }
  const maxWorldX = GRID_WIDTH * TILE_SIZE - w;
  if (player.x > maxWorldX) {
    player.x = maxWorldX;
    player.vx = 0;
  }

  // --- Y Axis & Fall Impact Damage ---
  player.isGrounded = false;
  const previousVy = player.vy;
  player.y += player.vy * dt;

  if (player.vy > 0) {
    const bottomRow = Math.floor((player.y + h) / TILE_SIZE);
    const leftCol = Math.floor(player.x / TILE_SIZE);
    const rightCol = Math.floor((player.x + w - 0.1) / TILE_SIZE);

    let hit = false;
    for (let c = leftCol; c <= rightCol; c++) {
      if (isSolidTile(world, c, bottomRow)) {
        hit = true;
        break;
      }
    }
    if (hit) {
      // Fall Damage Calculation (Elevator eliminates fall damage)
      let landedDamage = 0;
      if (!player.isInElevator && !player.elevatorAuto) {
        const damage = computeFallDamage(
          previousVy,
          player.upgrades.hull,
          !!player.discoveredRelics?.includes('obsidian_tablet')
        );
        if (damage > 0) {
          landedDamage = damage;
          player.hull = Math.max(0, player.hull - damage);
          sounds.playImpactSound(damage);
          addFloatingText(player.x + PLAYER_WIDTH / 2, player.y - 12, `-${damage} DARBE`, '#ef4444');
          addShockwave(player.x + PLAYER_WIDTH / 2, player.y + PLAYER_HEIGHT, Math.min(45, 18 + damage * 0.4), '#ef4444');
          addScreenShake(Math.min(7.5, 2.2 + damage * 0.12), 0.22);
          addDamageFlash(Math.min(0.48, 0.18 + damage * 0.008));
          spawnDustPuff(player.x + PLAYER_WIDTH / 2, player.y + PLAYER_HEIGHT, '#94a3b8', 8);
        }
      }
      if (landedDamage === 0 && previousVy > 95 && !player.isInElevator && !player.elevatorAuto) {
        spawnDustPuff(player.x + PLAYER_WIDTH / 2, player.y + PLAYER_HEIGHT, '#94a3b8', 4);
      }

      player.y = bottomRow * TILE_SIZE - h;
      player.vy = 0;
      player.isGrounded = true;
      if (player.elevatorAuto === 'down') {
        player.elevatorAuto = null;
        sounds.stopElevatorHum();
        sounds.playElevatorChime('stop');
        addFloatingText(player.x + PLAYER_WIDTH / 2, player.y - 14, '⚓ ASANSÖR HATTININ DİBİ', '#22d3ee');
      }
    }
  } else if (player.vy < 0) {
    const topRow = Math.floor(player.y / TILE_SIZE);
    const leftCol = Math.floor(player.x / TILE_SIZE);
    const rightCol = Math.floor((player.x + w - 0.1) / TILE_SIZE);

    let hit = false;
    for (let c = leftCol; c <= rightCol; c++) {
      if (isSolidTile(world, c, topRow)) {
        hit = true;
        break;
      }
    }
    if (hit) {
      player.y = (topRow + 1) * TILE_SIZE;
      player.vy = 0;
      if (player.elevatorAuto === 'up') {
        player.elevatorAuto = null;
        sounds.stopElevatorHum();
        sounds.playElevatorChime('stop');
        addFloatingText(player.x + PLAYER_WIDTH / 2, player.y - 14, '⚓ ASANSÖR HATTININ ZİRVESİ', '#22d3ee');
      }
    }
  }

  const minWorldY = -3 * TILE_SIZE;
  if (player.y < minWorldY) {
    player.y = minWorldY;
    player.vy = 0;
  }

  // 3.5. TOUCH / PROXIMITY OPENING FOR CHESTS
  const pMinGx = Math.floor((player.x - 3) / TILE_SIZE);
  const pMaxGx = Math.floor((player.x + w + 3) / TILE_SIZE);
  const pMinGy = Math.floor((player.y - 3) / TILE_SIZE);
  const pMaxGy = Math.floor((player.y + h + 3) / TILE_SIZE);

  for (let cgy = pMinGy; cgy <= pMaxGy; cgy++) {
    for (let cgx = pMinGx; cgx <= pMaxGx; cgx++) {
      if (world[cgy]?.[cgx]?.type === TileType.CHEST) {
        openChest(player, world, cgx, cgy);
      }
    }
  }

  // 4. STRICT DIRECTIONAL DRILL INITIATION & BIOME TIER GATE
  if (player.fuel > 0 && !upKey) {
    const currentGx = Math.floor((player.x + w / 2) / TILE_SIZE);
    const currentGy = Math.floor((player.y + h / 2) / TILE_SIZE);
    const now = performance.now();

    // Check Overheat Lockout: If engine is overheated, drilling is locked!
    if (player.heatLockoutTimer > 0) {
      if ((downKey || leftKey || rightKey) && now - lastRockWarnTime > 800) {
        lastRockWarnTime = now;
        addFloatingText(player.x + PLAYER_WIDTH / 2, player.y - 14, '🔥 MOTOR HARARET YAPTI! KİLİTLİ', '#ef4444');
        sounds.playClank();
      }
      return;
    }

    // Helper for biome & drill tier gating
    const checkDrillTierGate = (tile: Tile | null | undefined, targetGy: number): boolean => {
      if (tile && tile.type === TileType.BEDROCK) {
        if (now - lastRockWarnTime > 800) {
          lastRockWarnTime = now;
          sounds.playClank();
          addFloatingText(
            player.x + PLAYER_WIDTH / 2,
            player.y - 14,
            '🛡️ KIRILMAZ TEMEL KAYA (Yandan Giriş Ara)',
            '#94a3b8'
          );
        }
        return true;
      }
      if (
        !tile ||
        tile.type === TileType.EMPTY ||
        tile.type === TileType.FUEL_PAD ||
        tile.type === TileType.SHOP_PAD ||
        !Number.isFinite(tile.hardness)
      ) {
        return false;
      }
      const blockTier = getBlockTier(tile, targetGy);
      const drillTier = player.upgrades.drill || 1;

      // Durum C: KESİN KİLİT! (drillTier < blockTier - 1)
      if (drillTier < blockTier - 1) {
        if (now - lastRockWarnTime > 800) {
          lastRockWarnTime = now;
          const minReq = blockTier - 1; // Min tier needed to even struggle-drill
          sounds.playClank();
          addFloatingText(
            player.x + PLAYER_WIDTH / 2,
            player.y - 14,
            `🔒 MATKAP YETERSİZ! (Min. Seviye ${minReq} Gerekli)`,
            '#ef4444'
          );
          addShockwave(player.x + PLAYER_WIDTH / 2, player.y + PLAYER_HEIGHT / 2, 28, '#ef4444');
        }
        return true; // Blocked!
      }
      return false; // Allowed!
    };

    // Drilling Down: Strictly same column, row + 1
    if (downKey && player.isGrounded) {
      player.facing = 'down';
      const targetGx = currentGx;
      const targetGy = currentGy + 1;
      const targetTile = world[targetGy]?.[targetGx];

      if (checkDrillTierGate(targetTile, targetGy)) {
        return;
      }

      if (targetGy >= SURFACE_ROW && canDrillBlock(targetTile, player.upgrades.drill, targetGy)) {
        const blockTopY = targetGy * TILE_SIZE;
        if (player.y + h >= blockTopY - 4) {
          player.startDrillX = player.x;
          player.startDrillY = player.y;
          player.isDrilling = true;
          player.drillProgress = 0;
          player.drillTarget = { gx: targetGx, gy: targetGy };
          return;
        }
      }
    }

    // Drilling Left: Strictly col - 1, same row
    if (leftKey && player.isGrounded) {
      player.facing = 'left';
      const targetGx = currentGx - 1;
      const targetGy = currentGy;
      const targetTile = world[targetGy]?.[targetGx];

      if (checkDrillTierGate(targetTile, targetGy)) {
        return;
      }

      if (targetGx >= 0 && targetGy >= SURFACE_ROW && canDrillBlock(targetTile, player.upgrades.drill, targetGy)) {
        const blockRightX = (targetGx + 1) * TILE_SIZE;
        if (player.x <= blockRightX + 4) {
          player.startDrillX = player.x;
          player.startDrillY = player.y;
          player.isDrilling = true;
          player.drillProgress = 0;
          player.drillTarget = { gx: targetGx, gy: targetGy };
          return;
        }
      }
    }

    // Drilling Right: Strictly col + 1, same row
    if (rightKey && player.isGrounded) {
      player.facing = 'right';
      const targetGx = currentGx + 1;
      const targetGy = currentGy;
      const targetTile = world[targetGy]?.[targetGx];

      if (checkDrillTierGate(targetTile, targetGy)) {
        return;
      }

      if (targetGx < GRID_WIDTH && targetGy >= SURFACE_ROW && canDrillBlock(targetTile, player.upgrades.drill, targetGy)) {
        const blockLeftX = targetGx * TILE_SIZE;
        if (player.x + w >= blockLeftX - 4) {
          player.startDrillX = player.x;
          player.startDrillY = player.y;
          player.isDrilling = true;
          player.drillProgress = 0;
          player.drillTarget = { gx: targetGx, gy: targetGy };
          return;
        }
      }
    }
  }
}

let lastRockWarnTime = 0;

function resetVehicleAtSurface(player: PlayerExtendedState): void {
  player.x = 1.5 * TILE_SIZE - PLAYER_WIDTH / 2;
  player.y = (SURFACE_ROW - 1) * TILE_SIZE + (TILE_SIZE - PLAYER_HEIGHT);
  player.lastValidX = player.x;
  player.lastValidY = player.y;
  player.startDrillX = player.x;
  player.startDrillY = player.y;
  player.vx = 0;
  player.vy = 0;
  player.isDrilling = false;
  player.isStruggling = false;
  player.drillTarget = null;
  player.drillProgress = 0;
  player.isThrusting = false;
  player.isGrounded = true;
  player.elevatorAuto = null;
  player.elevatorCol = undefined;
  player.isInElevator = false;
  player.heat = 0;
  player.heatLockoutTimer = 0;
  sounds.stopThrust();
  sounds.stopDrill();
  sounds.stopElevatorHum();
}

/**
 * Resets player to surface upon fuel starvation or hull destruction.
 */
export function towPlayerToSurface(player: PlayerExtendedState, cause: 'fuel' | 'hull' | 'stuck' = 'fuel'): void {
  console.log(`[POLYMINER] Emergency tow triggered: ${cause}`);
  player.cargo = [];
  resetVehicleAtSurface(player);
  player.fuel = Math.max(player.fuel, Math.round(player.maxFuel * 0.3));
  player.hull = Math.max(player.hull, Math.round(player.maxHull * 0.5));
  sounds.playAlarm();
}

/**
 * Safe teleport to surface using consumable item Q (retains all cargo!).
 */
export function teleportPlayerToSurfaceSafe(player: PlayerExtendedState): void {
  resetVehicleAtSurface(player);
  sounds.playTeleport();
}

/**
 * Detonates a Seismic Dynamite blast in 3x3 block area.
 */
export function detonateDynamite(player: PlayerExtendedState, world: Tile[][]): boolean {
  if (player.inventory.dynamite <= 0) return false;

  // Must be underground
  if (player.y <= (SURFACE_ROW + 0.5) * TILE_SIZE) {
    addFloatingText(player.x + PLAYER_WIDTH / 2, player.y - 14, 'Yüzeyde Patlatılamaz!', '#facc15');
    return false;
  }

  // Safely abort active drill if triggered mid-drill
  if (player.isDrilling) {
    player.x = player.startDrillX;
    player.y = player.startDrillY;
    player.isDrilling = false;
    player.isStruggling = false;
    player.drillProgress = 0;
    player.drillTarget = null;
    sounds.stopDrill();
  }

  player.inventory.dynamite--;

  const centerGx = Math.floor((player.x + PLAYER_WIDTH / 2) / TILE_SIZE);
  const centerGy = Math.floor((player.y + PLAYER_HEIGHT / 2) / TILE_SIZE);

  let blastGx = centerGx;
  let blastGy = centerGy;

  if (player.facing === 'down') blastGy = centerGy + 1;
  else if (player.facing === 'left') blastGx = centerGx - 1;
  else if (player.facing === 'right') blastGx = centerGx + 1;

  const blastPxX = blastGx * TILE_SIZE + TILE_SIZE / 2;
  const blastPxY = blastGy * TILE_SIZE + TILE_SIZE / 2;

  let collectedOreCount = 0;
  let clearedAnyTile = false;
  let hitProtectedBlock = false;
  const dynamiteRad = getRadiatorSpecs(player.upgrades.radiator || 1);
  const dynamiteCoreAbsorb = player.discoveredRelics?.includes('core_shard') ? 0.80 : 1.0;

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const gx = blastGx + dx;
      const gy = blastGy + dy;

      if (gy < SURFACE_ROW || gy >= GRID_HEIGHT || gx < 0 || gx >= GRID_WIDTH) {
        continue;
      }

      const tile = world[gy]?.[gx];
      if (!tile) continue;

      if (tile.type === TileType.BEDROCK || tile.type === TileType.ANCIENT_CORE) {
        hitProtectedBlock = true;
        continue;
      }

      if (
        tile.type === TileType.EMPTY ||
        tile.type === TileType.FUEL_PAD ||
        tile.type === TileType.SHOP_PAD ||
        !Number.isFinite(tile.hardness)
      ) {
        continue;
      }

      // Collect Ore automatically if cargo has space
      if (tile.type === TileType.ORE && tile.ore) {
        if (player.cargo.length < player.maxCargo) {
          player.cargo.push(tile.ore);
          collectedOreCount++;
          addFloatingText(
            gx * TILE_SIZE + TILE_SIZE / 2,
            gy * TILE_SIZE + TILE_SIZE / 2,
            `+1 ${tile.ore.name} (${tile.ore.sides}G)`,
            tile.ore.color
          );
        }
      }

      // Chest Blasted by Dynamite!
      if (tile.type === TileType.CHEST) {
        openChest(player, world, gx, gy);
        continue;
      }

      // Blasting magma rock vents thermal heat splash
      if (tile.type === TileType.MAGMA_ROCK) {
        player.heat = Math.min(99, player.heat + 12 * dynamiteRad.heatAbsorptionMult * dynamiteCoreAbsorb);
      }

      // Check for Rare Archaeological Relic discovery via dynamite!
      checkAndAwardRelicAt(player, tile, gy);

      // Obliterate block
      tile.type = TileType.EMPTY;
      delete tile.ore;
      tile.hardness = 0;
      tile.revealed = true;
      clearedAnyTile = true;

      revealAdjacentTiles(world, gx, gy);
      checkAndTriggerFallingRock(world, gx, gy);

      emitGameEvent('polyminer:tile-changed', { gx, gy, tileType: TileType.EMPTY });
    }
  }

  if (clearedAnyTile) {
    markWorldDirty();
  }

  // Shockwave, Particle Bursts, Screen Shake & Bass Explosion Audio
  addShockwave(blastPxX, blastPxY, 110, '#facc15');
  addScreenShake(10.5, 0.36);
  spawnSparkBurst(blastPxX, blastPxY, '#facc15', 22, 220);
  spawnBlockBreakBurst(blastPxX, blastPxY, '#64748b', 14);
  sounds.playExplosion();
  addFloatingText(player.x + PLAYER_WIDTH / 2, player.y - 18, '💥 SİSMİK DİNAMİT!', '#facc15');
  if (hitProtectedBlock) {
    addFloatingText(player.x + PLAYER_WIDTH / 2, player.y - 34, '🛡️ ZIRHLI KAYA / ÇEKİRDEK DİNAMİTE DAYANIKLI', '#f43f5e');
  }

  if (collectedOreCount > 0) {
    sounds.playGemCollect(6);
  }

  return true;
}

/**
 * Purchases consumable units and adds exact unit count (not effect magnitude) to inventory.
 */
export function buyConsumableItem(
  player: PlayerExtendedState,
  itemKey: keyof ConsumableInventory,
  count: number = 1
): { ok: boolean; addedAmount: number; totalCost: number } {
  if (!Number.isInteger(count) || count <= 0) {
    return { ok: false, addedAmount: 0, totalCost: 0 };
  }
  const item = CONSUMABLES[itemKey];
  if (!item) {
    return { ok: false, addedAmount: 0, totalCost: 0 };
  }
  const totalCost = Math.round(item.cost * count * 100) / 100;
  if (player.money < totalCost) {
    return { ok: false, addedAmount: 0, totalCost };
  }

  player.money = Math.round((player.money - totalCost) * 100) / 100;
  player.inventory[itemKey] = (player.inventory[itemKey] || 0) + count;
  return { ok: true, addedAmount: count, totalCost };
}

/**
 * Consumes a usable item from player inventory.
 */
export function useConsumableItem(
  player: PlayerExtendedState,
  type: keyof ConsumableInventory,
  world?: Tile[][]
): boolean {
  if (player.inventory[type] <= 0) return false;

  switch (type) {
    case 'fuelCanister':
      if (player.fuel >= player.maxFuel) return false;
      player.fuel = Math.min(player.maxFuel, player.fuel + CONSUMABLES.fuelCanister.amount);
      player.inventory.fuelCanister--;
      sounds.playItemUse();
      addFloatingText(player.x + PLAYER_WIDTH / 2, player.y - 14, '+50L YAKIT', '#38bdf8');
      return true;

    case 'repairKit': {
      const needsHull = player.hull < player.maxHull;
      const needsCooling = (player.heat ?? 0) > 0 || (player.heatLockoutTimer ?? 0) > 0;
      if (!needsHull && !needsCooling) return false;

      if (needsHull) {
        player.hull = Math.min(player.maxHull, player.hull + CONSUMABLES.repairKit.amount);
      }
      player.heat = 0;
      player.heatLockoutTimer = 0;
      player.inventory.repairKit--;
      sounds.playItemUse();

      const label = needsHull && needsCooling
        ? '+50 GÖVDE & ❄️ SOĞUTULDU'
        : needsHull
          ? '+50 GÖVDE'
          : '❄️ HARARET SIFIRLANDI';
      addFloatingText(player.x + PLAYER_WIDTH / 2, player.y - 14, label, '#4ade80');
      return true;
    }

    case 'teleporter':
      player.inventory.teleporter--;
      teleportPlayerToSurfaceSafe(player);
      addFloatingText(player.x + PLAYER_WIDTH / 2, player.y - 14, 'IŞINLANDI!', '#facc15');
      return true;

    case 'dynamite':
      if (world) {
        return detonateDynamite(player, world);
      }
      return false;

    case 'elevatorRails':
      if (world) {
        return deployElevatorRail(player, world);
      }
      return false;
  }
  return false;
}
