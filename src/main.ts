import './style.css';
import {
  GRID_WIDTH,
  GRID_HEIGHT,
  TILE_SIZE,
  SURFACE_ROW,
  RELIC_DEFINITIONS,
  ROCK_HARDNESS,
  MUSEUM_CURATOR_REWARD
} from './constants';
import { generateWorld, revealAdjacentTiles, markWorldDirty } from './world';
import { renderWorld, renderPlayer, renderRemotePlayers } from './renderer';
import {
  createPlayer,
  updatePlayer,
  towPlayerToSurface,
  useConsumableItem,
  startElevatorAutoGlide,
  PLAYER_WIDTH,
  PLAYER_HEIGHT
} from './player';
import { UIManager } from './ui';
import { updateEffects, renderEffects, addFloatingText } from './effects';
import { saveGame, loadGame, applyLoadedGame, resetSave, serializeWorld, applySavedGrid } from './save';
import { updateBoulders, renderBoulders } from './boulders';
import { NetworkManager, MIN_SHARED_MONEY, MAX_SHARED_MONEY } from './network';
import { RemotePlayerState, TileType } from './types';
import { sounds } from './audio';
import { emitGameEvent, onGameEvent } from './events';

// Canvas Setup
const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
const topHudEl = document.getElementById('top-hud');

function computeCanvasHeight(): number {
  const hudHeight = topHudEl ? topHudEl.offsetHeight : (window.innerWidth <= 900 ? 95 : 80);
  return Math.max(360, Math.min(window.innerHeight - hudHeight - 6, 740));
}

const CANVAS_WIDTH = GRID_WIDTH * TILE_SIZE; // 1152px
canvas.width = CANVAS_WIDTH;
canvas.height = computeCanvasHeight();

// Camera State
let cameraY = 0;
const minCameraY = 0;
function getMaxCameraY(): number {
  return Math.max(0, GRID_HEIGHT * TILE_SIZE - canvas.height);
}

// World & Player State
const world = generateWorld();
const player = createPlayer();

// Remote Players State (Online Co-op)
const remotePlayers: Map<string, RemotePlayerState> = new Map();

// Playtime & Autosave
let playTime = 0;
let autoSaveTimer = 0;
let loadedSavedGame = false;

// Attempt auto-load on start with safety fallback
try {
  const savedGame = loadGame();
  if (savedGame) {
    applyLoadedGame(savedGame, player, world);
    playTime = savedGame.playTime || 0;
    loadedSavedGame = true;
    const targetCameraY = player.y - canvas.height / 2 + PLAYER_HEIGHT / 2;
    cameraY = Math.max(minCameraY, Math.min(getMaxCameraY(), targetCameraY));
  }
} catch (err) {
  console.error('[POLYMINER] Auto-load error, resetting corrupt save:', err);
  resetSave();
}

// UI Manager
const uiManager = new UIManager();
if (loadedSavedGame) {
  uiManager.showToast('💾 Kayıt Yüklendi!', '#38bdf8', 2200);
}

let wasGuestSession = false;
let isReloading = false;

