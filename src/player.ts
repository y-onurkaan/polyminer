import { PlayerState, Tile, TileType, OreDefinition, ConsumableInventory } from './types';
import {
  TILE_SIZE,
  GRID_WIDTH,
  GRID_HEIGHT,
  SURFACE_ROW,
  DEFAULT_RADAR_RADIUS,
  SAFE_LANDING_SPEED,
  FALL_DAMAGE_FACTOR,
  CONSUMABLES,
  BASE_ELEVATOR_SPEED,
  RELIC_DEFINITIONS,
  getBiomeTier
} from './constants';
import { revealTilesAround, revealAdjacentTiles } from './world';
import { sounds } from './audio';
import { addFloatingText, addShockwave } from './effects';
import { checkAndTriggerFallingRock } from './boulders';

export const PLAYER_WIDTH = 38;
export const PLAYER_HEIGHT = 38;

export const GRAVITY = 600; // px/s^2
export const MOVE_SPEED = 190; // px/s
export const MAX_FALL_SPEED = 380; // px/s
export const MAX_FLY_SPEED = -280; // px/s
export const BASE_THRUSTER_POWER = 1500; // px/s^2
export const THRUST_FUEL_DRAIN = 3.5; // fuel/sec
export const DRILL_FUEL_DRAIN = 2.0; // fuel/sec

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

  return {
    x: startX,
    y: startY,
    vx: 0,
    vy: 0,
    fuel: 100,
    maxFuel: 100,
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
    temperature: 24,
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
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('polyminer:wallet-changed', {
        detail: { newMoney: player.money, changeAmount: duplicateBonus, reason: `Çift Fosil (${def.name})` }
      }));
    }
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
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('polyminer:relic-discovered', { detail: { relicId } }));
    window.dispatchEvent(new CustomEvent('polyminer:wallet-changed', {
      detail: { newMoney: player.money, changeAmount: firstFindBonus, reason: `${def.name} Keşfi` }
    }));
  }
}

/**
 * Checks if mined tile contains a pre-seeded relic or rolls 2.5% discovery chance.
 */
export function checkAndAwardRelicAt(player: PlayerExtendedState, tile: Tile, gy: number): void {
  if (tile.relicId) {
    awardRelic(player, tile.relicId);
    delete tile.relicId;
    return;
  }

  // 2.5% chance to uncover a depth-appropriate relic
  if (Math.random() < 0.025) {
    const depthMeters = Math.max(0, (gy - SURFACE_ROW) * 2);
    const eligible = Object.values(RELIC_DEFINITIONS).filter(
      r => depthMeters >= r.minDepth && depthMeters <= r.maxDepth && !player.discoveredRelics?.includes(r.id)
    );
    if (eligible.length > 0) {
      const chosen = eligible[Math.floor(Math.random() * eligible.length)];
      awardRelic(player, chosen.id);
    }
  }
}

/**
 * Deploys an industrial elevator rail in current empty cell.
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
  sounds.playElevatorDeploy();
  addFloatingText(player.x + PLAYER_WIDTH / 2, player.y - 14, '🔩 ASANSÖR RAYI KURULDU!', '#06b6d4');
  addShockwave(pMidGx * TILE_SIZE + TILE_SIZE / 2, pMidGy * TILE_SIZE + TILE_SIZE / 2, 28, '#06b6d4');

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('polyminer:tile-changed', {
      detail: { gx: pMidGx, gy: pMidGy, tileType: TileType.EMPTY, hasElevator: true }
    }));
  }
  return true;
}

// (Weight system removed in FAZ 9 for streamlined progression)

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
 * Computes ambient geothermal temperature (°C) based on subterranean depth.
 * Rows 3 - 60 (0 - 114m): 20°C - 38°C
 * Rows 61 - 130 (115 - 254m): 38°C - 80°C
 * Rows 131 - 205 (255 - 404m): 80°C - 160°C
 * Rows 206 - 280 (405 - 554m, Magma Core): 160°C - 340°C!
 */
