import { Tile, TileType, OreDefinition } from './types';
import {
  GRID_WIDTH,
  GRID_HEIGHT,
  SURFACE_ROW,
  ORE_DEFINITIONS,
  ROCK_HARDNESS,
  getBiomeForDepth,
  RELIC_DEFINITIONS
} from './constants';

let worldRenderVersion = 1;

export function getWorldRenderVersion(): number {
  return worldRenderVersion;
}

export function markWorldDirty(): void {
  worldRenderVersion++;
}

export function createEmptyWorld(): Tile[][] {
  const world: Tile[][] = [];
  for (let y = 0; y < GRID_HEIGHT; y++) {
    const row: Tile[] = [];
    for (let x = 0; x < GRID_WIDTH; x++) {
      row.push({
        type: TileType.EMPTY,
        hardness: 0,
        revealed: y <= SURFACE_ROW
      });
    }
    world.push(row);
  }
  return world;
}

export function computeTileHardness(type: TileType, y: number, ore?: OreDefinition): number {
  switch (type) {
    case TileType.EMPTY:
      return 0;
    case TileType.FUEL_PAD:
    case TileType.SHOP_PAD:
    case TileType.BEDROCK:
      return Infinity;
    case TileType.ROCK:
      return ROCK_HARDNESS;
    case TileType.GAS_POCKET:
      return 1.2;
    case TileType.MAGMA_ROCK:
      return y >= GRID_HEIGHT - 6 ? 4.5 : 2.8;
    case TileType.CHEST:
      return 1.5;
    case TileType.ANCIENT_CORE:
      return ORE_DEFINITIONS.ANCIENT_CORE.hardness;
    case TileType.ORE:
      return (ore?.hardness ?? 1.0) + getBiomeForDepth(y).extraHardness * 0.3;
    case TileType.DIRT:
    default: {
      if (y <= SURFACE_ROW) return 1.0;
      const depthProgress = (y - SURFACE_ROW) / (GRID_HEIGHT - SURFACE_ROW);
      return 1.0 + depthProgress * 0.4 + getBiomeForDepth(y).extraHardness;
    }
  }
}

type HorizontalZone = 'left' | 'center' | 'right';

interface VeinSpec {
  biomeId: string;
  ore: OreDefinition;
  minY: number;
  maxY: number;
  count: number;
  minSize: number;
  maxSize: number;
  wingRatio: number;
  forceMinWingCount?: number;
  crustType?: 'k3' | 'k4_emerald' | 'k4_diamond';
}

function getBackgroundOreChance(y: number): number {
  if (y <= 60) return 0.068;
  if (y <= 130) return 0.040;
  if (y <= 205) return 0.015;
  return 0.010;
}

/**
 * Strictly biome-separated background ore picker:
 * - Biome 1 (4..60): Copper, Iron (22+)
 * - Biome 2 (61..130): Copper, Iron, Silver (65+)
 * - Biome 3 (131..205): Gold, Emerald (180+) ONLY (zero Copper/Iron/Silver)
 * - Biome 4 (206..273): Gold, Emerald ONLY (Diamonds spawn exclusively in K4 Geodes)
 */
function selectBackgroundOreForDepth(y: number): OreDefinition | undefined {
  let pool: { ore: OreDefinition; weight: number }[] = [];

  if (y <= 60) {
    pool = [{ ore: ORE_DEFINITIONS.COPPER, weight: 68 }];
    if (y >= ORE_DEFINITIONS.IRON.minDepth) {
      pool.push({ ore: ORE_DEFINITIONS.IRON, weight: 32 });
    }
  } else if (y <= 130) {
    pool = [
      { ore: ORE_DEFINITIONS.COPPER, weight: 18 },
      { ore: ORE_DEFINITIONS.IRON, weight: 36 }
    ];
    if (y >= ORE_DEFINITIONS.SILVER.minDepth) {
      pool.push({ ore: ORE_DEFINITIONS.SILVER, weight: 46 });
    }
  } else if (y <= 205) {
    pool = [{ ore: ORE_DEFINITIONS.GOLD, weight: 85 }];
    if (y >= ORE_DEFINITIONS.EMERALD.minDepth) {
      pool.push({ ore: ORE_DEFINITIONS.EMERALD, weight: 15 });
    }
  } else {
    pool = [
      { ore: ORE_DEFINITIONS.GOLD, weight: 55 },
      { ore: ORE_DEFINITIONS.EMERALD, weight: 45 }
    ];
  }

  if (pool.length === 0) return undefined;
  const totalWeight = pool.reduce((sum, item) => sum + item.weight, 0);
  let random = Math.random() * totalWeight;
  for (const item of pool) {
    if (random < item.weight) {
      return item.ore;
    }
    random -= item.weight;
  }
  return pool[pool.length - 1].ore;
}

