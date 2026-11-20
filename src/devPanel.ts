import {
  GRID_WIDTH,
  GRID_HEIGHT,
  TILE_SIZE,
  SURFACE_ROW,
  MAGMA_NO_RAIL_START_ROW,
  UpgradeKey,
  getUpgradeLevelValue
} from './constants';
import { PlayerExtendedState, PLAYER_WIDTH, PLAYER_HEIGHT } from './player';
import { Tile, TileType } from './types';
import { UIManager } from './ui';
import { findAncientCoreCoords, markWorldDirty, revealTilesAround } from './world';
import { sounds } from './audio';

export interface DevPanelContext {
  player: PlayerExtendedState;
  world: Tile[][];
  uiManager: UIManager;
  setAutosavePaused: (paused: boolean) => void;
  isAutosavePaused: () => boolean;
  snapCameraToPlayer: () => void;
  regenerateWorld: () => void;
}

const ALL_UPGRADE_KEYS: UpgradeKey[] = [
  'drill',
  'fuelTank',
  'cargo',
  'engine',
  'radar',
  'hull',
  'radiator'
];

function applyAllUpgrades(player: PlayerExtendedState, tier: number): void {
  const clamped = Math.max(1, Math.min(5, Math.floor(tier)));
  for (const key of ALL_UPGRADE_KEYS) {
    player.upgrades[key] = clamped;
  }
  player.drillSpeed = getUpgradeLevelValue('drill', clamped);
  player.maxFuel = getUpgradeLevelValue('fuelTank', clamped);
  player.maxCargo = getUpgradeLevelValue('cargo', clamped);
  player.thrusterPower = getUpgradeLevelValue('engine', clamped);
  player.radarRadius = getUpgradeLevelValue('radar', clamped);
  player.maxHull = getUpgradeLevelValue('hull', clamped);

  player.fuel = player.maxFuel;
  player.hull = player.maxHull;
  player.heat = 0;
  player.heatLockoutTimer = 0;
}

function isProtectedStructuralTile(tile: Tile | undefined): boolean {
  if (!tile) return true;
  return (
    tile.type === TileType.BEDROCK ||
    tile.type === TileType.ANCIENT_CORE ||
    tile.type === TileType.FUEL_PAD ||
    tile.type === TileType.SHOP_PAD
  );
}

function carveSafePocket(world: Tile[][], centerGx: number, centerGy: number, halfW: number = 1): void {
  for (let dy = -1; dy <= 0; dy++) {
    const gy = centerGy + dy;
    if (gy < SURFACE_ROW || gy >= GRID_HEIGHT - 1) continue;
    for (let dx = -halfW; dx <= halfW; dx++) {
      const gx = centerGx + dx;
      if (gx < 1 || gx >= GRID_WIDTH - 1) continue;
      const tile = world[gy]?.[gx];
      if (isProtectedStructuralTile(tile)) continue;
      world[gy][gx] = {
        type: TileType.EMPTY,
        hardness: 0,
        revealed: true
      };
    }
  }

  // Guarantee solid footing directly beneath player
  const floorGy = centerGy + 1;
  if (floorGy < GRID_HEIGHT && world[floorGy]?.[centerGx]) {
    const floorTile = world[floorGy][centerGx];
    if (floorTile.type === TileType.EMPTY) {
      world[floorGy][centerGx] = {
        type: TileType.DIRT,
        hardness: 2.0,
        revealed: true
      };
    } else {
      floorTile.revealed = true;
    }
  }
  markWorldDirty();
}

function buildElevatorShaft(world: Tile[][], col: number, fromRow: number, toRow: number): void {
  for (let gy = Math.max(SURFACE_ROW, fromRow); gy <= Math.min(MAGMA_NO_RAIL_START_ROW - 1, toRow); gy++) {
    const tile = world[gy]?.[col];
    if (isProtectedStructuralTile(tile)) continue;
    world[gy][col] = {
      type: TileType.EMPTY,
      hardness: 0,
      revealed: true,
      hasElevator: true
    };
  }
  markWorldDirty();
}

