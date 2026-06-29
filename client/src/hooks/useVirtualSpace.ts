import { useState, useCallback, useEffect, useRef } from 'react';
import { socket } from '@/lib/socket';

export type SpaceMask = 'none' | 'half' | 'full' | 'visor';

export interface SpacePlayer {
  socketId: string;
  name: string;
  bodyColor: string;
  glowColor: string;
  mask: SpaceMask;
  hat?: string;
  pet?: string;
  profileId?: string | null;
  x: number;
  y: number;
  message?: string;
  seat?: string | null;
  gesture?: string | null;
  typing?: boolean;
}

export interface ReactionFloat {
  id: number;
  socketId: string;
  emoji: string;
}

export interface SpaceChatMsg {
  socketId: string;
  name: string;
  bodyColor: string;
  glowColor: string;
  message: string;
  ts: number;
}

export interface SpaceMeta {
  id: string;
  name: string;
  icon: string;
  theme: string;
  maxPlayers: number;
  isPublic: boolean;
  ownerName: string;
  code: string;
  online: number;
  persistent: boolean;
  canControlTv?: boolean;
  layout?: string;
}

interface VirtualSpaceState {
  joined: boolean;
  mySocketId: string;
  players: Map<string, SpacePlayer>;
  chatHistory: SpaceChatMsg[];
  space: SpaceMeta | null;
  reactions: ReactionFloat[];
}

