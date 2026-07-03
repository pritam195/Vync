import { io } from 'socket.io-client';
import { getAuthToken } from './authToken.js';

const socketUrl = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

export function createSocket(token = getAuthToken()) {
  return io(socketUrl, {
    autoConnect: false,
    auth: token ? { token } : undefined,
    withCredentials: true,
  });
}
