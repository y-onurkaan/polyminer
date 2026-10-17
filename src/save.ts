import { PlayerExtendedState } from './player';
import { Tile, TileType } from './types';
import { ORE_DEFINITIONS } from './constants';

export const SAVE_KEY = 'polyminer_save_v1';
export const SAVE_KEY_COOP = 'polyminer_save_coop_v1';

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
      version: 1,
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
 * Attempts to load saved game from localStorage.
 */
export function loadGame(slot: SaveSlot = 'solo'): SaveData | null {
  try {
    const raw = localStorage.getItem(getSaveKey(slot));
    if (!raw) return null;
    const data = JSON.parse(raw) as SaveData;
    if (!data || data.version !== 1 || !data.grid || !data.player) {
      return null;
    }
    return data;
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
  for (let y = 0; y < savedGrid.length && y < world.length; y++) {
    const savedRow = savedGrid[y];
    const worldRow = world[y];
    for (let x = 0; x < savedRow.length && x < worldRow.length; x++) {
      const savedTile = savedRow[x];
      const targetTile = worldRow[x];

      targetTile.type = savedTile.t as TileType;
      targetTile.revealed = savedTile.r === 1;
      targetTile.hasElevator = savedTile.e === 1;
      targetTile.relicId = savedTile.m;

      if (savedTile.o && ORE_DEFINITIONS[savedTile.o]) {
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
