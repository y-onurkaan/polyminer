import { GRID_WIDTH, GRID_HEIGHT, TILE_SIZE, SURFACE_ROW, RELIC_DEFINITIONS } from './constants';
import { generateWorld, revealAdjacentTiles } from './world';
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
import { NetworkManager } from './network';
import { RemotePlayerState, TileType } from './types';
import { sounds } from './audio';

// Canvas Setup
const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;

const CANVAS_WIDTH = GRID_WIDTH * TILE_SIZE; // 1152px
const isMobileInitial = window.innerWidth <= 900;
const CANVAS_HEIGHT = Math.max(380, Math.min(window.innerHeight - (isMobileInitial ? 95 : 80), 740));

canvas.width = CANVAS_WIDTH;
canvas.height = CANVAS_HEIGHT;

// World & Player State
const world = generateWorld();
const player = createPlayer();

// Remote Players State (Online Co-op)
const remotePlayers: Map<string, RemotePlayerState> = new Map();

// Playtime & Autosave
let playTime = 0;
let autoSaveTimer = 0;

// Attempt auto-load on start with safety fallback
try {
  const savedGame = loadGame();
  if (savedGame) {
    applyLoadedGame(savedGame, player, world);
    playTime = savedGame.playTime || 0;
    setTimeout(() => {
      addFloatingText(player.x + PLAYER_WIDTH / 2, player.y - 24, '💾 Kayıt Yüklendi!', '#38bdf8');
    }, 350);
  }
} catch (err) {
  console.error('[POLYMINER] Auto-load error, resetting corrupt save:', err);
  resetSave();
}

// UI Manager
const uiManager = new UIManager();

let wasGuestSession = false;
let isReloading = false;

