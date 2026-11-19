import { PlayerExtendedState } from './player';
import { Tile, TileType } from './types';
import {
  GRID_WIDTH,
  GRID_HEIGHT,
  ORE_DEFINITIONS,
  RELIC_DEFINITIONS,
  getUpgradeLevelValue
} from './constants';
import { computeTileHardness, markWorldDirty } from './world';

export const VALID_TILE_TYPES: Set<number> = new Set([
  TileType.EMPTY,
  TileType.DIRT,
  TileType.ROCK,
  TileType.ORE,
  TileType.SHOP_PAD,
  TileType.FUEL_PAD,
  TileType.GAS_POCKET,
  TileType.MAGMA_ROCK,
  TileType.ANCIENT_CORE,
  TileType.CHEST
]);

export function isValidTileType(t: unknown): t is TileType {
  return typeof t === 'number' && VALID_TILE_TYPES.has(t);
}

export function isValidSavedGrid(grid: unknown): grid is SavedTile[][] {
  if (!Array.isArray(grid) || grid.length !== GRID_HEIGHT) {
    return false;
  }

  for (let y = 0; y < GRID_HEIGHT; y++) {
    const row = grid[y];
    if (!Array.isArray(row) || row.length !== GRID_WIDTH) {
      return false;
    }
    for (let x = 0; x < GRID_WIDTH; x++) {
      const cell = row[x];
      if (!cell || typeof cell !== 'object') {
        return false;
      }
      if (!Number.isInteger(cell.t) || !isValidTileType(cell.t)) {
        return false;
      }
      if (cell.r !== 0 && cell.r !== 1) {
        return false;
      }
      if (cell.o !== undefined) {
        if (typeof cell.o !== 'string' || !Object.hasOwn(ORE_DEFINITIONS, cell.o)) {
          return false;
        }
      }
      if (cell.m !== undefined) {
        if (typeof cell.m !== 'string' || !Object.hasOwn(RELIC_DEFINITIONS, cell.m)) {
          return false;
        }
      }
      if (cell.e !== undefined && cell.e !== 1) {
        return false;
      }
    }
  }

  return true;
}

export const SAVE_KEY = 'polyminer_save_v1';
export const SAVE_KEY_COOP = 'polyminer_save_coop_v1';
export const CURRENT_SAVE_VERSION = 1;

export type SaveSlot = 'solo' | 'coop';

export function getSaveKey(slot: SaveSlot = 'solo'): string {
  return slot === 'coop' ? SAVE_KEY_COOP : SAVE_KEY;
}

export interface SavedTile {
  t: number;      // TileType
  r: number;      // revealed (1 or 0)
  o?: string;     // oreId
  e?: number;     // hasElevator (1 or 0)
  m?: string;     // relicId
}

export interface SaveData {
  version: number;
  timestamp: number;
  playTime: number; // in seconds
  hasWon: boolean;
  player: {
    x: number;
    y: number;
    fuel: number;
    maxFuel: number;
    hull: number;
    maxHull: number;
    cargo: string[]; // ore IDs
    maxCargo?: number;
    money: number;
    drillSpeed: number;
    thrusterPower: number;
    radarRadius: number;
    upgrades: PlayerExtendedState['upgrades'];
    inventory: PlayerExtendedState['inventory'];
    heat?: number;
    discoveredRelics?: string[];
    museumRewardClaimed?: boolean;
  };
  grid: SavedTile[][];
}

/**
 * Serializes the world grid into a compact format.
 */
export function serializeWorld(world: Tile[][]): SavedTile[][] {
  return world.map(row =>
    row.map(tile => {
      const item: SavedTile = {
        t: tile.type,
        r: tile.revealed ? 1 : 0
      };
      if (tile.ore) {
        item.o = tile.ore.id.toUpperCase();
      }
      if (tile.hasElevator) {
        item.e = 1;
      }
      if (tile.relicId) {
        item.m = tile.relicId;
      }
      return item;
    })
  );
}

/**
 * Serializes and saves current game state to localStorage.
 */
