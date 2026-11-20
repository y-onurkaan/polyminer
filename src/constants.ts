import { OreDefinition, RelicDefinition } from './types';

export const TILE_SIZE = 48;
export const GRID_WIDTH = 24;
export const GRID_HEIGHT = 280;
export const SURFACE_ROW = 3; // Rows 0, 1, 2 are sky; Row 3 is surface level

// Radar / Fog of War Constants
export const DEFAULT_RADAR_RADIUS = 2.4; // In tile units

// Thermal, Hazard & Rail Limits
export const MAGMA_NO_RAIL_START_ROW = 206; // Biome 4 (Magma Çekirdeği, 406m+): steel elevator rails melt
export const GAS_POCKET_BASE_DAMAGE = 35;
export const GAS_POCKET_HEAT_SPIKE = 20;
export const MAGMA_ROCK_BASE_DAMAGE = 42;
export const MAGMA_ROCK_HEAT_SPIKE = 35;
export const MAGMA_PROXIMITY_HEAT_RATE = 22.0; // heat/s when touching or adjacent to magma rock
export const MAGMA_AMBIENT_HEAT_RATE = 4.5; // heat/s passive thermal creep in Biome 4

const ENGINE_MAX_FLY_SPEEDS = [-230, -270, -315, -365, -420] as const;

export function getMaxFlySpeed(engineLevel: number = 1): number {
  const clamped = Math.max(1, Math.min(ENGINE_MAX_FLY_SPEEDS.length, Math.floor(engineLevel || 1)));
  return ENGINE_MAX_FLY_SPEEDS[clamped - 1];
}

// Fall Damage & Retro-Thruster Constants
export const SAFE_LANDING_SPEED = 270; // px/s (1 block = ~240 px/s is safely below threshold)
export const FALL_DAMAGE_MAX_BASE = 160; // base damage at terminal velocity (760 px/s) before armor/relic mitigation
export const FALL_DAMAGE_EXPONENT = 1.20; // smooth progressive curve (no sudden cliff jump)
export const FALL_BRAKE_MULTIPLIER = 1.50; // +50% retro-thruster deceleration while falling fast (vy > 120)

// Rock Hardness & Fuel Economics
export const ROCK_HARDNESS = 5.0;
export const FUEL_COST_PER_LITRE = 1.0;

// Geologic Biome Configurations
export interface BiomeConfig {
  id: string;
  name: string;
  tier: number; // 1 to 4
  startRow: number;
  endRow: number;
  dirtColor: string;
  dirtDarkColor: string;
  fogColor: string;
  extraHardness: number;
}

export const BIOMES: BiomeConfig[] = [
  {
    id: 'crust',
    name: 'Üst Kabuk',
    tier: 1,
    startRow: 3,
    endRow: 60,
    dirtColor: '#573d26',
    dirtDarkColor: '#3d2b1b',
    fogColor: '#111217',
    extraHardness: 0.0
  },
  {
    id: 'quartz',
    name: 'Kuvars Mağaraları',
    tier: 2,
    startRow: 61,
    endRow: 130,
    dirtColor: '#2d2640',
    dirtDarkColor: '#1e1b2e',
    fogColor: '#13111c',
    extraHardness: 0.0
  },
  {
    id: 'basalt',
    name: 'Bazalt & Gaz Katmanı',
    tier: 3,
    startRow: 131,
    endRow: 205,
    dirtColor: '#2c3531',
    dirtDarkColor: '#1f2421',
    fogColor: '#111413',
    extraHardness: 0.6
  },
  {
    id: 'magma',
    name: 'Magma Çekirdeği',
    tier: 4,
    startRow: 206,
    endRow: 280,
    dirtColor: '#3d1818',
    dirtDarkColor: '#2b1111',
    fogColor: '#180d0d',
    extraHardness: 1.2
  }
];

export function getBiomeForDepth(row: number): BiomeConfig {
  if (row <= 60) return BIOMES[0];
  if (row <= 130) return BIOMES[1];
  if (row <= 205) return BIOMES[2];
  return BIOMES[3];
}