export function getAmbientTemperature(y: number): number {
  const currentDepthRow = Math.max(0, (y / TILE_SIZE) - SURFACE_ROW);
  if (currentDepthRow <= 0) return 22; // Surface ambient temperature

  if (currentDepthRow <= 60) {
    return 22 + (currentDepthRow / 60) * 16;
  } else if (currentDepthRow <= 130) {
    return 38 + ((currentDepthRow - 60) / 70) * 42;
  } else if (currentDepthRow <= 205) {
    return 80 + ((currentDepthRow - 130) / 75) * 80;
  } else {
    return 160 + ((currentDepthRow - 205) / 75) * 180;
  }
}

/**
 * Active cooling rates and heat absorption resistance for Radiator tiers (1-5).
 */
export function getRadiatorSpecs(level: number = 1): {
  safeTemp: number;
  coolingRate: number;
  heatAbsorptionMult: number;
  name: string;
} {
  switch (level) {
    case 1:
      return { safeTemp: 55, coolingRate: 20, heatAbsorptionMult: 1.0, name: 'Standart Fan' };
    case 2:
      return { safeTemp: 90, coolingRate: 28, heatAbsorptionMult: 0.90, name: 'Çift Sıvı Soğutma' };
    case 3:
      return { safeTemp: 155, coolingRate: 38, heatAbsorptionMult: 0.80, name: 'Termoelektrik Radyatör' };
    case 4:
      return { safeTemp: 230, coolingRate: 50, heatAbsorptionMult: 0.70, name: 'Kriyojenik Kalkan' };
    case 5:
      return { safeTemp: 350, coolingRate: 65, heatAbsorptionMult: 0.60, name: 'Plazma Isı Emici' };
    default:
      return { safeTemp: 55, coolingRate: 20, heatAbsorptionMult: 1.0, name: 'Standart Fan' };
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
  addFloatingText(
    gx * TILE_SIZE + TILE_SIZE / 2,
    gy * TILE_SIZE + TILE_SIZE / 2 - 12,
    `📦 TERK EDİLMİŞ SANDIK! +$${cashReward}`,
    '#facc15'
  );
  addFloatingText(
    gx * TILE_SIZE + TILE_SIZE / 2,
    gy * TILE_SIZE + TILE_SIZE / 2 + 8,
    `+1 ${CONSUMABLES[granted].name}`,
    '#4ade80'
  );

  // Clear block
  targetTile.type = TileType.EMPTY;
  delete targetTile.ore;
  targetTile.hardness = 0;
  targetTile.revealed = true;

  revealAdjacentTiles(world, gx, gy);
  checkAndTriggerFallingRock(world, gx, gy);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('polyminer:wallet-changed', {
      detail: { newMoney: player.money, changeAmount: cashReward, reason: 'Terk Edilmiş Sandık' }
    }));
    window.dispatchEvent(new CustomEvent('polyminer:tile-changed', {
      detail: { gx, gy, tileType: TileType.EMPTY }
    }));
  }
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
  if (!tile || tile.type === TileType.EMPTY) return false;
  if (gy === undefined) return true;
  const blockTier = getBlockTier(tile, gy);
  // Condition C: drillLevel < blockTier - 1 is locked.
  // Drill can mine if drillLevel >= blockTier - 1 (Condition B struggle or Condition A normal/bonus).
  return drillLevel >= (blockTier - 1);
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
    if (player.isThrusting) {
      player.isThrusting = false;
      sounds.stopThrust();
    }
    if (player.isDrilling) {
      player.isDrilling = false;
      sounds.stopDrill();
    }
    if (!player.isGrounded) {
      player.vy = Math.min(MAX_FALL_SPEED, player.vy + GRAVITY * dt);
      player.y += player.vy * dt;
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

    // Zorlanarak kazıda anlık görsel ve metinsel geri bildirim
    if (isStruggling && Math.random() < 0.04) {
      addFloatingText(player.x + PLAYER_WIDTH / 2, player.y - 14, '⚠️ ZORLANIYOR (%50 HIZ)', '#facc15');
      addShockwave(player.x + PLAYER_WIDTH / 2, player.y + PLAYER_HEIGHT / 2, 20, '#facc15');
    }

    if (player.drillProgress >= 1.0) {
      sounds.stopDrill();
      player.isStruggling = false;

      // 1. ORE Collection
      if (targetTile!.type === TileType.ORE && targetTile!.ore) {
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
        const damage = Math.max(1, Math.round(20 * getDamageReductionFactor(player.upgrades.hull) * tabletMult));
        player.hull = Math.max(0, player.hull - damage);
        player.vy = -220; // Recoil blast upwards
        player.vx = player.facing === 'left' ? 140 : player.facing === 'right' ? -140 : 0;
        addFloatingText(player.x + PLAYER_WIDTH / 2, player.y - 16, `-${damage} GAZ PATLAMASI!`, '#ef4444');
        sounds.playExplosion();
      }
      // 3. MAGMA ROCK Thermal Burn & Crystal Cash Bonus
      else if (targetTile!.type === TileType.MAGMA_ROCK) {
        const tabletMult = player.discoveredRelics?.includes('obsidian_tablet') ? 0.75 : 1.0;
        const damage = Math.max(1, Math.round(25 * getDamageReductionFactor(player.upgrades.hull) * tabletMult));
        player.hull = Math.max(0, player.hull - damage);
        const bonus = Math.floor(Math.random() * (600 - 250 + 1)) + 250;
        player.money += bonus;
        addFloatingText(player.x + PLAYER_WIDTH / 2, player.y - 24, `-${damage} ISI HASARI!`, '#ef4444');
        addFloatingText(player.x + PLAYER_WIDTH / 2, player.y - 8, `+$${bonus} TERMAL KRİSTAL`, '#f59e0b');
        sounds.playSteamSizzle();
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('polyminer:wallet-changed', {
            detail: { newMoney: player.money, changeAmount: bonus, reason: 'Termal Kristal' }
          }));
        }
      }
      // 4. Broken Hard Rock
      else if (targetTile!.type === TileType.ROCK) {
        addFloatingText(player.x + PLAYER_WIDTH / 2, player.y - 14, 'KAYA PARÇALANDI!', '#94a3b8');
        sounds.playImpactSound(200);
      }
      // 5. ANCIENT CORE Boss / Endgame Victory!
      else if (targetTile!.type === TileType.ANCIENT_CORE) {
        player.money += 50000;
        if (targetTile!.ore && player.cargo.length < player.maxCargo) {
          player.cargo.push(targetTile!.ore);
        }
        sounds.playVictoryFanfare();
        addFloatingText(player.x + PLAYER_WIDTH / 2, player.y - 20, '🏆 KADİM ÇEKİRDEK FETHEDİLDİ! +$50,000', '#ec4899');
        player.hasWon = true;
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('polyminer:victory', { detail: { winnerName: player.name || 'Madenci' } }));
          window.dispatchEvent(new CustomEvent('polyminer:wallet-changed', {
            detail: { newMoney: player.money, changeAmount: 50000, reason: 'Kadim Çekirdek Fethi' }
          }));
        }
      }
      // 6. ANCIENT CHEST / SUPPLY VAULT
      else if (targetTile!.type === TileType.CHEST) {
        openChest(player, world, gx, gy);
      }

      // Check for Rare Archaeological Relic discovery!
      checkAndAwardRelicAt(player, targetTile!, gy);

      // Clear block and reveal its immediate neighbors
      targetTile!.type = TileType.EMPTY;
      delete targetTile!.ore;
      targetTile!.hardness = 0;
      targetTile!.revealed = true;
      revealAdjacentTiles(world, gx, gy);

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('polyminer:tile-changed', {
          detail: { gx, gy, tileType: TileType.EMPTY }
        }));
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
    }
    return;
  } else {
    sounds.stopDrill();
  }

  // 2. ACTIVE HARARET (OVERHEAT) VE TERMAL YÖNETİM MEKANİĞİ
  const radiator = getRadiatorSpecs(player.upgrades.radiator || 1);
  const coreShardBonusCool = player.discoveredRelics?.includes('core_shard') ? 15 : 0;
  const currentDepthRow = Math.floor((player.y + h / 2) / TILE_SIZE);
  const currentBiomeTier = getBiomeTier(currentDepthRow);

  // Subterranean idle fuel drain (0.25 L/s) when underground and not on elevator
  const isUnderground = player.y > (SURFACE_ROW + 0.5) * TILE_SIZE;
  if (isUnderground && !player.isInElevator && !player.elevatorAuto) {
    const amberMult = player.discoveredRelics?.includes('amber') ? 0.85 : 1.0;
    player.fuel = Math.max(0, player.fuel - 0.25 * amberMult * dt);
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
    // Natural Cooling when NOT drilling and NOT thrusting
    if (!player.isDrilling && !player.isThrusting) {
      const depthPenalty = (currentBiomeTier - 1) * 3.5;
      let effectiveCooling = Math.max(8, (radiator.coolingRate + coreShardBonusCool) - depthPenalty);
      if (player.isInElevator || player.elevatorAuto) {
        effectiveCooling *= 1.6; // Superconducting cooled elevator shaft
      }
      player.heat = Math.max(0, player.heat - effectiveCooling * dt);
    }
  }

  // Magma Rock proximity heat emission
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
  if (nearMagma && player.heatLockoutTimer <= 0) {
    player.heat = Math.min(100, player.heat + 8.0 * dt);
  }

  // 100% Overheat Lockout Trigger
  if (player.heat >= 100 && player.heatLockoutTimer <= 0) {
    player.heat = 100;
    player.heatLockoutTimer = 2.5; // 2.5 seconds lockout
    const tabletMult = player.discoveredRelics?.includes('obsidian_tablet') ? 0.75 : 1.0;
    const damage = Math.max(1, Math.round(15 * getDamageReductionFactor(player.upgrades.hull) * tabletMult));
    player.hull = Math.max(0, player.hull - damage);
    sounds.playSteamSizzle();
    sounds.playImpactSound(damage);
    addFloatingText(player.x + w / 2, player.y - 18, '🔥 MOTOR HARARET YAPTI! -15 CAN', '#ef4444');
    addShockwave(player.x + w / 2, player.y + h / 2, 40, '#ef4444');
    player.isDrilling = false;
    player.isStruggling = false;
    player.drillTarget = null;
    player.isThrusting = false;
    sounds.stopDrill();
    sounds.stopThrust();
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

      player.temperature = Math.max(22, player.temperature - 55 * dt);

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

      player.temperature = Math.max(22, player.temperature - 35 * dt);
    } else {
      sounds.stopElevatorHum();

      const amberMult = player.discoveredRelics?.includes('amber') ? 0.85 : 1.0;

      if (upKey && player.fuel > 0 && player.heatLockoutTimer <= 0) {
        if (player.isGrounded && player.vy >= 0) {
          player.vy = -140; // Immediate liftoff impulse
        }
        player.vy -= player.thrusterPower * dt;
        if (player.vy < MAX_FLY_SPEED) {
          player.vy = MAX_FLY_SPEED;
        }
        player.fuel = Math.max(0, player.fuel - THRUST_FUEL_DRAIN * amberMult * dt);
        player.heat = Math.min(100, player.heat + 10.0 * dt); // Rocket thrust builds heat
        player.isThrusting = true;
        sounds.startThrust();
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
      if (previousVy > SAFE_LANDING_SPEED && !player.isInElevator && !player.elevatorAuto) {
        const excessSpeed = previousVy - SAFE_LANDING_SPEED;
        const baseDamage = Math.round(excessSpeed * FALL_DAMAGE_FACTOR);
        const tabletMult = player.discoveredRelics?.includes('obsidian_tablet') ? 0.75 : 1.0;
        const damage = Math.round(baseDamage * getDamageReductionFactor(player.upgrades.hull) * tabletMult);
        if (damage > 0) {
          player.hull = Math.max(0, player.hull - damage);
          sounds.playImpactSound(damage);
          addFloatingText(player.x + PLAYER_WIDTH / 2, player.y - 12, `-${damage} DARBE`, '#ef4444');
        }
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
      if (!tile || tile.type === TileType.EMPTY) return false;
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

/**
 * Resets player to surface upon fuel starvation or hull destruction.
 */
export function towPlayerToSurface(player: PlayerExtendedState, cause: 'fuel' | 'hull' | 'stuck' = 'fuel'): void {
  console.log(`[POLYMINER] Emergency tow triggered: ${cause}`);
  player.cargo = [];
  player.x = 1.5 * TILE_SIZE - PLAYER_WIDTH / 2;
  player.y = (SURFACE_ROW - 1) * TILE_SIZE + (TILE_SIZE - PLAYER_HEIGHT);
  player.lastValidX = player.x;
  player.lastValidY = player.y;
  player.startDrillX = player.x;
  player.startDrillY = player.y;
  player.vx = 0;
  player.vy = 0;
  player.fuel = Math.max(player.fuel, Math.round(player.maxFuel * 0.3));
  player.hull = Math.max(player.hull, Math.round(player.maxHull * 0.5));
  player.isDrilling = false;
  player.drillTarget = null;
  player.drillProgress = 0;
  player.isGrounded = true;
  sounds.stopThrust();
  sounds.stopDrill();
  sounds.playAlarm();
}

/**
 * Safe teleport to surface using consumable item Q (retains all cargo!).
 */
export function teleportPlayerToSurfaceSafe(player: PlayerExtendedState): void {
  player.x = 1.5 * TILE_SIZE - PLAYER_WIDTH / 2;
  player.y = (SURFACE_ROW - 1) * TILE_SIZE + (TILE_SIZE - PLAYER_HEIGHT);
  player.lastValidX = player.x;
  player.lastValidY = player.y;
  player.startDrillX = player.x;
  player.startDrillY = player.y;
  player.vx = 0;
  player.vy = 0;
  player.isDrilling = false;
  player.drillTarget = null;
  player.drillProgress = 0;
  player.isGrounded = true;
  sounds.stopThrust();
  sounds.stopDrill();
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

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const gx = blastGx + dx;
      const gy = blastGy + dy;

      if (gy < SURFACE_ROW || gy >= GRID_HEIGHT || gx < 0 || gx >= GRID_WIDTH) {
        continue;
      }

      const tile = world[gy]?.[gx];
      if (!tile) continue;

      if (tile.type === TileType.FUEL_PAD || tile.type === TileType.SHOP_PAD) {
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

      // Ancient Core Blasted by Dynamite!
      if (tile.type === TileType.ANCIENT_CORE) {
        player.money += 50000;
        if (tile.ore && player.cargo.length < player.maxCargo) {
          player.cargo.push(tile.ore);
        }
        sounds.playVictoryFanfare();
        addFloatingText(
          gx * TILE_SIZE + TILE_SIZE / 2,
          gy * TILE_SIZE + TILE_SIZE / 2,
          '🏆 KADİM ÇEKİRDEK FETHEDİLDİ! +$50,000',
          '#ec4899'
        );
        player.hasWon = true;
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('polyminer:victory', { detail: { winnerName: player.name || 'Madenci' } }));
          window.dispatchEvent(new CustomEvent('polyminer:wallet-changed', {
            detail: { newMoney: player.money, changeAmount: 50000, reason: 'Kadim Çekirdek Fethi' }
          }));
        }
      }

      // Check for Rare Archaeological Relic discovery via dynamite!
      checkAndAwardRelicAt(player, tile, gy);

      // Obliterate block
      tile.type = TileType.EMPTY;
      delete tile.ore;
      tile.hardness = 0;
      tile.revealed = true;

      revealAdjacentTiles(world, gx, gy);
      checkAndTriggerFallingRock(world, gx, gy);

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('polyminer:tile-changed', {
          detail: { gx, gy, tileType: TileType.EMPTY }
        }));
      }
    }
  }

  // Shockwave & Bass Explosion Audio
  addShockwave(blastPxX, blastPxY, 110, '#facc15');
  sounds.playExplosion();
  addFloatingText(player.x + PLAYER_WIDTH / 2, player.y - 18, '💥 SİSMİK DİNAMİT!', '#facc15');

  if (collectedOreCount > 0) {
    sounds.playGemCollect(6);
  }

  return true;
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

    case 'repairKit':
      if (player.hull >= player.maxHull) return false;
      player.hull = Math.min(player.maxHull, player.hull + CONSUMABLES.repairKit.amount);
      player.inventory.repairKit--;
      sounds.playItemUse();
      addFloatingText(player.x + PLAYER_WIDTH / 2, player.y - 14, '+50 GÖVDE', '#4ade80');
      return true;

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