export function saveGame(
  player: PlayerExtendedState,
  world: Tile[][],
  playTime: number,
  slot: SaveSlot = 'solo'
): boolean {
  try {
    const compactGrid = serializeWorld(world);

    const saveData: SaveData = {
      version: CURRENT_SAVE_VERSION,
      timestamp: Date.now(),
      playTime,
      hasWon: !!player.hasWon,
      player: {
        x: player.x,
        y: player.y,
        fuel: player.fuel,
        maxFuel: player.maxFuel,
        hull: player.hull,
        maxHull: player.maxHull,
        cargo: player.cargo.map(o => o.id.toUpperCase()),
        maxCargo: player.maxCargo,
        money: player.money,
        drillSpeed: player.drillSpeed,
        thrusterPower: player.thrusterPower,
        radarRadius: player.radarRadius,
        upgrades: { ...player.upgrades },
        inventory: { ...player.inventory },
        heat: Math.round(player.heat ?? 0),
        discoveredRelics: [...(player.discoveredRelics || [])],
        museumRewardClaimed: !!player.museumRewardClaimed
      },
      grid: compactGrid
    };

    localStorage.setItem(getSaveKey(slot), JSON.stringify(saveData));
    return true;
  } catch (err) {
    console.error(`[POLYMINER] Auto-save error (${slot}):`, err);
    return false;
  }
}

function normalizeUpgradeTier(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return 1;
  return Math.max(1, Math.min(5, Math.floor(raw)));
}

function normalizeNonNegInt(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return 0;
  return Math.max(0, Math.floor(raw));
}

/**
 * Migrates older or unversioned save files to the latest schema version.
 */
export function migrateSaveData(raw: unknown): SaveData | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as any;

  if (!d.grid || !Array.isArray(d.grid) || !d.player || typeof d.player !== 'object') {
    return null;
  }

  if (d.grid.length > 0 && !isValidSavedGrid(d.grid)) {
    return null;
  }

  const p = d.player;
  const rawUpgrades = p.upgrades && typeof p.upgrades === 'object' ? p.upgrades : {};
  const upgrades: PlayerExtendedState['upgrades'] = {
    drill: normalizeUpgradeTier(rawUpgrades.drill),
    fuelTank: normalizeUpgradeTier(rawUpgrades.fuelTank),
    cargo: normalizeUpgradeTier(rawUpgrades.cargo),
    engine: normalizeUpgradeTier(rawUpgrades.engine),
    radar: normalizeUpgradeTier(rawUpgrades.radar),
    hull: normalizeUpgradeTier(rawUpgrades.hull),
    radiator: normalizeUpgradeTier(rawUpgrades.radiator)
  };

  const rawInv = p.inventory && typeof p.inventory === 'object' ? p.inventory : {};
  const inventory: PlayerExtendedState['inventory'] = {
    fuelCanister: normalizeNonNegInt(rawInv.fuelCanister),
    repairKit: normalizeNonNegInt(rawInv.repairKit),
    teleporter: normalizeNonNegInt(rawInv.teleporter),
    dynamite: normalizeNonNegInt(rawInv.dynamite),
    elevatorRails: normalizeNonNegInt(rawInv.elevatorRails)
  };

  const maxFuel = (typeof p.maxFuel === 'number' && Number.isFinite(p.maxFuel) && p.maxFuel > 0)
    ? p.maxFuel
    : getUpgradeLevelValue('fuelTank', upgrades.fuelTank);
  const maxHull = (typeof p.maxHull === 'number' && Number.isFinite(p.maxHull) && p.maxHull > 0)
    ? p.maxHull
    : getUpgradeLevelValue('hull', upgrades.hull);
  const maxCargo = (typeof p.maxCargo === 'number' && Number.isFinite(p.maxCargo) && p.maxCargo > 0)
    ? p.maxCargo
    : getUpgradeLevelValue('cargo', upgrades.cargo);
  const drillSpeed = (typeof p.drillSpeed === 'number' && Number.isFinite(p.drillSpeed) && p.drillSpeed > 0)
    ? p.drillSpeed
    : getUpgradeLevelValue('drill', upgrades.drill);
  const thrusterPower = (typeof p.thrusterPower === 'number' && Number.isFinite(p.thrusterPower) && p.thrusterPower > 0)
    ? p.thrusterPower
    : getUpgradeLevelValue('engine', upgrades.engine);
  const radarRadius = (typeof p.radarRadius === 'number' && Number.isFinite(p.radarRadius) && p.radarRadius > 0)
    ? p.radarRadius
    : getUpgradeLevelValue('radar', upgrades.radar);

  const migratedPlayer: SaveData['player'] = {
    x: typeof p.x === 'number' && Number.isFinite(p.x) ? p.x : 0,
    y: typeof p.y === 'number' && Number.isFinite(p.y) ? p.y : 0,
    fuel: typeof p.fuel === 'number' && Number.isFinite(p.fuel) ? Math.max(0, Math.min(maxFuel, p.fuel)) : maxFuel,
    maxFuel,
    hull: typeof p.hull === 'number' && Number.isFinite(p.hull) ? Math.max(0, Math.min(maxHull, p.hull)) : maxHull,
    maxHull,
    cargo: Array.isArray(p.cargo)
      ? p.cargo.filter((c: unknown): c is string => typeof c === 'string' && Object.hasOwn(ORE_DEFINITIONS, c))
      : [],
    maxCargo,
    money: typeof p.money === 'number' && Number.isFinite(p.money)
      ? Math.max(-100_000, Math.min(1e9, Math.trunc(p.money)))
      : 0,
    drillSpeed,
    thrusterPower,
    radarRadius,
    upgrades,
    inventory,
    heat: typeof p.heat === 'number' && Number.isFinite(p.heat) ? Math.max(0, Math.min(100, Math.round(p.heat))) : 0,
    discoveredRelics: Array.isArray(p.discoveredRelics)
      ? p.discoveredRelics.filter((r: unknown): r is string => typeof r === 'string' && Object.hasOwn(RELIC_DEFINITIONS, r))
      : [],
    museumRewardClaimed: !!p.museumRewardClaimed
  };

  return {
    version: CURRENT_SAVE_VERSION,
    timestamp: typeof d.timestamp === 'number' && Number.isFinite(d.timestamp) ? d.timestamp : Date.now(),
    playTime: typeof d.playTime === 'number' && Number.isFinite(d.playTime) && d.playTime >= 0 ? d.playTime : 0,
    hasWon: !!d.hasWon,
    player: migratedPlayer,
    grid: d.grid
  };
}

