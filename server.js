'use strict';

const { createServer } = require('http');
const { Server }       = require('socket.io');

const PORT  = process.env.PORT || 3001;
const httpServer = createServer();
const io    = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

// rooms: Map<roomCode, { p1: socketId|null, p2: socketId|null }>
const rooms = new Map();

function getRoomBySocket(socketId) {
  for (const [code, room] of rooms.entries()) {
    if (room.p1 === socketId || room.p2 === socketId) {
      return { code, room };
    }
  }
  return null;
}

io.on('connection', (socket) => {
  console.log(`[+] connected: ${socket.id}`);

  socket.on('joinRoom', (rawCode) => {
    const code = String(rawCode).trim().toLowerCase().slice(0, 20);
    if (!code) return;

    let room = rooms.get(code);
    if (!room) {
      room = { p1: null, p2: null };
      rooms.set(code, room);
    }

    if (room.p1 && room.p2) {
      // Both slots already taken
      socket.emit('roomFull');
      return;
    }

    let slot;
    if (!room.p1) {
      room.p1 = socket.id;
      slot = 1;
    } else {
      room.p2 = socket.id;
      slot = 2;
    }

    socket.join(code);
    socket.emit('joined', { slot, roomCode: code });
    console.log(`  Room "${code}" — slot ${slot} assigned to ${socket.id}`);

    if (room.p1 && room.p2) {
      io.to(code).emit('bothConnected');
      console.log(`  Room "${code}" is full — both players connected`);
    }
  });

  socket.on('playerState', (state) => {
    const found = getRoomBySocket(socket.id);
    if (!found) return;
    // Relay to the OTHER player in the room
    socket.to(found.code).emit('remoteState', state);
  });

  socket.on('hitEvent', (ev) => {
    const found = getRoomBySocket(socket.id);
    if (!found) return;
    socket.to(found.code).emit('remoteHit', ev);
  });

  socket.on('gameEvent', (ev) => {
    const found = getRoomBySocket(socket.id);
    if (!found) return;
    socket.to(found.code).emit('remoteGameEvent', ev);
  });

  socket.on('disconnect', () => {
    console.log(`[-] disconnected: ${socket.id}`);
    const found = getRoomBySocket(socket.id);
    if (!found) return;
    const { code, room } = found;

    // Notify remaining player
    socket.to(code).emit('opponentDisconnected');

    // Clean up slot
    if (room.p1 === socket.id) room.p1 = null;
    if (room.p2 === socket.id) room.p2 = null;

    // Remove empty rooms
    if (!room.p1 && !room.p2) {
      rooms.delete(code);
      console.log(`  Room "${code}" deleted (empty)`);
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`SMC relay server listening on port ${PORT}`);
});