function pickXInZone(zone: HorizontalZone): number {
  if (zone === 'left') return 1 + Math.floor(Math.random() * 8); // 1..8
  if (zone === 'center') return 9 + Math.floor(Math.random() * 6); // 9..14
  return 15 + Math.floor(Math.random() * 8); // 15..22
}

function isOreReplaceable(tile: Tile | undefined): boolean {
  if (!tile) return false;
  return (
    tile.type !== TileType.EMPTY &&
    tile.type !== TileType.ORE &&
    tile.type !== TileType.BEDROCK &&
    tile.type !== TileType.ANCIENT_CORE &&
    tile.type !== TileType.FUEL_PAD &&
    tile.type !== TileType.SHOP_PAD &&
    tile.type !== TileType.CHEST
  );
}

function growVein(
  world: Tile[][],
  seedX: number,
  seedY: number,
  ore: OreDefinition,
  targetSize: number,
  minY: number,
  maxY: number
): { gx: number; gy: number }[] {
  const seedTile = world[seedY]?.[seedX];
  if (!isOreReplaceable(seedTile)) return [];

  seedTile.type = TileType.ORE;
  seedTile.ore = ore;
  seedTile.hardness = computeTileHardness(TileType.ORE, seedY, ore);
  delete seedTile.relicId;

  const placed: { gx: number; gy: number }[] = [{ gx: seedX, gy: seedY }];
  const visited = new Set<string>([`${seedX},${seedY}`]);

  let guard = 0;
  while (placed.length < targetSize && guard < 40) {
    guard++;
    const candidates: { gx: number; gy: number; weight: number }[] = [];

    for (const cell of placed) {
      const dirs = [
        { dx: -1, dy: 0, weight: 0.62 },
        { dx: 1, dy: 0, weight: 0.62 },
        { dx: 0, dy: -1, weight: 0.38 },
        { dx: 0, dy: 1, weight: 0.38 }
      ];
      for (const d of dirs) {
        const nx = cell.gx + d.dx;
        const ny = cell.gy + d.dy;
        if (nx < 1 || nx > GRID_WIDTH - 2 || ny < minY || ny > maxY) continue;
        const key = `${nx},${ny}`;
        if (visited.has(key)) continue;
        const nTile = world[ny]?.[nx];
        if (!isOreReplaceable(nTile)) continue;
        // Prefer overwriting regular DIRT over rocks/hazards to keep veins natural
        const terrainBias = nTile.type === TileType.DIRT ? 1.0 : 0.45;
        candidates.push({ gx: nx, gy: ny, weight: d.weight * terrainBias });
      }
    }

    if (candidates.length === 0) break;

    const totalW = candidates.reduce((acc, c) => acc + c.weight, 0);
    let r = Math.random() * totalW;
    let picked = candidates[candidates.length - 1];
    for (const c of candidates) {
      if (r < c.weight) {
        picked = c;
        break;
      }
      r -= c.weight;
    }

    visited.add(`${picked.gx},${picked.gy}`);
    const targetTile = world[picked.gy][picked.gx];
    targetTile.type = TileType.ORE;
    targetTile.ore = ore;
    targetTile.hardness = computeTileHardness(TileType.ORE, picked.gy, ore);
    delete targetTile.relicId;
    placed.push({ gx: picked.gx, gy: picked.gy });
  }

  return placed;
}