function placePlayerAtGrid(
  player: PlayerExtendedState,
  world: Tile[][],
  gx: number,
  gy: number,
  snapCameraToPlayer: () => void
): void {
  player.x = gx * TILE_SIZE + (TILE_SIZE - PLAYER_WIDTH) / 2;
  player.y = gy * TILE_SIZE + (TILE_SIZE - PLAYER_HEIGHT);
  player.lastValidX = player.x;
  player.lastValidY = player.y;
  player.startDrillX = player.x;
  player.startDrillY = player.y;
  player.vx = 0;
  player.vy = 0;
  player.isDrilling = false;
  player.isStruggling = false;
  player.drillProgress = 0;
  player.drillTarget = null;
  player.isThrusting = false;
  player.isGrounded = true;
  player.elevatorAuto = null;
  player.elevatorCol = undefined;
  player.isInElevator = false;
  sounds.stopDrill();
  sounds.stopThrust();
  sounds.stopElevatorHum();
  revealTilesAround(world, player.x + PLAYER_WIDTH / 2, player.y + PLAYER_HEIGHT / 2, player.radarRadius, TILE_SIZE);
  snapCameraToPlayer();
}

export function initDevPanel(ctx: DevPanelContext): void {
  if (typeof document === 'undefined' || document.getElementById('polyminer-dev-toggle')) {
    return;
  }

  let isOpen = false;
  let fogSnapshot: boolean[][] | null = null;
  let userTouchedAutosaveToggle = false;

  const toggleBtn = document.createElement('button');
  toggleBtn.id = 'polyminer-dev-toggle';
  toggleBtn.textContent = 'DEV [F9]';
  toggleBtn.title = 'Geliştirici Test Panelini Aç/Kapat (F9)';
  toggleBtn.style.cssText =
    'position:fixed;right:12px;bottom:12px;z-index:9999;background:rgba(15,23,42,0.92);border:1.5px solid #06b6d4;color:#22d3ee;padding:5px 10px;border-radius:6px;font:bold 11px monospace;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,0.45);';

  const panel = document.createElement('div');
  panel.id = 'polyminer-dev-panel';
  panel.style.cssText =
    'display:none;position:fixed;right:12px;bottom:48px;z-index:9999;width:320px;max-height:82vh;overflow-y:auto;background:rgba(15,23,42,0.96);border:1.5px solid #06b6d4;border-radius:8px;padding:10px;color:#e2e8f0;font:11px/1.4 monospace;box-shadow:0 12px 32px rgba(0,0,0,0.65);';

  panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #1e293b;padding-bottom:6px;margin-bottom:8px;">
      <strong style="color:#22d3ee;">🛠️ POLYMINER DEV TEST [F9]</strong>
      <button id="dev-close" style="background:none;border:none;color:#94a3b8;cursor:pointer;font:bold 12px monospace;">✕</button>
    </div>

    <label style="display:flex;align-items:center;gap:6px;background:#1e293b;padding:5px 7px;border-radius:4px;margin-bottom:8px;cursor:pointer;font-size:10.5px;">
      <input type="checkbox" id="dev-pause-autosave" />
      <span>Oto-kaydı duraklat (Solo kaydı koru)</span>
    </label>

    <div style="color:#94a3b8;font-size:10px;margin-bottom:4px;text-transform:uppercase;">Katman Işınlanma + Ekipman</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:8px;">
      <button class="dev-btn" data-preset="k2" style="padding:5px;background:#1e1b4b;border:1px solid #6366f1;color:#c7d2fe;border-radius:4px;cursor:pointer;font:10.5px monospace;">K2 Kuvars (120m)</button>
      <button class="dev-btn" data-preset="k3" style="padding:5px;background:#064e3b;border:1px solid #10b981;color:#a7f3d0;border-radius:4px;cursor:pointer;font:10.5px monospace;">K3 Bazalt (260m)</button>
      <button class="dev-btn" data-preset="k4" style="padding:5px;background:#451a03;border:1px solid #f97316;color:#fed7aa;border-radius:4px;cursor:pointer;font:10.5px monospace;">K4 Magma (410m)</button>
      <button class="dev-btn" data-preset="core" style="padding:5px;background:#4c0519;border:1px solid #ec4899;color:#fbcfe8;border-radius:4px;cursor:pointer;font:10.5px monospace;">Çekirdek Yanı</button>
    </div>

    <div style="color:#94a3b8;font-size:10px;margin-bottom:4px;text-transform:uppercase;">Harita &amp; Görünüm</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:8px;">
      <button id="dev-toggle-fog" style="padding:5px;background:#1e293b;border:1px solid #38bdf8;color:#e0f2fe;border-radius:4px;cursor:pointer;font:10.5px monospace;">👁️ Tüm Sisi Aç</button>
      <button id="dev-regen-world" style="padding:5px;background:#1e293b;border:1px solid #f59e0b;color:#fef3c7;border-radius:4px;cursor:pointer;font:10.5px monospace;">🗺️ Yeni Harita</button>
    </div>

    <div style="color:#94a3b8;font-size:10px;margin-bottom:4px;text-transform:uppercase;">Kaynak &amp; Modül Seviyesi</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:6px;">
      <button id="dev-add-money" style="padding:5px;background:#14532d;border:1px solid #22c55e;color:#dcfce7;border-radius:4px;cursor:pointer;font:10.5px monospace;">+$10,000</button>
      <button id="dev-refill" style="padding:5px;background:#0c4a6e;border:1px solid #0ea5e9;color:#e0f2fe;border-radius:4px;cursor:pointer;font:10.5px monospace;">⛽ Doldur &amp; Soğut</button>
      <button id="dev-add-gear" style="grid-column:span 2;padding:5px;background:#1e293b;border:1px solid #64748b;color:#f1f5f9;border-radius:4px;cursor:pointer;font:10.5px monospace;">+20 Asansör Rayı &amp; +5 Her Sarf</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(5, 1fr);gap:3px;margin-bottom:8px;">
      <button class="dev-tier-btn" data-tier="1" style="padding:4px 0;background:#1e293b;border:1px solid #475569;color:#cbd5e1;border-radius:3px;cursor:pointer;font:10px monospace;">Sv.1</button>
      <button class="dev-tier-btn" data-tier="2" style="padding:4px 0;background:#1e293b;border:1px solid #475569;color:#cbd5e1;border-radius:3px;cursor:pointer;font:10px monospace;">Sv.2</button>
      <button class="dev-tier-btn" data-tier="3" style="padding:4px 0;background:#1e293b;border:1px solid #475569;color:#cbd5e1;border-radius:3px;cursor:pointer;font:10px monospace;">Sv.3</button>
      <button class="dev-tier-btn" data-tier="4" style="padding:4px 0;background:#1e293b;border:1px solid #475569;color:#cbd5e1;border-radius:3px;cursor:pointer;font:10px monospace;">Sv.4</button>
      <button class="dev-tier-btn" data-tier="5" style="padding:4px 0;background:#1e293b;border:1px solid #475569;color:#cbd5e1;border-radius:3px;cursor:pointer;font:10px monospace;">Sv.5</button>
    </div>

    <div style="color:#94a3b8;font-size:10px;margin-bottom:4px;text-transform:uppercase;">Canlı Harita Özeti</div>
    <div id="dev-world-stats" style="background:#0f172a;border:1px solid #1e293b;border-radius:4px;padding:6px;font-size:10px;color:#cbd5e1;line-height:1.45;"></div>
  `;

  document.body.appendChild(toggleBtn);
  document.body.appendChild(panel);

  const autosaveCheckbox = panel.querySelector('#dev-pause-autosave') as HTMLInputElement;
  const fogBtn = panel.querySelector('#dev-toggle-fog') as HTMLButtonElement;
  const statsBox = panel.querySelector('#dev-world-stats') as HTMLDivElement;

  const ensureAutosaveProtection = () => {
    if (!userTouchedAutosaveToggle && !ctx.isAutosavePaused()) {
      ctx.setAutosavePaused(true);
      autosaveCheckbox.checked = true;
    }
  };

  const syncHudAndShop = () => {
    const centerRow = Math.floor((ctx.player.y + PLAYER_HEIGHT / 2) / TILE_SIZE);
    const depthMeters = Math.max(0, (centerRow - SURFACE_ROW) * 2);
    ctx.uiManager.updateHUD(ctx.player, depthMeters, false);
    ctx.uiManager.refreshShopIfOpen();
  };

  const refreshStats = () => {
    const counts: Record<string, number> = {
      copper: 0,
      iron: 0,
      silver: 0,
      k3Gold: 0,
      k3Emerald: 0,
      k4Gold: 0,
      k4Emerald: 0,
      diamond: 0,
      k34LowTier: 0,
      relics: 0
    };

    for (let y = SURFACE_ROW + 1; y < GRID_HEIGHT - 6; y++) {
      const row = ctx.world[y];
      if (!row) continue;
      for (let x = 0; x < GRID_WIDTH; x++) {
        const tile = row[x];
        if (!tile) continue;
        if (tile.relicId) counts.relics++;
        if (tile.type === TileType.ORE && tile.ore) {
          const id = tile.ore.id;
          if (y >= 131) {
            if (id === 'copper' || id === 'iron' || id === 'silver') counts.k34LowTier++;
            if (y <= 205) {
              if (id === 'gold') counts.k3Gold++;
              else if (id === 'emerald') counts.k3Emerald++;
            } else {
              if (id === 'gold') counts.k4Gold++;
              else if (id === 'emerald') counts.k4Emerald++;
              else if (id === 'diamond') counts.diamond++;
            }
          } else {
            if (id === 'copper') counts.copper++;
            else if (id === 'iron') counts.iron++;
            else if (id === 'silver') counts.silver++;
          }
        }
      }
    }

    const core = findAncientCoreCoords(ctx.world);
    const coreText = core
      ? `${core.gx < GRID_WIDTH / 2 ? 'Sol Kanat' : 'Sağ Kanat'} (x=${core.gx}, y=${core.gy})`
      : 'Yok / Açıldı';

    statsBox.innerHTML = `
      <div>• <strong>K1–K2:</strong> Bakır ${counts.copper} · Demir ${counts.iron} · Gümüş ${counts.silver}</div>
      <div>• <strong>K3 Bazalt:</strong> Altın ${counts.k3Gold} · Zümrüt ${counts.k3Emerald}</div>
      <div>• <strong>K4 Magma:</strong> Altın ${counts.k4Gold} · Zümrüt ${counts.k4Emerald} · <span style="color:#38bdf8;">Elmas ${counts.diamond}</span></div>
      <div>• <strong>K3–K4 Eski Cevher Sızıntısı:</strong> ${counts.k34LowTier} · <strong>Fosil:</strong> ${counts.relics}</div>
      <div>• <strong>Çekirdek:</strong> <span style="color:#f472b6;">${coreText}</span></div>
    `;
  };

  const setOpen = (next: boolean) => {
    isOpen = next;
    panel.style.display = isOpen ? 'block' : 'none';
    if (isOpen) {
      autosaveCheckbox.checked = ctx.isAutosavePaused();
      refreshStats();
    }
  };

  toggleBtn.addEventListener('click', () => setOpen(!isOpen));
  panel.querySelector('#dev-close')?.addEventListener('click', () => setOpen(false));

  window.addEventListener('keydown', (e: KeyboardEvent) => {
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
    if (e.code === 'F9') {
      e.preventDefault();
      setOpen(!isOpen);
    }
  });

  autosaveCheckbox.addEventListener('change', () => {
    userTouchedAutosaveToggle = true;
    ctx.setAutosavePaused(autosaveCheckbox.checked);
    ctx.uiManager.showToast(
      autosaveCheckbox.checked ? '⏸️ Oto-kayıt duraklatıldı' : '💾 Oto-kayıt yeniden açıldı',
      '#38bdf8'
    );
  });

  panel.querySelectorAll('.dev-btn[data-preset]').forEach(btn => {
    btn.addEventListener('click', () => {
      ensureAutosaveProtection();
      const preset = btn.getAttribute('data-preset');
      const col = Math.floor(GRID_WIDTH / 2);

      if (preset === 'k2') {
        applyAllUpgrades(ctx.player, 2);
        ctx.player.inventory.elevatorRails = Math.max(ctx.player.inventory.elevatorRails, 30);
        ctx.player.inventory.fuelCanister = Math.max(ctx.player.inventory.fuelCanister, 3);
        ctx.player.inventory.repairKit = Math.max(ctx.player.inventory.repairKit, 3);
        ctx.player.inventory.dynamite = Math.max(ctx.player.inventory.dynamite, 3);
        ctx.player.inventory.teleporter = Math.max(ctx.player.inventory.teleporter, 3);
        buildElevatorShaft(ctx.world, col, SURFACE_ROW, 63);
        carveSafePocket(ctx.world, col, 64, 1);
        placePlayerAtGrid(ctx.player, ctx.world, col, 64, ctx.snapCameraToPlayer);
        ctx.uiManager.showToast('🧪 K2 Kuvars (Sv.2 + Şaft) hazır', '#a855f7');
      } else if (preset === 'k3') {
        applyAllUpgrades(ctx.player, 3);
        ctx.player.inventory.elevatorRails = Math.max(ctx.player.inventory.elevatorRails, 60);
        ctx.player.inventory.fuelCanister = Math.max(ctx.player.inventory.fuelCanister, 5);
        ctx.player.inventory.repairKit = Math.max(ctx.player.inventory.repairKit, 5);
        ctx.player.inventory.dynamite = Math.max(ctx.player.inventory.dynamite, 5);
        ctx.player.inventory.teleporter = Math.max(ctx.player.inventory.teleporter, 5);
        buildElevatorShaft(ctx.world, col, SURFACE_ROW, 133);
        carveSafePocket(ctx.world, col, 134, 1);
        placePlayerAtGrid(ctx.player, ctx.world, col, 134, ctx.snapCameraToPlayer);
        ctx.uiManager.showToast('🧪 K3 Bazalt (Sv.3 + Şaft) hazır', '#10b981');
      } else if (preset === 'k4') {
        applyAllUpgrades(ctx.player, 4);
        ctx.player.inventory.elevatorRails = Math.max(ctx.player.inventory.elevatorRails, 20);
        ctx.player.inventory.fuelCanister = Math.max(ctx.player.inventory.fuelCanister, 6);
        ctx.player.inventory.repairKit = Math.max(ctx.player.inventory.repairKit, 6);
        ctx.player.inventory.dynamite = Math.max(ctx.player.inventory.dynamite, 6);
        ctx.player.inventory.teleporter = Math.max(ctx.player.inventory.teleporter, 6);
        buildElevatorShaft(ctx.world, col, SURFACE_ROW, MAGMA_NO_RAIL_START_ROW - 1);
        carveSafePocket(ctx.world, col, MAGMA_NO_RAIL_START_ROW + 1, 1);
        placePlayerAtGrid(ctx.player, ctx.world, col, MAGMA_NO_RAIL_START_ROW + 1, ctx.snapCameraToPlayer);
        ctx.uiManager.showToast('🧪 K4 Magma (Sv.4 · Ray yasağı aktif)', '#f97316');
      } else if (preset === 'core') {
        applyAllUpgrades(ctx.player, 5);
        ctx.player.inventory.fuelCanister = Math.max(ctx.player.inventory.fuelCanister, 6);
        ctx.player.inventory.repairKit = Math.max(ctx.player.inventory.repairKit, 6);
        ctx.player.inventory.dynamite = Math.max(ctx.player.inventory.dynamite, 6);
        ctx.player.inventory.teleporter = Math.max(ctx.player.inventory.teleporter, 6);
        const core = findAncientCoreCoords(ctx.world);
        if (core) {
          const targetGx = core.gx < GRID_WIDTH / 2 ? core.gx + 5 : core.gx - 5;
          carveSafePocket(ctx.world, targetGx, core.gy, 1);
          placePlayerAtGrid(ctx.player, ctx.world, targetGx, core.gy, ctx.snapCameraToPlayer);
          ctx.uiManager.showToast('🧪 Çekirdek kapısı yakınındasın (Sv.5)', '#ec4899');
        }
      }

      syncHudAndShop();
      refreshStats();
    });
  });

  fogBtn.addEventListener('click', () => {
    ensureAutosaveProtection();
    if (!fogSnapshot) {
      fogSnapshot = ctx.world.map(row => row.map(tile => !!tile.revealed));
      for (let y = SURFACE_ROW + 1; y < GRID_HEIGHT; y++) {
        for (let x = 0; x < GRID_WIDTH; x++) {
          ctx.world[y][x].revealed = true;
        }
      }
      fogBtn.textContent = '🌫️ Sisi Geri Kapat';
      markWorldDirty();
      ctx.uiManager.showToast('👁️ Tüm harita sisi açıldı (damar/jeod önizleme)', '#38bdf8');
    } else {
      for (let y = 0; y < GRID_HEIGHT; y++) {
        for (let x = 0; x < GRID_WIDTH; x++) {
          if (fogSnapshot[y] && ctx.world[y]?.[x]) {
            ctx.world[y][x].revealed = fogSnapshot[y][x];
          }
        }
      }
      fogSnapshot = null;
      fogBtn.textContent = '👁️ Tüm Sisi Aç';
      markWorldDirty();
      ctx.uiManager.showToast('🌫️ Önceki sis durumu geri yüklendi', '#94a3b8');
    }
  });

  panel.querySelector('#dev-regen-world')?.addEventListener('click', () => {
    ensureAutosaveProtection();
    fogSnapshot = null;
    fogBtn.textContent = '👁️ Tüm Sisi Aç';
    ctx.regenerateWorld();
    syncHudAndShop();
    refreshStats();
    ctx.uiManager.showToast('🗺️ Yeni Faz F haritası üretildi!', '#f59e0b');
  });

  panel.querySelector('#dev-add-money')?.addEventListener('click', () => {
    ensureAutosaveProtection();
    ctx.player.money += 10000;
    syncHudAndShop();
    ctx.uiManager.showToast('💵 +$10,000 eklendi', '#22c55e');
  });

  panel.querySelector('#dev-refill')?.addEventListener('click', () => {
    ensureAutosaveProtection();
    ctx.player.fuel = ctx.player.maxFuel;
    ctx.player.hull = ctx.player.maxHull;
    ctx.player.heat = 0;
    ctx.player.heatLockoutTimer = 0;
    syncHudAndShop();
    ctx.uiManager.showToast('⛽ Yakıt, gövde ve hararet sıfırlandı', '#38bdf8');
  });

  panel.querySelector('#dev-add-gear')?.addEventListener('click', () => {
    ensureAutosaveProtection();
    ctx.player.inventory.elevatorRails += 20;
    ctx.player.inventory.fuelCanister += 5;
    ctx.player.inventory.repairKit += 5;
    ctx.player.inventory.dynamite += 5;
    ctx.player.inventory.teleporter += 5;
    syncHudAndShop();
    ctx.uiManager.showToast('🎒 +20 Ray ve +5 sarf eklendi', '#cbd5e1');
  });

  panel.querySelectorAll('.dev-tier-btn[data-tier]').forEach(btn => {
    btn.addEventListener('click', () => {
      ensureAutosaveProtection();
      const tier = parseInt(btn.getAttribute('data-tier') || '1', 10);
      applyAllUpgrades(ctx.player, tier);
      syncHudAndShop();
      ctx.uiManager.showToast(`⚙️ Tüm modüller Seviye ${tier}/5 yapıldı`, '#38bdf8');
    });
  });
}
