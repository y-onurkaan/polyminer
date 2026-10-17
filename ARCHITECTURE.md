# PROJECT: POLYMINER (2D Minimalist Motherload Clone)

## 1. Tech Stack & Constraints
- Bundler: Vite (Vanilla-TS)
- Language: Strict TypeScript (Pure HTML5 Canvas 2D API, NO external game engines)
- Visual Style: Minimalist 2D geometry. No particle explosions. Ores inside dirt blocks are drawn as clean regular polygons where more sides = higher value (Triangle -> Square -> Pentagon -> Hexagon -> Heptagon -> Octagon).

## 2. Core Constants (src/constants.ts)
- TILE_SIZE = 48
- GRID_WIDTH = 24
- GRID_HEIGHT = 120
- SURFACE_ROW = 3 (Rows 0, 1, 2 are sky; Row 3 is surface level)

## 3. Data Structures (src/types.ts)
export enum TileType {
  EMPTY = 0,
  DIRT = 1,
  ROCK = 2,
  ORE = 3,
  SHOP_PAD = 4,
  FUEL_PAD = 5
}

export interface OreDefinition {
  id: string;
  name: string;
  sides: number;      // 3 to 8
  color: string;
  value: number;
  weight: number;
  minDepth: number;
  hardness: number;
}

export interface Tile {
  type: TileType;
  ore?: OreDefinition;
  hardness: number;
}

export interface PlayerState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  fuel: number;
  maxFuel: number;
  cargo: OreDefinition[];
  maxCargo: number;
  money: number;
  drillSpeed: number;
  thrusterPower: number;
  isDrilling: boolean;
  drillProgress: number;
  drillTarget: { gx: number; gy: number } | null;
}

## 4. Ore Table (Polygon Rule)
1. Copper (3 sides - Triangle): #d97706, Value: 15, Depth: 3+, Hardness: 1.0
2. Iron (4 sides - Square): #94a3b8, Value: 35, Depth: 10+, Hardness: 1.3
3. Silver (5 sides - Pentagon): #e2e8f0, Value: 80, Depth: 25+, Hardness: 1.7
4. Gold (6 sides - Hexagon): #facc15, Value: 180, Depth: 45+, Hardness: 2.2
5. Emerald (7 sides - Heptagon): #10b981, Value: 400, Depth: 70+, Hardness: 3.0
6. Diamond (8 sides - Octagon): #38bdf8, Value: 1000, Depth: 95+, Hardness: 4.0

## 5. Directory Structure
- src/constants.ts
- src/types.ts
- src/world.ts
- src/player.ts
- src/renderer.ts
- src/ui.ts
- src/main.ts
