import { describe, it, expect, vi } from 'vitest';
import {
  NetworkManager,
  MAX_DEBT_ALLOWED,
  sanitizeName,
  sanitizeColor,
  normalizeRoomCode,
  evaluateWalletDelta,
  isValidWalletDelta,
  isValidTileType,
  isValidSavedGrid,
  isFiniteNum,
  clamp,
  isInt
} from './network';
import { TileType } from './types';
import { GRID_WIDTH, GRID_HEIGHT, RELIC_DEFINITIONS, getUpgradeLevelValue } from './constants';
import { migrateSaveData, applySavedGrid, CURRENT_SAVE_VERSION, SavedTile } from './save';
import { createEmptyWorld } from './world';

describe('P2P Sanitization & Validation Helpers', () => {
  describe('sanitizeName', () => {
    it('strips dangerous HTML tags and XSS vectors', () => {
      expect(sanitizeName('<script>alert(1)</script>')).toBe('scriptalert(1)/s');
      expect(sanitizeName('<img src=x onerror=alert(1)>')).toBe('img src=x onerro');
      expect(sanitizeName('NormalMiner')).toBe('NormalMiner');
    });

    it('strips control characters and trims whitespace', () => {
      expect(sanitizeName('   Miner   ')).toBe('Miner');
      expect(sanitizeName('Miner\u0000\u001f')).toBe('Miner');
    });

    it('clamps length to 16 characters max', () => {
      expect(sanitizeName('VeryLongPlayerMiningName123456')).toBe('VeryLongPlayerMi');
      expect(sanitizeName('VeryLongPlayerMiningName123456').length).toBe(16);
    });

    it('falls back to default when input is empty or invalid', () => {
      expect(sanitizeName('', 'Varsayilan')).toBe('Varsayilan');
      expect(sanitizeName(null, 'Varsayilan')).toBe('Varsayilan');
      expect(sanitizeName(undefined, 'Varsayilan')).toBe('Varsayilan');
      expect(sanitizeName(12345 as any, 'Varsayilan')).toBe('Varsayilan');
      expect(sanitizeName('   <<<>>>   ', 'Varsayilan')).toBe('Varsayilan');
    });
  });

  describe('sanitizeColor', () => {
    it('accepts valid 6-digit hex colors', () => {
      expect(sanitizeColor('#00f2fe')).toBe('#00f2fe');
      expect(sanitizeColor('#FF0000')).toBe('#FF0000');
      expect(sanitizeColor('#10b981')).toBe('#10b981');
    });

    it('rejects invalid hex strings and XSS injection vectors', () => {
      expect(sanitizeColor('red')).toBe('#00f2fe');
      expect(sanitizeColor('#fff')).toBe('#00f2fe');
      expect(sanitizeColor('"><script>alert(1)</script>')).toBe('#00f2fe');
      expect(sanitizeColor(null as any)).toBe('#00f2fe');
      expect(sanitizeColor(undefined as any)).toBe('#00f2fe');
    });
  });

  describe('Number & Coordinate Helpers', () => {
    it('isFiniteNum validates finite numbers only', () => {
      expect(isFiniteNum(100)).toBe(true);
      expect(isFiniteNum(0)).toBe(true);
      expect(isFiniteNum(-42.5)).toBe(true);
      expect(isFiniteNum(NaN)).toBe(false);
      expect(isFiniteNum(Infinity)).toBe(false);
      expect(isFiniteNum(-Infinity)).toBe(false);
      expect(isFiniteNum('100')).toBe(false);
      expect(isFiniteNum(null)).toBe(false);
    });

    it('clamp restricts value between lo and hi bounds', () => {
      expect(clamp(50, 0, 100)).toBe(50);
      expect(clamp(-10, 0, 100)).toBe(0);
      expect(clamp(150, 0, 100)).toBe(100);
    });

    it('isInt checks for true integers', () => {
      expect(isInt(10)).toBe(true);
      expect(isInt(0)).toBe(true);
      expect(isInt(-5)).toBe(true);
      expect(isInt(10.5)).toBe(false);
      expect(isInt(NaN)).toBe(false);
      expect(isInt(Infinity)).toBe(false);
    });
  });

  describe('isValidWalletDelta', () => {
    it('accepts legitimate transaction amounts', () => {
      expect(isValidWalletDelta(100)).toBe(true);
      expect(isValidWalletDelta(-500)).toBe(true);
      expect(isValidWalletDelta(10_000_000)).toBe(true);
      expect(isValidWalletDelta(-10_000_000)).toBe(true);
    });

    it('rejects zero, non-finite, out of bounds, or non-numeric values', () => {
      expect(isValidWalletDelta(0)).toBe(false);
      expect(isValidWalletDelta(0.5)).toBe(false);
      expect(isValidWalletDelta(-0.5)).toBe(false);
      expect(isValidWalletDelta(NaN)).toBe(false);
      expect(isValidWalletDelta(Infinity)).toBe(false);
      expect(isValidWalletDelta(-Infinity)).toBe(false);
      expect(isValidWalletDelta(10_000_001)).toBe(false);
      expect(isValidWalletDelta(-10_000_001)).toBe(false);
      expect(isValidWalletDelta('500')).toBe(false);
      expect(isValidWalletDelta(null)).toBe(false);
    });
  });

  describe('isValidTileType', () => {
    it('accepts valid TileType enum numbers', () => {
      expect(isValidTileType(TileType.EMPTY)).toBe(true);
      expect(isValidTileType(TileType.DIRT)).toBe(true);
      expect(isValidTileType(TileType.ROCK)).toBe(true);
      expect(isValidTileType(TileType.ORE)).toBe(true);
      expect(isValidTileType(TileType.CHEST)).toBe(true);
    });

    it('rejects numbers outside TileType enum and non-numbers', () => {
      expect(isValidTileType(-1)).toBe(false);
      expect(isValidTileType(99)).toBe(false);
      expect(isValidTileType('DIRT')).toBe(false);
      expect(isValidTileType(null)).toBe(false);
    });
  });

  describe('isValidSavedGrid', () => {
    function createMockGrid(): SavedTile[][] {
      const grid: SavedTile[][] = [];
      for (let y = 0; y < GRID_HEIGHT; y++) {
        const row: SavedTile[] = [];
        for (let x = 0; x < GRID_WIDTH; x++) {
          row.push({ t: TileType.DIRT, r: 0 });
        }
        grid.push(row);
      }
      return grid;
    }

    it('accepts a valid GRID_HEIGHT x GRID_WIDTH world grid', () => {
      const valid = createMockGrid();
      valid[3][5] = { t: TileType.ORE, r: 1, o: 'COPPER' };
      valid[10][2] = { t: TileType.EMPTY, r: 1, e: 1 };
      valid[50][12] = { t: TileType.DIRT, r: 0, m: 'dino_skull' };
      expect(isValidSavedGrid(valid)).toBe(true);
    });

    it('rejects grids with wrong row or column counts', () => {
      expect(isValidSavedGrid([])).toBe(false);
      expect(isValidSavedGrid([[null]])).toBe(false);

      const wrongHeight = createMockGrid().slice(0, 100);
      expect(isValidSavedGrid(wrongHeight)).toBe(false);

      const wrongWidth = createMockGrid();
      wrongWidth[0] = wrongWidth[0].slice(0, 10);
      expect(isValidSavedGrid(wrongWidth)).toBe(false);
    });

    it('rejects grids with corrupt cells or invalid enum values', () => {
      const badCellType = createMockGrid();
      badCellType[0][0] = { t: 999 as any, r: 0 };
      expect(isValidSavedGrid(badCellType)).toBe(false);

      const badRevealed = createMockGrid();
      badRevealed[0][0] = { t: TileType.DIRT, r: 2 as any };
      expect(isValidSavedGrid(badRevealed)).toBe(false);

      const badOre = createMockGrid();
      badOre[0][0] = { t: TileType.ORE, r: 1, o: 'UNOBTANIUM' };
      expect(isValidSavedGrid(badOre)).toBe(false);

      const badRelic = createMockGrid();
      badRelic[0][0] = { t: TileType.DIRT, r: 0, m: 'unknown_alien_relic' };
      expect(isValidSavedGrid(badRelic)).toBe(false);

      const badElevator = createMockGrid();
      badElevator[0][0] = { t: TileType.EMPTY, r: 1, e: 2 as any };
      expect(isValidSavedGrid(badElevator)).toBe(false);
    });
  });

  describe('migrateSaveData', () => {
    it('backfills missing fields and sets CURRENT_SAVE_VERSION', () => {
      const legacySave = {
        version: 1,
        player: {
          x: 100,
          y: 200,
          money: 1500
        },
        grid: []
      };

      const migrated = migrateSaveData(legacySave);
      expect(migrated).not.toBeNull();
      expect(migrated?.version).toBe(CURRENT_SAVE_VERSION);
      expect(migrated?.player.money).toBe(1500);
      expect(migrated?.player.fuel).toBe(getUpgradeLevelValue('fuelTank', 1));
      expect(migrated?.player.maxHull).toBe(100);
      expect(migrated?.player.upgrades.drill).toBe(1);
      expect(migrated?.player.inventory.fuelCanister).toBe(0);
    });

    it('returns null for corrupt or non-object data', () => {
      expect(migrateSaveData(null)).toBeNull();
      expect(migrateSaveData('not a save')).toBeNull();
      expect(migrateSaveData({ version: 1 })).toBeNull(); // missing player/grid
    });

    it('preserves reasonable negative debt and clamps extreme negative balances', () => {
      const debtSave = migrateSaveData({
        version: 1,
        player: { x: 0, y: 0, money: -250 },
        grid: []
      });
      expect(debtSave?.player.money).toBe(-250);

      const extremeDebtSave = migrateSaveData({
        version: 1,
        player: { x: 0, y: 0, money: -500_000 },
        grid: []
      });
      expect(extremeDebtSave?.player.money).toBe(-100_000);
    });

    it('rejects non-empty saves with corrupt tile types or prototype-chain ore/relic keys', () => {
      const makeGrid = (): SavedTile[][] =>
        Array.from({ length: GRID_HEIGHT }, () =>
          Array.from({ length: GRID_WIDTH }, () => ({ t: TileType.DIRT, r: 0 }))
        );

      const badTypeGrid = makeGrid();
      badTypeGrid[0][0] = { t: 999 as any, r: 0 };
      expect(migrateSaveData({ version: 1, player: { x: 0, y: 0, money: 0 }, grid: badTypeGrid })).toBeNull();

      const protoOreGrid = makeGrid();
      protoOreGrid[2][3] = { t: TileType.ORE, r: 1, o: '__proto__' };
      expect(isValidSavedGrid(protoOreGrid)).toBe(false);
      expect(migrateSaveData({ version: 1, player: { x: 0, y: 0, money: 0 }, grid: protoOreGrid })).toBeNull();

      const protoRelicGrid = makeGrid();
      protoRelicGrid[2][3] = { t: TileType.DIRT, r: 1, m: 'toString' };
      expect(isValidSavedGrid(protoRelicGrid)).toBe(false);
      expect(migrateSaveData({ version: 1, player: { x: 0, y: 0, money: 0 }, grid: protoRelicGrid })).toBeNull();

      const cleanCargoSave = migrateSaveData({
        version: 1,
        player: { x: 0, y: 0, money: 0, cargo: ['COPPER', 'toString', '__proto__'], discoveredRelics: ['trilobite', 'constructor'] },
        grid: []
      });
      expect(cleanCargoSave?.player.cargo).toEqual(['COPPER']);
      expect(cleanCargoSave?.player.discoveredRelics).toEqual(['trilobite']);

      // applySavedGrid ignores invalid cell types and prototype keys safely
      const world = createEmptyWorld();
      const rogueGrid = makeGrid();
      rogueGrid[5][5] = { t: 999 as any, r: 1, o: 'toString', m: 'constructor' };
      applySavedGrid(rogueGrid, world);
      expect(world[5][5].type).toBe(TileType.EMPTY);
      expect(world[5][5].ore).toBeUndefined();
      expect(world[5][5].relicId).toBeUndefined();
    });
  });

  describe('Room Code Validation & Host Co-op Integrity Guards', () => {
    it('normalizes valid 4-6 char room codes and rejects malformed inputs', () => {
      expect(normalizeRoomCode('a7k9m2')).toBe('POLY-A7K9M2');
      expect(normalizeRoomCode('  poly-4829  ')).toBe('POLY-4829');
      expect(normalizeRoomCode('')).toBeNull();
      expect(normalizeRoomCode('abc')).toBeNull();
      expect(normalizeRoomCode('POLY-O1I0')).toBeNull(); // O, I, 0, 1 excluded from charset
      expect(normalizeRoomCode('<script>')).toBeNull();
    });

    it('evaluates wallet deltas cleanly up to full MAX_DEBT_ALLOWED even beyond -$500', () => {
      expect(evaluateWalletDelta(0, -600, true)).toEqual({ accepted: true, newMoney: -600, delta: -600 });
      expect(evaluateWalletDelta(-400, -600, true)).toEqual({ accepted: true, newMoney: MAX_DEBT_ALLOWED, delta: -600 });
      expect(evaluateWalletDelta(-900, -200, true)).toEqual({ accepted: false, newMoney: -900, delta: 0 });
      expect(evaluateWalletDelta(100, -200, false)).toEqual({ accepted: false, newMoney: 100, delta: 0 });
    });

    it('handles WALLET_DELTA_REQUEST rejection with txId, museum relic count check, victory gate & prototype relic filtering', () => {
      let hostMoney = 300;
      let discovered: string[] = ['trilobite'];
      let coreCleared = false;
      const onWallet = vi.fn((d) => { hostMoney = d.money; });
      const onMuseum = vi.fn();
      const onVictory = vi.fn();
      const onRelic = vi.fn();

      const nm = new NetworkManager({
        getSharedMoney: () => hostMoney,
        getDiscoveredRelics: () => discovered,
        canAcceptVictory: () => coreCleared,
        onSharedWalletUpdate: onWallet,
        onMuseumRewardClaimed: onMuseum,
        onVictory,
        onSharedRelicUpdate: onRelic
      });
      (nm as any).isHost = true;

      const sent: any[] = [];
      const mockConn = {
        peer: 'guest-1',
        open: true,
        send: (msg: any) => sent.push(msg)
      } as any;

      // 1. Over-budget guest purchase is rejected with matching txId
      nm.handleIncomingPacket(
        { type: 'WALLET_DELTA_REQUEST', payload: { changeAmount: -500, reason: 'Matkap Sv.2', txId: 'tx-1-abc' } },
        mockConn
      );
      expect(hostMoney).toBe(300);
      expect(onWallet).not.toHaveBeenCalled();
      expect(sent[0]).toMatchObject({
        type: 'SHARED_WALLET_UPDATE',
        payload: { money: 300, changeAmount: 0, rejected: true, txId: 'tx-1-abc' }
      });

      // 2. Prototype-chain relic IDs are dropped
      nm.handleIncomingPacket({ type: 'SHARED_RELIC_UPDATE', payload: { relicId: 'toString' } }, mockConn);
      nm.handleIncomingPacket({ type: 'SHARED_RELIC_UPDATE', payload: { relicId: '__proto__' } }, mockConn);
      expect(onRelic).not.toHaveBeenCalled();

      // 3. Museum claim rejected before all 6 unique relics are discovered
      nm.handleIncomingPacket({ type: 'MUSEUM_REWARD_CLAIM_REQUEST', payload: {} }, mockConn);
      expect(onMuseum).not.toHaveBeenCalled();

      discovered = Object.keys(RELIC_DEFINITIONS);
      nm.handleIncomingPacket({ type: 'MUSEUM_REWARD_CLAIM_REQUEST', payload: {} }, mockConn);
      expect(onMuseum).toHaveBeenCalledTimes(1);

      // 4. Victory gated by canAcceptVictory()
      nm.handleIncomingPacket({ type: 'VICTORY_EVENT', payload: { winnerName: 'Guest' } }, mockConn);
      expect(onVictory).not.toHaveBeenCalled();

      coreCleared = true;
      nm.handleIncomingPacket({ type: 'VICTORY_EVENT', payload: { winnerName: 'Guest' } }, mockConn);
      expect(onVictory).toHaveBeenCalledTimes(1);
    });
  });
});