function applyVeinCrust(
  world: Tile[][],
  veinCells: { gx: number; gy: number }[],
  crustType: 'k3' | 'k4_emerald' | 'k4_diamond',
  minY: number,
  maxY: number
): void {
  const neighborMap = new Map<string, { gx: number; gy: number }>();
  for (const cell of veinCells) {
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nx = cell.gx + dx;
      const ny = cell.gy + dy;
      if (nx < 1 || nx > GRID_WIDTH - 2 || ny < minY || ny > maxY) continue;
      const tile = world[ny]?.[nx];
      if (tile && tile.type === TileType.DIRT) {
        neighborMap.set(`${nx},${ny}`, { gx: nx, gy: ny });
      }
    }
  }

  const neighbors = Array.from(neighborMap.values());
  for (let i = neighbors.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [neighbors[i], neighbors[j]] = [neighbors[j], neighbors[i]];
  }

  const count =
    crustType === 'k4_diamond'
      ? Math.min(neighbors.length, 4 + Math.floor(Math.random() * 2))
      : Math.min(neighbors.length, 2 + Math.floor(Math.random() * 2));

  for (let i = 0; i < count; i++) {
    const { gx, gy } = neighbors[i];
    const tile = world[gy]?.[gx];
    if (!tile || tile.type !== TileType.DIRT) continue;

    let newType = TileType.ROCK;
    if (crustType === 'k3') {
      newType = Math.random() < 0.65 ? TileType.ROCK : TileType.GAS_POCKET;
    } else if (crustType === 'k4_emerald') {
      newType = Math.random() < 0.60 ? TileType.ROCK : TileType.MAGMA_ROCK;
    } else {
      newType = Math.random() < 0.50 ? TileType.ROCK : TileType.MAGMA_ROCK;
    }

    tile.type = newType;
    tile.hardness = computeTileHardness(newType, gy);
  }
}

