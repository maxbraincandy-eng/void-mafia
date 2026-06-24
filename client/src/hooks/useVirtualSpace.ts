import { useState, useCallback, useEffect, useRef } from 'react';
import { socket } from '@/lib/socket';

export interface SpacePlayer {
  socketId: string;
  name: string;
  emoji: string;
  color: string;
  x: number;
  y: number;
  message?: string;
}

interface VirtualSpaceState {
  joined: boolean;
  mySocketId: string;
  players: Map<string, SpacePlayer>;
}

export function useVirtualSpace() {
  const [state, setState] = useState<VirtualSpaceState>({
    joined: false,
    mySocketId: '',
    players: new Map(),
  });

  const moveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingMove = useRef<{ x: number; y: number } | null>(null);
  const msgTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const join = useCallback(async (name: string, emoji: string, color: string) => {
    return new Promise<boolean>((resolve) => {
      (socket as any).emit('space:join', { spaceId: 'main', name, emoji, color }, (res: any) => {
        if (!res?.ok) { resolve(false); return; }
        const players = new Map<string, SpacePlayer>();
        for (const p of res.data.players) players.set(p.socketId, p);
        setState({ joined: true, mySocketId: res.data.mySocketId, players });
        resolve(true);
      });
    });
  }, []);

  const leave = useCallback(() => {
    (socket as any).emit('space:leave');
    for (const t of msgTimers.current.values()) clearTimeout(t);
    msgTimers.current.clear();
    setState({ joined: false, mySocketId: '', players: new Map() });
  }, []);

  const moveLocal = useCallback((myId: string, x: number, y: number) => {
    setState(prev => {
      const next = new Map(prev.players);
      const me = next.get(myId);
      if (me) next.set(myId, { ...me, x, y });
      return { ...prev, players: next };
    });
    // Throttled broadcast to server
    pendingMove.current = { x, y };
    if (!moveTimer.current) {
      moveTimer.current = setTimeout(() => {
        moveTimer.current = null;
        if (pendingMove.current) {
          (socket as any).emit('space:move', pendingMove.current);
          pendingMove.current = null;
        }
      }, 80);
    }
  }, []);

  const sendChat = useCallback((message: string) => {
    (socket as any).emit('space:chat', { message });
  }, []);

  function setPlayerMessage(socketId: string, message: string) {
    // Clear existing timer
    const old = msgTimers.current.get(socketId);
    if (old) clearTimeout(old);
    setState(prev => {
      const next = new Map(prev.players);
      const p = prev.players.get(socketId);
      if (!p) return prev;
      next.set(socketId, { ...p, message });
      return { ...prev, players: next };
    });
    const timer = setTimeout(() => {
      msgTimers.current.delete(socketId);
      setState(prev => {
        const p = prev.players.get(socketId);
        if (!p) return prev;
        const next = new Map(prev.players);
        next.set(socketId, { ...p, message: undefined });
        return { ...prev, players: next };
      });
    }, 5000);
    msgTimers.current.set(socketId, timer);
  }

  useEffect(() => {
    function onJoined(player: SpacePlayer) {
      setState(prev => {
        const next = new Map(prev.players);
        next.set(player.socketId, player);
        return { ...prev, players: next };
      });
    }
    function onMoved({ socketId, x, y }: { socketId: string; x: number; y: number }) {
      setState(prev => {
        const p = prev.players.get(socketId);
        if (!p) return prev;
        const next = new Map(prev.players);
        next.set(socketId, { ...p, x, y });
        return { ...prev, players: next };
      });
    }
    function onLeft({ socketId }: { socketId: string }) {
      const t = msgTimers.current.get(socketId);
      if (t) { clearTimeout(t); msgTimers.current.delete(socketId); }
      setState(prev => {
        const next = new Map(prev.players);
        next.delete(socketId);
        return { ...prev, players: next };
      });
    }
    function onMessage({ socketId, message }: { socketId: string; message: string }) {
      setPlayerMessage(socketId, message);
    }

    (socket as any).on('space:player-joined', onJoined);
    (socket as any).on('space:player-moved', onMoved);
    (socket as any).on('space:player-left', onLeft);
    (socket as any).on('space:message', onMessage);
    return () => {
      (socket as any).off('space:player-joined', onJoined);
      (socket as any).off('space:player-moved', onMoved);
      (socket as any).off('space:player-left', onLeft);
      (socket as any).off('space:message', onMessage);
    };
  }, []);

  return { ...state, join, leave, moveLocal, sendChat };
}