export function getBiomeTier(row: number): number {
  if (row <= 60) return 1;
  if (row <= 130) return 2;
  if (row <= 205) return 3;
  return 4;
}

// Consumable Item Specifications
export const CONSUMABLES = {
  fuelCanister: {
    id: 'fuelCanister',
    name: 'Yedek Yakıt',
    key: 'R',
    cost: 150,
    amount: 50, // +50 Litres
    desc: '+50L Acil Yakıt Dolumu'
  },
  repairKit: {
    id: 'repairKit',
    name: 'Tamir Kiti',
    key: 'T',
    cost: 250,
    amount: 50, // +50 Hull HP
    desc: '+50 Gövde Zırhı Onarımı'
  },
  teleporter: {
    id: 'teleporter',
    name: 'Yüzeye Işınlayıcı',
    key: 'Q',
    cost: 500,
    amount: 1,
    desc: 'Kargo Kaybı Olmadan Yüzeye Güvenli Işınlanma'
  },
  dynamite: {
    id: 'dynamite',
    name: 'Sismik Dinamit',
    key: 'X',
    cost: 200,
    amount: 1,
    desc: '3x3 Alanı Patlatır & Madenleri Otomatik Toplar'
  },
  elevatorRails: {
    id: 'elevatorRails',
    name: 'Asansör Rayı',
    key: 'C',
    cost: 25,
    amount: 1,
    desc: 'Çelik Ray (Boş hücreye [C] ile döşenir; 4. Katman Magma ısısında kurulamaz)'
  }
};

export const ORE_DEFINITIONS: Record<string, OreDefinition> = {
  COPPER: {
    id: 'copper',
    name: 'Bakır',
    sides: 3,
    color: '#d97706',
    value: 30, // 2x artırıldı (15 -> 30)
    minDepth: 3,
    hardness: 1.0
  },
  IRON: {
    id: 'iron',
    name: 'Demir',
    sides: 4,
    color: '#94a3b8',
    value: 55, // Üçgenin üzerinde (30 < 55)
    minDepth: 22,
    hardness: 1.3
  },
  SILVER: {
    id: 'silver',
    name: 'Gümüş',
    sides: 5,
    color: '#e2e8f0',
    value: 110,
    minDepth: 65,
    hardness: 1.7
  },
  GOLD: {
    id: 'gold',
    name: 'Altın',
    sides: 6,
    color: '#facc15',
    value: 200,
    minDepth: 131,
    hardness: 2.2
  },
  EMERALD: {
    id: 'emerald',
    name: 'Zümrüt',
    sides: 7,
    color: '#10b981',
    value: 420,
    minDepth: 180,
    hardness: 3.0
  },
  DIAMOND: {
    id: 'diamond',
    name: 'Elmas',
    sides: 8,
    color: '#38bdf8',
    value: 900,
    minDepth: 222,
    hardness: 4.0
  },
  ANCIENT_CORE: {
    id: 'ancient_core',
    name: 'Kadim Dodecagon Çekirdeği',
    sides: 12,
    color: '#ec4899',
    value: 50000,
    minDepth: 274,
    hardness: 15.0
  }
};

export const ORES: OreDefinition[] = Object.values(ORE_DEFINITIONS);

