import { Peer, DataConnection } from 'peerjs';
import { RemotePlayerState, TileType } from './types';
import { GRID_WIDTH, GRID_HEIGHT, TILE_SIZE, RELIC_DEFINITIONS, ORE_DEFINITIONS } from './constants';
import { SavedTile } from './save';

export interface RosterPlayer {
  id: string;
  name: string;
  color: string;
  isHost: boolean;
  depthMeters?: number;
}

export interface NetworkCallbacks {
  getGridSyncData?: () => any[][];
  getSharedMoney?: () => number;
  getDiscoveredRelics?: () => string[];
  onWelcomeSync?: (data: { grid: any[][]; sharedMoney: number; discoveredRelics: string[] }) => void;
  onRemotePlayerUpdate?: (player: RemotePlayerState) => void;
  onRemotePlayerLeave?: (id: string) => void;
  onTileUpdate?: (data: { gx: number; gy: number; tileType: TileType; hasElevator?: boolean; sourcePlayerName?: string }) => void;
  onSharedWalletUpdate?: (data: { money: number; changeAmount: number; reason: string; actorName: string }) => void;
  onSharedRelicUpdate?: (data: { relicId: string; actorName: string }) => void;
  onVictory?: (data: { winnerName: string }) => void;
  onStatusChange?: (statusText: string, isConnected: boolean, peerCount: number) => void;
  onRosterUpdate?: (roster: RosterPlayer[]) => void;
}

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export function sanitizeName(raw: unknown, fallback: string = 'Madenci'): string {
  if (typeof raw !== 'string') return fallback;
  const cleaned = raw.replace(/[\u0000-\u001f\u007f<>&"'`]/g, '').trim().slice(0, 16);
  return cleaned || fallback;
}

export function sanitizeColor(raw: unknown, fallback: string = '#00f2fe'): string {
  return typeof raw === 'string' && HEX_COLOR_RE.test(raw) ? raw : fallback;
}

export const isFiniteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const isInt = (v: unknown): v is number => Number.isInteger(v);
export const isValidWalletDelta = (delta: unknown): delta is number =>
  isFiniteNum(delta) && Math.abs(delta) <= 1e7 && Math.floor(delta) !== 0;

export const VALID_TILE_TYPES: Set<number> = new Set([
  TileType.EMPTY,
  TileType.DIRT,
  TileType.ROCK,
  TileType.ORE,
  TileType.SHOP_PAD,
  TileType.FUEL_PAD,
  TileType.GAS_POCKET,
  TileType.MAGMA_ROCK,
  TileType.ANCIENT_CORE,
  TileType.CHEST
]);

export function isValidTileType(t: unknown): t is TileType {
  return typeof t === 'number' && VALID_TILE_TYPES.has(t);
}

export function isValidSavedGrid(grid: unknown): grid is SavedTile[][] {
  if (!Array.isArray(grid) || grid.length !== GRID_HEIGHT) {
    return false;
  }

  for (let y = 0; y < GRID_HEIGHT; y++) {
    const row = grid[y];
    if (!Array.isArray(row) || row.length !== GRID_WIDTH) {
      return false;
    }
    for (let x = 0; x < GRID_WIDTH; x++) {
      const cell = row[x];
      if (!cell || typeof cell !== 'object') {
        return false;
      }
      if (!isInt(cell.t) || !isValidTileType(cell.t)) {
        return false;
      }
      if (cell.r !== 0 && cell.r !== 1) {
        return false;
      }
      if (cell.o !== undefined) {
        if (typeof cell.o !== 'string' || !(cell.o in ORE_DEFINITIONS)) {
          return false;
        }
      }
      if (cell.m !== undefined) {
        if (typeof cell.m !== 'string' || !(cell.m in RELIC_DEFINITIONS)) {
          return false;
        }
      }
      if (cell.e !== undefined && cell.e !== 1) {
        return false;
      }
    }
  }

  return true;
}

function generateRoomCode(): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export class NetworkManager {
  private peer: Peer | null = null;
  private isHost: boolean = false;
  private roomCode: string | null = null;
  private connections: Map<string, DataConnection> = new Map();
  private hostConn: DataConnection | null = null;
  private roster: Map<string, RosterPlayer> = new Map();
  private callbacks: NetworkCallbacks;
  
  public localName: string = 'Madenci';
  public localColor: string = '#00f2fe';
  public isConnected: boolean = false;
  private lastStateBroadcast: number = 0;
  private victoryDeclared: boolean = false;

  public getLocalId(): string | null {
    return this.peer?.id ?? null;
  }

  constructor(callbacks: NetworkCallbacks) {
    this.callbacks = callbacks;
    // Load cached profile
    try {
      const savedName = localStorage.getItem('polyminer_net_name');
      if (savedName) this.localName = sanitizeName(savedName, 'Madenci');
      const savedColor = localStorage.getItem('polyminer_net_color');
      if (savedColor) this.localColor = sanitizeColor(savedColor, '#00f2fe');
    } catch (_) {}
  }

  public setProfile(name: string, color: string) {
    this.localName = sanitizeName(name, 'Madenci');
    this.localColor = sanitizeColor(color, '#00f2fe');
    try {
      localStorage.setItem('polyminer_net_name', this.localName);
      localStorage.setItem('polyminer_net_color', this.localColor);
    } catch (_) {}

    // If connected, update roster and broadcast
    if (this.peer && !this.peer.destroyed) {
      const myId = this.peer.id;
      const me = this.roster.get(myId);
      if (me) {
        me.name = this.localName;
        me.color = this.localColor;
        this.broadcastRoster();
      }
    }
  }

  public getRoomCode(): string | null {
    return this.roomCode;
  }

  public getIsHost(): boolean {
    return this.isHost;
  }

  public getRoster(): RosterPlayer[] {
    return Array.from(this.roster.values());
  }

  /**
   * Create a new Co-op Room as Host (POLY-XXXX).
   */
  public createRoom(onReady?: (code: string) => void, onError?: (err: any) => void) {
    this.disconnect();
    this.isHost = true;
    const code = generateRoomCode();
    const peerId = `POLY-${code}`;

    this.callbacks.onStatusChange?.('Sunucuya bağlanılıyor...', false, 1);

    try {
      this.peer = new Peer(peerId, { debug: 1 });

      this.peer.on('open', (id) => {
        this.roomCode = code;
        this.isConnected = true;
        this.roster.clear();
        this.roster.set(id, {
          id,
          name: this.localName,
          color: this.localColor,
          isHost: true
        });
        this.broadcastRoster();
        this.callbacks.onStatusChange?.(`Oda Açık: ${peerId}`, true, 1);
        onReady?.(peerId);
      });

      this.peer.on('connection', (conn) => {
        this.handleIncomingConnection(conn);
      });

      this.peer.on('error', (err) => {
        console.error('[P2P Net] Host Peer error:', err);
        this.callbacks.onStatusChange?.(`Hata: ${err.type || 'Bağlantı hatası'}`, false, 0);
        onError?.(err);
      });

      this.peer.on('close', () => {
        this.handleDisconnect();
      });
    } catch (e) {
      onError?.(e);
    }
  }

  /**
   * Join an existing Co-op Room as Client.
   */
  public joinRoom(roomInput: string, onConnected?: () => void, onError?: (err: any) => void) {
    this.disconnect();
    this.isHost = false;
    let target = roomInput.trim().toUpperCase();
    if (!target.startsWith('POLY-')) {
      target = `POLY-${target}`;
    }

    this.callbacks.onStatusChange?.('Odaya bağlanılıyor...', false, 0);

    try {
      this.peer = new Peer({ debug: 1 });

      this.peer.on('open', () => {
        this.roomCode = target;
        const conn = this.peer!.connect(target, {
          reliable: true,
          metadata: { name: this.localName, color: this.localColor }
        });
        this.hostConn = conn;

        conn.on('open', () => {
          this.isConnected = true;
          // Send introduction to host
          conn.send({
            type: 'PLAYER_INTRO',
            payload: { name: this.localName, color: this.localColor }
          });
          this.callbacks.onStatusChange?.(`Bağlandı: ${target}`, true, 2);
          onConnected?.();
        });

        conn.on('data', (data: any) => {
          this.handlePacket(data, conn);
        });

        conn.on('close', () => {
          this.callbacks.onStatusChange?.('Host ayrıldı / Bağlantı kesildi', false, 0);
          this.handleDisconnect();
        });

        conn.on('error', (err) => {
          console.error('[P2P Net] Connection error:', err);
          this.callbacks.onStatusChange?.('Bağlantı hatası', false, 0);
          onError?.(err);
        });
      });

      this.peer.on('error', (err) => {
        console.error('[P2P Net] Client Peer error:', err);
        this.callbacks.onStatusChange?.(`Oda bulunamadı veya hata: ${err.type || ''}`, false, 0);
        onError?.(err);
      });

      this.peer.on('close', () => {
        this.handleDisconnect();
      });
    } catch (e) {
      onError?.(e);
    }
  }

  public disconnect() {
    if (this.peer) {
      try {
        this.connections.forEach(conn => conn.close());
        this.connections.clear();
        if (this.hostConn) {
          this.hostConn.close();
          this.hostConn = null;
        }
        this.peer.destroy();
      } catch (_) {}
      this.peer = null;
    }
    this.handleDisconnect();
  }

  private handleDisconnect() {
    this.isConnected = false;
    this.roomCode = null;
    this.isHost = false;
    this.victoryDeclared = false;
    this.connections.clear();
    this.hostConn = null;
    this.roster.clear();
    this.callbacks.onStatusChange?.('Bağlantı kesildi', false, 1);
    this.callbacks.onRosterUpdate?.([]);
  }

  private handleIncomingConnection(conn: DataConnection) {
    conn.on('open', () => {
      // Room capacity limit: max 8 players (Host + 7 guests)
      if (this.connections.size >= 7) {
        conn.close();
        return;
      }

      this.connections.set(conn.peer, conn);

      // Register temporary roster item with sanitized name and color
      const meta = conn.metadata || {};
      this.roster.set(conn.peer, {
        id: conn.peer,
        name: sanitizeName(meta.name, 'Misafir'),
        color: sanitizeColor(meta.color, '#38bdf8'),
        isHost: false
      });

      // Send master game state to the newcomer
      conn.send({
        type: 'WELCOME_SYNC',
        payload: {
          grid: this.callbacks.getGridSyncData?.(),
          sharedMoney: this.callbacks.getSharedMoney?.() ?? 0,
          discoveredRelics: this.callbacks.getDiscoveredRelics?.() ?? []
        }
      });

      this.broadcastRoster();
      this.callbacks.onStatusChange?.(`Oda: ${this.roomCode}`, true, this.roster.size);
    });

    conn.on('data', (data: any) => {
      this.handlePacket(data, conn);
    });

    conn.on('close', () => {
      this.connections.delete(conn.peer);
      this.roster.delete(conn.peer);
      this.callbacks.onRemotePlayerLeave?.(conn.peer);
      this.broadcastRoster();
      this.broadcast({
        type: 'PLAYER_LEFT',
        payload: { id: conn.peer }
      }, conn.peer);
      this.callbacks.onStatusChange?.(`Oda: ${this.roomCode}`, true, this.roster.size);
    });
  }

  private handlePacket(packet: any, sourceConn: DataConnection) {
    if (!packet || typeof packet !== 'object' || typeof packet.type !== 'string') return;

    // Guests only accept packets directly from Host connection
    if (!this.isHost && this.hostConn && sourceConn !== this.hostConn) {
      return;
    }

    switch (packet.type) {
      case 'PLAYER_INTRO': {
        const p = packet.payload;
        if (!p || typeof p !== 'object') break;
        const entry = this.roster.get(sourceConn.peer);
        const safeName = sanitizeName(p.name, entry ? entry.name : 'Misafir');
        const safeColor = sanitizeColor(p.color, entry ? entry.color : '#38bdf8');
        if (entry) {
          entry.name = safeName;
          entry.color = safeColor;
        } else {
          this.roster.set(sourceConn.peer, {
            id: sourceConn.peer,
            name: safeName,
            color: safeColor,
            isHost: false
          });
        }
        this.broadcastRoster();
        break;
      }

      case 'ROSTER_UPDATE': {
        if (!this.isHost && packet.payload?.roster && Array.isArray(packet.payload.roster)) {
          this.roster.clear();
          for (const r of packet.payload.roster) {
            if (r && typeof r === 'object' && typeof r.id === 'string') {
              this.roster.set(r.id, {
                id: String(r.id).slice(0, 64),
                name: sanitizeName(r.name, 'Misafir'),
                color: sanitizeColor(r.color, '#38bdf8'),
                isHost: !!r.isHost,
                depthMeters: isFiniteNum(r.depthMeters) ? Math.max(0, Math.floor(r.depthMeters)) : undefined
              });
            }
          }
          this.callbacks.onRosterUpdate?.(Array.from(this.roster.values()));
          this.callbacks.onStatusChange?.(`Oda: ${this.roomCode}`, true, this.roster.size);
        }
        break;
      }

      case 'WELCOME_SYNC': {
        if (!this.isHost && packet.payload && typeof packet.payload === 'object') {
          const { grid, sharedMoney, discoveredRelics } = packet.payload;
          const safeGrid = isValidSavedGrid(grid) ? grid : undefined;
          const safeMoney = isFiniteNum(sharedMoney) && sharedMoney >= 0 && sharedMoney < 1e9 ? Math.floor(sharedMoney) : 0;
          const safeRelics = Array.isArray(discoveredRelics)
            ? discoveredRelics.filter((id: unknown) => typeof id === 'string' && id in RELIC_DEFINITIONS)
            : [];
          this.callbacks.onWelcomeSync?.({
            grid: safeGrid as any,
            sharedMoney: safeMoney,
            discoveredRelics: safeRelics
          });
        }
        break;
      }

      case 'PLAYER_STATE': {
        const p = packet.payload;
        if (!p || typeof p !== 'object') break;

        // In Host mode: overwrite ID with verified peer ID, and name/color from authoritative roster!
        const playerId = this.isHost ? sourceConn.peer : (typeof p.id === 'string' ? p.id.slice(0, 64) : null);
        if (!playerId) break;

        const rosterEntry = this.roster.get(sourceConn.peer);
        const verifiedName = this.isHost ? (rosterEntry?.name || 'Misafir') : sanitizeName(p.name, 'Misafir');
        const verifiedColor = this.isHost ? (rosterEntry?.color || '#38bdf8') : sanitizeColor(p.color, '#38bdf8');

        if (!isFiniteNum(p.x) || !isFiniteNum(p.y)) break;
        const safeX = clamp(p.x, 0, GRID_WIDTH * TILE_SIZE);
        const safeY = clamp(p.y, 0, GRID_HEIGHT * TILE_SIZE);
        const safeVx = isFiniteNum(p.vx) ? clamp(p.vx, -2000, 2000) : 0;
        const safeVy = isFiniteNum(p.vy) ? clamp(p.vy, -2000, 2000) : 0;
        const safeFacing = (p.facing === 'left' || p.facing === 'right' || p.facing === 'down') ? p.facing : 'down';
        const safeDrillProgress = isFiniteNum(p.drillProgress) ? clamp(p.drillProgress, 0, 1) : 0;
        const safeDrillTier = isFiniteNum(p.drillTier) ? clamp(Math.floor(p.drillTier), 1, 10) : 1;

        const validatedState: RemotePlayerState = {
          id: playerId,
          name: verifiedName,
          color: verifiedColor,
          x: safeX,
          y: safeY,
          vx: safeVx,
          vy: safeVy,
          facing: safeFacing,
          isDrilling: !!p.isDrilling,
          drillProgress: safeDrillProgress,
          isThrusting: !!p.isThrusting,
          drillTier: safeDrillTier,
          lastSeen: Date.now()
        };

        this.callbacks.onRemotePlayerUpdate?.(validatedState);
        if (this.isHost) {
          this.broadcast({
            type: 'PLAYER_STATE',
            payload: validatedState
          }, sourceConn.peer);
        }
        break;
      }

      case 'TILE_UPDATE': {
        const p = packet.payload;
        if (!p || typeof p !== 'object') break;
        if (!isInt(p.gx) || !isInt(p.gy)) break;
        if (p.gx < 0 || p.gx >= GRID_WIDTH || p.gy < 0 || p.gy >= GRID_HEIGHT) break;
        if (!isValidTileType(p.tileType)) break;

        const rosterEntry = this.roster.get(sourceConn.peer);
        const safeActorName = this.isHost
          ? (rosterEntry?.name || 'Madenci')
          : sanitizeName(p.sourcePlayerName, 'Madenci');

        const validatedTile = {
          gx: p.gx,
          gy: p.gy,
          tileType: p.tileType,
          hasElevator: !!p.hasElevator,
          sourcePlayerName: safeActorName
        };

        this.callbacks.onTileUpdate?.(validatedTile);
        if (this.isHost) {
          this.broadcast({
            type: 'TILE_UPDATE',
            payload: validatedTile
          }, sourceConn.peer);
        }
        break;
      }

      case 'WALLET_DELTA_REQUEST': {
        // Only Host receives and validates delta requests from guests!
        if (!this.isHost) break;
        const p = packet.payload;
        if (!p || typeof p !== 'object') break;
        if (!isValidWalletDelta(p.changeAmount)) break;
        const changeAmount = Math.floor(p.changeAmount);

        const currentMoney = this.callbacks.getSharedMoney?.() ?? 0;
        const newMoney = currentMoney + changeAmount;
        // Spending is rejected if balance would go below 0
        if (newMoney < 0 || newMoney > 1e9) break;

        const rosterEntry = this.roster.get(sourceConn.peer);
        const safeActorName = rosterEntry?.name || 'Madenci';
        const safeReason = typeof p.reason === 'string' ? p.reason.slice(0, 40) : 'Ortak İşlem';

        const validatedWallet = {
          money: Math.floor(newMoney),
          changeAmount,
          reason: safeReason,
          actorName: safeActorName
        };

        // Host updates its own local state & UI
        this.callbacks.onSharedWalletUpdate?.(validatedWallet);

        // Host broadcasts authoritative new total to ALL connected clients (including sender)
        this.broadcast({
          type: 'SHARED_WALLET_UPDATE',
          payload: validatedWallet
        });
        break;
      }

      case 'SHARED_WALLET_UPDATE': {
        // Only guests receive SHARED_WALLET_UPDATE from the authoritative host!
        if (this.isHost) break;
        const p = packet.payload;
        if (!p || typeof p !== 'object') break;
        if (!isFiniteNum(p.money) || p.money < 0 || p.money > 1e9) break;
        if (!isFiniteNum(p.changeAmount) || Math.abs(p.changeAmount) > 1e8) break;

        const safeActorName = sanitizeName(p.actorName, 'Madenci');
        const safeReason = typeof p.reason === 'string' ? p.reason.slice(0, 40) : 'Ortak İşlem';

        const validatedWallet = {
          money: Math.floor(p.money),
          changeAmount: Math.floor(p.changeAmount),
          reason: safeReason,
          actorName: safeActorName
        };

        this.callbacks.onSharedWalletUpdate?.(validatedWallet);
        break;
      }

      case 'SHARED_RELIC_UPDATE': {
        const p = packet.payload;
        if (!p || typeof p !== 'object' || typeof p.relicId !== 'string') break;
        if (!(p.relicId in RELIC_DEFINITIONS)) break;

        const rosterEntry = this.roster.get(sourceConn.peer);
        const safeActorName = this.isHost
          ? (rosterEntry?.name || 'Madenci')
          : sanitizeName(p.actorName, 'Madenci');

        const validatedRelic = {
          relicId: p.relicId,
          actorName: safeActorName
        };

        this.callbacks.onSharedRelicUpdate?.(validatedRelic);
        if (this.isHost) {
          this.broadcast({
            type: 'SHARED_RELIC_UPDATE',
            payload: validatedRelic
          }, sourceConn.peer);
        }
        break;
      }

      case 'VICTORY_EVENT': {
        const p = packet.payload;
        if (!p || typeof p !== 'object') break;

        if (this.isHost) {
          // Host allows only ONE victory event per room session
          if (this.victoryDeclared) break;
          this.victoryDeclared = true;

          const rosterEntry = this.roster.get(sourceConn.peer);
          const safeWinner = rosterEntry?.name || 'Bir Madenci';

          const validatedVictory = {
            winnerName: safeWinner
          };

          this.callbacks.onVictory?.(validatedVictory);
          this.broadcast({
            type: 'VICTORY_EVENT',
            payload: validatedVictory
          });
        } else {
          // Client accepts victory event once from Host connection
          if (this.victoryDeclared) break;
          this.victoryDeclared = true;

          const safeWinner = sanitizeName(p.winnerName, 'Bir Madenci');
          this.callbacks.onVictory?.({ winnerName: safeWinner });
        }
        break;
      }

      case 'PLAYER_LEFT': {
        if (packet.payload && typeof packet.payload.id === 'string') {
          this.callbacks.onRemotePlayerLeave?.(packet.payload.id);
        }
        break;
      }
    }
  }

  private broadcastRoster() {
    const rosterArr = Array.from(this.roster.values());
    this.callbacks.onRosterUpdate?.(rosterArr);
    if (this.isHost) {
      this.broadcast({
        type: 'ROSTER_UPDATE',
        payload: { roster: rosterArr }
      });
    }
  }

  /**
   * Broadcasts a packet to all connected peers (or sends to Host if client).
   */
  private broadcast(packet: any, excludePeerId?: string) {
    if (this.isHost) {
      this.connections.forEach((conn, peerId) => {
        if (peerId !== excludePeerId && conn.open) {
          try {
            conn.send(packet);
          } catch (_) {}
        }
      });
    } else if (this.hostConn && this.hostConn.open) {
      try {
        this.hostConn.send(packet);
      } catch (_) {}
    }
  }

  /**
   * Broadcast local player state at 20 Hz (every 50ms).
   */
  public broadcastPlayerState(player: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    facing: 'left' | 'right' | 'down' | 'up';
    isDrilling: boolean;
    drillProgress: number;
    isThrusting: boolean;
    drillTier: number;
  }) {
    if (!this.isConnected || !this.peer) return;

    const now = performance.now();
    if (now - this.lastStateBroadcast < 50) return; // 20 Hz throttle
    this.lastStateBroadcast = now;

    const myId = this.peer.id;
    const payload: RemotePlayerState = {
      id: myId,
      name: this.localName,
      color: this.localColor,
      x: player.x,
      y: player.y,
      vx: player.vx,
      vy: player.vy,
      facing: player.facing,
      isDrilling: player.isDrilling,
      drillProgress: player.drillProgress,
      isThrusting: player.isThrusting,
      drillTier: player.drillTier,
      lastSeen: Date.now()
    };

    this.broadcast({
      type: 'PLAYER_STATE',
      payload
    });
  }

  /**
   * Broadcast instant block break, elevator placement, or dynamite blast.
   */
  public broadcastTileUpdate(gx: number, gy: number, tileType: TileType, hasElevator?: boolean) {
    if (!this.isConnected) return;
    this.broadcast({
      type: 'TILE_UPDATE',
      payload: {
        gx,
        gy,
        tileType,
        hasElevator: !!hasElevator,
        sourcePlayerName: this.localName
      }
    });
  }

  /**
   * Send shared money delta (sales, upgrades, repairs).
   * Host authoritatively aggregates deltas and broadcasts the new total.
   * Guest sends delta request to Host for authoritative validation.
   */
  public sendWalletDelta(changeAmount: number, reason: string) {
    if (!this.isConnected) return;
    if (!isValidWalletDelta(changeAmount)) return;

    if (this.isHost) {
      const currentMoney = this.callbacks.getSharedMoney?.() ?? 0;
      const safeReason = typeof reason === 'string' ? reason.slice(0, 40) : 'Ortak İşlem';
      this.broadcast({
        type: 'SHARED_WALLET_UPDATE',
        payload: {
          money: Math.floor(currentMoney),
          changeAmount: Math.floor(changeAmount),
          reason: safeReason,
          actorName: this.localName
        }
      });
    } else {
      this.broadcast({
        type: 'WALLET_DELTA_REQUEST',
        payload: {
          changeAmount: Math.floor(changeAmount),
          reason: typeof reason === 'string' ? reason.slice(0, 40) : 'Ortak İşlem'
        }
      });
    }
  }

  /**
   * Broadcast newly unearthed archaeological relic.
   */
  public broadcastRelicDiscovered(relicId: string) {
    if (!this.isConnected) return;
    this.broadcast({
      type: 'SHARED_RELIC_UPDATE',
      payload: {
        relicId,
        actorName: this.localName
      }
    });
  }

  /**
   * Broadcast ancient core victory event to all players.
   * Locked to once per room session.
   */
  public broadcastVictory(winnerName: string) {
    if (!this.isConnected || this.victoryDeclared) return;
    this.victoryDeclared = true;

    const safeWinner = this.isHost ? sanitizeName(winnerName, this.localName) : this.localName;
    this.broadcast({
      type: 'VICTORY_EVENT',
      payload: {
        winnerName: safeWinner
      }
    });
  }
}