// Network Manager (P2P WebRTC)
const network = new NetworkManager({
  getGridSyncData: () => serializeWorld(world),
  getSharedMoney: () => player.money,
  getDiscoveredRelics: () => player.discoveredRelics || [],
  onWelcomeSync: (data) => {
    wasGuestSession = true;
    if (data.grid && Array.isArray(data.grid) && data.grid.length === GRID_HEIGHT) {
      applySavedGrid(data.grid, world);
    }
    if (typeof data.sharedMoney === 'number' && Number.isFinite(data.sharedMoney) && data.sharedMoney >= 0) {
      player.money = Math.floor(data.sharedMoney);
    }
    if (Array.isArray(data.discoveredRelics)) {
      player.discoveredRelics = data.discoveredRelics.filter(id => typeof id === 'string' && id in RELIC_DEFINITIONS);
    }
    uiManager.showToast('🗺️ Host Haritası & Ortak Kasa Eşitlendi!', '#10b981');
  },
  onRemotePlayerUpdate: (rp) => {
    remotePlayers.set(rp.id, rp);
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
        } else if (data.tileType === TileType.EMPTY) {
          tile.type = TileType.EMPTY;
          delete tile.ore;
          tile.hardness = 0;
          tile.revealed = true;
          revealAdjacentTiles(world, data.gx, data.gy);
        }
      }
    }
  },
  onSharedWalletUpdate: (data) => {
    if (typeof data.money === 'number' && Number.isFinite(data.money) && data.money >= 0) {
      player.money = Math.floor(data.money);
    }
    const centerRow = Math.floor((player.y + PLAYER_HEIGHT / 2) / TILE_SIZE);
    const depthMeters = Math.max(0, (centerRow - SURFACE_ROW) * 2);
    uiManager.updateHUD(player, depthMeters, false);

    if (data.actorName !== network.localName) {
      const change = Number(data.changeAmount) || 0;
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
window.addEventListener('polyminer:pre-join', () => {
  saveGame(player, world, playTime);
});

uiManager.setPlayerRef(player, () => {
  // Callback when purchase/sell happens: save safely!
  safeSaveGame();
});

// Initialize Co-op Lobby in UI
uiManager.initCoop(network);

// Listen to Custom Game Events & Broadcast Over Network
window.addEventListener('polyminer:tile-changed', (e: any) => {
  const d = e.detail;
  if (d) {
    network.broadcastTileUpdate(d.gx, d.gy, d.tileType, d.hasElevator);
  }
});

window.addEventListener('polyminer:wallet-changed', (e: any) => {
  const d = e.detail;
  if (d && typeof d.changeAmount === 'number') {
    network.sendWalletDelta(d.changeAmount, d.reason || 'Ortak İşlem');
  }
});

window.addEventListener('polyminer:relic-discovered', (e: any) => {
  const d = e.detail;
  if (d && d.relicId) {
    network.broadcastRelicDiscovered(d.relicId);
  }
});

// Victory Event Listener (When 550m Ancient Core is mined/blasted)
window.addEventListener('polyminer:victory', (e: any) => {
  const winner = e.detail?.winnerName || player.name || network.localName || 'Madenci';
  network.broadcastVictory(winner);
  uiManager.showVictory(playTime, player, winner);
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

// Top HUD horizontal mousewheel scroll support
const topHudEl = document.getElementById('top-hud');
if (topHudEl) {
  topHudEl.addEventListener('wheel', (e: WheelEvent) => {
    if (e.deltaY !== 0) {
      e.preventDefault();
      topHudEl.scrollLeft += e.deltaY;
    }
  }, { passive: false });
}

// Camera State
let cameraY = 0;
const minCameraY = 0;
const maxCameraY = Math.max(0, GRID_HEIGHT * TILE_SIZE - CANVAS_HEIGHT);

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
  const isAnyModalOpen = uiManager.isShopOpen() || uiManager.isTowOpen() || uiManager.isHelpOpen() || uiManager.isVictoryOpen() || uiManager.isCoopOpen();
  if (!isAnyModalOpen) {
    if (!e.repeat) {
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
    }

    if (e.code === 'KeyR' || e.key.toLowerCase() === 'r') {
      useConsumableItem(player, 'fuelCanister', world);
    } else if (e.code === 'KeyT' || e.key.toLowerCase() === 't') {
      useConsumableItem(player, 'repairKit', world);
    } else if (e.code === 'KeyQ' || e.key.toLowerCase() === 'q') {
      useConsumableItem(player, 'teleporter', world);
    } else if (e.code === 'KeyX' || e.key.toLowerCase() === 'x') {
      useConsumableItem(player, 'dynamite', world);
    } else if (e.code === 'KeyC' || e.key.toLowerCase() === 'c') {
      useConsumableItem(player, 'elevatorRails', world);
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
  const isMobile = window.innerWidth <= 900;
  const newHeight = Math.max(380, Math.min(window.innerHeight - (isMobile ? 95 : 80), 740));
  canvas.height = newHeight;
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
      const isAnyModalOpen = uiManager.isShopOpen() || uiManager.isTowOpen() || uiManager.isHelpOpen();
      if (!isAnyModalOpen) {
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
      const isAnyModalOpen = uiManager.isShopOpen() || uiManager.isTowOpen() || uiManager.isHelpOpen();
      if (!isAnyModalOpen) {
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
      const isAnyModalOpen = uiManager.isShopOpen() || uiManager.isTowOpen() || uiManager.isHelpOpen();
      if (!isAnyModalOpen) {
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

// Smooth Camera Follow
function updateCamera() {
  const targetCameraY = player.y - canvas.height / 2 + PLAYER_HEIGHT / 2;
  const clampedTarget = Math.max(minCameraY, Math.min(maxCameraY, targetCameraY));

  cameraY += (clampedTarget - cameraY) * 0.12;

  if (cameraY < minCameraY) cameraY = minCameraY;
  if (cameraY > maxCameraY) cameraY = maxCameraY;
}

// Station & Fuel Logic
let refuelAccumulator = 0;
let repairAccumulator = 0;

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
        repairAccumulator -= moneyToDeduct;

        if (prevMoney >= 0 && player.money < 0) {
          addFloatingText(player.x + PLAYER_WIDTH / 2, player.y - 24, '💳 KREDİ KULLANILDI (BORÇLANDIN)', '#fb923c');
        }
      }
      player.hull = Math.min(player.maxHull, player.hull + hpStep);
    }

    // C. Rapid thermal cooling & Hararet instant reset
    if (player.temperature > 22) {
      player.temperature = Math.max(22, player.temperature - 65 * dt);
    }
    player.heat = 0;
    player.heatLockoutTimer = 0;
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

  // 3. OUT OF FUEL OR HULL DESTROYED UNDERGROUND CHECK
  const isUnderground = player.y > (SURFACE_ROW + 0.5) * TILE_SIZE;
  if (player.hull <= 0 && isUnderground && !uiManager.isTowOpen()) {
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

  const isModalOpen = uiManager.isShopOpen() || uiManager.isTowOpen() || uiManager.isHelpOpen() || uiManager.isVictoryOpen() || uiManager.isCoopOpen();

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
  updateBoulders(deltaTime, world, player);
  updateEffects(deltaTime);

  // 3. Camera Tracking
  updateCamera();

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
  renderRemotePlayers(ctx, remotePlayers, cameraY);
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
console.log('POLYMINER v2.0: Subterranean Mining, Elevators, Museum Relics & P2P Co-op Active.');