function placeOreVeins(world: Tile[][]): void {
  const specs: VeinSpec[] = [
    // Katman 1 (Üst Kabuk: Bakır + Demir)
    { biomeId: 'crust', ore: ORE_DEFINITIONS.COPPER, minY: 6, maxY: 58, count: 6, minSize: 3, maxSize: 4, wingRatio: 0.6 },
    { biomeId: 'crust', ore: ORE_DEFINITIONS.IRON, minY: 24, maxY: 58, count: 4, minSize: 2, maxSize: 3, wingRatio: 0.65 },

    // Katman 2 (Kuvars Mağaraları: Demir + Gümüş)
    { biomeId: 'quartz', ore: ORE_DEFINITIONS.IRON, minY: 62, maxY: 128, count: 4, minSize: 3, maxSize: 4, wingRatio: 0.65 },
    { biomeId: 'quartz', ore: ORE_DEFINITIONS.SILVER, minY: 66, maxY: 128, count: 10, minSize: 4, maxSize: 5, wingRatio: 0.7 },

    // Katman 3 (Bazalt & Gaz: Yalnızca Altın + Zümrüt)
    { biomeId: 'basalt', ore: ORE_DEFINITIONS.GOLD, minY: 132, maxY: 203, count: 12, minSize: 4, maxSize: 6, wingRatio: 0.8 },
    { biomeId: 'basalt', ore: ORE_DEFINITIONS.EMERALD, minY: 175, maxY: 203, count: 6, minSize: 3, maxSize: 5, wingRatio: 0.8, crustType: 'k3' },

    // Katman 4 (Magma Çekirdeği: Yalnızca Altın + Zümrüt + Elmas Jeodları)
    { biomeId: 'magma', ore: ORE_DEFINITIONS.GOLD, minY: 208, maxY: 266, count: 4, minSize: 3, maxSize: 4, wingRatio: 0.75 },
    { biomeId: 'magma', ore: ORE_DEFINITIONS.EMERALD, minY: 208, maxY: 268, count: 8, minSize: 4, maxSize: 5, wingRatio: 0.8, crustType: 'k4_emerald' },
    { biomeId: 'magma', ore: ORE_DEFINITIONS.DIAMOND, minY: 222, maxY: 268, count: 6, minSize: 3, maxSize: 4, wingRatio: 0.85, forceMinWingCount: 5, crustType: 'k4_diamond' }
  ];

  const seedsByBiome: Record<string, { gx: number; gy: number }[]> = {};

  for (const spec of specs) {
    if (!seedsByBiome[spec.biomeId]) seedsByBiome[spec.biomeId] = [];
    const biomeSeeds = seedsByBiome[spec.biomeId];

    const wingCount = spec.forceMinWingCount
      ? Math.max(spec.forceMinWingCount, Math.round(spec.count * spec.wingRatio))
      : Math.round(spec.count * spec.wingRatio);

    const zones: HorizontalZone[] = [];
    let nextLeft = Math.random() < 0.5;
    for (let i = 0; i < wingCount; i++) {
      zones.push(nextLeft ? 'left' : 'right');
      nextLeft = !nextLeft;
    }
    for (let i = wingCount; i < spec.count; i++) {
      zones.push('center');
    }
    for (let i = zones.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [zones[i], zones[j]] = [zones[j], zones[i]];
    }

    for (const zone of zones) {
      let seedX = -1;
      let seedY = -1;

      for (let attempt = 0; attempt < 60; attempt++) {
        const candX = attempt < 50 ? pickXInZone(zone) : 1 + Math.floor(Math.random() * (GRID_WIDTH - 2));
        const candY = spec.minY + Math.floor(Math.random() * (spec.maxY - spec.minY + 1));
        const candTile = world[candY]?.[candX];
        if (!isOreReplaceable(candTile)) continue;

        const minDist = attempt < 35 ? 4.5 : attempt < 50 ? 2.8 : 1.5;
        const tooClose = biomeSeeds.some(s => Math.hypot(s.gx - candX, s.gy - candY) < minDist);
        if (!tooClose) {
          seedX = candX;
          seedY = candY;
          break;
        }
      }

      if (seedX === -1 || seedY === -1) continue;

      biomeSeeds.push({ gx: seedX, gy: seedY });
      const targetSize = spec.minSize + Math.floor(Math.random() * (spec.maxSize - spec.minSize + 1));
      const cells = growVein(world, seedX, seedY, spec.ore, targetSize, spec.minY, spec.maxY);

      if (spec.crustType && cells.length > 0) {
        applyVeinCrust(world, cells, spec.crustType, spec.minY, spec.maxY);
      }
    }
  }
}

function selectCaveWallOreForRow(gy: number): OreDefinition | undefined {
  if (gy >= 61 && gy <= 129) {
    return Math.random() < 0.70 ? ORE_DEFINITIONS.SILVER : ORE_DEFINITIONS.IRON;
  }
  if (gy >= 131 && gy <= 204) {
    if (gy >= 175 && Math.random() < 0.25) return ORE_DEFINITIONS.EMERALD;
    return ORE_DEFINITIONS.GOLD;
  }
  if (gy >= 206 && gy < GRID_HEIGHT - 6) {
    return Math.random() < 0.65 ? ORE_DEFINITIONS.EMERALD : ORE_DEFINITIONS.GOLD;
  }
  return undefined;
}