// Network Manager (P2P WebRTC)
const network = new NetworkManager({
  getGridSyncData: () => serializeWorld(world),
  getSharedMoney: () => player.money,
  getDiscoveredRelics: () => player.discoveredRelics || [],
  getMuseumRewardClaimed: () => !!player.museumRewardClaimed,
  onWelcomeSync: (data) => {
    wasGuestSession = true;
    if (data.grid && Array.isArray(data.grid) && data.grid.length === GRID_HEIGHT) {
      applySavedGrid(data.grid, world);
    }
    if (typeof data.sharedMoney === 'number' && Number.isFinite(data.sharedMoney) && data.sharedMoney >= MIN_SHARED_MONEY) {
      player.money = Math.trunc(data.sharedMoney);
    }
    if (Array.isArray(data.discoveredRelics)) {
      player.discoveredRelics = data.discoveredRelics.filter(id => typeof id === 'string' && id in RELIC_DEFINITIONS);
    }
    player.museumRewardClaimed = !!data.museumRewardClaimed;
    uiManager.showToast('🗺️ Host Haritası & Ortak Kasa Eşitlendi!', '#10b981');
  },
  onRemotePlayerUpdate: (rp) => {
    const existing = remotePlayers.get(rp.id);
    remotePlayers.set(rp.id, {
      ...rp,
      renderX: existing?.renderX ?? rp.x,
      renderY: existing?.renderY ?? rp.y,
    });
  },
  onRemotePlayerLeave: (id) => {
    const left = remotePlayers.get(id);
    remotePlayers.delete(id);
    if (left) {
      uiManager.showToast(`👋 ${left.name} odadan ayrıldı.`, '#94a3b8');
    }
  },
  onTileUpdate: (data) => {
    if (Number.isInteger(data.gy) && Number.isInteger(data.gx) &&
        data.gy >= 0 && data.gy < world.length && data.gx >= 0 && data.gx < GRID_WIDTH) {
      const tile = world[data.gy][data.gx];
      if (tile) {
        if (data.hasElevator) {
          tile.hasElevator = true;
          tile.type = TileType.EMPTY;
          tile.revealed = true;
          delete tile.ore;
          tile.hardness = 0;
          revealAdjacentTiles(world, data.gx, data.gy);
          markWorldDirty();
        } else if (data.tileType === TileType.EMPTY) {
          tile.type = TileType.EMPTY;
          delete tile.ore;
          tile.hardness = 0;
          tile.revealed = true;
          revealAdjacentTiles(world, data.gx, data.gy);
          markWorldDirty();
        } else if (data.tileType === TileType.ROCK) {
          tile.type = TileType.ROCK;
          delete tile.ore;
          tile.hardness = ROCK_HARDNESS;
          tile.revealed = true;
          markWorldDirty();
        }
      }
    }
  },
  onSharedWalletUpdate: (data) => {
    if (
      typeof data.money === 'number' &&
      Number.isFinite(data.money) &&
      data.money >= MIN_SHARED_MONEY &&
      data.money <= MAX_SHARED_MONEY
    ) {
      player.money = Math.trunc(data.money);
    }
    const centerRow = Math.floor((player.y + PLAYER_HEIGHT / 2) / TILE_SIZE);
    const depthMeters = Math.max(0, (centerRow - SURFACE_ROW) * 2);
    uiManager.updateHUD(player, depthMeters, false);
    uiManager.refreshShopIfOpen();

    const change = Number(data.changeAmount) || 0;
    if (change === 0) {
      uiManager.showToast(`⚠️ Bakiye eşitlendi (${data.reason})`, '#f59e0b');
    } else if (data.actorName !== network.localName) {
      const isGain = change > 0;
      const msg = isGain
        ? `🤝 [${data.actorName}] +$${change.toLocaleString()} kazandı! (${data.reason})`
        : `💸 [${data.actorName}] ${data.reason} aldı (-$${Math.abs(change).toLocaleString()})`;
      uiManager.showToast(msg, isGain ? '#10b981' : '#f59e0b');
    }
  },
  onSharedRelicUpdate: (data) => {
    if (!player.discoveredRelics) player.discoveredRelics = [];
    if (typeof data.relicId === 'string' && data.relicId in RELIC_DEFINITIONS && !player.discoveredRelics.includes(data.relicId)) {
      player.discoveredRelics.push(data.relicId);
      if (data.actorName !== network.localName) {
        uiManager.showToast(`🏛️ [${data.actorName}] yeni bir kadim fosil keşfetti!`, '#f59e0b');
        sounds.playRelicFound();
      }
    }
  },
  onMuseumRewardClaimed: (data) => {
    player.museumRewardClaimed = true;
    if (data.grantLocally) {
      player.money += MUSEUM_CURATOR_REWARD;
      network.sendWalletDelta(MUSEUM_CURATOR_REWARD, 'Müze Küratör Ödülü');
      sounds.playVictoryFanfare();
      addFloatingText(
        player.x + PLAYER_WIDTH / 2,
        player.y - 14,
        `🏆 +$${MUSEUM_CURATOR_REWARD.toLocaleString()} MÜZE ÖDÜLÜ!`,
        '#f59e0b'
      );
    } else {
      sounds.playRelicFound();
    }
    uiManager.showToast(
      `🏛️ [${data.actorName}] Müze Küratör Ödülünü aldı (+$${MUSEUM_CURATOR_REWARD.toLocaleString()})!`,
      '#f59e0b'
    );
    uiManager.refreshShopIfOpen();
    safeSaveGame();
  },
  onVictory: (data) => {
    sounds.playVictoryFanfare();
    uiManager.showVictory(playTime, player, data.winnerName);
  },
  onStatusChange: (statusText, isConnected, peerCount) => {
    uiManager.updateCoopHUD(statusText, isConnected, peerCount);
    // If was in a guest session and connection dropped (host closed room or network dropped),
    // prevent any autosave and cleanly reload so guest returns safely to their pristine solo save!
    if (wasGuestSession && !isConnected && !isReloading) {
      isReloading = true;
      uiManager.showToast('🔌 Bağlantı kesildi. Kendi madenine dönülüyor...', '#f59e0b');
      setTimeout(() => {
        window.location.reload();
      }, 800);
    }
  },
  onRosterUpdate: (roster) => {
    uiManager.updateCoopRoster(roster);
  }
});

