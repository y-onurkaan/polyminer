import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Tile, TileType } from './types';
import {
  TILE_SIZE,
  GRID_WIDTH,
  GRID_HEIGHT,
  SURFACE_ROW,
  ORES,
  ORE_DEFINITIONS,
  ROCK_HARDNESS,
  FALL_BRAKE_MULTIPLIER,
  getUpgradeLevelValue
} from './constants';
import {
  createEmptyWorld,
  generateWorld,
  computeTileHardness,
  revealTilesAround,
  revealAdjacentTiles,
  getWorldRenderVersion
} from './world';
import {
  createPlayer,
  updatePlayer,
  canDrillBlock,
  getBlockTier,
  computeFallDamage,
  triggerOverheatLockout,
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
import { emitGameEvent, onGameEvent } from './events';
import { UI_ICONS, renderPolygonSvg, renderLevelSegmentsHtml } from './icons';
import { getOreVisualStyle } from './renderer';
import {
  MAX_PARTICLES,
  spawnParticle,
  addScreenShake,
  getScreenShakeOffset,
  addDamageFlash,
  getDamageFlashAlpha,
  showBiomeBanner,
  getBiomeBanner,
  updateEffects,
  clearEffects,
  getEffectsDebugStats
} from './effects';

describe('Polyminer Faz A Core Gameplay & Stabilization Tests', () => {
  beforeEach(() => {
    resetBoulders();
    clearEffects();
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

describe('Polyminer Faz B Architecture, Cache & Tier Tests', () => {
  beforeEach(() => {
    resetBoulders();
    clearEffects();
    vi.restoreAllMocks();
  });

  it('tracks worldRenderVersion only on actual mutations and reveals', () => {
    const v0 = getWorldRenderVersion();
    generateWorld();
    const vAfterGen = getWorldRenderVersion();
    expect(vAfterGen).toBeGreaterThan(v0);

    const world = createEmptyWorld();
    world[20][10].revealed = false;
    world[20][11].revealed = false;

    const vBeforeReveal = getWorldRenderVersion();
    const px = 10 * TILE_SIZE + TILE_SIZE / 2;
    const py = 20 * TILE_SIZE + TILE_SIZE / 2;
    revealTilesAround(world, px, py, 1, TILE_SIZE);
    const vAfterReveal = getWorldRenderVersion();
    expect(vAfterReveal).toBeGreaterThan(vBeforeReveal);

    // Repeating reveal on already-revealed tiles does not bump version
    revealTilesAround(world, px, py, 1, TILE_SIZE);
    expect(getWorldRenderVersion()).toBe(vAfterReveal);

    // Adjacent reveal bumps once when neighbors are hidden, then stays stable
    world[29][15].revealed = false;
    world[30][15].revealed = false;
    world[31][15].revealed = false;
    world[30][14].revealed = false;
    world[30][16].revealed = false;
    revealAdjacentTiles(world, 15, 30);
    const vAfterAdj = getWorldRenderVersion();
    expect(vAfterAdj).toBeGreaterThan(vAfterReveal);
    revealAdjacentTiles(world, 15, 30);
    expect(getWorldRenderVersion()).toBe(vAfterAdj);

    // applySavedGrid marks dirty
    applySavedGrid(serializeWorld(world), world);
    const vAfterApply = getWorldRenderVersion();
    expect(vAfterApply).toBeGreaterThan(vAfterAdj);

    // Falling boulder detach and settle mark dirty
    const bWorld = createEmptyWorld();
    bWorld[10][5] = { type: TileType.ROCK, hardness: ROCK_HARDNESS, revealed: true };
    bWorld[12][5] = { type: TileType.DIRT, hardness: 1.0, revealed: true };
    const bPlayer = createPlayer();
    bPlayer.x = 0;
    bPlayer.y = 0;

    const vBeforeDetach = getWorldRenderVersion();
    checkAndTriggerFallingRock(bWorld, 5, 11);
    const vAfterDetach = getWorldRenderVersion();
    expect(vAfterDetach).toBeGreaterThan(vBeforeDetach);

    updateBoulders(0.5, bWorld, bPlayer);
    for (let i = 0; i < 40 && activeBoulders.length > 0; i++) {
      updateBoulders(0.03, bWorld, bPlayer);
    }
    expect(activeBoulders.length).toBe(0);
    expect(getWorldRenderVersion()).toBeGreaterThan(vAfterDetach);
  });

  it('safely no-ops typed events without window and delivers payloads when window exists', () => {
    expect(typeof window).toBe('undefined');
    const unsubNoop = onGameEvent('polyminer:tile-changed', () => {});
    expect(() =>
      emitGameEvent('polyminer:tile-changed', { gx: 3, gy: 4, tileType: TileType.EMPTY })
    ).not.toThrow();
    unsubNoop();

    (globalThis as Record<string, unknown>).window = new EventTarget();
    try {
      const receivedWallets: Array<{ changeAmount: number; reason: string }> = [];
      let claimCalls = 0;

      const offWallet = onGameEvent('polyminer:wallet-changed', (detail) => {
        receivedWallets.push({ changeAmount: detail.changeAmount, reason: detail.reason });
      });
      const offClaim = onGameEvent('polyminer:museum-claim', () => {
        claimCalls++;
      });

      emitGameEvent('polyminer:wallet-changed', {
        changeAmount: 250,
        reason: 'Test Kazanç'
      });
      emitGameEvent('polyminer:museum-claim');

      expect(receivedWallets).toEqual([{ changeAmount: 250, reason: 'Test Kazanç' }]);
      expect(claimCalls).toBe(1);

      offWallet();
      offClaim();

      emitGameEvent('polyminer:wallet-changed', {
        changeAmount: 50,
        reason: 'Unsubscribed'
      });
      emitGameEvent('polyminer:museum-claim');
      expect(receivedWallets.length).toBe(1);
      expect(claimCalls).toBe(1);
    } finally {
      delete (globalThis as Record<string, unknown>).window;
    }
  });

  it('migrates and loads legacy saves containing deprecated temperature field', () => {
    const world = createEmptyWorld();
    const legacyWithTemp = {
      version: 1,
      player: {
        x: 120,
        y: 144,
        money: 500,
        temperature: 145
      },
      grid: serializeWorld(world)
    };

    const migrated = migrateSaveData(legacyWithTemp);
    expect(migrated).not.toBeNull();
    expect('temperature' in (migrated!.player as Record<string, unknown>)).toBe(false);

    const player = createPlayer();
    applyLoadedGame(migrated!, player, world);
    expect(player.money).toBe(500);
    expect('temperature' in (player as unknown as Record<string, unknown>)).toBe(false);
  });

  it('enforces biome-based getBlockTier and canDrillBlock rules for ROCK', () => {
    const rockTile: Tile = { type: TileType.ROCK, hardness: ROCK_HARDNESS, revealed: true };

    // Biome 1 (Üst Kabuk, row 20 -> Tier 2): Drill 1 struggles (true), Drill 2 normal (true)
    expect(getBlockTier(rockTile, 20)).toBe(2);
    expect(canDrillBlock(rockTile, 1, 20)).toBe(true);
    expect(canDrillBlock(rockTile, 2, 20)).toBe(true);

    // Biome 2 (Kuvars Mağaraları, row 80 -> Tier 3): Drill 1 locked (false), Drill 2 struggles (true)
    expect(getBlockTier(rockTile, 80)).toBe(3);
    expect(canDrillBlock(rockTile, 1, 80)).toBe(false);
    expect(canDrillBlock(rockTile, 2, 80)).toBe(true);

    // Biome 3 (Bazalt & Gaz, row 150 -> Tier 4): Drill 2 locked (false), Drill 3 struggles (true)
    expect(getBlockTier(rockTile, 150)).toBe(4);
    expect(canDrillBlock(rockTile, 2, 150)).toBe(false);
    expect(canDrillBlock(rockTile, 3, 150)).toBe(true);

    // Biome 4 (Magma Çekirdeği, row 220 -> Tier 5): Drill 3 locked (false), Drill 4 struggles (true)
    expect(getBlockTier(rockTile, 220)).toBe(5);
    expect(canDrillBlock(rockTile, 3, 220)).toBe(false);
    expect(canDrillBlock(rockTile, 4, 220)).toBe(true);
  });
});

describe('Polyminer Faz C Game Feel, Particles, Shake & Overlay Tests', () => {
  beforeEach(() => {
    resetBoulders();
    clearEffects();
    vi.restoreAllMocks();
  });

  it('caps pooled particles at MAX_PARTICLES, steps expiration via updateEffects, and resets on clearEffects', () => {
    for (let i = 0; i < MAX_PARTICLES + 25; i++) {
      spawnParticle({
        x: i,
        y: 100,
        vx: 10,
        vy: -20,
        size: 3,
        color: '#facc15',
        lifetime: 0.25,
        shape: 'square'
      });
    }

    expect(getEffectsDebugStats().particleCount).toBe(MAX_PARTICLES);

    // Step past particle lifetime -> all expire cleanly
    updateEffects(0.30);
    expect(getEffectsDebugStats().particleCount).toBe(0);

    // clearEffects clears particles, texts, shake, flash, and banner together
    spawnParticle({ x: 10, y: 10, vx: 0, vy: 0, size: 3, color: '#fff', lifetime: 1 });
    addScreenShake(6, 0.4);
    addDamageFlash(0.4);
    showBiomeBanner('Kuvars Mağaraları', 2, '#a855f7', 2.0);
    clearEffects();

    const stats = getEffectsDebugStats();
    expect(stats.particleCount).toBe(0);
    expect(stats.shakeActive).toBe(false);
    expect(stats.damageFlashAlpha).toBe(0);
    expect(stats.hasBiomeBanner).toBe(false);
  });

  it('retains stronger screen shake impulses, clamps damage flash, and decays biome banners over dt', () => {
    addScreenShake(10, 0.5);
    // Overlapping weaker short shake should not reduce remaining stronger effective intensity
    addScreenShake(2, 0.1);
    vi.spyOn(Math, 'random').mockReturnValue(1);
    const initialOffset = getScreenShakeOffset();
    expect(initialOffset.x).toBeGreaterThanOrEqual(9.9);
    expect(initialOffset.y).toBeGreaterThanOrEqual(9.9);

    updateEffects(0.55);
    expect(getScreenShakeOffset()).toEqual({ x: 0, y: 0 });
    expect(getEffectsDebugStats().shakeActive).toBe(false);

    // Damage flash clamps at 0.55 and decays to 0
    addDamageFlash(0.95);
    expect(getDamageFlashAlpha()).toBeCloseTo(0.55, 6);
    updateEffects(0.30);
    expect(getDamageFlashAlpha()).toBe(0);

    // Biome banner stays active during duration then clears cleanly
    showBiomeBanner('Bazalt & Gaz Katmanı', 3, '#a3e635', 1.5);
    expect(getBiomeBanner()?.name).toBe('Bazalt & Gaz Katmanı');
    updateEffects(1.0);
    expect(getBiomeBanner()?.tier).toBe(3);
    updateEffects(0.6);
    expect(getBiomeBanner()).toBeNull();
  });

  it('triggers particles, screen shake, and damage flash from dynamite, overheat lockout, and boulder crush', () => {
    // 1. Dynamite blast: particles + screen shake
    const world = createEmptyWorld();
    world[21][10] = { type: TileType.DIRT, hardness: 1.0, revealed: true };
    const player = createPlayer();
    player.x = 10 * TILE_SIZE + (TILE_SIZE - PLAYER_WIDTH) / 2;
    player.y = 20 * TILE_SIZE + (TILE_SIZE - PLAYER_HEIGHT) / 2;
    player.facing = 'down';
    player.inventory.dynamite = 1;

    expect(detonateDynamite(player, world)).toBe(true);
    let stats = getEffectsDebugStats();
    expect(stats.particleCount).toBeGreaterThan(0);
    expect(stats.shakeActive).toBe(true);

    // 2. Overheat lockout: screen shake + damage flash + steam puff
    clearEffects();
    player.hull = 100;
    triggerOverheatLockout(player);
    stats = getEffectsDebugStats();
    expect(stats.particleCount).toBeGreaterThan(0);
    expect(stats.shakeActive).toBe(true);
    expect(stats.damageFlashAlpha).toBeGreaterThan(0);

    // 3. Falling boulder crush: screen shake + damage flash + debris burst
    clearEffects();
    const crushWorld = createEmptyWorld();
    crushWorld[10][5] = { type: TileType.ROCK, hardness: ROCK_HARDNESS, revealed: true };
    crushWorld[14][5] = { type: TileType.DIRT, hardness: 1.0, revealed: true };
    player.x = 5 * TILE_SIZE + (TILE_SIZE - PLAYER_WIDTH) / 2;
    player.y = 11.4 * TILE_SIZE;
    player.hull = 100;

    checkAndTriggerFallingRock(crushWorld, 5, 11);
    updateBoulders(0.5, crushWorld, player);
    for (let i = 0; i < 15; i++) {
      updateBoulders(0.016, crushWorld, player);
    }

    stats = getEffectsDebugStats();
    expect(player.hull).toBe(45);
    expect(stats.particleCount).toBeGreaterThan(0);
    expect(stats.shakeActive).toBe(true);
    expect(stats.damageFlashAlpha).toBeGreaterThan(0);
  });

  it('computes smooth high-stakes fall damage curve with armor and relic scaling', () => {
    // Base hull Lv.1, no relic
    expect(computeFallDamage(240)).toBe(0); // 1 block safe
    expect(computeFallDamage(270)).toBe(0); // exact threshold safe
    expect(computeFallDamage(339.4)).toBe(15); // 2 blocks
    expect(computeFallDamage(415.7)).toBe(37); // 3 blocks
    expect(computeFallDamage(480)).toBe(58); // 4 blocks
    expect(computeFallDamage(536.7)).toBe(77); // 5 blocks
    expect(computeFallDamage(635)).toBe(112); // 7 blocks
    expect(computeFallDamage(760)).toBe(160); // 10 blocks terminal cliff

    // Smooth monotonic increments between 2-5 blocks (no sudden cliff jump)
    const d2 = computeFallDamage(339.4);
    const d3 = computeFallDamage(415.7);
    const d4 = computeFallDamage(480);
    const d5 = computeFallDamage(536.7);
    expect(d3 - d2).toBeLessThan(25);
    expect(d4 - d3).toBeLessThan(25);
    expect(d5 - d4).toBeLessThan(25);

    // Armor Lv.5 (x0.6) and Obsidian Tablet (x0.75) scaling at terminal speed
    expect(computeFallDamage(760, 5, false)).toBe(96);
    expect(computeFallDamage(760, 5, true)).toBe(72);
  });

  it('applies FALL_BRAKE_MULTIPLIER when thrusting to brake a fast fall', () => {
    const world = createEmptyWorld();

    const fallingPlayer = createPlayer();
    fallingPlayer.x = 10 * TILE_SIZE;
    fallingPlayer.y = 15 * TILE_SIZE;
    fallingPlayer.isGrounded = false;
    fallingPlayer.vy = 500;

    updatePlayer(fallingPlayer, world, { ArrowUp: true }, 0.05, false);
    const brakeDelta = 500 - fallingPlayer.vy;
    expect(brakeDelta).toBeCloseTo(fallingPlayer.thrusterPower * FALL_BRAKE_MULTIPLIER * 0.05, 4);

    const climbPlayer = createPlayer();
    climbPlayer.x = 10 * TILE_SIZE;
    climbPlayer.y = 15 * TILE_SIZE;
    climbPlayer.isGrounded = false;
    climbPlayer.vy = 0;

    updatePlayer(climbPlayer, world, { ArrowUp: true }, 0.05, false);
    const climbDelta = 0 - climbPlayer.vy;
    expect(climbDelta).toBeCloseTo(climbPlayer.thrusterPower * 0.05, 4);
    expect(brakeDelta).toBeGreaterThan(climbDelta);
  });

  it('uses canonical 60L starter fuel tank and clamps legacy 100L saves on load', () => {
    const starter = createPlayer();
    expect(starter.maxFuel).toBe(getUpgradeLevelValue('fuelTank', 1));
    expect(starter.maxFuel).toBe(60);
    expect(starter.fuel).toBe(60);

    const world = createEmptyWorld();
    const legacy100Save = {
      version: 1,
      player: {
        x: 120,
        y: 144,
        fuel: 100,
        maxFuel: 100,
        money: 200,
        upgrades: { fuelTank: 1 }
      },
      grid: serializeWorld(world)
    };

    const migrated = migrateSaveData(legacy100Save);
    expect(migrated).not.toBeNull();
    const restored = createPlayer();
    applyLoadedGame(migrated!, restored, world);
    expect(restored.maxFuel).toBe(60);
    expect(restored.fuel).toBe(60);
  });
});

describe('Polyminer Faz D SVG Icons, Polygon & Segmented Level UI Helpers', () => {
  it('renders regular mineral polygons with exact vertex counts (3G to 12G) and inner facet', () => {
    for (const [sides, color] of [[3, '#d97706'], [4, '#94a3b8'], [6, '#facc15'], [8, '#38bdf8'], [12, '#ec4899']] as const) {
      const svg = renderPolygonSvg(sides, color, 18);
      const matches = [...svg.matchAll(/points="([^"]+)"/g)];
      expect(matches.length).toBe(2);
      const outerVerts = matches[0][1].trim().split(/\s+/);
      const innerVerts = matches[1][1].trim().split(/\s+/);
      expect(outerVerts.length).toBe(sides);
      expect(innerVerts.length).toBe(sides);
      expect(svg).toContain(`fill="${color}"`);
    }
  });

  it('renders segmented level bars with accurate filled and maxed states', () => {
    const lv2 = renderLevelSegmentsHtml(2, 5);
    expect((lv2.match(/class="level-seg filled"/g) || []).length).toBe(2);
    expect((lv2.match(/class="level-seg"/g) || []).length).toBe(3);
    expect(lv2).not.toContain('maxed');

    const lv5 = renderLevelSegmentsHtml(5, 5);
    expect((lv5.match(/class="level-seg filled maxed"/g) || []).length).toBe(5);
    expect(lv5).toContain('aria-label="Seviye 5/5"');
  });

  it('exposes complete SVG icon markup for HUD, upgrades, consumables, and shop controls', () => {
    for (const [key, markup] of Object.entries(UI_ICONS)) {
      expect(markup, key).toContain('<svg ');
      expect(markup, key).toContain('class="ui-svg-icon"');
      expect(markup, key).toContain('aria-hidden="true"');
    }
  });

  it('provides distinct 5-tone faceted material styles for all mineral ores', () => {
    const materialById: Record<string, string> = {
      copper: 'metal',
      iron: 'metal',
      silver: 'precious_metal',
      gold: 'precious_metal',
      emerald: 'gem',
      diamond: 'gem',
      ancient_core: 'relic'
    };

    for (const ore of ORES) {
      const style = getOreVisualStyle(ore.id, ore.color);
      expect(style.material, ore.id).toBe(materialById[ore.id]);
      expect(new Set([style.spec, style.light, style.base, style.shadow, style.deep]).size, ore.id).toBeGreaterThanOrEqual(4);
      expect(style.veinColor.length).toBeGreaterThan(0);

      if (ore.sides >= 5) {
        expect(style.sparkle, ore.id).toBe(true);
      } else {
        expect(style.sparkle, ore.id).toBe(false);
      }

      if (ore.sides >= 6) {
        expect(style.auraRgb, ore.id).toBeTruthy();
      } else {
        expect(style.auraRgb, ore.id).toBeUndefined();
      }
    }
  });

  it('adds faceted bevel path layers and silver+ specular glint to polygon SVGs', () => {
    const copperSvg = renderPolygonSvg(3, '#d97706', 18);
    expect((copperSvg.match(/<path /g) || []).length).toBeGreaterThanOrEqual(2);
    expect(copperSvg).not.toContain('<circle ');

    const ironSvg = renderPolygonSvg(4, '#94a3b8', 18);
    expect((ironSvg.match(/<path /g) || []).length).toBeGreaterThanOrEqual(2);
    expect(ironSvg).not.toContain('<circle ');

    const silverSvg = renderPolygonSvg(5, '#e2e8f0', 18);
    expect((silverSvg.match(/<path /g) || []).length).toBeGreaterThanOrEqual(3);
    expect(silverSvg).toContain('<circle ');

    const diamondSvg = renderPolygonSvg(8, '#38bdf8', 20);
    expect((diamondSvg.match(/<path /g) || []).length).toBeGreaterThanOrEqual(3);
    expect(diamondSvg).toContain('<circle ');
  });
});
