// ============ RIFT BRAWL — Lobby Service ============
// Socket.io relay for online lobbies: room codes, up to 4 players per room,
// lobby state broadcast, and low-latency match message relay (inputs up, snapshots down).
// The game simulation is host-authoritative — this service only relays.

import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import { makeLobbyCode, type LobbyState, type LobbyPlayer } from '../../src/lib/game/net/protocol';

const httpServer = createServer();
const io = new Server(httpServer, {
  path: '/',
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60000,
  pingInterval: 25000,
  // the match relay needs to move fast — bump the transport buffer
  perMessageDeflate: false,
});

const MAX_PLAYERS = 4;

interface Room {
  code: string;
  players: Map<string, LobbyPlayer & { socket: Socket }>;
  inMatch: boolean;
  hostSlot: number;
  lastActivity: number;
}

const rooms = new Map<string, Room>();
const socketRoom = new Map<string, string>();

// ---------------------------------------------------------------------------
//  ABUSE CONTROLS
//  The relay previously had no rate limit, no room lifetime and no message
//  size cap: a single client could create unlimited rooms or flood every peer.
// ---------------------------------------------------------------------------

/** max lobby control messages per socket per window */
const RATE_LIMIT = { windowMs: 10_000, maxEvents: 60 };
/** rooms with no activity for this long are reaped */
const ROOM_TTL_MS = 30 * 60 * 1000;
/** hard cap on a relayed match payload, in bytes of JSON */
const MAX_PAYLOAD = 64 * 1024;

const rateState = new Map<string, { count: number; resetAt: number }>();

function rateLimited(socket: Socket): boolean {
  const now = Date.now();
  let st = rateState.get(socket.id);
  if (!st || now > st.resetAt) {
    st = { count: 0, resetAt: now + RATE_LIMIT.windowMs };
    rateState.set(socket.id, st);
  }
  st.count++;
  if (st.count > RATE_LIMIT.maxEvents) {
    socket.emit('lobby:error', { msg: 'Too many requests. Slow down.' });
    return true;
  }
  return false;
}

function touchRoom(room: Room) { room.lastActivity = Date.now(); }

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (now - room.lastActivity > ROOM_TTL_MS) {
      for (const p of room.players.values()) {
        p.socket.emit('match:aborted', { reason: 'Lobby expired.' });
        p.socket.leave(code);
        socketRoom.delete(p.socket.id);
      }
      rooms.delete(code);
      console.log(`[lobby] room ${code} reaped (idle)`);
    }
  }
}, 60_000).unref?.();

function serializeRoom(room: Room): LobbyState {
  return {
    code: room.code,
    hostSlot: room.hostSlot,
    inMatch: room.inMatch,
    players: [...room.players.values()]
      .sort((a, b) => a.slot - b.slot)
      .map(({ slot, socketId, name, char, ready }) => ({ slot, socketId, name, char, ready })),
  };
}

function broadcastLobby(room: Room) {
  const state = serializeRoom(room);
  for (const p of room.players.values()) {
    p.socket.emit('lobby:state', state);
  }
}

function hostSocket(room: Room): Socket | null {
  for (const p of room.players.values()) {
    if (p.slot === room.hostSlot) return p.socket;
  }
  return null;
}

function freeSlot(room: Room): number {
  for (let s = 0; s < MAX_PLAYERS; s++) {
    if (![...room.players.values()].some(p => p.slot === s)) return s;
  }
  return -1;
}