/**
 * Safe save wrapper:
 * Solo session: saves to primary 'solo' slot ('polyminer_save_v1').
 * Guest co-op session: saves to dedicated 'coop' slot ('polyminer_save_coop_v1'), preserving solo save 100% pristine!
 */
function safeSaveGame(): boolean {
  if (wasGuestSession || (network.isConnected && !network.getIsHost())) {
    return saveGame(player, world, playTime, 'coop');
  }
  return saveGame(player, world, playTime, 'solo');
}

// Pre-save solo game before connecting to any remote host
onGameEvent('polyminer:pre-join', () => {
  saveGame(player, world, playTime);
});

uiManager.setPlayerRef(player, () => {
  // Callback when purchase/sell happens: save safely!
  safeSaveGame();
});

uiManager.setConsumableClickHandler((itemKey) => {
  if (!uiManager.isAnyModalOpen()) {
    useConsumableItem(player, itemKey, world);
  }
});

// Initialize Co-op Lobby in UI
uiManager.initCoop(network);

// Listen to Custom Game Events & Broadcast Over Network
onGameEvent('polyminer:tile-changed', (d) => {
  network.broadcastTileUpdate(d.gx, d.gy, d.tileType, d.hasElevator);
});

onGameEvent('polyminer:wallet-changed', (d) => {
  if (typeof d.changeAmount === 'number') {
    network.sendWalletDelta(d.changeAmount, d.reason || 'Ortak İşlem', !!d.allowDebt);
  }
});

onGameEvent('polyminer:relic-discovered', (d) => {
  if (d.relicId) {
    network.broadcastRelicDiscovered(d.relicId);
  }
});

onGameEvent('polyminer:museum-claim', () => {
  const status = network.requestMuseumRewardClaim();
  if (status === 'already_claimed') {
    player.museumRewardClaimed = true;
    uiManager.refreshShopIfOpen();
    return;
  }
  if (status === 'requested') {
    uiManager.showToast('⏳ Müze ödülü Host onayına gönderildi...', '#38bdf8');
    return;
  }

  player.museumRewardClaimed = true;
  player.money += MUSEUM_CURATOR_REWARD;
  sounds.playVictoryFanfare();
  addFloatingText(
    player.x + PLAYER_WIDTH / 2,
    player.y - 14,
    `🏆 +$${MUSEUM_CURATOR_REWARD.toLocaleString()} MÜZE ÖDÜLÜ!`,
    '#f59e0b'
  );
  if (status === 'granted') {
    network.sendWalletDelta(MUSEUM_CURATOR_REWARD, 'Müze Küratör Ödülü');
  }
  safeSaveGame();
  uiManager.refreshShopIfOpen();
});

// Victory Event Listener (When 550m Ancient Core is mined/blasted)
onGameEvent('polyminer:victory', (d) => {
  const winner = d.winnerName || player.name || network.localName || 'Madenci';
  if (network.isConnected) {
    network.broadcastVictory(winner);
    uiManager.showVictory(playTime, player, winner);
  } else {
    uiManager.showVictory(playTime, player);
  }
  safeSaveGame();
});

