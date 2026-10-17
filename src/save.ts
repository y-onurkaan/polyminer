import { PlayerExtendedState } from './player';
import { Tile, TileType } from './types';
import { ORE_DEFINITIONS } from './constants';

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
    temperature?: number;
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
        temperature: player.temperature,
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

/**
 * Migrates older or unversioned save files to the latest schema version.
 */
export function migrateSaveData(raw: unknown): SaveData | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as any;

  if (!d.grid || !Array.isArray(d.grid) || !d.player || typeof d.player !== 'object') {
    return null;
  }

  const p = d.player;
  const migratedPlayer: SaveData['player'] = {
    x: typeof p.x === 'number' ? p.x : 0,
    y: typeof p.y === 'number' ? p.y : 0,
    fuel: typeof p.fuel === 'number' ? p.fuel : 100,
    maxFuel: typeof p.maxFuel === 'number' ? p.maxFuel : 100,
    hull: typeof p.hull === 'number' ? p.hull : 100,
    maxHull: typeof p.maxHull === 'number' ? p.maxHull : 100,
    cargo: Array.isArray(p.cargo) ? p.cargo.filter((c: any) => typeof c === 'string') : [],
    maxCargo: typeof p.maxCargo === 'number' ? p.maxCargo : 10,
    money: typeof p.money === 'number' && Number.isFinite(p.money) ? Math.max(0, Math.floor(p.money)) : 0,
    drillSpeed: typeof p.drillSpeed === 'number' ? p.drillSpeed : 1.25,
    thrusterPower: typeof p.thrusterPower === 'number' ? p.thrusterPower : 1500,
    radarRadius: typeof p.radarRadius === 'number' ? p.radarRadius : 2.5,
    upgrades: p.upgrades && typeof p.upgrades === 'object' ? p.upgrades : {
      drill: 1, fuelTank: 1, cargo: 1, engine: 1, radar: 1, hull: 1, radiator: 1
    },
    inventory: p.inventory && typeof p.inventory === 'object' ? p.inventory : {
      fuelCanister: 0, repairKit: 0, teleporter: 0, dynamite: 0, elevatorRails: 0
    },
    temperature: typeof p.temperature === 'number' ? p.temperature : 24,
    heat: typeof p.heat === 'number' ? Math.round(p.heat) : 0,
    discoveredRelics: Array.isArray(p.discoveredRelics) ? p.discoveredRelics.filter((r: any) => typeof r === 'string') : [],
    museumRewardClaimed: !!p.museumRewardClaimed
  };

  return {
    version: CURRENT_SAVE_VERSION,
    timestamp: typeof d.timestamp === 'number' ? d.timestamp : Date.now(),
    playTime: typeof d.playTime === 'number' ? d.playTime : 0,
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
  player.fuel = saveData.player.fuel;
  player.maxFuel = saveData.player.maxFuel;
  player.hull = saveData.player.hull;
  player.maxHull = saveData.player.maxHull;
  player.money = saveData.player.money;
  player.drillSpeed = saveData.player.drillSpeed;
  player.thrusterPower = saveData.player.thrusterPower;
  player.radarRadius = saveData.player.radarRadius;
  player.upgrades = {
    drill: saveData.player.upgrades?.drill ?? 1,
    fuelTank: saveData.player.upgrades?.fuelTank ?? 1,
    cargo: saveData.player.upgrades?.cargo ?? 1,
    engine: saveData.player.upgrades?.engine ?? 1,
    radar: saveData.player.upgrades?.radar ?? 1,
    hull: (saveData.player.upgrades as any)?.hull ?? 1,
    radiator: (saveData.player.upgrades as any)?.radiator ?? 1
  };

  // Re-sync all derived upgrade capacities and stats with full fallback
  const CARGO_CAPACITIES: Record<number, number> = { 1: 10, 2: 16, 3: 25, 4: 40, 5: 65 };
  const FUEL_CAPACITIES: Record<number, number> = { 1: 100, 2: 160, 3: 240, 4: 360, 5: 520 };
  const HULL_CAPACITIES: Record<number, number> = { 1: 100, 2: 150, 3: 220, 4: 320, 5: 450 };
  const DRILL_SPEEDS: Record<number, number> = { 1: 1.25, 2: 1.85, 3: 2.60, 4: 3.75, 5: 5.50 };
  const THRUSTER_POWERS: Record<number, number> = { 1: 1500, 2: 1850, 3: 2300, 4: 2850, 5: 3600 };
  const RADAR_RADII: Record<number, number> = { 1: 2.5, 2: 3.5, 3: 4.5, 4: 5.8, 5: 7.5 };

  player.maxCargo = saveData.player.maxCargo ?? CARGO_CAPACITIES[player.upgrades.cargo] ?? 10;
  player.maxFuel = saveData.player.maxFuel ?? FUEL_CAPACITIES[player.upgrades.fuelTank] ?? 100;
  player.maxHull = saveData.player.maxHull ?? HULL_CAPACITIES[player.upgrades.hull] ?? 100;
  player.drillSpeed = saveData.player.drillSpeed ?? DRILL_SPEEDS[player.upgrades.drill] ?? 1.25;
  player.thrusterPower = saveData.player.thrusterPower ?? THRUSTER_POWERS[player.upgrades.engine] ?? 1500;
  player.radarRadius = saveData.player.radarRadius ?? RADAR_RADII[player.upgrades.radar] ?? 2.5;

  player.temperature = (saveData.player as any)?.temperature ?? 24;
  player.heat = (saveData.player as any)?.heat ?? 0;
  player.maxHeat = 100;
  player.heatLockoutTimer = 0;
  player.isStruggling = false;
  player.inventory = {
    fuelCanister: saveData.player.inventory?.fuelCanister ?? 0,
    repairKit: saveData.player.inventory?.repairKit ?? 0,
    teleporter: saveData.player.inventory?.teleporter ?? 0,
    dynamite: saveData.player.inventory?.dynamite ?? 0,
    elevatorRails: saveData.player.inventory?.elevatorRails ?? 0
  };
  player.hasWon = !!saveData.hasWon;
  player.discoveredRelics = Array.isArray(saveData.player.discoveredRelics) ? [...saveData.player.discoveredRelics] : [];
  player.museumRewardClaimed = !!saveData.player.museumRewardClaimed;

  // Restore Cargo
  player.cargo = [];
  if (Array.isArray(saveData.player.cargo)) {
    for (const oreId of saveData.player.cargo) {
      const def = ORE_DEFINITIONS[oreId];
      if (def) player.cargo.push(def);
    }
  }

  // 2. Restore Grid State
  applySavedGrid(saveData.grid, world);
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

      if (typeof savedTile.t === 'number') {
        targetTile.type = savedTile.t as TileType;
      }
      targetTile.revealed = savedTile.r === 1;
      targetTile.hasElevator = savedTile.e === 1;
      targetTile.relicId = typeof savedTile.m === 'string' ? savedTile.m : undefined;

      if (savedTile.o && typeof savedTile.o === 'string' && ORE_DEFINITIONS[savedTile.o]) {
        targetTile.ore = ORE_DEFINITIONS[savedTile.o];
      } else {
        delete targetTile.ore;
      }
    }
  }
}

/**
 * Removes saved game from localStorage.
 */
export function resetSave(slot: SaveSlot = 'solo'): void {
  localStorage.removeItem(getSaveKey(slot));
}
