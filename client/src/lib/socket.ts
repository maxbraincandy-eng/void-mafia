import { io, Socket } from 'socket.io-client';

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? '';

export const socket: Socket = io(SERVER_URL, {
  autoConnect: false,
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
});

export function connectSocket(): void {
  if (!socket.connected) socket.connect();
}

export function disconnectSocket(): void {
  socket.disconnect();
}

/** Promisified emit that resolves with server response */
export function emitWithAck<TData, TRes>(
  event: string,
  data?: TData,
): Promise<TRes> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Request timed out.')), 10_000);

    socket.emit(event as any, data, (res: TRes) => {
      clearTimeout(timeout);
      resolve(res);
    });
  });
}
