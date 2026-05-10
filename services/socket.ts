import { io } from "socket.io-client";

const socket = io(
  "https://kidharhaibus-backend-production.up.railway.app",
  {
    transports: ["websocket"],
    reconnection: true,
  }
);

export default socket;