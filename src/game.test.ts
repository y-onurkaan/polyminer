import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Tile, TileType } from './types';
import {
  TILE_SIZE,
  GRID_WIDTH,
  GRID_HEIGHT,
  SURFACE_ROW,
  ORE_DEFINITIONS,
  ROCK_HARDNESS,
  getUpgradeLevelValue
} from './constants';
import { createEmptyWorld, generateWorld, computeTileHardness } from './world';
import {
  createPlayer,
  updatePlayer,
  canDrillBlock,
  buyConsumableItem,
  useConsumableItem,
  detonateDynamite,
  towPlayerToSurface,
  teleportPlayerToSurfaceSafe,
  PLAYER_WIDTH,
  PLAYER_HEIGHT
} from './player';
import {
  activeBoulders,
  resetBoulders,
  checkAndTriggerFallingRock,
  updateBoulders
} from './boulders';
import { serializeWorld, applySavedGrid, migrateSaveData, applyLoadedGame } from './save';

describe('Polyminer Faz A Core Gameplay & Stabilization Tests', () => {
  beforeEach(() => {
    resetBoulders();
    vi.restoreAllMocks();
  });

  describe('Consumables Economy & Repair Kit', () => {
    it('adds exact unit counts when buying consumables (no 50x magnitude bug)', () => {
      const player = createPlayer();
      player.money = 1000;

      const fuelRes = buyConsumableItem(player, 'fuelCanister', 1);
      expect(fuelRes).toEqual({ ok: true, addedAmount: 1, totalCost: 150 });
      expect(player.inventory.fuelCanister).toBe(1);
      expect(player.money).toBe(850);

      const repairRes = buyConsumableItem(player, 'repairKit', 1);
      expect(repairRes).toEqual({ ok: true, addedAmount: 1, totalCost: 250 });
      expect(player.inventory.repairKit).toBe(1);
      expect(player.money).toBe(600);

      const railRes = buyConsumableItem(player, 'elevatorRails', 10);
      expect(railRes).toEqual({ ok: true, addedAmount: 10, totalCost: 250 });
      expect(player.inventory.elevatorRails).toBe(10);
      expect(player.money).toBe(350);

      // Insufficient funds rejected cleanly
      const tpRes = buyConsumableItem(player, 'teleporter', 1);
      expect(tpRes.ok).toBe(false);
      expect(player.inventory.teleporter).toBe(0);
      expect(player.money).toBe(350);

      // Invalid counts rejected
      expect(buyConsumableItem(player, 'fuelCanister', 0).ok).toBe(false);
      expect(buyConsumableItem(player, 'fuelCanister', -2).ok).toBe(false);
      expect(buyConsumableItem(player, 'fuelCanister', 1.5).ok).toBe(false);
    });

    it('repairKit [T] heals hull AND clears heat and heatLockoutTimer', () => {
      const player = createPlayer();
      player.inventory.repairKit = 2;

      // Damaged + overheated
      player.hull = 30;
      player.heat = 100;
      player.heatLockoutTimer = 2.0;
      expect(useConsumableItem(player, 'repairKit')).toBe(true);
      expect(player.hull).toBe(80);
      expect(player.heat).toBe(0);
      expect(player.heatLockoutTimer).toBe(0);
      expect(player.inventory.repairKit).toBe(1);

      // Full hull but overheated still allows cooling via repair kit
      player.hull = player.maxHull;
      player.heat = 90;
      player.heatLockoutTimer = 1.2;
      expect(useConsumableItem(player, 'repairKit')).toBe(true);
      expect(player.heat).toBe(0);
      expect(player.heatLockoutTimer).toBe(0);
      expect(player.inventory.repairKit).toBe(0);

      // Full hull and cool does not waste a kit
      player.inventory.repairKit = 1;
      expect(useConsumableItem(player, 'repairKit')).toBe(false);
      expect(player.inventory.repairKit).toBe(1);
    });
  });

  describe('Falling Boulders Physics & Chain Reactions', () => {
    it('deals crush damage at most once per boulder across multiple overlapping frames', () => {
      const world = createEmptyWorld();
      world[10][5] = { type: TileType.ROCK, hardness: ROCK_HARDNESS, revealed: true };
      world[14][5] = { type: TileType.DIRT, hardness: 1.0, revealed: true };

      const player = createPlayer();
      player.x = 5 * TILE_SIZE + (TILE_SIZE - PLAYER_WIDTH) / 2;
      player.y = 11.4 * TILE_SIZE;
      player.hull = 100;

      checkAndTriggerFallingRock(world, 5, 11);
      expect(activeBoulders.length).toBe(1);

      // Transition past 0.45s tremble
      updateBoulders(0.5, world, player);
      expect(activeBoulders[0].state).toBe('falling');

      // Step through player hitbox over many frames
      for (let i = 0; i < 15; i++) {
        updateBoulders(0.016, world, player);
      }

      expect(player.hull).toBe(45); // Exactly one -55 crush hit
    });

    it('preserves relicId on falling rocks and propagates chain reactions upward', () => {
      const world = createEmptyWorld();
      world[9][5] = { type: TileType.ROCK, hardness: ROCK_HARDNESS, revealed: true };
      world[10][5] = { type: TileType.ROCK, hardness: ROCK_HARDNESS, revealed: true, relicId: 'amber' };
      world[13][5] = { type: TileType.DIRT, hardness: 1.0, revealed: true };

      const player = createPlayer();
      player.x = 0;
      player.y = 0;

      checkAndTriggerFallingRock(world, 5, 11);
      expect(activeBoulders.length).toBe(1);

      // Wait for lower boulder to finish trembling and start falling; upper boulder starts trembling
      updateBoulders(0.5, world, player);
      expect(activeBoulders.length).toBe(2);
      expect(activeBoulders[0].state).toBe('falling');
      expect(activeBoulders[1].state).toBe('tremble');

      // Wait for upper boulder to start falling and both to settle
      for (let i = 0; i < 80; i++) {
        updateBoulders(0.03, world, player);
      }

      expect(activeBoulders.length).toBe(0);
      expect(world[12][5].type).toBe(TileType.ROCK);
      expect(world[12][5].relicId).toBe('amber');
      expect(world[11][5].type).toBe(TileType.ROCK);
    });

    it('removes boulders cleanly at world bottom boundary', () => {
      const world = createEmptyWorld();
      world[GRID_HEIGHT - 2][5] = { type: TileType.ROCK, hardness: ROCK_HARDNESS, revealed: true };

      const player = createPlayer();
      player.x = 0;
      player.y = 0;

      checkAndTriggerFallingRock(world, 5, GRID_HEIGHT - 1);
      expect(activeBoulders.length).toBe(1);

      for (let i = 0; i < 40; i++) {
        updateBoulders(0.05, world, player);
      }

      expect(activeBoulders.length).toBe(0);
      expect(world[GRID_HEIGHT - 1][5].type).toBe(TileType.ROCK);
    });
  });

  describe('World Generation, Hardness & Save/Load Integrity', () => {
    it('spawns exactly one ANCIENT_CORE in the final chamber and never as random ORE', () => {
      const world = generateWorld();
      let ancientCoreTiles = 0;
      let ancientCoreOres = 0;

      for (let y = 0; y < GRID_HEIGHT; y++) {
        for (let x = 0; x < GRID_WIDTH; x++) {
          const tile = world[y][x];
          if (tile.type === TileType.ANCIENT_CORE) ancientCoreTiles++;
          if (tile.type === TileType.ORE && tile.ore?.id === 'ancient_core') ancientCoreOres++;
        }
      }

      expect(ancientCoreTiles).toBe(1);
      expect(ancientCoreOres).toBe(0);
      expect(world[GRID_HEIGHT - 4][Math.floor(GRID_WIDTH / 2)].type).toBe(TileType.ANCIENT_CORE);
    });

    it('restores exact tile hardness via applySavedGrid and preserves debt/upgrades in migrateSaveData', () => {
      const worldA = createEmptyWorld();
      worldA[SURFACE_ROW][0] = { type: TileType.FUEL_PAD, hardness: Infinity, revealed: true };
      worldA[220][6] = {
        type: TileType.DIRT,
        hardness: computeTileHardness(TileType.DIRT, 220),
        revealed: true
      };
      worldA[220][7] = {
        type: TileType.ROCK,
        hardness: ROCK_HARDNESS,
        revealed: true
      };
      worldA[220][8] = {
        type: TileType.ORE,
        ore: ORE_DEFINITIONS.DIAMOND,
        hardness: computeTileHardness(TileType.ORE, 220, ORE_DEFINITIONS.DIAMOND),
        revealed: true
      };

      const serialized = serializeWorld(worldA);
      const worldB: Tile[][] = createEmptyWorld().map(row =>
        row.map(t => ({ ...t, hardness: 999 }))
      );

      applySavedGrid(serialized, worldB);

      expect(worldB[SURFACE_ROW][0].hardness).toBe(Infinity);
      expect(worldB[220][6].hardness).toBeCloseTo(computeTileHardness(TileType.DIRT, 220), 6);
      expect(worldB[220][7].hardness).toBe(ROCK_HARDNESS);
      expect(worldB[220][8].hardness).toBeCloseTo(
        computeTileHardness(TileType.ORE, 220, ORE_DEFINITIONS.DIAMOND),
        6
      );

      const legacySave = {
        version: 1,
        player: {
          x: 100,
          y: 200,
          money: -175,
          upgrades: { drill: 4, fuelTank: 2, cargo: 3, engine: 1, radar: 2, hull: 3, radiator: 2 }
        },
        grid: serialized
      };

      const migrated = migrateSaveData(legacySave);
      expect(migrated).not.toBeNull();
      expect(migrated!.player.money).toBe(-175);
      expect(migrated!.player.maxCargo).toBe(getUpgradeLevelValue('cargo', 3));
      expect(migrated!.player.maxFuel).toBe(getUpgradeLevelValue('fuelTank', 2));
      expect(migrated!.player.maxHull).toBe(getUpgradeLevelValue('hull', 3));
      expect(migrated!.player.drillSpeed).toBe(getUpgradeLevelValue('drill', 4));

      const restoredPlayer = createPlayer();
      applyLoadedGame(migrated!, restoredPlayer, worldB);
      expect(restoredPlayer.money).toBe(-175);
      expect(restoredPlayer.maxCargo).toBe(25);
      expect(restoredPlayer.drillSpeed).toBe(3.75);
    });
  });

  describe('Drilling Gates, Modal Freeze, Overheat & Dynamite', () => {
    it('blocks drilling station pads and non-finite hardness tiles', () => {
      const fuelPad: Tile = { type: TileType.FUEL_PAD, hardness: Infinity, revealed: true };
      const shopPad: Tile = { type: TileType.SHOP_PAD, hardness: Infinity, revealed: true };
      const infiniteDirt: Tile = { type: TileType.DIRT, hardness: Infinity, revealed: true };

      expect(canDrillBlock(fuelPad, 5, SURFACE_ROW)).toBe(false);
      expect(canDrillBlock(shopPad, 5, SURFACE_ROW)).toBe(false);
      expect(canDrillBlock(infiniteDirt, 5, SURFACE_ROW)).toBe(false);
    });

    it('freezes airborne player and rolls back active drill when disableInput is true', () => {
      const world = createEmptyWorld();
      const player = createPlayer();
      player.x = 10 * TILE_SIZE;
      player.y = 5 * TILE_SIZE;
      player.lastValidX = player.x;
      player.lastValidY = player.y;
      player.isGrounded = false;
      player.vy = 250;
      player.vx = 90;
      player.isDrilling = true;
      player.startDrillX = 10 * TILE_SIZE;
      player.startDrillY = 5 * TILE_SIZE;
      player.x = 10.4 * TILE_SIZE;
      player.drillTarget = { gx: 10, gy: 6 };
      player.elevatorAuto = 'up';

      updatePlayer(player, world, {}, 0.05, true);

      expect(player.vx).toBe(0);
      expect(player.vy).toBe(0);
      expect(player.y).toBe(5 * TILE_SIZE);
      expect(player.x).toBe(10 * TILE_SIZE);
      expect(player.isDrilling).toBe(false);
      expect(player.drillTarget).toBeNull();
      expect(player.elevatorAuto).toBeNull();
    });

    it('triggers overheat lockout immediately during drilling when heat reaches 100%', () => {
      const world = createEmptyWorld();
      world[10][5] = { type: TileType.ROCK, hardness: ROCK_HARDNESS, revealed: true };

      const player = createPlayer();
      player.upgrades.drill = 4;
      player.drillSpeed = 3.75;
      player.x = 5 * TILE_SIZE + (TILE_SIZE - PLAYER_WIDTH) / 2;
      player.y = 9 * TILE_SIZE + (TILE_SIZE - PLAYER_HEIGHT);
      player.startDrillX = player.x;
      player.startDrillY = player.y;
      player.lastValidX = player.x;
      player.lastValidY = player.y;
      player.isDrilling = true;
      player.facing = 'down';
      player.drillTarget = { gx: 5, gy: 10 };
      player.drillProgress = 0.2;
      player.heat = 99.5;
      player.hull = 100;

      updatePlayer(player, world, { ArrowDown: true }, 0.05, false);

      expect(player.isDrilling).toBe(false);
      expect(player.drillTarget).toBeNull();
      expect(player.heatLockoutTimer).toBe(2.5);
      expect(player.hull).toBe(85);
      expect(player.x).toBe(player.startDrillX);
      expect(player.y).toBe(player.startDrillY);
    });

    it('detonateDynamite skips EMPTY cells (no relic farming) and preserves elevator rails', () => {
      const world = createEmptyWorld();
      world[20][10].hasElevator = true;
      world[21][10].hasElevator = true;

      const player = createPlayer();
      player.x = 10 * TILE_SIZE + (TILE_SIZE - PLAYER_WIDTH) / 2;
      player.y = 20 * TILE_SIZE + (TILE_SIZE - PLAYER_HEIGHT) / 2;
      player.facing = 'down';
      player.inventory.dynamite = 1;
      player.discoveredRelics = [];

      vi.spyOn(Math, 'random').mockReturnValue(0.001);

      expect(detonateDynamite(player, world)).toBe(true);
      expect(player.inventory.dynamite).toBe(0);
      expect(player.discoveredRelics).toEqual([]);
      expect(world[20][10].hasElevator).toBe(true);
      expect(world[21][10].hasElevator).toBe(true);
    });

    it('tow and teleport reset elevator, thrust, and thermal states cleanly', () => {
      const player = createPlayer();
      player.elevatorAuto = 'down';
      player.elevatorCol = 8;
      player.isInElevator = true;
      player.isThrusting = true;
      player.isStruggling = true;
      player.heat = 95;
      player.heatLockoutTimer = 2.0;

      teleportPlayerToSurfaceSafe(player);
      expect(player.elevatorAuto).toBeNull();
      expect(player.elevatorCol).toBeUndefined();
      expect(player.isInElevator).toBe(false);
      expect(player.isThrusting).toBe(false);
      expect(player.isStruggling).toBe(false);
      expect(player.heat).toBe(0);
      expect(player.heatLockoutTimer).toBe(0);

      player.elevatorAuto = 'up';
      player.elevatorCol = 4;
      player.isInElevator = true;
      player.heat = 100;
      player.heatLockoutTimer = 2.5;
      player.fuel = 0;
      player.hull = 0;

      towPlayerToSurface(player, 'hull');
      expect(player.elevatorAuto).toBeNull();
      expect(player.elevatorCol).toBeUndefined();
      expect(player.isInElevator).toBe(false);
      expect(player.heat).toBe(0);
      expect(player.heatLockoutTimer).toBe(0);
      expect(player.fuel).toBeGreaterThan(0);
      expect(player.hull).toBeGreaterThan(0);
    });
  });
});
