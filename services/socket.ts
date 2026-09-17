import { io } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BASE_URL } from '../constants/api';
const socket = io(BASE_URL.replace(/\/api\/?$/, ''), {
  path: '/socket.io', transports: ['websocket', 'polling'],
  auth: callback => { AsyncStorage.getItem('token').then(token => callback({ token: token || '' })).catch(() => callback({ token: '' })); },
  autoConnect: false, reconnection: true, reconnectionAttempts: Infinity,
  reconnectionDelay: 1000, reconnectionDelayMax: 10000, timeout: 10000,
});
export default socket;
