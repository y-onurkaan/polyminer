export enum TileType {
  EMPTY = 0,
  DIRT = 1,
  ROCK = 2,
  ORE = 3,
  SHOP_PAD = 4,
  FUEL_PAD = 5,
  GAS_POCKET = 6,
  MAGMA_ROCK = 7,
  ANCIENT_CORE = 8,
  CHEST = 9
}

export interface FallingBoulder {
  id: number;
  gx: number;
  gy: number;
  x: number;
  y: number;
  vy: number;
  state: 'tremble' | 'falling';
  trembleTimer: number;
}

export interface OreDefinition {
  id: string;
  name: string;
  sides: number;      // 3 to 8
  color: string;
  value: number;
  weight?: number;
  minDepth: number;
  hardness: number;
}

export interface Tile {
  type: TileType;
  ore?: OreDefinition;
  hardness: number;
  revealed?: boolean; // Subterranean fog-of-war radar state
  hasElevator?: boolean; // Mechanical steel elevator rail track
  relicId?: string; // Pre-seeded or discovered rare museum relic
}

export interface ConsumableInventory {
  fuelCanister: number;
  repairKit: number;
  teleporter: number;
  dynamite: number;
  elevatorRails: number;
}

export interface RelicDefinition {
  id: string;
  name: string;
  minDepth: number; // in meters
  maxDepth: number; // in meters
  icon: string;
  color: string;
  description: string;
  buffLabel: string;
}

export interface FloatingText {
  id: number;
  x: number;
  y: number;
  text: string;
  color: string;
  alpha: number;
  vy: number;
  lifetime: number;
  maxLifetime: number;
}

export interface ShockwaveEffect {
  id: number;
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  color: string;
  alpha: number;
}

export interface PlayerState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  fuel: number;
  maxFuel: number;
  hull: number;
  maxHull: number;
  cargo: OreDefinition[];
  maxCargo: number;
  money: number;
  drillSpeed: number;
  thrusterPower: number;
  radarRadius: number;
  isDrilling: boolean;
  drillProgress: number;
  drillTarget: { gx: number; gy: number } | null;
  inventory: ConsumableInventory;
  temperature: number;
  heat: number; // 0 to 100% active hararet
  maxHeat: number; // 100
  heatLockoutTimer: number; // > 0 means engine is overheated and locked out (2.5s)
  isStruggling?: boolean; // True when drilling a higher tier block at 50% speed
  hasWon?: boolean;
  discoveredRelics: string[];
  museumRewardClaimed?: boolean;
  name?: string;
  color?: string;
}

export interface ChassisColor {
  id: string;
  name: string;
  hex: string;
  emoji: string;
}

export const CHASSIS_COLORS: ChassisColor[] = [
  { id: 'cyan', name: 'Siyan', hex: '#00f2fe', emoji: '🩵' },
  { id: 'orange', name: 'Turuncu', hex: '#ff7b00', emoji: '🧡' },
  { id: 'green', name: 'Neon Yeşil', hex: '#10b981', emoji: '💚' },
  { id: 'purple', name: 'Kozmik Mor', hex: '#a855f7', emoji: '💜' },
  { id: 'red', name: 'Kızıl', hex: '#ef4444', emoji: '❤️' }
];

export interface RemotePlayerState {
  id: string;
  name: string;
  color: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 'left' | 'right' | 'down' | 'up';
  isDrilling: boolean;
  drillProgress: number;
  isThrusting: boolean;
  drillTier: number;
  lastSeen: number;
}

