import { PlayerExtendedState } from './player';
import { OreDefinition, ConsumableInventory, CHASSIS_COLORS } from './types';
import { NetworkManager, RosterPlayer } from './network';
import { CONSUMABLES, ORES, BIOMES, RELIC_DEFINITIONS, MUSEUM_CURATOR_REWARD } from './constants';
import { sounds } from './audio';
import { addFloatingText } from './effects';

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

export const UPGRADES: Record<string, UpgradeConfig> = {
  drill: {
    name: 'Matkap Hızı',
    desc: 'Toprak ve madenleri daha hızlı parçalar',
    icon: '⚡',
    levels: [
      { level: 1, value: 1.25, label: '1.25x (Standart)', cost: 0 },
      { level: 2, value: 1.85, label: '1.85x (+%48)', cost: 150, oreReqs: { iron: 2 } },
      { level: 3, value: 2.60, label: '2.60x (+%108)', cost: 550, oreReqs: { silver: 3 } },
      { level: 4, value: 3.75, label: '3.75x (Kaya Kırıcı)', cost: 1600, oreReqs: { gold: 3 } },
      { level: 5, value: 5.50, label: '5.50x (Ultra Matkap)', cost: 4200, oreReqs: { emerald: 3, diamond: 1 } }
    ]
  },
  fuelTank: {
    name: 'Yakıt Tankı',
    desc: 'Daha derin maden seferleri için kapasite',
    icon: '🛢️',
    levels: [
      { level: 1, value: 100, label: '100 Litre', cost: 0 },
      { level: 2, value: 160, label: '160 Litre', cost: 120, oreReqs: { iron: 2 } },
      { level: 3, value: 240, label: '240 Litre', cost: 500, oreReqs: { silver: 3 } },
      { level: 4, value: 360, label: '360 Litre', cost: 1500, oreReqs: { gold: 3 } },
      { level: 5, value: 520, label: '520 Litre', cost: 3800, oreReqs: { emerald: 3, diamond: 1 } }
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
      { level: 4, value: 40, label: '40 Adet', cost: 1500, oreReqs: { gold: 3 } },
      { level: 5, value: 65, label: '65 Adet', cost: 3800, oreReqs: { emerald: 3, diamond: 1 } }
    ]
  },
  engine: {
    name: 'Motor İtki Gücü',
    desc: 'Yukarı tırmanış hızını ve kaçış gücünü artırır',
    icon: '🚀',
    levels: [
      { level: 1, value: 1500, label: '1500 kW', cost: 0 },
      { level: 2, value: 1850, label: '1850 kW', cost: 130, oreReqs: { iron: 2 } },
      { level: 3, value: 2300, label: '2300 kW', cost: 520, oreReqs: { silver: 3 } },
      { level: 4, value: 2850, label: '2850 kW', cost: 1550, oreReqs: { gold: 3 } },
      { level: 5, value: 3600, label: '3600 kW', cost: 4000, oreReqs: { emerald: 3, diamond: 1 } }
    ]
  },
  radar: {
    name: 'Yeraltı Radarı',
    desc: 'Sis altındaki madenleri daha uzaktan tespit eder',
    icon: '📡',
    levels: [
      { level: 1, value: 2.5, label: '2.5 Blok (Temel)', cost: 0 },
      { level: 2, value: 3.5, label: '3.5 Blok (+%40)', cost: 140, oreReqs: { iron: 2 } },
      { level: 3, value: 4.5, label: '4.5 Blok (+%80)', cost: 520, oreReqs: { silver: 3 } },
      { level: 4, value: 5.8, label: '5.8 Blok (+%132)', cost: 1550, oreReqs: { gold: 3 } },
      { level: 5, value: 7.5, label: '7.5 Blok (Derin Tarama)', cost: 3900, oreReqs: { emerald: 3, diamond: 1 } }
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
      { level: 4, value: 320, label: '320 HP (-%30 Hasar)', cost: 1500, oreReqs: { gold: 3 } },
      { level: 5, value: 450, label: '450 HP (-%40 Hasar)', cost: 3800, oreReqs: { emerald: 3, diamond: 1 } }
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
      { level: 4, value: 50, label: '50%/s (Kriyojenik - %30 Direnç)', cost: 1750, oreReqs: { gold: 3 } },
      { level: 5, value: 65, label: '65%/s (Plazma Emici - %40 Direnç)', cost: 4200, oreReqs: { emerald: 3, diamond: 1 } }
    ]
  }
};

export class UIManager {
  // HUD Elements
  private depthDisplay: HTMLElement;
  private hullBarFill: HTMLElement;
  private hullVal: HTMLElement;
  private fuelBarFill: HTMLElement;
  private fuelVal: HTMLElement;
  private tempBarFill: HTMLElement;
  private tempVal: HTMLElement;
  private cargoVal: HTMLElement;
  private moneyVal: HTMLElement;
  private moneyLabel: HTMLElement;
  private stationStatus: HTMLElement;

  // Consumable Badges
  private badgeFuel: HTMLElement;
  private badgeRepair: HTMLElement;
  private badgeTeleport: HTMLElement;
  private badgeDynamite: HTMLElement;
  private badgeRail: HTMLElement;
  private badgeMuseum: HTMLElement;

  // Top Action Buttons
  private btnToggleSound: HTMLButtonElement;
  private btnOpenHelp: HTMLButtonElement;

  // Shop Modal
  private shopModal: HTMLElement;
  private shopOreList: HTMLElement;
  private shopTotalValue: HTMLElement;
  private btnSellAll: HTMLButtonElement;
  private btnSellSafe: HTMLButtonElement;
  private upgradesContainer: HTMLElement;
  private consumablesContainer: HTMLElement;
  private museumContainer: HTMLElement;
  private btnCloseShop: HTMLElement;
  private btnCloseShopFooter: HTMLElement;
  private shopPlayerBalance: HTMLElement | null = null;
  private shopBalanceLabel: HTMLElement | null = null;
  private shopBalanceVal: HTMLElement | null = null;

  // Help Modal
  private helpModal: HTMLElement;
  private btnCloseHelp: HTMLElement;
  private helpOreTable: HTMLElement;

  // Tow Modal
  private towModal: HTMLElement;
  private towTitle: HTMLElement;
  private towDesc: HTMLElement;
  private btnCloseTow: HTMLButtonElement;

  // Victory Modal (120m Final)
  private victoryModal: HTMLElement;
  private victoryTime: HTMLElement;
  private victoryMoney: HTMLElement;
  private victoryCargo: HTMLElement;
  private btnContinueGame: HTMLButtonElement;

  // Co-op Modal
  private btnOpenCoop: HTMLElement | null = null;
  private coopModal: HTMLElement | null = null;
  private btnCloseCoop: HTMLElement | null = null;
  private coopNicknameInput: HTMLInputElement | null = null;
  private coopColorSelector: HTMLElement | null = null;
  private btnCoopCreateRoom: HTMLButtonElement | null = null;
  private coopHostInfo: HTMLElement | null = null;
  private coopDisplayRoomCode: HTMLElement | null = null;
  private btnCoopCopyCode: HTMLButtonElement | null = null;
  private coopJoinInput: HTMLInputElement | null = null;
  private btnCoopJoinRoom: HTMLButtonElement | null = null;
  private coopDisconnectContainer: HTMLElement | null = null;
  private btnCoopDisconnect: HTMLButtonElement | null = null;
  private coopStatusBadge: HTMLElement | null = null;
  private coopRosterList: HTMLElement | null = null;
  private isCoopVisible = false;
  private networkManager: NetworkManager | null = null;

  // Modal Visibility State
  private isShopVisible = false;
  private isHelpVisible = false;
  private isTowVisible = false;
  private isVictoryVisible = false;
  private shopDismissedUntilLeave = false;

  private playerRef: PlayerExtendedState | null = null;
  private onStateChange: (() => void) | null = null;

