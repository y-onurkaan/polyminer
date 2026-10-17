import { Tile, TileType, OreDefinition } from './types';
import {
  GRID_WIDTH,
  GRID_HEIGHT,
  SURFACE_ROW,
  ORES,
  ORE_DEFINITIONS,
  ROCK_HARDNESS,
  getBiomeForDepth,
  RELIC_DEFINITIONS
} from './constants';

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

function selectOreForDepth(depth: number): OreDefinition | undefined {
  const eligibleOres = ORES.filter(ore => ore.minDepth <= depth);
  if (eligibleOres.length === 0) return undefined;

  const weighted = eligibleOres.map(ore => {
    let weight = 10;
    switch (ore.id) {
      case 'copper':
        weight = depth < 65 ? 60 : depth < 130 ? 20 : 5;
        break;
      case 'iron':
        weight = depth < 100 ? 45 : depth < 185 ? 20 : 6;
        break;
      case 'silver':
        weight = depth < 130 ? 35 : depth < 200 ? 22 : 8;
        break;
      case 'gold':
        weight = depth < 185 ? 26 : depth < 235 ? 18 : 10;
        break;
      case 'emerald':
        weight = depth < 235 ? 16 : 14;
        break;
      case 'diamond':
        weight = depth >= 225 ? 12 : 4;
        break;
      default:
        weight = 10;
    }
    return { ore, weight };
  });

  const totalWeight = weighted.reduce((acc, item) => acc + item.weight, 0);
  let random = Math.random() * totalWeight;

  for (const item of weighted) {
    if (random < item.weight) {
      return item.ore;
    }
    random -= item.weight;
  }

  return eligibleOres[eligibleOres.length - 1];
}