function placeAncientCoreChamber(world: Tile[][]): void {
  const onLeft = Math.random() < 0.5;
  const chamberCenterGx = onLeft
    ? 4 + Math.floor(Math.random() * 4) // 4..7
    : 16 + Math.floor(Math.random() * 4); // 16..19
  const chamberCenterGy = GRID_HEIGHT - 4; // 276

  // 1. Hollow out the inner chamber (5x3)
  for (let gy = chamberCenterGy - 1; gy <= chamberCenterGy + 1; gy++) {
    for (let gx = chamberCenterGx - 2; gx <= chamberCenterGx + 2; gx++) {
      if (gx >= 0 && gx < GRID_WIDTH && gy >= 0 && gy < GRID_HEIGHT) {
        world[gy][gx] = {
          type: TileType.EMPTY,
          hardness: computeTileHardness(TileType.EMPTY, gy),
          revealed: false
        };
      }
    }
  }

  // 2. Seal outer vault perimeter (7x5 border) with indestructible BEDROCK
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      if (Math.abs(dx) !== 3 && Math.abs(dy) !== 2) continue;
      const gx = chamberCenterGx + dx;
      const gy = chamberCenterGy + dy;
      if (gx >= 0 && gx < GRID_WIDTH && gy >= 0 && gy < GRID_HEIGHT) {
        world[gy][gx] = {
          type: TileType.BEDROCK,
          hardness: Infinity,
          revealed: false
        };
      }
    }
  }

  // 3. Carve 2-tile tall MAGMA_ROCK side gate facing the center shaft
  const gateGx = onLeft ? chamberCenterGx + 3 : chamberCenterGx - 3;
  for (const gateGy of [chamberCenterGy, chamberCenterGy + 1]) {
    if (gateGx >= 0 && gateGx < GRID_WIDTH && gateGy >= 0 && gateGy < GRID_HEIGHT) {
      world[gateGy][gateGx] = {
        type: TileType.MAGMA_ROCK,
        hardness: computeTileHardness(TileType.MAGMA_ROCK, gateGy),
        revealed: false
      };
    }
  }

  // 4. Sacred Center Altar: The Ancient Dodecagon Core
  world[chamberCenterGy][chamberCenterGx] = {
    type: TileType.ANCIENT_CORE,
    ore: ORE_DEFINITIONS.ANCIENT_CORE,
    hardness: computeTileHardness(TileType.ANCIENT_CORE, chamberCenterGy, ORE_DEFINITIONS.ANCIENT_CORE),
    revealed: false
  };
}

export function findAncientCoreCoords(world: Tile[][]): { gx: number; gy: number } | null {
  for (let gy = world.length - 1; gy >= 0; gy--) {
    const row = world[gy];
    if (!row) continue;
    for (let gx = 0; gx < row.length; gx++) {
      if (row[gx]?.type === TileType.ANCIENT_CORE) {
        return { gx, gy };
      }
    }
  }
  return null;
}

