// ============ RIFT BRAWL — Net Client ============
// Socket.io wrapper: lobby lifecycle + match transport for host/clients.

'use client';

import type { Socket } from 'socket.io-client';
import type { LobbyState, MatchStartMsg, NetSnapshot } from './protocol';
import { ALL_ACTIONS } from '../core/types';

export type NetStatus = 'offline' | 'connecting' | 'online';

/** Port the lobby relay listens on (mini-services/lobby-service). */
const LOBBY_PORT = 3003;

interface NetHandlers {
  onLobbyState?: (lobby: LobbyState) => void;
  onJoined?: (info: { code: string; slot: number; lobby: LobbyState }) => void;
  onError?: (msg: string) => void;
  onMatchStart?: (msg: MatchStartMsg) => void;
  onMatchAborted?: (reason: string) => void;
  onStatus?: (s: NetStatus) => void;
}

class NetClient {
  private socket: Socket | null = null;
  private connecting = false;

  /**
   * Where the lobby relay lives.
   *
   * An explicit NEXT_PUBLIC_LOBBY_URL always wins, so a real deployment can
   * point at a hosted relay. Failing that we try to work it out from the page
   * we are being served from, because the relay is almost always a sibling of
   * the game on the same machine:
   *
   *   <port>-<id>.e2b.app   preview host -> 3003-<id>.e2b.app
   *   localhost:3000        dev / local  -> localhost:3003
   *
   * and finally the reverse-proxy port transform used by the original harness.
   * Returning a bad guess is cheap: the socket fails to connect and the online
   * screen says so. Nothing else in the game depends on this.
   */
  private endpoint(): string {
    const configured = process.env.NEXT_PUBLIC_LOBBY_URL;
    if (configured) return configured;
    if (typeof window !== 'undefined') {
      const { protocol, hostname, port } = window.location;
      // Sandbox previews address ports by prefixing the hostname.
      const preview = /^(\d+)-(.+)$/.exec(hostname);
      if (preview) return `${protocol}//${LOBBY_PORT}-${preview[2]}`;
      if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return `${protocol}//${hostname}:${LOBBY_PORT}`;
      }
      // Served from a port on some other host: try the same host, relay port.
      if (port) return `${protocol}//${hostname}:${LOBBY_PORT}`;
    }
    return `/?XTransformPort=${LOBBY_PORT}`;
  }
  private handlers: NetHandlers = {};
  private inputQueue: { h: number; p: number; ax: number; ay: number }[] = [];
  private snapQueue: NetSnapshot[] = [];
  private lagTimer: ReturnType<typeof setInterval> | null = null;
  ping = 0;
  lobby: LobbyState | null = null;
  mySlot = -1;
  status: NetStatus = 'offline';
  /** debug counters (QA) */
  sentCount = 0;
  recvCount = 0;

  /**
   * Socket.io is ~45 KB gzipped and only ever needed if the player opens the
   * ONLINE screen, yet it used to sit in the initial bundle for everyone.
   * Loading it on demand keeps the offline game's first paint lean.
   */
  async connect(handlers: NetHandlers) {
    if (this.socket || this.connecting) return;
    this.connecting = true;
    this.handlers = handlers;
    this.status = 'connecting';
    handlers.onStatus?.('connecting');
    let io: typeof import('socket.io-client').io;
    try {
      ({ io } = await import('socket.io-client'));
    } catch {
      this.connecting = false;
      this.status = 'offline';
      handlers.onStatus?.('offline');
      handlers.onError?.('Could not load the online module.');
      return;
    }
    this.connecting = false;
    if (this.socket) return;      // a second call resolved first
    const s = io(this.endpoint(), {
      transports: ['websocket', 'polling'],
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: 6,
      reconnectionDelay: 1000,
      timeout: 10000,
    });
    this.socket = s;
    if (typeof window !== 'undefined') {
      (window as unknown as { __net?: NetClient }).__net = this;
    }

    s.on('connect', () => {
      this.status = 'online';
      handlers.onStatus?.('online');
      this.lagTimer = setInterval(() => s.emit('lag:ping', performance.now()), 2000);
    });
    s.on('disconnect', () => {
      this.status = 'connecting';
      handlers.onStatus?.('connecting');
    });
    s.on('connect_error', () => {
      handlers.onError?.('Could not reach the lobby service. Is it running?');
    });
    s.on('lag:pong', (t: number) => {
      this.ping = Math.round(performance.now() - t);
    });

    s.on('lobby:joined', (info: { code: string; slot: number; lobby: LobbyState }) => {
      this.lobby = info.lobby;
      this.mySlot = info.slot;
      handlers.onJoined?.(info);
    });
    s.on('lobby:state', (lobby: LobbyState) => {
      this.lobby = lobby;
      const me = lobby.players.find(p => p.socketId === s.id);
      if (me) this.mySlot = me.slot;
      handlers.onLobbyState?.(lobby);
    });
    s.on('lobby:error', (e: { msg: string }) => handlers.onError?.(e.msg));
    s.on('match:start', (msg: MatchStartMsg) => handlers.onMatchStart?.(msg));
    s.on('match:aborted', (e: { reason: string }) => handlers.onMatchAborted?.(e.reason));

    // match transport
    s.on('m:input', (pkt: { slot: number; h: number; p: number; ax: number; ay: number }) => {
      // host receives client inputs (slot -> playerIndex mapping done by the game)
      this.recvCount++;
      this.inputQueue.push(pkt);
    });
    s.on('m:snap', (snap: NetSnapshot) => {
      // keep the newest handful (drop stale ones after background throttling)
      this.snapQueue.push(snap);
      while (this.snapQueue.length > 4) this.snapQueue.shift();
    });
  }

  get connected(): boolean {
    return this.status === 'online';
  }

  // ---------- lobby actions ----------

  createLobby(name: string, char: string) { this.socket?.emit('lobby:create', { name, char }); }
  joinLobby(code: string, name: string, char: string) { this.socket?.emit('lobby:join', { code, name, char }); }
  setChar(char: string) { this.socket?.emit('lobby:setChar', { char }); }
  setReady(ready: boolean) { this.socket?.emit('lobby:setReady', { ready }); }
  startMatch(stageId: string, stocks: number) { this.socket?.emit('lobby:start', { stageId, stocks }); }
  leaveLobby() {
    this.socket?.emit('lobby:leave');
    this.lobby = null;
    this.mySlot = -1;
  }

  /** host: end the current match and return everyone to the lobby */
  socketEmitLeave() {
    this.socket?.emit('m:leave', { reason: 'The host ended the match.' });
  }

  /** host: match finished normally — re-open the lobby for joins */
  endMatch() {
    this.socket?.emit('m:over');
  }

  // ---------- match transport ----------

  sendInput(held: Record<string, boolean>, pressed: Record<string, boolean>, ax: number, ay: number) {
    if (!this.socket) return;
    this.sentCount = (this.sentCount ?? 0) + 1;
    let h = 0, p = 0;
    for (let i = 0; i < ALL_ACTIONS.length; i++) {
      if (held[ALL_ACTIONS[i]]) h |= 1 << i;
      if (pressed[ALL_ACTIONS[i]]) p |= 1 << i;
    }
    this.socket.emit('m:input', { h, p, ax, ay });
  }

  sendSnapshot(snap: NetSnapshot) {
    this.socket?.emit('m:snap', snap);
  }

  /** host: drain received client inputs (slot-tagged) */
  drainInputs(): { slot: number; h: number; p: number; ax: number; ay: number }[] {
    const out = this.inputQueue;
    this.inputQueue = [];
    return out as { slot: number; h: number; p: number; ax: number; ay: number }[];
  }

  /** client: drain received snapshots */
  drainSnapshots(): NetSnapshot[] {
    const out = this.snapQueue;
    this.snapQueue = [];
    return out;
  }

  disconnect() {
    if (this.lagTimer) clearInterval(this.lagTimer);
    this.lagTimer = null;
    this.socket?.disconnect();
    this.socket = null;
    this.lobby = null;
    this.mySlot = -1;
    this.status = 'offline';
    this.handlers.onStatus?.('offline');
  }
}

export const net = new NetClient();
