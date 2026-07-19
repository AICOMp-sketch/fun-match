const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: [
      "https://fun-match.pages.dev",
      "http://localhost:3000",
      "http://127.0.0.1:3000"
    ],
    methods: ["GET", "POST"]
  }
});

app.use(express.static("public"));

app.get("/health", (req, res) => {
  res.send("✅ Server is running!");
});

const rooms = {};

function generateRoomCode() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

io.on("connection", (socket) => {
  console.log("✅ User connected:", socket.id);

  socket.on("create-room", (data) => {
    let roomCode = (data && data.roomCode) ? data.roomCode.toUpperCase() : generateRoomCode();
    while (rooms[roomCode]) {
      roomCode = generateRoomCode();
    }

    rooms[roomCode] = {
      hostId: socket.id,
      players: {}
    };

    socket.join(roomCode);
    socket.emit("room-created", { roomCode });
    console.log(`🏠 Room created: ${roomCode}`);
  });

  socket.on("join-room", (data) => {
    const { roomCode, playerName } = data;
    const room = rooms[roomCode];

    if (!room) {
      socket.emit("join-error", { message: "Room not found!" });
      return;
    }

    room.players[socket.id] = {
      id: socket.id,
      name: playerName,
      x: 400,
      y: 250,
      color: `hsl(${Math.random() * 360}, 70%, 60%)`
    };

    socket.join(roomCode);
    socket.data.roomCode = roomCode;

    socket.emit("join-success", { playerName });
    io.to(room.hostId).emit("player-joined", room.players[socket.id]);

    console.log(`👤 ${playerName} joined room ${roomCode}`);
  });

  socket.on("move", (data) => {
    const roomCode = socket.data.roomCode;
    const room = rooms[roomCode];
    if (!room || !room.players[socket.id]) return;

    io.to(room.hostId).emit("player-moved", {
      playerId: socket.id,
      direction: data.direction
    });
  });

  // ═══════ UNO EVENTS ═══════

  // Host sends hand to specific player
  socket.on("uno-hand", (data) => {
    // Forward to specific player
    io.to(data.targetId).emit("uno-your-hand", {
      hand: data.hand,
      isMyTurn: data.isMyTurn,
      currentColor: data.currentColor,
      topCard: data.topCard
    });
  });

  // Player plays a card
  socket.on("uno-play-card", (data) => {
    const roomCode = socket.data.roomCode;
    const room = rooms[roomCode];
    if (!room) return;

    // Forward to host
    io.to(room.hostId).emit("uno-play", {
      playerId: socket.id,
      cardIndex: data.cardIndex,
      chosenColor: data.chosenColor
    });
  });

  // Player draws a card
  socket.on("uno-draw-card", () => {
    const roomCode = socket.data.roomCode;
    const room = rooms[roomCode];
    if (!room) return;

    io.to(room.hostId).emit("uno-draw", {
      playerId: socket.id
    });
  });

  // Host sends error back to player
  socket.on("uno-error", (data) => {
    io.to(data.targetId).emit("uno-error-msg", {
      message: data.message
    });
  });

  socket.on("disconnect", () => {
    console.log("❌ User disconnected:", socket.id);

    const roomCode = socket.data.roomCode;
    if (roomCode && rooms[roomCode]) {
      const room = rooms[roomCode];

      if (room.players[socket.id]) {
        delete room.players[socket.id];
        io.to(room.hostId).emit("player-left", { playerId: socket.id });
      }

      if (room.hostId === socket.id) {
        delete rooms[roomCode];
        console.log(`🏠 Room deleted: ${roomCode}`);
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("🚀 Server running on port " + PORT);
});