// Reset / New Game Button
const btnResetGame = document.getElementById('btn-reset-game');
if (btnResetGame) {
  btnResetGame.addEventListener('click', () => {
    if (confirm('Tüm ilerlemeniz, paranız ve harita silinecek, yeni bir oyun başlatılacak. Onaylıyor musunuz?')) {
      resetSave();
      location.reload();
    }
  });
}

// Camera State already initialized above

// Keyboard Tracking
const keysDown: Record<string, boolean> = {};

// Double-tap tracking for elevator auto-glide
let lastUpTapTime = 0;
let lastDownTapTime = 0;
const DOUBLE_TAP_WINDOW_MS = 380;

window.addEventListener('keydown', (e: KeyboardEvent) => {
  if ((e.target as HTMLElement)?.tagName === 'INPUT') {
    return;
  }

  keysDown[e.code] = true;
  keysDown[e.key] = true;
  keysDown[e.key.toLowerCase()] = true;

  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
    e.preventDefault();
  }

  // Quick consumable triggers and elevator double-tap when not in modal
  if (!uiManager.isAnyModalOpen() && !e.repeat) {
    const now = performance.now();
    const isUpKey = e.code === 'KeyW' || e.code === 'ArrowUp' || e.key === 'w' || e.key === 'W';
    const isDownKey = e.code === 'KeyS' || e.code === 'ArrowDown' || e.key === 's' || e.key === 'S';

    if (isUpKey) {
      if (now - lastUpTapTime <= DOUBLE_TAP_WINDOW_MS) {
        startElevatorAutoGlide(player, world, 'up');
        lastUpTapTime = 0;
      } else {
        lastUpTapTime = now;
      }
    } else if (isDownKey) {
      if (now - lastDownTapTime <= DOUBLE_TAP_WINDOW_MS) {
        startElevatorAutoGlide(player, world, 'down');
        lastDownTapTime = 0;
      } else {
        lastDownTapTime = now;
      }
    }

    if (e.code === 'KeyR' || e.key.toLowerCase() === 'r') {
      useConsumableItem(player, 'fuelCanister', world);
    } else if (e.code === 'KeyT' || e.key.toLowerCase() === 't') {
      useConsumableItem(player, 'repairKit', world);
    } else if (e.code === 'KeyQ' || e.key.toLowerCase() === 'q') {
      useConsumableItem(player, 'teleporter', world);
    } else if (e.code === 'KeyX' || e.key.toLowerCase() === 'x') {
      useConsumableItem(player, 'dynamite', world);
    }
  }
});

window.addEventListener('keyup', (e: KeyboardEvent) => {
  if ((e.target as HTMLElement)?.tagName === 'INPUT') {
    return;
  }
  keysDown[e.code] = false;
  keysDown[e.key] = false;
  keysDown[e.key.toLowerCase()] = false;
});

window.addEventListener('blur', () => {
  for (const k of Object.keys(keysDown)) {
    keysDown[k] = false;
  }
});

window.addEventListener('resize', () => {
  canvas.height = computeCanvasHeight();
});