  constructor() {
    this.depthDisplay = document.getElementById('top-depth') as HTMLElement;
    this.hullBarFill = document.getElementById('top-hull-fill') as HTMLElement;
    this.hullVal = document.getElementById('top-hull-text') as HTMLElement;
    this.fuelBarFill = document.getElementById('top-fuel-fill') as HTMLElement;
    this.fuelVal = document.getElementById('top-fuel-text') as HTMLElement;
    this.tempBarFill = document.getElementById('top-temp-fill') as HTMLElement;
    this.tempVal = document.getElementById('top-temp-text') as HTMLElement;
    this.cargoVal = document.getElementById('top-cargo') as HTMLElement;
    this.moneyVal = document.getElementById('top-money') as HTMLElement;
    this.moneyLabel = document.getElementById('top-money-label') as HTMLElement;
    this.stationStatus = document.getElementById('station-status') as HTMLElement;

    this.badgeFuel = document.getElementById('badge-fuel') as HTMLElement;
    this.badgeRepair = document.getElementById('badge-repair') as HTMLElement;
    this.badgeTeleport = document.getElementById('badge-teleport') as HTMLElement;
    this.badgeDynamite = document.getElementById('badge-dynamite') as HTMLElement;
    this.badgeRail = document.getElementById('badge-rail') as HTMLElement;
    this.badgeMuseum = document.getElementById('badge-museum') as HTMLElement;

    this.btnToggleSound = document.getElementById('btn-toggle-sound') as HTMLButtonElement;
    this.btnOpenHelp = document.getElementById('btn-open-help') as HTMLButtonElement;

    this.shopModal = document.getElementById('shop-modal') as HTMLElement;
    this.shopOreList = document.getElementById('shop-ore-list') as HTMLElement;
    this.shopTotalValue = document.getElementById('shop-total-value') as HTMLElement;
    this.btnSellAll = document.getElementById('btn-sell-all') as HTMLButtonElement;
    this.btnSellSafe = document.getElementById('btn-sell-safe') as HTMLButtonElement;
    this.upgradesContainer = document.getElementById('upgrades-container') as HTMLElement;
    this.consumablesContainer = document.getElementById('consumables-shop-container') as HTMLElement;
    this.museumContainer = document.getElementById('museum-container') as HTMLElement;
     this.btnCloseShop = document.getElementById('btn-close-shop') as HTMLElement;
    this.btnCloseShopFooter = document.getElementById('btn-close-shop-footer') as HTMLElement;
    this.shopPlayerBalance = document.getElementById('shop-player-balance');
    this.shopBalanceLabel = document.getElementById('shop-balance-label');
    this.shopBalanceVal = document.getElementById('shop-balance-val');

    this.helpModal = document.getElementById('help-modal') as HTMLElement;
    this.btnCloseHelp = document.getElementById('btn-close-help') as HTMLElement;
    this.helpOreTable = document.getElementById('help-ore-table') as HTMLElement;

    this.towModal = document.getElementById('tow-modal') as HTMLElement;
    this.towTitle = document.getElementById('tow-title') as HTMLElement;
    this.towDesc = document.getElementById('tow-desc') as HTMLElement;
    this.btnCloseTow = document.getElementById('btn-close-tow') as HTMLButtonElement;

    this.victoryModal = document.getElementById('victory-modal') as HTMLElement;
    this.victoryTime = document.getElementById('victory-time') as HTMLElement;
    this.victoryMoney = document.getElementById('victory-money') as HTMLElement;
    this.victoryCargo = document.getElementById('victory-cargo') as HTMLElement;
    this.btnContinueGame = document.getElementById('btn-continue-game') as HTMLButtonElement;

    // Co-op elements
    this.btnOpenCoop = document.getElementById('btn-open-coop');
    this.coopModal = document.getElementById('coop-modal');
    this.btnCloseCoop = document.getElementById('btn-close-coop');
    this.coopNicknameInput = document.getElementById('coop-nickname-input') as HTMLInputElement | null;
    this.coopColorSelector = document.getElementById('coop-color-selector');
    this.btnCoopCreateRoom = document.getElementById('btn-coop-create-room') as HTMLButtonElement | null;
    this.coopHostInfo = document.getElementById('coop-host-info');
    this.coopDisplayRoomCode = document.getElementById('coop-display-room-code');
    this.btnCoopCopyCode = document.getElementById('btn-coop-copy-code') as HTMLButtonElement | null;
    this.coopJoinInput = document.getElementById('coop-join-input') as HTMLInputElement | null;
    this.btnCoopJoinRoom = document.getElementById('btn-coop-join-room') as HTMLButtonElement | null;
    this.coopDisconnectContainer = document.getElementById('coop-disconnect-container');
    this.btnCoopDisconnect = document.getElementById('btn-coop-disconnect') as HTMLButtonElement | null;
    this.coopStatusBadge = document.getElementById('coop-status-badge');
    this.coopRosterList = document.getElementById('coop-roster-list');

    this.renderHelpOreTable();
    this.setupListeners();
  }

  public setPlayerRef(player: PlayerExtendedState, onStateChange: () => void) {
    this.playerRef = player;
    this.onStateChange = onStateChange;
  }

  private setupListeners() {
    this.btnCloseShop.addEventListener('click', () => this.hideShop());
    if (this.btnCloseShopFooter) {
      this.btnCloseShopFooter.addEventListener('click', () => this.hideShop());
    }
    this.btnSellAll.addEventListener('click', () => this.sellAllCargo());
    if (this.btnSellSafe) {
      this.btnSellSafe.addEventListener('click', () => this.sellSafeCargo());
    }

    this.btnOpenHelp.addEventListener('click', () => this.showHelp());
    this.btnCloseHelp.addEventListener('click', () => this.hideHelp());

    this.btnToggleSound.addEventListener('click', () => {
      const isMuted = sounds.toggleMute();
      this.btnToggleSound.innerText = isMuted ? '🔇' : '🔊';
      this.btnToggleSound.title = isMuted ? 'Sesi Aç' : 'Sesi Kapat';
    });

    this.btnCloseTow.addEventListener('click', () => this.hideTowModal());
    this.btnContinueGame.addEventListener('click', () => this.hideVictory());

    if (this.btnOpenCoop) {
      this.btnOpenCoop.addEventListener('click', () => this.toggleCoop());
    }
    if (this.btnCloseCoop) {
      this.btnCloseCoop.addEventListener('click', () => this.hideCoop());
    }

    // Mobile Virtual Gamepad Toggle
    const btnToggleControls = document.getElementById('btn-toggle-controls');
    const mobileControls = document.getElementById('mobile-controls');
    if (btnToggleControls && mobileControls) {
      btnToggleControls.addEventListener('click', () => {
        if (mobileControls.classList.contains('force-show')) {
          mobileControls.classList.remove('force-show');
          mobileControls.classList.add('force-hide');
          localStorage.setItem('polyminer_touch_controls', 'hide');
        } else if (mobileControls.classList.contains('force-hide')) {
          mobileControls.classList.remove('force-hide');
          mobileControls.classList.add('force-show');
          localStorage.setItem('polyminer_touch_controls', 'show');
        } else {
          const isVisible = window.getComputedStyle(mobileControls).display !== 'none';
          if (isVisible) {
            mobileControls.classList.add('force-hide');
            localStorage.setItem('polyminer_touch_controls', 'hide');
          } else {
            mobileControls.classList.add('force-show');
            localStorage.setItem('polyminer_touch_controls', 'show');
          }
        }
      });

      const savedPref = localStorage.getItem('polyminer_touch_controls');
      if (savedPref === 'show') {
        mobileControls.classList.add('force-show');
      } else if (savedPref === 'hide') {
        mobileControls.classList.add('force-hide');
      }
    }

    window.addEventListener('keydown', (e: KeyboardEvent) => {
      // Prevent game hotkeys if focused on text input
      if ((e.target as HTMLElement)?.tagName === 'INPUT') {
        if (e.key === 'Escape') {
          (e.target as HTMLElement).blur();
          if (this.isCoopVisible) this.hideCoop();
        }
        return;
      }

      if (e.key === 'h' || e.key === 'H') {
        if (!this.isShopVisible && !this.isTowVisible && !this.isVictoryVisible && !this.isCoopVisible) {
          if (this.isHelpVisible) this.hideHelp();
          else this.showHelp();
        }
      }

      if (e.key === 'Escape') {
        if (this.isCoopVisible) this.hideCoop();
        if (this.isShopVisible) this.hideShop();
        if (this.isHelpVisible) this.hideHelp();
        if (this.isTowVisible) this.hideTowModal();
        if (this.isVictoryVisible) this.hideVictory();
      }

      if (this.isShopVisible) {
        if (
          e.code === 'KeyW' || e.key.toLowerCase() === 'w' ||
          e.code === 'KeyA' || e.key.toLowerCase() === 'a' ||
          e.code === 'ArrowUp' || e.code === 'ArrowLeft'
        ) {
          this.hideShop();
        }
      }

      if (this.isTowVisible) {
        if (e.key === 'Enter' || e.code === 'Space') {
          this.hideTowModal();
        }
      }
    });
  }

