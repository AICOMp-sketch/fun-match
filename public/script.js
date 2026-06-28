// Connect to Railway server
const socket = io("https://fun-match-production.up.railway.app");

socket.on("connect", () => {
    console.log("✅ Connected to server!");
});

socket.on("disconnect", () => {
    console.log("❌ Disconnected from server!");
});