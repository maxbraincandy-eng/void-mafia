import { io, Socket } from 'socket.io-client';

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? '';

export const socket: Socket = io(SERVER_URL, {
  autoConnect: false,
  transports: ['websocket', 'polling'],
  upgrade: true,
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 500,
  reconnectionDelayMax: 3000,
  timeout: 5000,
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
    const timeout = setTimeout(() => {
      console.warn(`[ack-timeout] ${event} connected=${socket.connected}`);
      reject(new Error('Connection slow — please try again.'));
    }, 30_000);

    const cb = (res: TRes) => {
      clearTimeout(timeout);
      resolve(res);
    };

    // Never pass undefined/null as data — Socket.IO serialises it to null,
    // and the server handler (cb) => {} would receive null as its first arg
    // instead of the ack callback, causing the ack to never fire.
    if (data !== undefined && data !== null) {
      socket.emit(event as any, data, cb);
    } else {
      socket.emit(event as any, cb);
    }
  });
}