/**
 * Attempts to load saved game from localStorage.
 */
export function loadGame(slot: SaveSlot = 'solo'): SaveData | null {
  try {
    const raw = localStorage.getItem(getSaveKey(slot));
    if (!raw) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
    return migrateSaveData(parsed);
  } catch (err) {
    console.error(`[POLYMINER] Load save error (${slot}):`, err);
    return null;
  }
}

/**
 * Applies saved data onto the live player and world structures.
 */
export function applyLoadedGame(
  saveData: SaveData,
  player: PlayerExtendedState,
  world: Tile[][]
): void {
  // 1. Restore Player State
  player.x = saveData.player.x;
  player.y = saveData.player.y;
  player.lastValidX = player.x;
  player.lastValidY = player.y;
  player.money = saveData.player.money;
  player.upgrades = {
    drill: normalizeUpgradeTier(saveData.player.upgrades?.drill),
    fuelTank: normalizeUpgradeTier(saveData.player.upgrades?.fuelTank),
    cargo: normalizeUpgradeTier(saveData.player.upgrades?.cargo),
    engine: normalizeUpgradeTier(saveData.player.upgrades?.engine),
    radar: normalizeUpgradeTier(saveData.player.upgrades?.radar),
    hull: normalizeUpgradeTier(saveData.player.upgrades?.hull),
    radiator: normalizeUpgradeTier(saveData.player.upgrades?.radiator)
  };

  // Re-sync all derived upgrade capacities and stats from canonical UPGRADES table
  player.maxCargo = getUpgradeLevelValue('cargo', player.upgrades.cargo);
  player.maxFuel = getUpgradeLevelValue('fuelTank', player.upgrades.fuelTank);
  player.maxHull = getUpgradeLevelValue('hull', player.upgrades.hull);
  player.drillSpeed = getUpgradeLevelValue('drill', player.upgrades.drill);
  player.thrusterPower = getUpgradeLevelValue('engine', player.upgrades.engine);
  player.radarRadius = getUpgradeLevelValue('radar', player.upgrades.radar);

  player.fuel = Math.max(0, Math.min(player.maxFuel, saveData.player.fuel));
  player.hull = Math.max(0, Math.min(player.maxHull, saveData.player.hull));

  player.heat = Math.max(0, Math.min(100, saveData.player.heat ?? 0));
  player.maxHeat = 100;
  player.heatLockoutTimer = 0;
  player.isStruggling = false;
  player.inventory = {
    fuelCanister: normalizeNonNegInt(saveData.player.inventory?.fuelCanister),
    repairKit: normalizeNonNegInt(saveData.player.inventory?.repairKit),
    teleporter: normalizeNonNegInt(saveData.player.inventory?.teleporter),
    dynamite: normalizeNonNegInt(saveData.player.inventory?.dynamite),
    elevatorRails: normalizeNonNegInt(saveData.player.inventory?.elevatorRails)
  };
  player.hasWon = !!saveData.hasWon;
  player.discoveredRelics = Array.isArray(saveData.player.discoveredRelics)
    ? saveData.player.discoveredRelics.filter((r): r is string => typeof r === 'string' && Object.hasOwn(RELIC_DEFINITIONS, r))
    : [];
  player.museumRewardClaimed = !!saveData.player.museumRewardClaimed;

  // Restore Cargo
  player.cargo = [];
  if (Array.isArray(saveData.player.cargo)) {
    for (const oreId of saveData.player.cargo) {
      if (typeof oreId === 'string' && Object.hasOwn(ORE_DEFINITIONS, oreId)) {
        player.cargo.push(ORE_DEFINITIONS[oreId]);
      }
    }
  }

  // 2. Restore Grid State only if dimensions match live world
  if (
    Array.isArray(saveData.grid) &&
    saveData.grid.length === world.length &&
    saveData.grid.every((row, y) => Array.isArray(row) && row.length === world[y].length)
  ) {
    applySavedGrid(saveData.grid, world);
  }
}

