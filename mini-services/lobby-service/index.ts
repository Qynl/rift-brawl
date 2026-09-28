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
}

const rooms = new Map<string, Room>();
const socketRoom = new Map<string, string>();

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
    const room: Room = { code, players: new Map(), inMatch: false, hostSlot: 0 };
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
    leaveCurrent(socket);
    const code = String(data.code || '').toUpperCase().trim();
    const room = rooms.get(code);
    if (!room) { socket.emit('lobby:error', { msg: 'Lobby not found. Check the code.' }); return; }
    if (room.players.size >= MAX_PLAYERS) { socket.emit('lobby:error', { msg: 'Lobby is full (4 players).' }); return; }
    if (room.inMatch) { socket.emit('lobby:error', { msg: 'That lobby is mid-match. Try again soon.' }); return; }
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
    console.log(`[lobby] match started in ${code0(room.code)} with ${msg.players.length} players on ${msg.stageId}`);
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

function sanitizeName(name: string): string {
  const n = String(name || '').replace(/[^\w \-]/g, '').trim().slice(0, 12);
  return n || 'PLAYER';
}

function code0(code: string): string { return code; }

const PORT = 3003;
httpServer.listen(PORT, () => {
  console.log(`RIFT BRAWL lobby service running on port ${PORT}`);
});

process.on('SIGTERM', () => {
  httpServer.close(() => process.exit(0));
});
process.on('SIGINT', () => {
  httpServer.close(() => process.exit(0));
});