// Mobile Virtual Gamepad Bindings
function setupMobileControls() {
  const dpadUp = document.getElementById('btn-touch-up');
  const dpadDown = document.getElementById('btn-touch-down');
  const dpadLeft = document.getElementById('btn-touch-left');
  const dpadRight = document.getElementById('btn-touch-right');

  const btnRail = document.getElementById('btn-touch-rail');
  const btnFuel = document.getElementById('btn-touch-fuel');
  const btnRepair = document.getElementById('btn-touch-repair');
  const btnDyn = document.getElementById('btn-touch-dyn');
  const btnTp = document.getElementById('btn-touch-tp');

  const bindDpadButton = (btn: HTMLElement | null, primaryKey: string, isUp = false, isDown = false) => {
    if (!btn) return;

    const onStart = (e: Event) => {
      e.preventDefault();
      btn.classList.add('active');
      keysDown[primaryKey] = true;
      keysDown[primaryKey.toLowerCase()] = true;
      if (primaryKey === 'ArrowUp') { keysDown['KeyW'] = true; keysDown['w'] = true; keysDown['W'] = true; }
      if (primaryKey === 'ArrowDown') { keysDown['KeyS'] = true; keysDown['s'] = true; keysDown['S'] = true; }
      if (primaryKey === 'ArrowLeft') { keysDown['KeyA'] = true; keysDown['a'] = true; keysDown['A'] = true; }
      if (primaryKey === 'ArrowRight') { keysDown['KeyD'] = true; keysDown['d'] = true; keysDown['D'] = true; }

      // Double-tap for elevator auto-glide
      if (!uiManager.isAnyModalOpen()) {
        const now = performance.now();
        if (isUp) {
          if (now - lastUpTapTime <= DOUBLE_TAP_WINDOW_MS) {
            startElevatorAutoGlide(player, world, 'up');
            lastUpTapTime = 0;
          } else {
            lastUpTapTime = now;
          }
        } else if (isDown) {
          if (now - lastDownTapTime <= DOUBLE_TAP_WINDOW_MS) {
            startElevatorAutoGlide(player, world, 'down');
            lastDownTapTime = 0;
          } else {
            lastDownTapTime = now;
          }
        }
      }
    };

    const onEnd = (e: Event) => {
      e.preventDefault();
      btn.classList.remove('active');
      keysDown[primaryKey] = false;
      keysDown[primaryKey.toLowerCase()] = false;
      if (primaryKey === 'ArrowUp') { keysDown['KeyW'] = false; keysDown['w'] = false; keysDown['W'] = false; }
      if (primaryKey === 'ArrowDown') { keysDown['KeyS'] = false; keysDown['s'] = false; keysDown['S'] = false; }
      if (primaryKey === 'ArrowLeft') { keysDown['KeyA'] = false; keysDown['a'] = false; keysDown['A'] = false; }
      if (primaryKey === 'ArrowRight') { keysDown['KeyD'] = false; keysDown['d'] = false; keysDown['D'] = false; }
    };

    btn.addEventListener('pointerdown', onStart);
    btn.addEventListener('pointerup', onEnd);
    btn.addEventListener('pointercancel', onEnd);
    btn.addEventListener('pointerleave', onEnd);
  };

  bindDpadButton(dpadUp, 'ArrowUp', true, false);
  bindDpadButton(dpadDown, 'ArrowDown', false, true);
  bindDpadButton(dpadLeft, 'ArrowLeft');
  bindDpadButton(dpadRight, 'ArrowRight');

  // Elevator Rails [C]: Tap or Hold to deploy
  if (btnRail) {
    const startRail = (e: Event) => {
      e.preventDefault();
      btnRail.classList.add('active');
      keysDown['KeyC'] = true;
      keysDown['c'] = true;
      keysDown['C'] = true;
      if (!uiManager.isAnyModalOpen()) {
        useConsumableItem(player, 'elevatorRails', world);
      }
    };
    const stopRail = (e: Event) => {
      e.preventDefault();
      btnRail.classList.remove('active');
      keysDown['KeyC'] = false;
      keysDown['c'] = false;
      keysDown['C'] = false;
    };
    btnRail.addEventListener('pointerdown', startRail);
    btnRail.addEventListener('pointerup', stopRail);
    btnRail.addEventListener('pointercancel', stopRail);
    btnRail.addEventListener('pointerleave', stopRail);
  }

  // Instant Consumable Triggers
  const bindConsumable = (btn: HTMLElement | null, itemKey: 'fuelCanister' | 'repairKit' | 'dynamite' | 'teleporter') => {
    if (!btn) return;
    btn.addEventListener('pointerdown', (e: Event) => {
      e.preventDefault();
      btn.classList.add('active');
      if (!uiManager.isAnyModalOpen()) {
        useConsumableItem(player, itemKey, world);
      }
    });
    btn.addEventListener('pointerup', (e: Event) => {
      e.preventDefault();
      btn.classList.remove('active');
    });
    btn.addEventListener('pointercancel', () => btn.classList.remove('active'));
    btn.addEventListener('pointerleave', () => btn.classList.remove('active'));
  };

  bindConsumable(btnFuel, 'fuelCanister');
  bindConsumable(btnRepair, 'repairKit');
  bindConsumable(btnDyn, 'dynamite');
  bindConsumable(btnTp, 'teleporter');
}