/**
 * Applies a compact saved grid onto the live world grid.
 */
export function applySavedGrid(savedGrid: SavedTile[][], world: Tile[][]): void {
  if (!Array.isArray(savedGrid) || !Array.isArray(world)) return;

  for (let y = 0; y < savedGrid.length && y < world.length; y++) {
    const savedRow = savedGrid[y];
    const worldRow = world[y];
    if (!Array.isArray(savedRow) || !Array.isArray(worldRow)) continue;

    for (let x = 0; x < savedRow.length && x < worldRow.length; x++) {
      const savedTile = savedRow[x];
      const targetTile = worldRow[x];
      if (!savedTile || typeof savedTile !== 'object' || !targetTile) continue;

      if (Number.isInteger(savedTile.t) && isValidTileType(savedTile.t)) {
        targetTile.type = savedTile.t;
      }
      targetTile.revealed = savedTile.r === 1;
      targetTile.hasElevator = savedTile.e === 1;
      targetTile.relicId =
        typeof savedTile.m === 'string' && Object.hasOwn(RELIC_DEFINITIONS, savedTile.m)
          ? savedTile.m
          : undefined;

      if (savedTile.o && typeof savedTile.o === 'string' && Object.hasOwn(ORE_DEFINITIONS, savedTile.o)) {
        targetTile.ore = ORE_DEFINITIONS[savedTile.o];
      } else {
        delete targetTile.ore;
      }

      targetTile.hardness = computeTileHardness(targetTile.type, y, targetTile.ore);
    }
  }
  markWorldDirty();
}

/**
 * Removes saved game from localStorage.
 */
export function resetSave(slot: SaveSlot = 'solo'): void {
  localStorage.removeItem(getSaveKey(slot));
}