export function generateWorld(): Tile[][] {
  const world: Tile[][] = [];

  for (let y = 0; y < GRID_HEIGHT; y++) {
    const row: Tile[] = [];
    const biome = getBiomeForDepth(y);

    for (let x = 0; x < GRID_WIDTH; x++) {
      // 1. Rows 0, 1, 2 are sky (EMPTY & always revealed)
      if (y < SURFACE_ROW) {
        row.push({
          type: TileType.EMPTY,
          hardness: 0,
          revealed: true
        });
        continue;
      }

      // 2. Surface row (y === 3): Pad stations and surface earth (always revealed)
      if (y === SURFACE_ROW) {
        if (x < 3) {
          row.push({
            type: TileType.FUEL_PAD,
            hardness: Infinity,
            revealed: true
          });
        } else if (x >= GRID_WIDTH - 3) {
          row.push({
            type: TileType.SHOP_PAD,
            hardness: Infinity,
            revealed: true
          });
        } else {
          row.push({
            type: TileType.DIRT,
            hardness: 1.0,
            revealed: true
          });
        }
        continue;
      }

      // 3. Subterranean rows (y > 3): Fog of war starts here (revealed = false)
      const depthProgress = (y - SURFACE_ROW) / (GRID_HEIGHT - SURFACE_ROW);
      const baseDirtHardness = 1.0 + depthProgress * 0.4 + biome.extraHardness;
      const rockChance = 0.06 + depthProgress * 0.08;
      const oreChance = 0.095 + depthProgress * 0.045;
      const roll = Math.random();

      // Check for Hazard blocks:
      // A. GAS_POCKET: Prevalent in Katman 3 Basalt & Gas (rows 125-205)
      const isGasPocketZone = y >= 125 && y <= 205;
      const gasPocketChance = isGasPocketZone ? 0.055 : 0;

      // B. MAGMA_ROCK: Prevalent in Katman 4 Magma Core (rows 205-275)
      const isMagmaZone = y >= 205 && y < GRID_HEIGHT - 6;
      const magmaRockChance = isMagmaZone ? 0.065 : 0;

      if (roll < rockChance) {
        // Rock block (drillable with Drill Level >= 4, can fall when excavated below!)
        row.push({
          type: TileType.ROCK,
          hardness: ROCK_HARDNESS,
          revealed: false
        });
      } else if (roll < rockChance + oreChance) {
        const ore = selectOreForDepth(y);
        if (ore) {
          row.push({
            type: TileType.ORE,
            ore,
            hardness: ore.hardness + biome.extraHardness * 0.3,
            revealed: false
          });
        } else {
          row.push({
            type: TileType.DIRT,
            hardness: baseDirtHardness,
            revealed: false
          });
        }
      } else if (Math.random() < magmaRockChance) {
        // Magma Rock Hazard
        row.push({
          type: TileType.MAGMA_ROCK,
          hardness: 2.8,
          revealed: false
        });
      } else if (Math.random() < gasPocketChance) {
        // Gas Pocket Hazard
        row.push({
          type: TileType.GAS_POCKET,
          hardness: 1.2,
          revealed: false
        });
      } else {
        // Standard Biome Dirt
        row.push({
          type: TileType.DIRT,
          hardness: baseDirtHardness,
          revealed: false
        });
      }
    }

    world.push(row);
  }

  // 4. Natural Cave Cavities & Lost Supply Chests in Katman 2 & 3
  const caveZones = [
    { startY: 65, endY: 125, count: 6 },
    { startY: 135, endY: 200, count: 6 }
  ];

  for (const zone of caveZones) {
    for (let c = 0; c < zone.count; c++) {
      const caveWidth = Math.floor(Math.random() * 2) + 3; // 3 or 4 wide
      const caveHeight = Math.floor(Math.random() * 2) + 2; // 2 or 3 high

      const startX = Math.floor(Math.random() * (GRID_WIDTH - caveWidth - 2)) + 1;
      const startY = Math.floor(Math.random() * (zone.endY - zone.startY - caveHeight)) + zone.startY;

      let chestPlaced = false;

      for (let dy = 0; dy < caveHeight; dy++) {
        for (let dx = 0; dx < caveWidth; dx++) {
          const gx = startX + dx;
          const gy = startY + dy;
          if (gy < GRID_HEIGHT && gx < GRID_WIDTH) {
            // Chance to spawn an ancient supply chest in the corner of cave
            if (!chestPlaced && Math.random() < 0.35 && dy === caveHeight - 1) {
              world[gy][gx] = {
                type: TileType.CHEST,
                hardness: 1.5,
                revealed: false
              };
              chestPlaced = true;
            } else {
              world[gy][gx] = {
                type: TileType.EMPTY,
                hardness: 0,
                revealed: false
              };
            }
          }
        }
      }
    }
  }

  // 5. Deeper Endgame Final Chamber: "Kadim Dodecagon Çekirdeği" (Satır 274 - 278)
  const chamberCenterGx = Math.floor(GRID_WIDTH / 2); // 12
  const chamberCenterGy = GRID_HEIGHT - 4; // 276

  // Hollow out altar hall
  for (let gy = chamberCenterGy - 2; gy <= chamberCenterGy + 2; gy++) {
    for (let gx = chamberCenterGx - 3; gx <= chamberCenterGx + 3; gx++) {
      if (gx >= 0 && gx < GRID_WIDTH && gy < GRID_HEIGHT) {
        world[gy][gx] = {
          type: TileType.EMPTY,
          hardness: 0,
          revealed: false
        };
      }
    }
  }

  // Magma guardian pillars framing the sacred chamber
  for (let gx = chamberCenterGx - 3; gx <= chamberCenterGx + 3; gx++) {
    world[chamberCenterGy - 2][gx] = { type: TileType.MAGMA_ROCK, hardness: 4.5, revealed: false };
    world[chamberCenterGy + 2][gx] = { type: TileType.MAGMA_ROCK, hardness: 4.5, revealed: false };
  }
  world[chamberCenterGy - 1][chamberCenterGx - 3] = { type: TileType.MAGMA_ROCK, hardness: 4.5, revealed: false };
  world[chamberCenterGy][chamberCenterGx - 3] = { type: TileType.MAGMA_ROCK, hardness: 4.5, revealed: false };
  world[chamberCenterGy + 1][chamberCenterGx - 3] = { type: TileType.MAGMA_ROCK, hardness: 4.5, revealed: false };

  world[chamberCenterGy - 1][chamberCenterGx + 3] = { type: TileType.MAGMA_ROCK, hardness: 4.5, revealed: false };
  world[chamberCenterGy][chamberCenterGx + 3] = { type: TileType.MAGMA_ROCK, hardness: 4.5, revealed: false };
  world[chamberCenterGy + 1][chamberCenterGx + 3] = { type: TileType.MAGMA_ROCK, hardness: 4.5, revealed: false };

  // Sacred Center Altar: The Ancient Dodecagon Core
  world[chamberCenterGy][chamberCenterGx] = {
    type: TileType.ANCIENT_CORE,
    ore: ORE_DEFINITIONS.ANCIENT_CORE,
    hardness: 15.0,
    revealed: false
  };

  // 6. Pre-seed Rare Archaeological Relics across depth strata
  for (const relic of Object.values(RELIC_DEFINITIONS)) {
    const minGy = Math.max(SURFACE_ROW + 1, Math.floor(relic.minDepth / 2) + SURFACE_ROW);
    const maxGy = Math.min(GRID_HEIGHT - 8, Math.floor(relic.maxDepth / 2) + SURFACE_ROW);

    let placed = 0;
    let attempts = 0;
    while (placed < 3 && attempts < 100) {
      attempts++;
      const gy = Math.floor(Math.random() * (maxGy - minGy + 1)) + minGy;
      const gx = Math.floor(Math.random() * (GRID_WIDTH - 2)) + 1;
      const tile = world[gy]?.[gx];

      if (tile && (tile.type === TileType.DIRT || tile.type === TileType.ROCK) && !tile.relicId) {
        tile.relicId = relic.id;
        placed++;
      }
    }
  }

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
      }
    }
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

  for (const [nx, ny] of neighbors) {
    if (world[ny] && world[ny][nx]) {
      world[ny][nx].revealed = true;
    }
  }
}

export function getTile(world: Tile[][], x: number, y: number): Tile | null {
  if (y < 0 || y >= world.length) return null;
  const row = world[y];
  if (x < 0 || x >= row.length) return null;
  return row[x];
}
