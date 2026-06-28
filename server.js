const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

// Allow Cloudflare Pages to connect
const io = new Server(server, {
  cors: {
    origin: "https://fun-match.ac1423004.workers.dev/",
    methods: ["GET", "POST"]
  }
});

app.use(express.static("public"));

// Test route to check if server is running
app.get("/health", (req, res) => {
  res.send("✅ Server is running!");
});

io.on("connection", (socket) => {
  console.log("✅ User connected:", socket.id);

  socket.on("disconnect", () => {
    console.log("❌ User disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log("🚀 Server running on port " + PORT);
});