export const RELIC_DEFINITIONS: Record<string, RelicDefinition> = {
  trilobite: {
    id: 'trilobite',
    name: 'Taşlaşmış Trilobit',
    minDepth: 0,
    maxDepth: 120,
    icon: '🐚',
    color: '#fbbf24',
    description: 'İlk çağlardan kalma mükemmel korunmuş zırhlı kabuklu.',
    buffLabel: '+%10 Kalıcı Matkap Hızı'
  },
  amber: {
    id: 'amber',
    name: 'Kuvars Kehribarı',
    minDepth: 100,
    maxDepth: 250,
    icon: '🔮',
    color: '#f59e0b',
    description: 'Milyonlarca yıllık kadim reçine, yanma odası verimini artırır.',
    buffLabel: '+%15 Yakıt Tasarrufu'
  },
  dino_skull: {
    id: 'dino_skull',
    name: 'Kristalize Sürüngen Kafatası',
    minDepth: 180,
    maxDepth: 350,
    icon: '🦖',
    color: '#a855f7',
    description: 'Maden tüccarlarının ve müzelerin paha biçemediği tarih öncesi kafatası.',
    buffLabel: '+%15 Tüm Maden Satış Fiyatları'
  },
  alien_gear: {
    id: 'alien_gear',
    name: 'Antik Mekanik Dişli',
    minDepth: 250,
    maxDepth: 420,
    icon: '⚙️',
    color: '#06b6d4',
    description: 'Bilinmeyen bir yeraltı medeniyetine ait süper iletken mekanizma.',
    buffLabel: '+%20 Asansör & Sürüş Hızı'
  },
  obsidian_tablet: {
    id: 'obsidian_tablet',
    name: 'Bazalt Rün Tableti',
    minDepth: 350,
    maxDepth: 500,
    icon: '📜',
    color: '#64748b',
    description: 'Tektonik basınçlara ve şok dalgalarına karşı koruyucu rünler içerir.',
    buffLabel: '+%25 Kaya & Patlama Hasar Direnci'
  },
  core_shard: {
    id: 'core_shard',
    name: 'Kadim Çekirdek Parçası',
    minDepth: 420,
    maxDepth: 550,
    icon: '💠',
    color: '#ec4899',
    description: 'Gezegenin çekirdeğinden kopmuş mutlak ısı emici kristal parçası.',
    buffLabel: '-%20 Hararet & +15 Soğuma Hızı'
  }
};

export const RELICS: RelicDefinition[] = Object.values(RELIC_DEFINITIONS);
export const BASE_ELEVATOR_SPEED = 380;
export const MUSEUM_CURATOR_REWARD = 5000;

export interface OreRequirement {
  [oreId: string]: number;
}

export interface UpgradeConfig {
  name: string;
  desc: string;
  icon: string;
  levels: {
    level: number;
    value: number;
    label: string;
    cost: number;
    oreReqs?: OreRequirement;
  }[];
}

export type UpgradeKey = 'drill' | 'fuelTank' | 'cargo' | 'engine' | 'radar' | 'hull' | 'radiator';