export function useVirtualSpace() {
  const [state, setState] = useState<VirtualSpaceState>({
    joined: false,
    mySocketId: '',
    players: new Map(),
    chatHistory: [],
    space: null,
    reactions: [],
  });

  const moveTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingMove = useRef<{ x: number; y: number } | null>(null);
  const msgTimers   = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const gestureTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const reactionId  = useRef(0);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingState = useRef(false);

  const join = useCallback(async (
    spaceId: string,
    name: string,
    bodyColor: string,
    glowColor: string,
    mask: SpaceMask,
    hat = 'none',
    pet = 'none',
  ) => {
    return new Promise<boolean>((resolve) => {
      (socket as any).emit(
        'space:join',
        { spaceId: spaceId || 'main', name, bodyColor, glowColor, mask, hat, pet },
        (res: any) => {
          if (!res?.ok) { resolve(false); return; }
          const players = new Map<string, SpacePlayer>();
          for (const p of res.data.players) players.set(p.socketId, p);
          setState({ joined: true, mySocketId: res.data.mySocketId, players, chatHistory: [], space: res.data.space ?? null, reactions: [] });
          resolve(true);
        },
      );
    });
  }, []);

  // ── Space management ──────────────────────────────────────────────────
  const listSpaces = useCallback(() => {
    return new Promise<SpaceMeta[]>((resolve) => {
      (socket as any).emit('space:list', (res: any) => resolve(res?.ok ? res.data : []));
    });
  }, []);

  const createSpace = useCallback((opts: { name: string; icon: string; theme: string; layout: string; maxPlayers: number; isPublic: boolean }) => {
    return new Promise<SpaceMeta | null>((resolve) => {
      (socket as any).emit('space:create', opts, (res: any) => resolve(res?.ok ? res.data.space : null));
    });
  }, []);

  const resolveSpace = useCallback((code: string) => {
    return new Promise<{ ok: boolean; space?: SpaceMeta; error?: string }>((resolve) => {
      (socket as any).emit('space:resolve', { code }, (res: any) => {
        resolve(res?.ok ? { ok: true, space: res.data.space } : { ok: false, error: res?.error ?? 'Not found' });
      });
    });
  }, []);

  const inviteToSpace = useCallback((targetProfileId: string) => {
    return new Promise<{ ok: boolean; error?: string }>((resolve) => {
      (socket as any).emit('space:invite', { targetProfileId }, (res: any) => {
        resolve(res?.ok ? { ok: true } : { ok: false, error: res?.error ?? 'Failed' });
      });
    });
  }, []);

  const leave = useCallback(() => {
    (socket as any).emit('space:leave');
    for (const t of msgTimers.current.values()) clearTimeout(t);
    msgTimers.current.clear();
    if (moveTimer.current) { clearTimeout(moveTimer.current); moveTimer.current = null; }
    setState({ joined: false, mySocketId: '', players: new Map(), chatHistory: [], space: null, reactions: [] });
  }, []);

  const sit = useCallback((myId: string, seatId: string, x: number, y: number) => {
    // Cancel any queued move — otherwise its debounced space:move fires after
    // space:sit and the server stands us back up.
    if (moveTimer.current) { clearTimeout(moveTimer.current); moveTimer.current = null; }
    pendingMove.current = null;
    setState(prev => {
      const next = new Map(prev.players);
      const me = next.get(myId);
      if (me) next.set(myId, { ...me, seat: seatId, x, y });
      return { ...prev, players: next };
    });
    (socket as any).emit('space:sit', { seatId, x, y });
  }, []);

  const stand = useCallback((myId: string) => {
    setState(prev => {
      const next = new Map(prev.players);
      const me = next.get(myId);
      if (me) next.set(myId, { ...me, seat: null });
      return { ...prev, players: next };
    });
    (socket as any).emit('space:stand');
  }, []);

  const moveLocal = useCallback((myId: string, x: number, y: number) => {
    setState(prev => {
      const next = new Map(prev.players);
      const me = next.get(myId);
      // Moving stands you up (matches server behaviour).
      if (me) next.set(myId, { ...me, x, y, seat: null });
      return { ...prev, players: next };
    });
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

  // ── Expressions ───────────────────────────────────────────────────────
  const react = useCallback((myId: string, emoji: string) => {
    (socket as any).emit('space:react', { emoji });
    spawnReaction(myId, emoji);
  }, []);

  const gesture = useCallback((myId: string, g: string) => {
    (socket as any).emit('space:gesture', { gesture: g });
    applyGesture(myId, g);
  }, []);

  const setTyping = useCallback((typing: boolean) => {
    if (typing) {
      if (!typingState.current) { typingState.current = true; (socket as any).emit('space:typing', { typing: true }); }
      if (typingTimer.current) clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => {
        typingState.current = false;
        (socket as any).emit('space:typing', { typing: false });
      }, 2500);
    } else {
      if (typingTimer.current) { clearTimeout(typingTimer.current); typingTimer.current = null; }
      if (typingState.current) { typingState.current = false; (socket as any).emit('space:typing', { typing: false }); }
    }
  }, []);

  function spawnReaction(socketId: string, emoji: string) {
    const id = ++reactionId.current;
    setState(prev => ({ ...prev, reactions: [...prev.reactions, { id, socketId, emoji }] }));
    setTimeout(() => {
      setState(prev => ({ ...prev, reactions: prev.reactions.filter(r => r.id !== id) }));
    }, 2400);
  }

  function applyGesture(socketId: string, g: string) {
    const old = gestureTimers.current.get(socketId);
    if (old) clearTimeout(old);
    setState(prev => {
      const p = prev.players.get(socketId);
      if (!p) return prev;
      const next = new Map(prev.players);
      next.set(socketId, { ...p, gesture: g });
      return { ...prev, players: next };
    });
    const timer = setTimeout(() => {
      gestureTimers.current.delete(socketId);
      setState(prev => {
        const p = prev.players.get(socketId);
        if (!p) return prev;
        const next = new Map(prev.players);
        next.set(socketId, { ...p, gesture: null });
        return { ...prev, players: next };
      });
    }, g === 'dance' ? 5000 : 2200);
    gestureTimers.current.set(socketId, timer);
  }

  function addChatMsg(socketId: string, message: string, player: SpacePlayer | undefined) {
    if (!player) return;
    const chatMsg: SpaceChatMsg = {
      socketId,
      name: player.name,
      bodyColor: player.bodyColor,
      glowColor: player.glowColor,
      message,
      ts: Date.now(),
    };
    setState(prev => ({
      ...prev,
      chatHistory: [...prev.chatHistory, chatMsg].slice(-40),
    }));
  }

  function setPlayerMessage(socketId: string, message: string) {
    const old = msgTimers.current.get(socketId);
    if (old) clearTimeout(old);
    setState(prev => {
      const next = new Map(prev.players);
      const p = prev.players.get(socketId);
      if (!p) return prev;
      next.set(socketId, { ...p, message });
      const chatMsg: SpaceChatMsg = {
        socketId,
        name: p.name,
        bodyColor: p.bodyColor,
        glowColor: p.glowColor,
        message,
        ts: Date.now(),
      };
      return { ...prev, players: next, chatHistory: [...prev.chatHistory, chatMsg].slice(-40) };
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
    function onSat({ socketId, seatId, x, y }: { socketId: string; seatId: string; x: number; y: number }) {
      setState(prev => {
        const p = prev.players.get(socketId);
        if (!p) return prev;
        const next = new Map(prev.players);
        next.set(socketId, { ...p, seat: seatId, x, y });
        return { ...prev, players: next };
      });
    }
    function onStood({ socketId }: { socketId: string }) {
      setState(prev => {
        const p = prev.players.get(socketId);
        if (!p || !p.seat) return prev;
        const next = new Map(prev.players);
        next.set(socketId, { ...p, seat: null });
        return { ...prev, players: next };
      });
    }

    function onReacted({ socketId, emoji }: { socketId: string; emoji: string }) {
      // Other players' reactions (mine were already spawned optimistically).
      if (socketId === socket.id) return;
      spawnReaction(socketId, emoji);
    }
    function onGesture({ socketId, gesture: g }: { socketId: string; gesture: string }) {
      if (socketId === socket.id) return;
      applyGesture(socketId, g);
    }
    function onTyping({ socketId, typing }: { socketId: string; typing: boolean }) {
      setState(prev => {
        const p = prev.players.get(socketId);
        if (!p) return prev;
        const next = new Map(prev.players);
        next.set(socketId, { ...p, typing });
        return { ...prev, players: next };
      });
    }

    (socket as any).on('space:player-joined', onJoined);
    (socket as any).on('space:player-moved',  onMoved);
    (socket as any).on('space:player-left',   onLeft);
    (socket as any).on('space:message',       onMessage);
    (socket as any).on('space:player-sat',    onSat);
    (socket as any).on('space:player-stood',  onStood);
    (socket as any).on('space:player-reacted', onReacted);
    (socket as any).on('space:player-gesture', onGesture);
    (socket as any).on('space:player-typing',  onTyping);
    return () => {
      (socket as any).off('space:player-joined', onJoined);
      (socket as any).off('space:player-moved',  onMoved);
      (socket as any).off('space:player-left',   onLeft);
      (socket as any).off('space:message',       onMessage);
      (socket as any).off('space:player-sat',    onSat);
      (socket as any).off('space:player-stood',  onStood);
      (socket as any).off('space:player-reacted', onReacted);
      (socket as any).off('space:player-gesture', onGesture);
      (socket as any).off('space:player-typing',  onTyping);
    };
  }, []);

  return { ...state, join, leave, moveLocal, sendChat, sit, stand, react, gesture, setTyping, listSpaces, createSpace, resolveSpace, inviteToSpace };
}
