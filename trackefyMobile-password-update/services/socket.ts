import { io } from "socket.io-client";

const socket = io(
  "https://api.trackefy.in",
  {
    path: "/socket.io",
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    timeout: 10000,
    autoConnect: true,
  }
);

socket.on("connect", () => {
  console.log("✅ Socket connected:", socket.id);
});

socket.on("disconnect", (reason) => {
  console.log("❌ Socket disconnected:", reason);
});

socket.on("connect_error", (err) => {
  console.log("⚠️ Socket connect error:", err.message);
});

export default socket;