  public updateHUD(player: PlayerExtendedState, depthMeters: number, isRefueling: boolean) {
    // 1. Depth
    this.depthDisplay.innerText = `${depthMeters}m`;

    // 2. Hull Health
    const hullPct = Math.max(0, Math.min(100, Math.round((player.hull / player.maxHull) * 100)));
    this.hullVal.innerText = `${hullPct}%`;
    this.hullVal.title = `${Math.round(player.hull)} / ${player.maxHull} HP`;
    this.hullBarFill.style.width = `${hullPct}%`;

    if (hullPct <= 25) {
      this.hullBarFill.style.backgroundColor = '#ef4444';
    } else if (hullPct <= 55) {
      this.hullBarFill.style.backgroundColor = '#f59e0b';
    } else {
      this.hullBarFill.style.backgroundColor = '#22c55e'; // Green
    }

    // 3. Fuel
    const fuelPct = Math.max(0, Math.min(100, Math.round((player.fuel / player.maxFuel) * 100)));
    this.fuelVal.innerText = `${fuelPct}%`;
    this.fuelVal.title = `${Math.round(player.fuel)} / ${player.maxFuel} L`;
    this.fuelBarFill.style.width = `${fuelPct}%`;

    if (fuelPct <= 20) {
      this.fuelBarFill.style.backgroundColor = '#ef4444';
    } else if (fuelPct <= 45) {
      this.fuelBarFill.style.backgroundColor = '#f59e0b';
    } else {
      this.fuelBarFill.style.backgroundColor = '#38bdf8';
    }

    // 4. Cargo Count
    this.cargoVal.innerText = `${player.cargo.length} / ${player.maxCargo}`;
    if (player.cargo.length >= player.maxCargo) {
      this.cargoVal.style.color = '#ef4444';
    } else if (player.cargo.length >= player.maxCargo * 0.8) {
      this.cargoVal.style.color = '#f59e0b';
    } else {
      this.cargoVal.style.color = '#f4f4f5';
    }

    // 5. Money & Debt
    const formatMoney = (val: number) => {
      const rounded = Math.round(val * 100) / 100;
      return Number.isInteger(rounded) ? rounded.toLocaleString() : rounded.toFixed(2);
    };

    if (player.money < 0) {
      if (this.moneyLabel) {
        this.moneyLabel.innerText = '💳 BORÇ:';
        this.moneyLabel.style.color = '#ef4444';
      }
      this.moneyVal.innerText = `-$${formatMoney(Math.abs(player.money))}`;
      this.moneyVal.style.color = '#ef4444';
    } else {
      if (this.moneyLabel) {
        this.moneyLabel.innerText = '💰 BAKİYE:';
        this.moneyLabel.style.color = '#94a3b8';
      }
      this.moneyVal.innerText = `$${formatMoney(player.money)}`;
      this.moneyVal.style.color = '#facc15';
    }

    // 6. Consumable Items Badges (Compact Icon on top + Micro Explanation Underneath)
    const fuelCount = player.inventory.fuelCanister;
    this.badgeFuel.innerHTML = `<span class="hud-badge-icon">⛽ ${fuelCount}</span><span class="hud-badge-sub">Yakıt [R]</span>`;
    this.badgeFuel.title = `Yedek Yakıt [R]: x${fuelCount} (Acil durumda yakıt ekler)`;
    this.badgeFuel.style.color = fuelCount > 0 ? '#38bdf8' : '#64748b';

    const repairCount = player.inventory.repairKit;
    this.badgeRepair.innerHTML = `<span class="hud-badge-icon">🔧 ${repairCount}</span><span class="hud-badge-sub">Tamir [T]</span>`;
    this.badgeRepair.title = `Tamir Kiti [T]: x${repairCount} (Gövdeyi 50 HP onarır)`;
    this.badgeRepair.style.color = repairCount > 0 ? '#4ade80' : '#64748b';

    const tpCount = player.inventory.teleporter;
    this.badgeTeleport.innerHTML = `<span class="hud-badge-icon">🌀 ${tpCount}</span><span class="hud-badge-sub">Işınla [Q]</span>`;
    this.badgeTeleport.title = `Yüzeye Işınlayıcı [Q]: x${tpCount} (Acil yüzeye ışınlanma)`;
    this.badgeTeleport.style.color = tpCount > 0 ? '#38bdf8' : '#64748b';

    const dynCount = player.inventory.dynamite;
    this.badgeDynamite.innerHTML = `<span class="hud-badge-icon">💣 ${dynCount}</span><span class="hud-badge-sub">Dinamit [X]</span>`;
    this.badgeDynamite.title = `Sismik Dinamit [X]: x${dynCount} (Çevredeki kayaları patlatır)`;
    this.badgeDynamite.style.color = dynCount > 0 ? '#facc15' : '#64748b';

    if (this.badgeRail) {
      const railCount = player.inventory.elevatorRails || 0;
      this.badgeRail.innerHTML = `<span class="hud-badge-icon">🏗️ ${railCount}</span><span class="hud-badge-sub">Asansör [C]</span>`;
      this.badgeRail.title = `Asansör Rayı [C]: x${railCount} (Dikey asansör hattı döşer)`;
      this.badgeRail.style.color = railCount > 0 ? '#06b6d4' : '#64748b';
    }

    if (this.badgeMuseum) {
      const found = player.discoveredRelics?.length || 0;
      this.badgeMuseum.innerHTML = `<span class="hud-badge-icon">🏛️ ${found}/6</span><span class="hud-badge-sub">Fosil</span>`;
      this.badgeMuseum.title = `Arkeoloji Müzesi & Fosiller: ${found}/6 (Toplanan eserler)`;
      this.badgeMuseum.style.color = found > 0 ? '#f59e0b' : '#64748b';
    }

    // Mobile Virtual Gamepad Badges
    const touchBadgeRail = document.getElementById('touch-badge-rail');
    const touchBadgeFuel = document.getElementById('touch-badge-fuel');
    const touchBadgeRepair = document.getElementById('touch-badge-repair');
    const touchBadgeDyn = document.getElementById('touch-badge-dyn');
    const touchBadgeTp = document.getElementById('touch-badge-tp');

    if (touchBadgeRail) touchBadgeRail.innerText = `${player.inventory.elevatorRails || 0}`;
    if (touchBadgeFuel) touchBadgeFuel.innerText = `${player.inventory.fuelCanister || 0}`;
    if (touchBadgeRepair) touchBadgeRepair.innerText = `${player.inventory.repairKit || 0}`;
    if (touchBadgeDyn) touchBadgeDyn.innerText = `${player.inventory.dynamite || 0}`;
    if (touchBadgeTp) touchBadgeTp.innerText = `${player.inventory.teleporter || 0}`;

    // 7. Station & Elevator Status
    if (player.elevatorAuto) {
      this.stationStatus.style.display = 'block';
      const dirText = player.elevatorAuto === 'up' ? '▲ OTOMATİK ASANSÖR: YUKARI' : '▼ OTOMATİK ASANSÖR: AŞAĞI';
      this.stationStatus.innerHTML = `<span style="color:#22d3ee; font-weight:bold; letter-spacing:0.5px;">⚡ ${dirText} · [Durdur: Boşluk / Ters Yön]</span>`;
    } else if (player.isInElevator) {
      this.stationStatus.style.display = 'block';
      this.stationStatus.innerHTML = '<span style="color:#06b6d4; font-size:12px;">🔩 Asansör Şaftı · <b>2x [W]</b>: Otomatik Yukarı | <b>2x [S]</b>: Otomatik Aşağı</span>';
    } else if (isRefueling) {
      this.stationStatus.style.display = 'block';
      if (player.money < 0) {
        this.stationStatus.innerHTML = '<span style="color:#fb923c;">⛽ İkmal & Onarım Yapılıyor (💳 Acil Kredi Devrede)...</span>';
      } else {
        this.stationStatus.innerHTML = '<span style="color:#38bdf8;">⛽ İkmal & Onarım Yapılıyor...</span>';
      }
    } else {
      this.stationStatus.style.display = 'none';
    }

    // 8. Subterranean Active Hararet & Overdrive HUD
    if (this.tempVal && this.tempBarFill) {
      const heatVal = Math.round(player.heat ?? 0);
      const lockout = player.heatLockoutTimer ?? 0;

      if (lockout > 0) {
        this.tempVal.innerText = `🔥 KİLİT! ${lockout.toFixed(1)}s`;
        this.tempVal.style.color = '#ef4444';
        this.tempBarFill.style.width = '100%';
        this.tempBarFill.style.backgroundColor = '#ef4444';
      } else if (heatVal >= 75) {
        this.tempVal.innerText = `⚡ %${heatVal} (OD)`;
        this.tempVal.style.color = '#fb923c';
        this.tempBarFill.style.width = `${heatVal}%`;
        this.tempBarFill.style.backgroundColor = '#f97316';
      } else {
        this.tempVal.innerText = `%${heatVal}`;
        this.tempBarFill.style.width = `${heatVal}%`;

        if (heatVal >= 50) {
          this.tempBarFill.style.backgroundColor = '#facc15';
          this.tempVal.style.color = '#facc15';
        } else if (heatVal >= 25) {
          this.tempBarFill.style.backgroundColor = '#38bdf8';
          this.tempVal.style.color = '#38bdf8';
        } else {
          this.tempBarFill.style.backgroundColor = '#06b6d4';
          this.tempVal.style.color = '#06b6d4';
        }
      }
    }
  }

