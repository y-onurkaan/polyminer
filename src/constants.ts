import { OreDefinition, RelicDefinition } from './types';

export const TILE_SIZE = 48;
export const GRID_WIDTH = 24;
export const GRID_HEIGHT = 280;
export const SURFACE_ROW = 3; // Rows 0, 1, 2 are sky; Row 3 is surface level

// Radar / Fog of War Constants
export const DEFAULT_RADAR_RADIUS = 2.5; // In tile units

// Fall Damage Constants
export const SAFE_LANDING_SPEED = 250; // px/s (1 block fall = ~240 px/s is 100% safe; damage starts after > 1 block)
export const FALL_DAMAGE_FACTOR = 0.33; // damage per px/s above threshold (2 blocks = ~30 HP)
export const DEEP_FALL_THRESHOLD_SPEED = 165; // px/s excess (speed reached after falling 3+ blocks / 144px)
export const DEEP_FALL_PENALTY_MULTIPLIER = 1.20; // +20% damage penalty for falls from 3 blocks and deeper

// Rock Mining Requirements
export const ROCK_MIN_DRILL_LEVEL = 4;
export const ROCK_HARDNESS = 5.0;

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
    desc: 'Çelik Ray (Boş hücreye [C] ile döşenir, yerçekimsiz & yakıtsız ulaşım)'
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
    value: 240,
    minDepth: 130,
    hardness: 2.2
  },
  EMERALD: {
    id: 'emerald',
    name: 'Zümrüt',
    sides: 7,
    color: '#10b981',
    value: 520,
    minDepth: 185,
    hardness: 3.0
  },
  DIAMOND: {
    id: 'diamond',
    name: 'Elmas',
    sides: 8,
    color: '#38bdf8',
    value: 1350,
    minDepth: 225,
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
    buffLabel: '+50°C Radyatör Isı Toleransı'
  }
};

export const RELICS: RelicDefinition[] = Object.values(RELIC_DEFINITIONS);
export const BASE_ELEVATOR_SPEED = 380;
export const MUSEUM_CURATOR_REWARD = 15000;