setupMobileControls();

// Smooth Frame-Rate Independent Camera Follow
function updateCamera(deltaTime: number) {
  const maxCameraY = getMaxCameraY();
  const targetCameraY = player.y - canvas.height / 2 + PLAYER_HEIGHT / 2;
  const clampedTarget = Math.max(minCameraY, Math.min(maxCameraY, targetCameraY));

  const alpha = 1 - Math.exp(-7.5 * deltaTime);
  cameraY += (clampedTarget - cameraY) * alpha;

  if (cameraY < minCameraY) cameraY = minCameraY;
  if (cameraY > maxCameraY) cameraY = maxCameraY;
}

// Station & Fuel Logic
let refuelAccumulator = 0;
let repairAccumulator = 0;
let pendingStationSpend = 0;

function handleStations(dt: number): boolean {
  let isRefueling = false;

  const centerGx = Math.floor((player.x + PLAYER_WIDTH / 2) / TILE_SIZE);
  const bottomGy = Math.floor((player.y + PLAYER_HEIGHT + 2) / TILE_SIZE);

  // 1. FUEL PAD (y === 3, x < 3): Refuels and repairs hull
  if (bottomGy === SURFACE_ROW && centerGx < 3 && player.isGrounded) {
    // A. Fuel replenishment ($0.75 per Litre)
    if (player.fuel < player.maxFuel) {
      isRefueling = true;
      const fuelNeeded = player.maxFuel - player.fuel;
      const refuelRate = 45; // Litres per second
      const fuelStep = Math.min(fuelNeeded, refuelRate * dt);
      const costPerLitre = 0.75;

      refuelAccumulator += fuelStep * costPerLitre;
      if (refuelAccumulator >= 1) {
        const moneyToDeduct = Math.floor(refuelAccumulator);
        const prevMoney = player.money;
        player.money -= moneyToDeduct;
        pendingStationSpend += moneyToDeduct;
        refuelAccumulator -= moneyToDeduct;

        if (prevMoney >= 0 && player.money < 0) {
          addFloatingText(player.x + PLAYER_WIDTH / 2, player.y - 24, '💳 KREDİ KULLANILDI (BORÇLANDIN)', '#fb923c');
        }
      }
      player.fuel = Math.min(player.maxFuel, player.fuel + fuelStep);
    }

    // B. Hull repair ($1.20 per HP)
    if (player.hull < player.maxHull) {
      isRefueling = true;
      const costPerHp = 1.20;
      const repairRate = 35; // HP per second
      const hpStep = Math.min(player.maxHull - player.hull, repairRate * dt);

      repairAccumulator += hpStep * costPerHp;
      if (repairAccumulator >= 1) {
        const moneyToDeduct = Math.floor(repairAccumulator);
        const prevMoney = player.money;
        player.money -= moneyToDeduct;
        pendingStationSpend += moneyToDeduct;
        repairAccumulator -= moneyToDeduct;

        if (prevMoney >= 0 && player.money < 0) {
          addFloatingText(player.x + PLAYER_WIDTH / 2, player.y - 24, '💳 KREDİ KULLANILDI (BORÇLANDIN)', '#fb923c');
        }
      }
      player.hull = Math.min(player.maxHull, player.hull + hpStep);
    }

    // C. Hararet instant reset
    player.heat = 0;
    player.heatLockoutTimer = 0;
  }

  // Batch-sync station expenses to Co-op shared wallet
  if (pendingStationSpend >= 10 || (!isRefueling && pendingStationSpend > 0)) {
    emitGameEvent('polyminer:wallet-changed', {
      newMoney: player.money,
      changeAmount: -pendingStationSpend,
      reason: 'İstasyon İkmali',
      allowDebt: true
    });
    pendingStationSpend = 0;
  }

  // 2. SHOP PAD (y === 3, x >= GRID_WIDTH - 3)
  const isOnShopPad = bottomGy === SURFACE_ROW && centerGx >= GRID_WIDTH - 3 && player.isGrounded;
  if (isOnShopPad) {
    if (uiManager.canAutoOpenShop()) {
      uiManager.showShop();
    }
  } else {
    // If player leaves the shop pad, reset dismiss flag and close modal
    const wasOpen = uiManager.isShopOpen();
    uiManager.onLeaveShopPad();
    if (wasOpen) {
      uiManager.hideShop();
      safeSaveGame();
    }
  }

  // 3. HULL DESTROYED (ANYWHERE) OR OUT OF FUEL UNDERGROUND CHECK
  const isUnderground = player.y > (SURFACE_ROW + 0.5) * TILE_SIZE;
  if (player.hull <= 0 && !uiManager.isTowOpen()) {
    towPlayerToSurface(player, 'hull');
    uiManager.showTowModal('hull');
  } else if (player.fuel <= 0 && isUnderground && !uiManager.isTowOpen()) {
    towPlayerToSurface(player, 'fuel');
    uiManager.showTowModal('fuel');
  }

  return isRefueling;
}