export function generateWorld(): Tile[][] {
  const world: Tile[][] = [];

  for (let y = 0; y < GRID_HEIGHT; y++) {
    const row: Tile[] = [];

    for (let x = 0; x < GRID_WIDTH; x++) {
      // 1. Rows 0, 1, 2 are sky (EMPTY & always revealed)
      if (y < SURFACE_ROW) {
        row.push({
          type: TileType.EMPTY,
          hardness: computeTileHardness(TileType.EMPTY, y),
          revealed: true
        });
        continue;
      }

      // 2. Surface row (y === 3): Pad stations and surface earth (always revealed)
      if (y === SURFACE_ROW) {
        if (x < 3) {
          row.push({
            type: TileType.FUEL_PAD,
            hardness: computeTileHardness(TileType.FUEL_PAD, y),
            revealed: true
          });
        } else if (x >= GRID_WIDTH - 3) {
          row.push({
            type: TileType.SHOP_PAD,
            hardness: computeTileHardness(TileType.SHOP_PAD, y),
            revealed: true
          });
        } else {
          row.push({
            type: TileType.DIRT,
            hardness: computeTileHardness(TileType.DIRT, y),
            revealed: true
          });
        }
        continue;
      }

      // 3. Subterranean rows (y > 3): Sparse background ores + deep hazards
      const depthProgress = (y - SURFACE_ROW) / (GRID_HEIGHT - SURFACE_ROW);
      const rockChance = 0.06 + depthProgress * 0.08;
      const oreChance = getBackgroundOreChance(y);
      const roll = Math.random();

      const isGasPocketZone = y >= 131 && y <= 205;
      const gasPocketChance = isGasPocketZone ? 0.065 : 0;

      const isMagmaZone = y >= 206 && y < GRID_HEIGHT - 6;
      const magmaRockChance = isMagmaZone ? 0.075 : 0;

      if (roll < rockChance) {
        row.push({
          type: TileType.ROCK,
          hardness: computeTileHardness(TileType.ROCK, y),
          revealed: false
        });
      } else if (roll < rockChance + oreChance) {
        const ore = selectBackgroundOreForDepth(y);
        if (ore) {
          row.push({
            type: TileType.ORE,
            ore,
            hardness: computeTileHardness(TileType.ORE, y, ore),
            revealed: false
          });
        } else {
          row.push({
            type: TileType.DIRT,
            hardness: computeTileHardness(TileType.DIRT, y),
            revealed: false
          });
        }
      } else if (Math.random() < magmaRockChance) {
        row.push({
          type: TileType.MAGMA_ROCK,
          hardness: computeTileHardness(TileType.MAGMA_ROCK, y),
          revealed: false
        });
      } else if (Math.random() < gasPocketChance) {
        row.push({
          type: TileType.GAS_POCKET,
          hardness: computeTileHardness(TileType.GAS_POCKET, y),
          revealed: false
        });
      } else {
        row.push({
          type: TileType.DIRT,
          hardness: computeTileHardness(TileType.DIRT, y),
          revealed: false
        });
      }
    }

    world.push(row);
  }

  // 4. Structured Geological Ore Veins & Diamond Geodes
  placeOreVeins(world);

  // 5. Natural Cave Cavities, Wall Vein Pockets & Lost Supply Chests
  const caveZones = [
    { startY: 65, endY: 124, count: 6, maxW: 4, maxH: 3 },
    { startY: 135, endY: 200, count: 6, maxW: 4, maxH: 3 },
    { startY: 214, endY: 256, count: 3, maxW: 3, maxH: 2 }
  ];

  for (const zone of caveZones) {
    for (let c = 0; c < zone.count; c++) {
      const caveWidth = zone.maxW === 3 ? 3 : Math.floor(Math.random() * 2) + 3;
      const caveHeight = zone.maxH === 2 ? 2 : Math.floor(Math.random() * 2) + 2;

      const startX = Math.floor(Math.random() * (GRID_WIDTH - caveWidth - 2)) + 1;
      const startY = Math.floor(Math.random() * (zone.endY - zone.startY - caveHeight)) + zone.startY;

      let chestPlaced = false;

      for (let dy = 0; dy < caveHeight; dy++) {
        for (let dx = 0; dx < caveWidth; dx++) {
          const gx = startX + dx;
          const gy = startY + dy;
          const existing = world[gy]?.[gx];
          if (!existing) continue;
          // Protect pre-placed geodes/ores inside K4 & veins
          if (existing.type === TileType.ORE && existing.ore?.id === 'diamond') continue;

          if (!chestPlaced && Math.random() < 0.35 && dy === caveHeight - 1) {
            world[gy][gx] = {
              type: TileType.CHEST,
              hardness: computeTileHardness(TileType.CHEST, gy),
              revealed: false
            };
            chestPlaced = true;
          } else {
            world[gy][gx] = {
              type: TileType.EMPTY,
              hardness: computeTileHardness(TileType.EMPTY, gy),
              revealed: false
            };
          }
        }
      }

      // 60% chance to embed a 2-3 tile wall vein alongside cave wall
      if (Math.random() < 0.60) {
        const sideLeft = Math.random() < 0.5;
        const wallX = sideLeft ? Math.max(1, startX - 1) : Math.min(GRID_WIDTH - 2, startX + caveWidth);
        const wallY = startY + Math.floor(Math.random() * caveHeight);
        const wallOre = selectCaveWallOreForRow(wallY);
        if (wallOre && isOreReplaceable(world[wallY]?.[wallX])) {
          const wallMinY = wallY <= 130 ? 61 : wallY <= 205 ? 131 : 206;
          const wallMaxY = wallY <= 130 ? 129 : wallY <= 205 ? 204 : 268;
          growVein(world, wallX, wallY, wallOre, 2 + Math.floor(Math.random() * 2), wallMinY, wallMaxY);
        }
      }
    }
  }

  // 6. Off-Center Sealed Core Chamber (Side MAGMA_ROCK Gate + BEDROCK Perimeter)
  placeAncientCoreChamber(world);

  // 7. Pre-seed Rare Archaeological Relics (5 copies each, wing-weighted)
  for (const relic of Object.values(RELIC_DEFINITIONS)) {
    const minGy = Math.max(SURFACE_ROW + 2, Math.floor(relic.minDepth / 2) + SURFACE_ROW);
    const maxGy = Math.min(GRID_HEIGHT - 8, Math.floor(relic.maxDepth / 2) + SURFACE_ROW);

    const placedPositions: { gx: number; gy: number }[] = [];
    let attempts = 0;
    while (placedPositions.length < 5 && attempts < 250) {
      attempts++;
      const requireWing = placedPositions.length < 3 && attempts < 140;
      const gx = requireWing
        ? (Math.random() < 0.5 ? 1 + Math.floor(Math.random() * 8) : 15 + Math.floor(Math.random() * 8))
        : 1 + Math.floor(Math.random() * (GRID_WIDTH - 2));
      const gy = Math.floor(Math.random() * (maxGy - minGy + 1)) + minGy;
      const tile = world[gy]?.[gx];

      if (!tile || (tile.type !== TileType.DIRT && tile.type !== TileType.ROCK) || tile.relicId) {
        continue;
      }

      const minRelicDist = attempts < 90 ? 5 : 2;
      if (placedPositions.some(p => Math.hypot(p.gx - gx, p.gy - gy) < minRelicDist)) {
        continue;
      }

      tile.relicId = relic.id;
      placedPositions.push({ gx, gy });
    }
  }

  markWorldDirty();
  return world;
}