  public canAutoOpenShop(): boolean {
    return !this.isShopVisible && !this.shopDismissedUntilLeave && !this.isHelpVisible && !this.isTowVisible;
  }

  public onLeaveShopPad(): void {
    this.shopDismissedUntilLeave = false;
  }

  public showShop() {
    if (this.isShopVisible || !this.playerRef) return;
    this.isShopVisible = true;
    this.shopModal.style.display = 'flex';
    this.renderShopContent();
  }

  public hideShop() {
    this.isShopVisible = false;
    this.shopModal.style.display = 'none';
    this.shopDismissedUntilLeave = true;
  }

  public showHelp() {
    this.isHelpVisible = true;
    this.helpModal.style.display = 'flex';
  }

  public hideHelp() {
    this.isHelpVisible = false;
    this.helpModal.style.display = 'none';
  }

  public isShopOpen(): boolean {
    return this.isShopVisible;
  }

  public isHelpOpen(): boolean {
    return this.isHelpVisible;
  }

  private sellAllCargo() {
    if (!this.playerRef || this.playerRef.cargo.length === 0) return;

    const dinoBonus = this.playerRef.discoveredRelics?.includes('dino_skull') ? 1.15 : 1.0;
    const baseTotal = this.playerRef.cargo.reduce((sum, ore) => sum + ore.value, 0);
    const total = Math.round(baseTotal * dinoBonus);

    this.playerRef.money += total;
    this.playerRef.cargo = [];
    sounds.playSellSound();

    const bonusLabel = dinoBonus > 1 ? ` (+$${total - baseTotal} %15 Müze Bonusu)` : '';
    addFloatingText(this.playerRef.x + 19, this.playerRef.y - 14, `+$${total} SATILDI!${bonusLabel}`, '#facc15');

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('polyminer:wallet-changed', {
        detail: { newMoney: this.playerRef.money, changeAmount: total, reason: 'Tüm Madenleri Sat' }
      }));
    }

    if (this.onStateChange) this.onStateChange();
    this.renderShopContent();
  }

  private sellOreType(oreId: string) {
    if (!this.playerRef || this.playerRef.cargo.length === 0) return;

    const matching = this.playerRef.cargo.filter(o => o.id === oreId);
    if (matching.length === 0) return;

    const dinoBonus = this.playerRef.discoveredRelics?.includes('dino_skull') ? 1.15 : 1.0;
    const baseTotal = matching.reduce((sum, ore) => sum + ore.value, 0);
    const total = Math.round(baseTotal * dinoBonus);
    const oreName = matching[0].name;

    this.playerRef.money += total;
    this.playerRef.cargo = this.playerRef.cargo.filter(o => o.id !== oreId);
    sounds.playSellSound();

    const bonusLabel = dinoBonus > 1 ? ` (+%15 Fosil)` : '';
    addFloatingText(this.playerRef.x + 19, this.playerRef.y - 14, `+$${total} ${oreName} (${matching.length}x) Satıldı!${bonusLabel}`, '#facc15');

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('polyminer:wallet-changed', {
        detail: { newMoney: this.playerRef.money, changeAmount: total, reason: `${oreName} Satışı` }
      }));
    }

    if (this.onStateChange) this.onStateChange();
    this.renderShopContent();
  }

  private sellSafeCargo() {
    if (!this.playerRef || this.playerRef.cargo.length === 0) return;

    // Calculate needed ores for all current next-tier upgrades
    const neededOres: Record<string, number> = {};
    for (const [key, config] of Object.entries(UPGRADES)) {
      const curLevel = (this.playerRef.upgrades as any)[key] || 1;
      const nextConfig = config.levels.find(l => l.level === curLevel + 1);
      if (nextConfig && nextConfig.oreReqs) {
        for (const [oreId, count] of Object.entries(nextConfig.oreReqs)) {
          neededOres[oreId] = (neededOres[oreId] || 0) + count;
        }
      }
    }

    const keptCounts: Record<string, number> = {};
    const toSell: OreDefinition[] = [];
    const keptCargo: OreDefinition[] = [];

    for (const ore of this.playerRef.cargo) {
      const needed = neededOres[ore.id] || 0;
      const currentKept = keptCounts[ore.id] || 0;
      if (currentKept < needed) {
        keptCounts[ore.id] = currentKept + 1;
        keptCargo.push(ore);
      } else {
        toSell.push(ore);
      }
    }

    if (toSell.length === 0) {
      addFloatingText(this.playerRef.x + 19, this.playerRef.y - 14, '🛡️ Tüm madenler yükseltmeler için korundu!', '#38bdf8');
      return;
    }

    const dinoBonus = this.playerRef.discoveredRelics?.includes('dino_skull') ? 1.15 : 1.0;
    const baseTotal = toSell.reduce((sum, ore) => sum + ore.value, 0);
    const total = Math.round(baseTotal * dinoBonus);

    this.playerRef.money += total;
    this.playerRef.cargo = keptCargo;
    sounds.playSellSound();

    const bonusLabel = dinoBonus > 1 ? ` (+%15 Fosil)` : '';
    addFloatingText(this.playerRef.x + 19, this.playerRef.y - 14, `+$${total} SATILDI! (${toSell.length} maden satıldı, ${keptCargo.length} korundu)${bonusLabel}`, '#facc15');

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('polyminer:wallet-changed', {
        detail: { newMoney: this.playerRef.money, changeAmount: total, reason: 'Üretim Harici Maden Satışı' }
      }));
    }

    if (this.onStateChange) this.onStateChange();
    this.renderShopContent();
  }

  private buyUpgrade(key: string) {
    if (!this.playerRef) return;
    const config = UPGRADES[key];
    const currentTier = (this.playerRef.upgrades as any)[key] || 1;
    const nextTierConfig = config.levels.find(l => l.level === currentTier + 1);

    if (!nextTierConfig) return;
    if (this.playerRef.money < nextTierConfig.cost) return;

    // Check required ores in cargo
    if (nextTierConfig.oreReqs) {
      for (const [oreId, reqCount] of Object.entries(nextTierConfig.oreReqs)) {
        const owned = this.playerRef.cargo.filter(o => o.id === oreId).length;
        if (owned < reqCount) {
          addFloatingText(this.playerRef.x + 19, this.playerRef.y - 14, `Yetersiz Hammadde!`, '#ef4444');
          return;
        }
      }
      // Consume required ores from cargo
      for (const [oreId, reqCount] of Object.entries(nextTierConfig.oreReqs)) {
        let toRemove = reqCount;
        this.playerRef.cargo = this.playerRef.cargo.filter(o => {
          if (o.id === oreId && toRemove > 0) {
            toRemove--;
            return false;
          }
          return true;
        });
      }
    }

    this.playerRef.money -= nextTierConfig.cost;
    (this.playerRef.upgrades as any)[key] = nextTierConfig.level;
    sounds.playSellSound();

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('polyminer:wallet-changed', {
        detail: { newMoney: this.playerRef.money, changeAmount: -nextTierConfig.cost, reason: `${config.name} Seviye ${nextTierConfig.level}` }
      }));
    }

    switch (key) {
      case 'drill':
        this.playerRef.drillSpeed = nextTierConfig.value;
        break;
      case 'fuelTank':
        this.playerRef.maxFuel = nextTierConfig.value;
        this.playerRef.fuel = Math.min(
          this.playerRef.maxFuel,
          this.playerRef.fuel + (nextTierConfig.value - config.levels[currentTier - 1].value)
        );
        break;
      case 'cargo':
        this.playerRef.maxCargo = nextTierConfig.value;
        break;
      case 'engine':
        this.playerRef.thrusterPower = nextTierConfig.value;
        break;
      case 'radar':
        this.playerRef.radarRadius = nextTierConfig.value;
        break;
      case 'hull':
        const oldMax = this.playerRef.maxHull;
        this.playerRef.maxHull = nextTierConfig.value;
        this.playerRef.hull = Math.min(
            this.playerRef.maxHull,
            this.playerRef.hull + (nextTierConfig.value - oldMax)
        );
        break;
      case 'radiator':
        // Radiator level tier updated in playerRef.upgrades
        break;
    }

    addFloatingText(this.playerRef.x + 19, this.playerRef.y - 14, `${config.name} Seviye ${nextTierConfig.level}!`, '#38bdf8');

    if (this.onStateChange) this.onStateChange();
    this.renderShopContent();
  }

  private buyConsumable(itemKey: keyof ConsumableInventory, count: number = 1) {
    if (!this.playerRef) return;
    const item = CONSUMABLES[itemKey];
    const totalCost = Math.round(item.cost * count * 100) / 100;
    if (this.playerRef.money < totalCost) return;

    this.playerRef.money = Math.round((this.playerRef.money - totalCost) * 100) / 100;
    const addedAmount = (item.amount || 1) * count;
    this.playerRef.inventory[itemKey] = (this.playerRef.inventory[itemKey] || 0) + addedAmount;
    sounds.playSellSound();
    addFloatingText(this.playerRef.x + 19, this.playerRef.y - 14, `+${addedAmount} ${item.name}`, '#4ade80');

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('polyminer:wallet-changed', {
        detail: { newMoney: this.playerRef.money, changeAmount: -totalCost, reason: `${item.name} x${count}` }
      }));
    }

    if (this.onStateChange) this.onStateChange();
    this.renderShopContent();
  }

  private renderShopContent() {
    if (!this.playerRef) return;
    const player = this.playerRef;

    // 0. Update Shop Header Live Balance
    const formatShopMoney = (val: number) => {
      const rounded = Math.round(val * 100) / 100;
      return Number.isInteger(rounded) ? rounded.toLocaleString() : rounded.toFixed(2);
    };

    if (this.shopPlayerBalance && this.shopBalanceLabel && this.shopBalanceVal) {
      if (player.money < 0) {
        this.shopBalanceLabel.innerText = '💳 MEVCUT BORÇ:';
        this.shopBalanceLabel.style.color = '#ef4444';
        this.shopBalanceVal.innerText = `-$${formatShopMoney(Math.abs(player.money))}`;
        this.shopBalanceVal.style.color = '#ef4444';
        this.shopPlayerBalance.style.borderColor = '#ef4444';
        this.shopPlayerBalance.style.boxShadow = '0 0 10px rgba(239, 68, 68, 0.35)';
      } else {
        this.shopBalanceLabel.innerText = '💰 MEVCUT BAKİYE:';
        this.shopBalanceLabel.style.color = '#94a3b8';
        this.shopBalanceVal.innerText = `$${formatShopMoney(player.money)}`;
        this.shopBalanceVal.style.color = '#facc15';
        this.shopPlayerBalance.style.borderColor = '#facc15';
        this.shopPlayerBalance.style.boxShadow = '0 0 10px rgba(250, 204, 21, 0.25)';
      }
    }

    // 1. Mineral Sales Section
    const oreCounts: Record<string, { ore: OreDefinition; count: number }> = {};
    for (const ore of player.cargo) {
      if (!oreCounts[ore.id]) {
        oreCounts[ore.id] = { ore, count: 0 };
      }
      oreCounts[ore.id].count++;
    }

    const items = Object.values(oreCounts);
    const dinoBonus = player.discoveredRelics?.includes('dino_skull') ? 1.15 : 1.0;
    const baseCargoValue = items.reduce((sum, item) => sum + item.count * item.ore.value, 0);
    const totalCargoValue = Math.round(baseCargoValue * dinoBonus);

    if (items.length === 0) {
      this.shopOreList.innerHTML = `
        <div style="color:#64748b; font-size:12px; padding:18px 0; text-align:center;">
          Kargo haznesi boş. Yeraltından maden toplayarak dönün.
        </div>`;
      this.btnSellAll.disabled = true;
      this.btnSellAll.innerText = 'Kargo Boş ($0)';
      if (this.btnSellSafe) this.btnSellSafe.disabled = true;
      this.shopTotalValue.innerText = '$0';
    } else {
      let html = '';
      for (const item of items) {
        const lineTotal = item.count * item.ore.value;
        const lineBonus = Math.round(lineTotal * dinoBonus);
        html += `
          <div class="ore-row">
            <div style="display:flex; align-items:center; gap:8px;">
              <span class="ore-pill" style="background:${item.ore.color};">${item.ore.sides}G</span>
              <strong>${item.ore.name}</strong>
              <span style="color:#94a3b8; font-size:11px;">(${item.count} Adet × $${item.ore.value})</span>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="color:#facc15; font-weight:bold;">$${lineBonus}</span>
              <button class="btn-sell-single-ore" data-ore-id="${item.ore.id}" style="background:#334155; border:1px solid #475569; color:#f8fafc; font-size:10px; padding:3px 8px; border-radius:3px; cursor:pointer;" title="${item.ore.name} türünün tamamını sat">
                Sat
              </button>
            </div>
          </div>`;
      }
      this.shopOreList.innerHTML = html;
      this.shopTotalValue.innerText = dinoBonus > 1 ? `$${totalCargoValue} (+%15 Fosil Bonusu)` : `$${totalCargoValue}`;
      this.btnSellAll.disabled = false;
      this.btnSellAll.innerText = `Tümünü Sat (+$${totalCargoValue})`;
      if (this.btnSellSafe) this.btnSellSafe.disabled = false;
    }

    // 2. Upgrades Section
    let upgradesHtml = '';
    for (const [key, config] of Object.entries(UPGRADES)) {
      const currentLevel = (player.upgrades as any)[key] || 1;
      const currentLevelInfo = config.levels[currentLevel - 1];
      const nextLevelInfo = config.levels[currentLevel];
      const isMax = !nextLevelInfo;

      let hasOres = true;
      let oreReqHtml = '';
      if (nextLevelInfo && nextLevelInfo.oreReqs) {
        const badges: string[] = [];
        for (const [oreId, reqCount] of Object.entries(nextLevelInfo.oreReqs)) {
          const ownedCount = player.cargo.filter(o => o.id === oreId).length;
          const oreDef = ORES.find(o => o.id === oreId);
          const oreName = oreDef ? oreDef.name : oreId;
          const isMet = ownedCount >= reqCount;
          if (!isMet) hasOres = false;
          const badgeColor = isMet ? '#4ade80' : '#f87171';
          const borderColor = isMet ? '#15803d' : '#991b1b';
          badges.push(`<span style="color:${badgeColor}; font-size:9.5px; font-weight:bold; background:#0f172a; padding:1px 5px; border-radius:3px; border:1px solid ${borderColor};">${reqCount}x ${oreName} (${ownedCount}/${reqCount})</span>`);
        }
        oreReqHtml = `
          <div style="display:flex; flex-wrap:wrap; align-items:center; gap:4px; margin-top:4px;">
            <span style="font-size:10px; color:#94a3b8;">Gereken:</span>
            ${badges.join(' ')}
          </div>`;
      }
      const canAfford = !isMax && player.money >= nextLevelInfo.cost && hasOres;

      upgradesHtml += `
        <div class="upgrade-card ${isMax ? 'maxed' : ''}">
          <div style="display:flex; justify-content:space-between; align-items:flex-start;">
            <div>
              <div style="font-weight:bold; font-size:13px; color:#f8fafc;">
                ${config.icon} ${config.name}
                <span class="level-badge">Seviye ${currentLevel}/${config.levels.length}</span>
              </div>
              <div style="font-size:11px; color:#94a3b8; margin-top:2px;">
                ${config.desc}
              </div>
            </div>
            <div>
              ${
                isMax
                  ? `<button class="btn-upgrade" disabled>MAKS</button>`
                  : `<button class="btn-upgrade ${canAfford ? 'can-buy' : ''}" data-key="${key}" ${canAfford ? '' : 'disabled'} title="${!hasOres ? 'Kargoda gereken cevher eksik!' : player.money < nextLevelInfo.cost ? 'Yetersiz bakiye!' : 'Yükselt'}">
                      Yükselt: $${nextLevelInfo.cost}
                    </button>`
              }
            </div>
          </div>
          ${oreReqHtml}
          <div class="stat-comparison" style="margin-top:4px;">
            <span>Mevcut: <strong>${currentLevelInfo.label}</strong></span>
            ${
              !isMax
                ? `<span>➔ Sonraki: <strong style="color:#4ade80;">${nextLevelInfo.label}</strong></span>`
                : `<span style="color:#facc15;">Maksimum Seviye</span>`
            }
          </div>
        </div>`;
    }
    this.upgradesContainer.innerHTML = upgradesHtml;

    // 3. Consumables Section (rendered in grid)
    let consumablesHtml = `
      <div style="display:grid; grid-template-columns: repeat(2, 1fr); gap:8px; margin-top:4px;">
    `;
    for (const [key, item] of Object.entries(CONSUMABLES)) {
      const canAfford = player.money >= item.cost;
      const owned = (player.inventory as any)[key] || 0;

      let actionButtons = '';
      if (key === 'elevatorRails') {
        const canAfford10 = player.money >= item.cost * 10;
        actionButtons = `
          <div style="display:flex; gap:6px; margin-top:2px;">
            <button class="btn-upgrade ${canAfford ? 'can-buy' : ''}" data-consumable="${key}" data-count="1" ${canAfford ? '' : 'disabled'} style="flex:1; text-align:center; padding:5px 4px;">
              1 Adet: $${item.cost}
            </button>
            <button class="btn-upgrade ${canAfford10 ? 'can-buy' : ''}" data-consumable="${key}" data-count="10" ${canAfford10 ? '' : 'disabled'} style="flex:1; text-align:center; padding:5px 4px; background:#0f766e; border-color:#14b8a6;">
              10 Adet: $${item.cost * 10}
            </button>
          </div>
        `;
      } else {
        actionButtons = `
          <button class="btn-upgrade ${canAfford ? 'can-buy' : ''}" data-consumable="${key}" data-count="1" ${canAfford ? '' : 'disabled'} style="width:100%; text-align:center;">
            Satın Al: $${item.cost}
          </button>
        `;
      }

      const isElevator = key === 'elevatorRails';
      consumablesHtml += `
        <div class="consumable-card" ${isElevator ? 'style="grid-column: span 2;"' : ''}>
          <div style="display:flex; justify-content:space-between; font-weight:bold; font-size:11px; color:#f8fafc;">
            <span>[${item.key}] ${item.name}</span>
            <span style="color:#38bdf8;">x${owned}</span>
          </div>
          <div style="font-size:10px; color:#94a3b8; margin:3px 0 6px 0;">${item.desc}</div>
          ${actionButtons}
        </div>
      `;
    }
    consumablesHtml += `</div>`;
    this.consumablesContainer.innerHTML = consumablesHtml;

    // Attach listeners
    this.shopOreList.querySelectorAll('.btn-sell-single-ore[data-ore-id]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const oreId = (e.currentTarget as HTMLElement).getAttribute('data-ore-id');
        if (oreId) this.sellOreType(oreId);
      });
    });

    this.upgradesContainer.querySelectorAll('.btn-upgrade[data-key]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const key = (e.currentTarget as HTMLElement).getAttribute('data-key');
        if (key) this.buyUpgrade(key);
      });
    });

    this.consumablesContainer.querySelectorAll('.btn-upgrade[data-consumable]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLElement;
        const key = target.getAttribute('data-consumable') as keyof ConsumableInventory;
        const count = parseInt(target.getAttribute('data-count') || '1', 10);
        if (key) this.buyConsumable(key, count);
      });
    });

    // 4. Museum & Relic Collection Section
    if (this.museumContainer) {
      const discovered = player.discoveredRelics || [];
      const allRelics = Object.values(RELIC_DEFINITIONS);
      const totalRelics = allRelics.length;
      const allCollected = discovered.length >= totalRelics;

      let museumHtml = `
        <div style="font-size:10px; color:#cbd5e1; margin-bottom:6px; display:flex; justify-content:space-between; align-items:center;">
          <span>Keşif Durumu: <strong style="color:#f59e0b;">${discovered.length}/${totalRelics}</strong></span>
          ${discovered.includes('dino_skull') ? '<span style="color:#a855f7; font-size:9.5px; font-weight:bold;">+%15 Satış Bonusu</span>' : ''}
        </div>
        <div style="max-height: 155px; overflow-y: auto; padding-right: 2px;">
      `;

      for (const relic of allRelics) {
        const isFound = discovered.includes(relic.id);
        if (isFound) {
          museumHtml += `
            <div class="relic-card unlocked">
              <div class="relic-icon">${relic.icon}</div>
              <div class="relic-info">
                <div style="font-weight:bold; color:${relic.color}; font-size:11px;">${relic.name}</div>
                <div style="color:#94a3b8; font-size:9.5px;">${relic.description}</div>
              </div>
              <div class="relic-buff">${relic.buffLabel}</div>
            </div>
          `;
        } else {
          museumHtml += `
            <div class="relic-card locked">
              <div class="relic-icon">🔒</div>
              <div class="relic-info">
                <div style="font-weight:bold; color:#64748b; font-size:10.5px;">Gizli Kalıntı (${relic.minDepth}m - ${relic.maxDepth}m)</div>
                <div style="color:#475569; font-size:9.5px;">Kazı esnasında keşfedilmeyi bekliyor.</div>
              </div>
              <div style="font-size:9px; color:#64748b;">???</div>
            </div>
          `;
        }
      }
      museumHtml += `</div>`;

      if (allCollected) {
        if (!player.museumRewardClaimed) {
          museumHtml += `
            <button id="btn-claim-museum" class="btn-primary" style="background:#f59e0b; border:1px solid #fbbf24; margin-top:6px; font-weight:bold; font-size:11px; padding:6px 10px;">
              🏆 Küratör Büyük Ödülünü Al (+$15,000)
            </button>
          `;
        } else {
          museumHtml += `
            <div style="text-align:center; padding:5px; background:#064e3b; border:1px solid #059669; border-radius:4px; margin-top:6px; font-size:10px; font-weight:bold; color:#6ee7b7;">
              ✅ Küratör Büyük Ödülü Alındı (+$15,000)
            </div>
          `;
        }
      }

      this.museumContainer.innerHTML = museumHtml;

      const btnClaim = this.museumContainer.querySelector('#btn-claim-museum');
      if (btnClaim) {
        btnClaim.addEventListener('click', () => {
          player.money += MUSEUM_CURATOR_REWARD;
          player.museumRewardClaimed = true;
          sounds.playVictoryFanfare();
          addFloatingText(player.x + 19, player.y - 14, '🏆 +$15,000 MÜZE ÖDÜLÜ!', '#f59e0b');

          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('polyminer:wallet-changed', {
              detail: { newMoney: player.money, changeAmount: MUSEUM_CURATOR_REWARD, reason: 'Müze Küratör Ödülü' }
            }));
          }

          if (this.onStateChange) this.onStateChange();
          this.renderShopContent();
        });
      }
    }
  }

  private renderHelpOreTable() {
    let html = `
      <div style="margin-bottom:8px; font-weight:bold; font-size:11px; color:#94a3b8; text-transform:uppercase;">
        💎 Maden Değer & Sertlik Tablosu
      </div>
      <table class="help-table">
        <thead>
          <tr>
            <th>Maden</th>
            <th>Çokgen</th>
            <th>Değer</th>
            <th>Derinlik</th>
          </tr>
        </thead>
        <tbody>
    `;

    for (const ore of ORES) {
      const depthM = Math.max(0, (ore.minDepth - 3) * 2);
      html += `
        <tr>
          <td><strong style="color:${ore.color};">${ore.name}</strong></td>
          <td><span class="ore-pill" style="background:${ore.color};">${ore.sides}G</span></td>
          <td style="color:#facc15; font-weight:bold;">$${ore.value}</td>
          <td>${depthM}m+</td>
        </tr>
      `;
    }

    html += `</tbody></table>`;

    // Add Geologic Biomes Summary with Tiers
    html += `
      <div style="margin-top:14px; margin-bottom:6px; font-weight:bold; font-size:11px; color:#94a3b8; text-transform:uppercase;">
        🌍 Jeolojik Biyom Katmanları & Kademe (Tier)
      </div>
      <div style="display:flex; flex-direction:column; gap:4px; font-size:11px;">
    `;

    for (const biome of BIOMES) {
      html += `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:3px 6px; background:#1e293b; border-radius:3px;">
          <span><strong style="color:${biome.dirtColor};">■</strong> ${biome.name}</span>
          <span style="font-size:10px; color:#38bdf8; font-weight:bold;">Kademe ${biome.tier}</span>
          <span style="color:#94a3b8;">${(biome.startRow - 3) * 2}m - ${(biome.endRow - 3) * 2}m</span>
        </div>
      `;
    }
    html += `</div>`;

    // Add Hazard Blocks & Mechanics Warning
    html += `
      <div style="margin-top:14px; margin-bottom:6px; font-weight:bold; font-size:11px; color:#ef4444; text-transform:uppercase;">
        ⚠️ Yeraltı Dinamikleri & Kurallar
      </div>
      <div style="display:flex; flex-direction:column; gap:4px; font-size:11px; color:#cbd5e1;">
        <div>🔒 <strong>Matkap Seviyesi vs. Biyom Kademesi:</strong>
          <br/>• <em>drillTier >= blockTier:</em> Tam hızda kazı (%100) + her üst seviye için +%25 hız bonusu!
          <br/>• <em>drillTier == blockTier - 1:</em> <strong>Zorlanarak Kazı!</strong> Yarı hızda (%50) kazarsın ve 2.5 kat daha fazla hararet üretirsin.
          <br/>• <em>drillTier < blockTier - 1:</em> <strong>Kilitli (Kazılamaz)!</strong> Matkap seker ve uyarı verir.
          <br/>• <strong>Sert Kaya (Rock):</strong> Bulunduğu biyomun 1 kademe üstü (Tier + 1) sayılır! 550m Kadim Çekirdek ise Tier 5'tir.
        </div>
        <div>🛠️ <strong>Hibrit Geliştirme (Nakit + Ham Cevher):</strong>
          <br/>• Seviye 2: Nakit + 2x Demir | Seviye 3: Nakit + 3x Gümüş
          <br/>• Seviye 4: Nakit + 3x Altın | Seviye 5: Nakit + 3x Zümrüt & 1x Elmas
          <br/>• Geliştirme yapıldığında kargodaki madenler eritilerek tüketilir. Mağazada <em>[🛡️ Üretim Haricini Sat]</em> ile gerekenleri koruyabilirsiniz.
        </div>
        <div>🌡️ <strong>Aktif Hararet (%0 - %100):</strong> Kazı yapmak ve roket yakmak motoru ısıtır.
          <br/>• <strong>Termal Overdrive (%75-%99):</strong> Matkap alev alır ve <strong>+%25 ekstra hız bonusu</strong> kazanır!
          <br/>• <strong>Hararet Kilidi (%100):</strong> Motor 2.5 saniye kilitlenir, 15 gövde hasarı verir ve zorunlu soğumaya geçer.
          <br/>• <strong>Soğutma:</strong> Kazı/roketi durdurunca radyatörünüz motoru soğutur. Ray/asansörde soğuma 1.6 kat daha hızlıdır. <strong>[T] Tamir Kiti</strong> veya yüzey istasyonu harareti anında sıfırlar.
        </div>
        <div>⛽ <strong>İkmal & Operasyonel Giderler:</strong> Yüzeyde yakıt $0.75/L, gövde tamiri $1.20/HP'dir. Yeraltında dururken saniyede 0.25 L/s baz rölanti yakıtı harcanır.</div>
        <div>🧪 <strong>Sıkışmış Gaz (Gas Pocket):</strong> Kazılınca patlar (-20 Gövde).</div>
        <div>🌋 <strong>Magma Taşı (Magma Rock):</strong> -25 Gövde hasarı verir ama $250-$600 arası Termal Kristal bonusu kazandırır!</div>
        <div>👑 <strong>550m Kadim Çekirdek (Ancient Core):</strong> Haritanın en dibindeki 12-Gen kutsal çekirdek (+$50,000 & Zafer Ekranı!).</div>
        <div>💾 <strong>Otomatik Kayıt:</strong> İlerlemeniz her 5 saniyede bir ve mağazadan çıkıldığında otomatik kaydedilir.</div>
      </div>
    `;

    this.helpOreTable.innerHTML = html;
  }

  // --- TOAST NOTIFICATIONS ---
  public showToast(message: string, color: string = '#38bdf8', durationMs: number = 3500): void {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.style.cssText = 'position:fixed; top:42px; left:50%; transform:translateX(-50%); display:flex; flex-direction:column; align-items:center; gap:6px; z-index:99999; pointer-events:none;';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.style.cssText = `
      background: rgba(15, 23, 42, 0.94);
      border: 1.5px solid ${color};
      color: #f8fafc;
      padding: 7px 16px;
      border-radius: 6px;
      font-family: monospace;
      font-size: 12px;
      font-weight: bold;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(6px);
      transition: opacity 0.3s ease, transform 0.3s ease;
      opacity: 0;
      transform: translateY(-8px);
      max-width: 90vw;
      text-align: center;
    `;
    toast.innerText = message;
    container.appendChild(toast);

    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0)';
    });

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-8px)';
      setTimeout(() => toast.remove(), 300);
    }, durationMs);
  }

  // --- VICTORY MODAL ---
  public showVictory(playTime: number, player: PlayerExtendedState, winnerName?: string) {
    this.isVictoryVisible = true;
    const mins = Math.floor(playTime / 60);
    const secs = Math.floor(playTime % 60);
    const timeFormatted = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

    if (this.victoryTime) this.victoryTime.innerText = timeFormatted;
    if (this.victoryMoney) this.victoryMoney.innerText = `$${player.money.toLocaleString()}`;
    if (this.victoryCargo) this.victoryCargo.innerText = `${player.cargo.length} / ${player.maxCargo}`;

    const victoryTitle = document.getElementById('victory-title');
    const victoryDesc = document.getElementById('victory-desc');
    if (winnerName && victoryTitle) {
      victoryTitle.innerText = `🏆 KADİM ÇEKİRDEK [${winnerName.toUpperCase()}] ÖNCÜLÜĞÜNDE EKİP TARAFINDAN FETHEDİLDİ!`;
      if (victoryDesc) {
        victoryDesc.innerHTML = `550. metrenin en dibindeki devasa <strong style="color:#ec4899;">Kadim Dodecagon (12-Gen) Çekirdeği</strong> tüm co-op ekibinin ortak çalışmasıyla başarıyla çıkarıldı!`;
      }
    } else if (victoryTitle) {
      victoryTitle.innerText = `TEBRİKLER! YERALTI ÇEKİRDEĞİ FETHEDİLDİ`;
    }

    if (this.victoryModal) {
      this.victoryModal.style.display = 'flex';
    }
  }

  public hideVictory() {
    this.isVictoryVisible = false;
    if (this.victoryModal) {
      this.victoryModal.style.display = 'none';
    }
  }

  public isVictoryOpen(): boolean {
    return this.isVictoryVisible;
  }

  // --- CO-OP MODAL & MULTIPLAYER LOBBY ---
  public isCoopOpen(): boolean {
    return this.isCoopVisible;
  }

  public showCoop() {
    this.isCoopVisible = true;
    if (this.coopModal) this.coopModal.style.display = 'flex';
    this.renderCoopUI();
  }

  public hideCoop() {
    this.isCoopVisible = false;
    if (this.coopModal) this.coopModal.style.display = 'none';
  }

  public toggleCoop() {
    if (this.isCoopVisible) this.hideCoop();
    else this.showCoop();
  }

  public initCoop(network: NetworkManager) {
    this.networkManager = network;

    if (this.playerRef) {
      this.playerRef.name = network.localName;
      this.playerRef.color = network.localColor;
    }

    // Bind nickname input
    if (this.coopNicknameInput) {
      this.coopNicknameInput.value = network.localName;
      this.coopNicknameInput.addEventListener('input', () => {
        const val = this.coopNicknameInput!.value.trim().slice(0, 16) || 'Madenci';
        network.setProfile(val, network.localColor);
        if (this.playerRef) this.playerRef.name = val;
      });
    }

    // Render 5 color swatches
    this.renderColorSwatches();

    // Bind Host Room button
    if (this.btnCoopCreateRoom) {
      this.btnCoopCreateRoom.addEventListener('click', () => {
        if (!this.networkManager) return;
        this.btnCoopCreateRoom!.disabled = true;
        this.btnCoopCreateRoom!.innerText = '⏳ Oda Oluşturuluyor...';

        this.networkManager.createRoom(
          (code) => {
            this.btnCoopCreateRoom!.disabled = false;
            this.btnCoopCreateRoom!.innerText = '📡 YENİ ODA KUR (HOST)';
            if (this.coopHostInfo) this.coopHostInfo.style.display = 'block';
            if (this.coopDisplayRoomCode) this.coopDisplayRoomCode.innerText = code;
            if (this.coopDisconnectContainer) this.coopDisconnectContainer.style.display = 'block';
            this.showToast(`📡 Oda kuruldu: ${code}`, '#10b981');
          },
          (err) => {
            this.btnCoopCreateRoom!.disabled = false;
            this.btnCoopCreateRoom!.innerText = '📡 YENİ ODA KUR (HOST)';
            this.showToast(`❌ Oda kurulamadı: ${err?.type || 'Bağlantı hatası'}`, '#ef4444');
          }
        );
      });
    }

    // Bind Copy Code button
    if (this.btnCoopCopyCode) {
      this.btnCoopCopyCode.addEventListener('click', () => {
        const code = this.coopDisplayRoomCode?.innerText;
        if (code) {
          navigator.clipboard.writeText(code).then(() => {
            this.showToast(`📋 Oda kodu kopyalandı: ${code}`, '#34d399');
          }).catch(() => {
            this.showToast(`Oda Kodu: ${code}`, '#38bdf8');
          });
        }
      });
    }

    // Bind Join Room button
    if (this.btnCoopJoinRoom && this.coopJoinInput) {
      this.btnCoopJoinRoom.addEventListener('click', () => {
        const inputVal = this.coopJoinInput!.value.trim();
        if (!inputVal) {
          this.showToast('⚠️ Lütfen bir oda kodu girin!', '#f59e0b');
          return;
        }

        this.btnCoopJoinRoom!.disabled = true;
        this.btnCoopJoinRoom!.innerText = '⏳ Bağlanıyor...';

        this.networkManager!.joinRoom(
          inputVal,
          () => {
            this.btnCoopJoinRoom!.disabled = false;
            this.btnCoopJoinRoom!.innerText = 'Bağlan';
            if (this.coopDisconnectContainer) this.coopDisconnectContainer.style.display = 'block';
            if (this.coopHostInfo) this.coopHostInfo.style.display = 'none';
            this.showToast(`🟢 Odaya bağlanıldı!`, '#10b981');
          },
          (err) => {
            this.btnCoopJoinRoom!.disabled = false;
            this.btnCoopJoinRoom!.innerText = 'Bağlan';
            this.showToast(`❌ Odaya bağlanılamadı (${err?.type || 'Hata'})`, '#ef4444');
          }
        );
      });
    }

    // Bind Disconnect button
    if (this.btnCoopDisconnect) {
      this.btnCoopDisconnect.addEventListener('click', () => {
        this.networkManager?.disconnect();
        if (this.coopHostInfo) this.coopHostInfo.style.display = 'none';
        if (this.coopDisconnectContainer) this.coopDisconnectContainer.style.display = 'none';
        this.showToast('🔌 Odadan ayrıldın.', '#94a3b8');
      });
    }
  }

  private renderColorSwatches() {
    if (!this.coopColorSelector || !this.networkManager) return;
    this.coopColorSelector.innerHTML = '';

    for (const color of CHASSIS_COLORS) {
      const swatch = document.createElement('div');
      swatch.className = `color-swatch ${this.networkManager.localColor === color.hex ? 'active' : ''}`;
      swatch.style.backgroundColor = color.hex;
      swatch.title = `${color.name} (${color.emoji})`;
      swatch.innerHTML = `<span style="font-size:12px; pointer-events:none;">${color.emoji}</span>`;

      swatch.addEventListener('click', () => {
        if (!this.networkManager) return;
        this.networkManager.setProfile(this.networkManager.localName, color.hex);
        if (this.playerRef) this.playerRef.color = color.hex;

        const all = this.coopColorSelector?.querySelectorAll('.color-swatch');
        all?.forEach(s => s.classList.remove('active'));
        swatch.classList.add('active');
        this.showToast(`🎨 Şasi Rengi: ${color.name}`, color.hex, 1800);
      });

      this.coopColorSelector.appendChild(swatch);
    }
  }

  private renderCoopUI() {
    if (!this.networkManager) return;
    if (this.coopNicknameInput) {
      this.coopNicknameInput.value = this.networkManager.localName;
    }
    this.renderColorSwatches();

    if (this.networkManager.isConnected) {
      if (this.coopDisconnectContainer) this.coopDisconnectContainer.style.display = 'block';
      if (this.networkManager.getIsHost() && this.coopHostInfo && this.networkManager.getRoomCode()) {
        this.coopHostInfo.style.display = 'block';
        if (this.coopDisplayRoomCode) this.coopDisplayRoomCode.innerText = `POLY-${this.networkManager.getRoomCode()}`;
      }
    } else {
      if (this.coopDisconnectContainer) this.coopDisconnectContainer.style.display = 'none';
      if (this.coopHostInfo) this.coopHostInfo.style.display = 'none';
    }
  }

  public updateCoopHUD(statusText: string, isConnected: boolean, peerCount: number) {
    if (this.coopStatusBadge) {
      this.coopStatusBadge.innerText = `Durum: ${statusText}`;
      this.coopStatusBadge.style.color = isConnected ? '#34d399' : '#94a3b8';
      this.coopStatusBadge.style.background = isConnected ? '#064e3b' : '#1e293b';
      this.coopStatusBadge.style.border = isConnected ? '1px solid #10b981' : '1px solid #334155';
    }

    if (this.btnOpenCoop) {
      if (isConnected && this.networkManager?.getRoomCode()) {
        const code = this.networkManager.getRoomCode()!;
        const displayCode = code.startsWith('POLY-') ? code : `POLY-${code}`;
        this.btnOpenCoop.innerHTML = `🟢 ODA: ${displayCode} (${peerCount} Kişi)`;
        this.btnOpenCoop.style.borderColor = '#10b981';
        this.btnOpenCoop.style.color = '#34d399';
        this.btnOpenCoop.style.background = 'rgba(16, 185, 129, 0.22)';
        this.btnOpenCoop.style.boxShadow = '0 0 10px rgba(16, 185, 129, 0.4)';
      } else {
        this.btnOpenCoop.innerHTML = '🌐 CO-OP (Tek Kişi)';
        this.btnOpenCoop.style.borderColor = '#06b6d4';
        this.btnOpenCoop.style.color = '#22d3ee';
        this.btnOpenCoop.style.background = 'rgba(6, 182, 212, 0.18)';
        this.btnOpenCoop.style.boxShadow = 'none';
      }
    }
  }

  public updateCoopRoster(roster: RosterPlayer[]) {
    if (!this.coopRosterList) return;
    if (roster.length === 0) {
      this.coopRosterList.innerHTML = `
        <div style="color:#64748b; font-size:11px; text-align:center; padding:12px;">
          Henüz bağlı oyuncu yok.
        </div>
      `;
      return;
    }

    let html = '';
    for (const p of roster) {
      const isMe = this.networkManager?.localName === p.name;
      html += `
        <div class="roster-card" style="border-left: 3px solid ${p.color};">
          <div style="display:flex; align-items:center; gap:8px;">
            <div style="width:12px; height:12px; border-radius:50%; background:${p.color}; box-shadow:0 0 6px ${p.color};"></div>
            <strong style="color:#f8fafc;">${p.name} ${isMe ? '(Sen)' : ''}</strong>
          </div>
          <div style="display:flex; align-items:center; gap:6px;">
            ${p.isHost ? '<span style="background:#0284c7; color:#fff; font-size:9px; padding:1px 5px; border-radius:3px; font-weight:bold;">HOST</span>' : '<span style="background:#334155; color:#94a3b8; font-size:9px; padding:1px 5px; border-radius:3px;">MİSAFİR</span>'}
          </div>
        </div>
      `;
    }
    this.coopRosterList.innerHTML = html;
  }

  public showTowModal(cause: 'fuel' | 'hull' | 'stuck' = 'fuel') {
    this.isTowVisible = true;
    if (cause === 'hull') {
      this.towTitle.innerText = '💥 GÖVDE PARÇALANDI!';
      this.towDesc.innerHTML = `
        Aracın yüksek hızla yere çarpması veya yeraltı patlaması sonucu gövdesi imha oldu.<br />
        <span style="color:#f87171; font-size:12px;">(Kargo haznesindeki tüm madenler onarım masrafı olarak kaybedildi!)</span><br />
        Acil durum kurtarma ekibi kapsülü yüzeye çekti ve acil zırh onarımı (%50) sağlandı.
      `;
    } else {
      this.towTitle.innerText = '🚨 YAKIT BİTTİ!';
      this.towDesc.innerHTML = `
        Yeraltında yakıtın tamamen tükendi. Acil durum kurtarma ekibi kapsülünü yüzeye çekti.<br />
        <span style="color:#f87171; font-size:12px;">(Kargo haznesindeki tüm madenler kurtarma masrafı olarak kaybedildi!)</span><br />
        Acil durum yakıt rezervi (%30) dolduruldu.
      `;
    }
    this.towModal.style.display = 'flex';
  }

  public hideTowModal() {
    this.isTowVisible = false;
    this.towModal.style.display = 'none';
  }

  public isTowOpen(): boolean {
    return this.isTowVisible;
  }
}