io.on('connection', (socket) => {
  console.log(`[lobby] connected: ${socket.id}`);

  // ---------- lobby lifecycle ----------

  socket.on('lobby:create', (data: { name: string; char: string }) => {
    leaveCurrent(socket);
    let code = makeLobbyCode();
    while (rooms.has(code)) code = makeLobbyCode();
    if (rateLimited(socket)) return;
    const room: Room = { code, players: new Map(), inMatch: false, hostSlot: 0, lastActivity: Date.now() };
    room.players.set(socket.id, {
      slot: 0, socketId: socket.id, name: sanitizeName(data.name), char: data.char || 'vanguard', ready: false, socket,
    });
    rooms.set(code, room);
    socketRoom.set(socket.id, code);
    socket.join(code);
    socket.emit('lobby:joined', { code, slot: 0, lobby: serializeRoom(room) });
    console.log(`[lobby] room ${code} created by ${socket.id}`);
  });

  socket.on('lobby:join', (data: { code: string; name: string; char: string }) => {
    if (rateLimited(socket)) return;
    leaveCurrent(socket);
    const code = String(data.code || '').toUpperCase().trim();
    const room = rooms.get(code);
    if (!room) { socket.emit('lobby:error', { msg: 'Lobby not found. Check the code.' }); return; }
    if (room.players.size >= MAX_PLAYERS) { socket.emit('lobby:error', { msg: 'Lobby is full (4 players).' }); return; }
    if (room.inMatch) { socket.emit('lobby:error', { msg: 'That lobby is mid-match. Try again soon.' }); return; }
    touchRoom(room);
    const slot = freeSlot(room);
    if (slot < 0) { socket.emit('lobby:error', { msg: 'Lobby is full (4 players).' }); return; }
    room.players.set(socket.id, {
      slot, socketId: socket.id, name: sanitizeName(data.name), char: data.char || 'vanguard', ready: false, socket,
    });
    socketRoom.set(socket.id, code);
    socket.join(code);
    socket.emit('lobby:joined', { code, slot, lobby: serializeRoom(room) });
    broadcastLobby(room);
    console.log(`[lobby] ${socket.id} joined ${code} as slot ${slot}`);
  });

  socket.on('lobby:setChar', (data: { char: string }) => {
    const room = currentRoom(socket);
    if (!room) return;
    const p = room.players.get(socket.id);
    if (p) { p.char = data.char; broadcastLobby(room); }
  });

  socket.on('lobby:setReady', (data: { ready: boolean }) => {
    const room = currentRoom(socket);
    if (!room) return;
    const p = room.players.get(socket.id);
    if (p) { p.ready = data.ready; broadcastLobby(room); }
  });

  socket.on('lobby:leave', () => {
    leaveCurrent(socket);
  });

  // ---------- match start (host only) ----------

  socket.on('lobby:start', (data: { stageId: string; stocks: number }) => {
    const room = currentRoom(socket);
    if (!room) return;
    const me = room.players.get(socket.id);
    if (!me || me.slot !== room.hostSlot) { socket.emit('lobby:error', { msg: 'Only the host can start the match.' }); return; }
    if (room.players.size < 2) { socket.emit('lobby:error', { msg: 'Need at least 2 players.' }); return; }
    room.inMatch = true;
    const msg = {
      stageId: String(data.stageId || 'forest'),
      stocks: Math.max(1, Math.min(5, data.stocks || 3)),
      players: [...room.players.values()].sort((a, b) => a.slot - b.slot).map(p => ({ slot: p.slot, name: p.name, char: p.char })),
      hostSlot: room.hostSlot,
    };
    for (const p of room.players.values()) p.socket.emit('match:start', msg);
    console.log(`[lobby] match started in ${room.code} with ${msg.players.length} players on ${msg.stageId}`);
  });

  // ---------- match relay ----------

  socket.on('m:input', (pkt: { h: number; p: number; ax: number; ay: number }) => {
    const room = currentRoom(socket);
    if (!room || !room.inMatch) return;
    const me = room.players.get(socket.id);
    if (!me) return;
    const host = hostSocket(room);
    if (host && host.id !== socket.id) {
      host.emit('m:input', { slot: me.slot, ...pkt });
    }
  });

  socket.on('m:snap', (snap: unknown) => {
    const room = currentRoom(socket);
    if (!room || !room.inMatch) return;
    const me = room.players.get(socket.id);
    if (!me || me.slot !== room.hostSlot) return; // only the host broadcasts snapshots
    if (payloadTooBig(snap)) return;              // never fan out an oversized frame
    touchRoom(room);
    socket.to(room.code).emit('m:snap', snap);
  });

  socket.on('m:over', () => {
    // host signals the match finished: re-open the lobby for joins
    const room = currentRoom(socket);
    if (!room) return;
    const me = room.players.get(socket.id);
    if (!me || me.slot !== room.hostSlot) return;
    if (room.inMatch) {
      room.inMatch = false;
      broadcastLobby(room);
    }
  });

  socket.on('m:leave', (data?: { reason?: string }) => {
    // someone bailed (or the host ended the match): return survivors to the lobby
    const room = currentRoom(socket);
    if (!room) return;
    room.inMatch = false;
    const reason = String(data?.reason || 'A player left the match.');
    for (const p of room.players.values()) {
      if (p.socket.id !== socket.id) p.socket.emit('match:aborted', { reason });
    }
    broadcastLobby(room);
  });

  // ---------- ping (latency display) ----------

  socket.on('lag:ping', (t: number) => socket.emit('lag:pong', t));

  // ---------- disconnect ----------

  socket.on('disconnect', () => {
    console.log(`[lobby] disconnected: ${socket.id}`);
    leaveCurrent(socket);
  });

  socket.on('error', (err) => console.error(`[lobby] socket error ${socket.id}:`, err));

  // ---------- helpers ----------

  function currentRoom(s: Socket): Room | null {
    const code = socketRoom.get(s.id);
    if (!code) return null;
    const room = rooms.get(code);
    if (!room) return null;
    if (!room.players.has(s.id)) return null;
    return room;
  }

  function leaveCurrent(s: Socket) {
    const code = socketRoom.get(s.id);
    if (!code) return;
    socketRoom.delete(s.id);
    s.leave(code);
    const room = rooms.get(code);
    if (!room) return;
    const wasHost = room.players.get(s.id)?.slot === room.hostSlot;
    room.players.delete(s.id);
    if (room.players.size === 0) {
      rooms.delete(code);
      console.log(`[lobby] room ${code} closed (empty)`);
      return;
    }
    // reassign host to the lowest remaining slot
    if (wasHost) {
      room.hostSlot = Math.min(...[...room.players.values()].map(p => p.slot));
    }
    if (room.inMatch) {
      room.inMatch = false;
      for (const p of room.players.values()) {
        p.socket.emit('match:aborted', { reason: 'A player disconnected.' });
      }
    }
    broadcastLobby(room);
  }
});

/** Reject oversized relay payloads before they are fanned out to every peer. */
function payloadTooBig(payload: unknown): boolean {
  try { return JSON.stringify(payload).length > MAX_PAYLOAD; } catch { return true; }
}

function sanitizeName(name: string): string {
  const n = String(name || '').replace(/[^\w -]/g, '').trim().slice(0, 12);
  return n || 'PLAYER';
}

const PORT = Number(process.env.PORT || 3003);
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`RIFT BRAWL lobby service running on port ${PORT}`);
});

// Socket.io is mounted at path '/', so it swallows every HTTP request on the
// main port. Health checks therefore get their own tiny listener — a
// deployment needs a readiness probe that does not speak the socket protocol.
const health = createServer((req, res) => {
  if (!req.url?.startsWith('/healthz')) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({
    ok: true,
    rooms: rooms.size,
    players: [...rooms.values()].reduce((n, r) => n + r.players.size, 0),
    uptime: Math.round(process.uptime()),
  }));
});
health.listen(PORT + 1, '0.0.0.0', () => {
  console.log(`RIFT BRAWL lobby health endpoint on port ${PORT + 1}/healthz`);
});

const shutdown = () => {
  health.close();
  httpServer.close(() => process.exit(0));
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