/**
 * Permanently reveals tiles within radar radius of vehicle center.
 */
export function revealTilesAround(
  world: Tile[][],
  centerPixelX: number,
  centerPixelY: number,
  radiusTiles: number,
  tileSize: number
): void {
  const centerGx = centerPixelX / tileSize;
  const centerGy = centerPixelY / tileSize;

  const minGx = Math.max(0, Math.floor(centerGx - radiusTiles));
  const maxGx = Math.min(GRID_WIDTH - 1, Math.ceil(centerGx + radiusTiles));
  const minGy = Math.max(0, Math.floor(centerGy - radiusTiles));
  const maxGy = Math.min(GRID_HEIGHT - 1, Math.ceil(centerGy + radiusTiles));

  const radiusSquared = radiusTiles * radiusTiles;
  let changed = false;

  for (let gy = minGy; gy <= maxGy; gy++) {
    const row = world[gy];
    if (!row) continue;
    for (let gx = minGx; gx <= maxGx; gx++) {
      const tile = row[gx];
      if (!tile || tile.revealed) continue;

      const dx = (gx + 0.5) - centerGx;
      const dy = (gy + 0.5) - centerGy;
      if (dx * dx + dy * dy <= radiusSquared) {
        tile.revealed = true;
        changed = true;
      }
    }
  }

  if (changed) {
    markWorldDirty();
  }
}

/**
 * Automatically reveals adjacent blocks when a tile is dug out.
 */
export function revealAdjacentTiles(world: Tile[][], gx: number, gy: number): void {
  const neighbors = [
    [gx, gy - 1],
    [gx, gy + 1],
    [gx - 1, gy],
    [gx + 1, gy]
  ];

  let changed = false;
  for (const [nx, ny] of neighbors) {
    if (world[ny] && world[ny][nx] && !world[ny][nx].revealed) {
      world[ny][nx].revealed = true;
      changed = true;
    }
  }

  if (changed) {
    markWorldDirty();
  }
}

export function getTile(world: Tile[][], x: number, y: number): Tile | null {
  if (y < 0 || y >= world.length) return null;
  const row = world[y];
  if (x < 0 || x >= row.length) return null;
  return row[x];
}
