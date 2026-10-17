import { Peer, DataConnection } from 'peerjs';
import { RemotePlayerState, TileType } from './types';

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

  constructor(callbacks: NetworkCallbacks) {
    this.callbacks = callbacks;
    // Load cached profile
    try {
      const savedName = localStorage.getItem('polyminer_net_name');
      if (savedName) this.localName = savedName;
      const savedColor = localStorage.getItem('polyminer_net_color');
      if (savedColor) this.localColor = savedColor;
    } catch (_) {}
  }

  public setProfile(name: string, color: string) {
    this.localName = name.trim().slice(0, 16) || 'Madenci';
    this.localColor = color || '#00f2fe';
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
    this.connections.clear();
    this.hostConn = null;
    this.roster.clear();
    this.callbacks.onStatusChange?.('Bağlantı kesildi', false, 1);
    this.callbacks.onRosterUpdate?.([]);
  }

  private handleIncomingConnection(conn: DataConnection) {
    conn.on('open', () => {
      this.connections.set(conn.peer, conn);

      // Register temporary roster item
      const meta = conn.metadata || {};
      this.roster.set(conn.peer, {
        id: conn.peer,
        name: meta.name || 'Misafir',
        color: meta.color || '#38bdf8',
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
    if (!packet || !packet.type) return;

    switch (packet.type) {
      case 'PLAYER_INTRO': {
        const p = packet.payload;
        const entry = this.roster.get(sourceConn.peer);
        if (entry) {
          entry.name = p.name || entry.name;
          entry.color = p.color || entry.color;
        } else {
          this.roster.set(sourceConn.peer, {
            id: sourceConn.peer,
            name: p.name || 'Misafir',
            color: p.color || '#38bdf8',
            isHost: false
          });
        }
        this.broadcastRoster();
        break;
      }

      case 'ROSTER_UPDATE': {
        if (!this.isHost && packet.payload?.roster) {
          this.roster.clear();
          packet.payload.roster.forEach((r: RosterPlayer) => this.roster.set(r.id, r));
          this.callbacks.onRosterUpdate?.(Array.from(this.roster.values()));
          this.callbacks.onStatusChange?.(`Oda: ${this.roomCode}`, true, this.roster.size);
        }
        break;
      }

      case 'WELCOME_SYNC': {
        if (!this.isHost && packet.payload) {
          this.callbacks.onWelcomeSync?.(packet.payload);
        }
        break;
      }

      case 'PLAYER_STATE': {
        const payload: RemotePlayerState = packet.payload;
        this.callbacks.onRemotePlayerUpdate?.(payload);
        // Relay to other clients if Host
        if (this.isHost) {
          this.broadcast(packet, sourceConn.peer);
        }
        break;
      }

      case 'TILE_UPDATE': {
        this.callbacks.onTileUpdate?.(packet.payload);
        if (this.isHost) {
          this.broadcast(packet, sourceConn.peer);
        }
        break;
      }

      case 'SHARED_WALLET_UPDATE': {
        this.callbacks.onSharedWalletUpdate?.(packet.payload);
        if (this.isHost) {
          this.broadcast(packet, sourceConn.peer);
        }
        break;
      }

      case 'SHARED_RELIC_UPDATE': {
        this.callbacks.onSharedRelicUpdate?.(packet.payload);
        if (this.isHost) {
          this.broadcast(packet, sourceConn.peer);
        }
        break;
      }

      case 'VICTORY_EVENT': {
        this.callbacks.onVictory?.(packet.payload);
        if (this.isHost) {
          this.broadcast(packet, sourceConn.peer);
        }
        break;
      }

      case 'PLAYER_LEFT': {
        this.callbacks.onRemotePlayerLeave?.(packet.payload?.id);
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
   * Broadcast shared money balance changes (sales, upgrades, chests).
   */
  public broadcastSharedWallet(money: number, changeAmount: number, reason: string) {
    if (!this.isConnected) return;
    this.broadcast({
      type: 'SHARED_WALLET_UPDATE',
      payload: {
        money,
        changeAmount,
        reason,
        actorName: this.localName
      }
    });
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
   */
  public broadcastVictory(winnerName: string) {
    if (!this.isConnected) return;
    this.broadcast({
      type: 'VICTORY_EVENT',
      payload: {
        winnerName
      }
    });
  }
}
