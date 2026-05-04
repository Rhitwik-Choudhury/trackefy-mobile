import { io } from "socket.io-client";

const socket = io("http://192.168.29.190:5000", {
  transports: ["websocket"],
  reconnection: true,
});

export default socket;