// Main Game Loop
let lastTime = performance.now();

function gameLoop(now: number) {
  const deltaTime = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  // Seamless escape: If shop is open and player presses flight/drive keys, close shop and resume flight
  if (uiManager.isShopOpen()) {
    const wantsToMove = !!(
      keysDown['ArrowUp'] || keysDown['KeyW'] || keysDown['w'] || keysDown['W'] ||
      keysDown['ArrowLeft'] || keysDown['KeyA'] || keysDown['a'] || keysDown['A']
    );
    if (wantsToMove) {
      uiManager.hideShop();
    }
  }

  const isModalOpen = uiManager.isAnyModalOpen();

  // Periodic 5-Second Autosave
  playTime += deltaTime;
  autoSaveTimer += deltaTime;
  if (autoSaveTimer >= 5.0) {
    autoSaveTimer = 0;
    safeSaveGame();
  }

  // 1. Station Mechanics & Tow Check
  const isRefueling = handleStations(deltaTime);

  // Continuous Elevator Rail Deployment if [C] is held down
  if (!isModalOpen && (keysDown['KeyC'] || keysDown['c'] || keysDown['C'])) {
    useConsumableItem(player, 'elevatorRails', world);
  }

  // 2. Physics, Controls & Visual Effects
  updatePlayer(player, world, keysDown, deltaTime, isModalOpen);
  if (!isModalOpen) {
    updateBoulders(deltaTime, world, player);
  }
  updateEffects(deltaTime);

  // 3. Camera Tracking
  updateCamera(deltaTime);

  // Broadcast local player state at 20 Hz
  network.broadcastPlayerState({
    x: player.x,
    y: player.y,
    vx: player.vx,
    vy: player.vy,
    facing: player.facing,
    isDrilling: player.isDrilling,
    drillProgress: player.drillProgress,
    isThrusting: player.isThrusting,
    drillTier: player.upgrades.drill || 1
  });

  // 4. Rendering (World, Dynamic Boulders, Remote Players, Local Player, then Floating Texts & Shockwaves)
  renderWorld(ctx, world, cameraY, canvas.width, canvas.height, player, remotePlayers);
  renderBoulders(ctx, cameraY);
  renderRemotePlayers(ctx, remotePlayers, cameraY, canvas.height, deltaTime);
  renderPlayer(ctx, player, cameraY);
  renderEffects(ctx, cameraY);

  // 5. Update Top HUD
  const centerRow = Math.floor((player.y + PLAYER_HEIGHT / 2) / TILE_SIZE);
  const depthMeters = Math.max(0, (centerRow - SURFACE_ROW) * 2);
  uiManager.updateHUD(player, depthMeters, isRefueling);

  requestAnimationFrame(gameLoop);
}

// Start
requestAnimationFrame(gameLoop);
console.log('POLYMINER v2.1: Host-Authoritative Co-op, Dedicated Save Slots, Automated CI/Tests Active.');

