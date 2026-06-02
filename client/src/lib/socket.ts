import { io, Socket } from 'socket.io-client';

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? '';

export const socket: Socket = io(SERVER_URL, {
  autoConnect: false,
  transports: ['websocket'],
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 500,
  reconnectionDelayMax: 3000,
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
    const timeout = setTimeout(() => reject(new Error('Connection slow — please try again.')), 30_000);

    socket.emit(event as any, data, (res: TRes) => {
      clearTimeout(timeout);
      resolve(res);
    });
  });
}