export const UPGRADES: Record<UpgradeKey, UpgradeConfig> = {
  drill: {
    name: 'Matkap Hızı',
    desc: 'Toprak ve madenleri daha hızlı parçalar',
    icon: '⚡',
    levels: [
      { level: 1, value: 1.25, label: '1.25x (Standart)', cost: 0 },
      { level: 2, value: 1.85, label: '1.85x (+%48)', cost: 150, oreReqs: { iron: 2 } },
      { level: 3, value: 2.60, label: '2.60x (+%108)', cost: 550, oreReqs: { silver: 3 } },
      { level: 4, value: 3.75, label: '3.75x (Kaya Kırıcı)', cost: 2500, oreReqs: { gold: 3 } },
      { level: 5, value: 5.50, label: '5.50x (Ultra Matkap)', cost: 5200, oreReqs: { emerald: 3, diamond: 2 } }
    ]
  },
  fuelTank: {
    name: 'Yakıt Tankı',
    desc: 'Daha derin maden seferleri için kapasite',
    icon: '🛢️',
    levels: [
      { level: 1, value: 60, label: '60 Litre', cost: 0 },
      { level: 2, value: 110, label: '110 Litre', cost: 120, oreReqs: { iron: 2 } },
      { level: 3, value: 185, label: '185 Litre', cost: 500, oreReqs: { silver: 3 } },
      { level: 4, value: 290, label: '290 Litre', cost: 2300, oreReqs: { gold: 3 } },
      { level: 5, value: 450, label: '450 Litre', cost: 4700, oreReqs: { gold: 4, emerald: 2, diamond: 1 } }
    ]
  },
  cargo: {
    name: 'Kargo Kapasitesi',
    desc: 'Tek seferde daha fazla maden taşıma haznesi',
    icon: '🎒',
    levels: [
      { level: 1, value: 10, label: '10 Adet', cost: 0 },
      { level: 2, value: 16, label: '16 Adet', cost: 100, oreReqs: { iron: 2 } },
      { level: 3, value: 25, label: '25 Adet', cost: 500, oreReqs: { silver: 3 } },
      { level: 4, value: 34, label: '34 Adet', cost: 2300, oreReqs: { gold: 3 } },
      { level: 5, value: 48, label: '48 Adet', cost: 4700, oreReqs: { gold: 4, emerald: 3 } }
    ]
  },
  engine: {
    name: 'Motor İtki Gücü',
    desc: 'Yukarı tırmanış tavan hızını ve itki gücünü artırır',
    icon: '🚀',
    levels: [
      { level: 1, value: 1500, label: '1500 kW · 230 m/s', cost: 0 },
      { level: 2, value: 1850, label: '1850 kW · 270 m/s', cost: 130, oreReqs: { iron: 2 } },
      { level: 3, value: 2300, label: '2300 kW · 315 m/s', cost: 520, oreReqs: { silver: 3 } },
      { level: 4, value: 2850, label: '2850 kW · 365 m/s', cost: 2350, oreReqs: { gold: 3 } },
      { level: 5, value: 3600, label: '3600 kW · 420 m/s', cost: 4900, oreReqs: { emerald: 3, diamond: 1 } }
    ]
  },
  radar: {
    name: 'Yeraltı Radarı',
    desc: 'Sisi açar; Sv.3 fosil parıltısı, Sv.4-5 sismik çekirdek sinyali açar',
    icon: '📡',
    levels: [
      { level: 1, value: 2.4, label: '2.4 Blok (Temel)', cost: 0 },
      { level: 2, value: 3.2, label: '3.2 Blok (+%33)', cost: 140, oreReqs: { iron: 2 } },
      { level: 3, value: 4.0, label: '4.0 Blok · Fosil Parıltısı', cost: 520, oreReqs: { silver: 3 } },
      { level: 4, value: 4.8, label: '4.8 Blok · Derin Sismik Tarama', cost: 2350, oreReqs: { gold: 3 } },
      { level: 5, value: 5.6, label: '5.6 Blok · Tam Çekirdek Sensörü', cost: 4800, oreReqs: { emerald: 2, diamond: 2 } }
    ]
  },
  hull: {
    name: 'Gövde Zırhı',
    desc: 'Maksimum dayanıklılık ve darbe hasarı direnci',
    icon: '🛡️',
    levels: [
      { level: 1, value: 100, label: '100 HP (Standart)', cost: 0 },
      { level: 2, value: 150, label: '150 HP (-%10 Hasar)', cost: 120, oreReqs: { iron: 2 } },
      { level: 3, value: 220, label: '220 HP (-%20 Hasar)', cost: 500, oreReqs: { silver: 3 } },
      { level: 4, value: 320, label: '320 HP (-%30 Hasar)', cost: 2250, oreReqs: { gold: 3 } },
      { level: 5, value: 450, label: '450 HP (-%40 Hasar)', cost: 4700, oreReqs: { gold: 4, emerald: 2, diamond: 1 } }
    ]
  },
  radiator: {
    name: 'Termal Radyatör',
    desc: 'Hararet soğuma hızını artırır ve aşırı ısınmayı önler',
    icon: '❄️',
    levels: [
      { level: 1, value: 20, label: '20%/s (Standart Fan)', cost: 0 },
      { level: 2, value: 28, label: '28%/s (Sıvı Soğutma - %10 Direnç)', cost: 180, oreReqs: { iron: 2 } },
      { level: 3, value: 38, label: '38%/s (Termoelektrik - %20 Direnç)', cost: 600, oreReqs: { silver: 3 } },
      { level: 4, value: 50, label: '50%/s (Kriyojenik - %30 Direnç)', cost: 2500, oreReqs: { gold: 3 } },
      { level: 5, value: 65, label: '65%/s (Plazma Emici - %40 Direnç)', cost: 5200, oreReqs: { emerald: 3, diamond: 2 } }
    ]
  }
};

export function getUpgradeLevelValue(key: UpgradeKey, level: number): number {
  const config = UPGRADES[key];
  if (!config) return 1;
  const clamped = Math.max(1, Math.min(config.levels.length, Math.floor(level || 1)));
  return config.levels[clamped - 1].value;
}
