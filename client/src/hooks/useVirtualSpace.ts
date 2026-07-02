import { useState, useCallback, useEffect, useRef } from 'react';
import { socket } from '@/lib/socket';
import { SFX } from '@/lib/audioEngine';

export type SpaceMask = 'none' | 'half' | 'full' | 'visor';

const SPACE_MAX_HP = 10; // must match the server's SPACE_MAX_HP

export interface SpacePlayer {
  socketId: string;
  name: string;
  bodyColor: string;
  glowColor: string;
  mask: SpaceMask;
  hat?: string;
  pet?: string;
  form?: string;
  profileId?: string | null;
  x: number;
  y: number;
  message?: string;
  seat?: string | null;
  gesture?: string | null;
  typing?: boolean;
  hp?: number;
}

export interface ReactionFloat {
  id: number;
  socketId: string;
  emoji: string;
}

export type Weapon = 'fist' | 'tomato' | 'snowball';
export interface Projectile {
  id: number;
  fromX: number; fromY: number;
  toX: number; toY: number;
  weapon: Weapon;
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

export interface ActiveDuel {
  aSocketId: string; aName: string;
  bSocketId: string; bName: string;
  maxHp: number;
}
export interface DuelInvite { fromSocketId: string; fromName: string }
export interface DuelResult { text: string; win: boolean; sticky?: boolean; winner?: string; loser?: string; forfeit?: boolean }

interface VirtualSpaceState {
  joined: boolean;
  mySocketId: string;
  players: Map<string, SpacePlayer>;
  chatHistory: SpaceChatMsg[];
  space: SpaceMeta | null;
  reactions: ReactionFloat[];
  projectiles: Projectile[];
  knockout: { byName: string } | null;
  ghost: boolean;
  duelInvite: DuelInvite | null;
  activeDuel: ActiveDuel | null;
  duelResult: DuelResult | null;
}

export function useVirtualSpace() {
  const [state, setState] = useState<VirtualSpaceState>({
    joined: false,
    mySocketId: '',
    players: new Map(),
    chatHistory: [],
    space: null,
    reactions: [],
    projectiles: [],
    knockout: null, ghost: false,
    duelInvite: null, activeDuel: null, duelResult: null,
  });

  const moveTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingMove = useRef<{ x: number; y: number } | null>(null);
  const msgTimers   = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const gestureTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const reactionId  = useRef(0);
  const projId      = useRef(0);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingState = useRef(false);
  const duelResultTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flashDuelResult = useCallback((text: string, win: boolean, ms: number) => {
    if (duelResultTimer.current) clearTimeout(duelResultTimer.current);
    setState(prev => ({ ...prev, duelResult: { text, win } }));
    duelResultTimer.current = setTimeout(() => setState(prev => ({ ...prev, duelResult: null })), ms);
  }, []);

  const dismissDuelInvite = useCallback(() => setState(prev => ({ ...prev, duelInvite: null })), []);
  const dismissDuelResult = useCallback(() => {
    if (duelResultTimer.current) { clearTimeout(duelResultTimer.current); duelResultTimer.current = null; }
    setState(prev => ({ ...prev, duelResult: null }));
  }, []);

  const join = useCallback(async (
    spaceId: string,
    name: string,
    bodyColor: string,
    glowColor: string,
    mask: SpaceMask,
    hat = 'none',
    pet = 'none',
    form = 'human',
  ) => {
    return new Promise<boolean>((resolve) => {
      (socket as any).emit(
        'space:join',
        { spaceId: spaceId || 'main', name, bodyColor, glowColor, mask, hat, pet, form },
        (res: any) => {
          if (!res?.ok) { resolve(false); return; }
          const players = new Map<string, SpacePlayer>();
          for (const p of res.data.players) players.set(p.socketId, p);
          setState({ joined: true, mySocketId: res.data.mySocketId, players, chatHistory: [], space: res.data.space ?? null, reactions: [], projectiles: [], knockout: null, ghost: false, duelInvite: null, activeDuel: null, duelResult: null });
          resolve(true);
        },
      );
    });
  }, []);

  const hit = useCallback((targetSocketId: string, weapon: Weapon = 'fist') => {
    (socket as any).emit('space:hit', { targetSocketId, weapon }, () => {});
  }, []);

  const challengeDuel = useCallback((targetSocketId: string) => {
    (socket as any).emit('space:duel_challenge', { targetSocketId }, (res: any) => {
      if (res?.ok) flashDuelResult('⚔️ მოწვევა გაიგზავნა', false, 2200);
      else flashDuelResult(res?.error === 'Already in a duel.' ? 'უკვე მიმდინარეობს დუელი' : 'დუელი ვერ გაიგზავნა', false, 2200);
    });
  }, [flashDuelResult]);

  const respondDuel = useCallback((fromSocketId: string, accept: boolean) => {
    setState(prev => ({ ...prev, duelInvite: null }));
    (socket as any).emit('space:duel_respond', { fromSocketId, accept }, () => {});
  }, []);

  const clearKnockout = useCallback(() => {
    setState(prev => ({ ...prev, knockout: null }));
  }, []);

  const setSpaceTheme = useCallback((theme: string) => {
    return new Promise<boolean>((resolve) => {
      (socket as any).emit('space:set_theme', { theme }, (res: any) => {
        if (res?.ok) setState(prev => prev.space ? { ...prev, space: { ...prev.space, theme } } : prev);
        resolve(!!res?.ok);
      });
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
    setState({ joined: false, mySocketId: '', players: new Map(), chatHistory: [], space: null, reactions: [], projectiles: [], knockout: null, ghost: false, duelInvite: null, activeDuel: null, duelResult: null });
  }, []);

  // Ghost observe — enter a space as an invisible owner (no avatar, no voice,
  // not a participant). Server returns the current occupants + TV/DJ state.
  const ghostJoin = useCallback((spaceId: string) => {
    return new Promise<boolean>((resolve) => {
      (socket as any).emit('space:ghost_join', { spaceId: spaceId || 'main' }, (res: any) => {
        if (!res?.ok) { resolve(false); return; }
        const players = new Map<string, SpacePlayer>();
        for (const p of res.data.players) players.set(p.socketId, p);
        setState({ joined: true, mySocketId: res.data.mySocketId, players, chatHistory: [], space: res.data.space ?? null, reactions: [], projectiles: [], knockout: null, ghost: true, duelInvite: null, activeDuel: null, duelResult: null });
        resolve(true);
      });
    });
  }, []);

  const ghostLeave = useCallback(() => {
    (socket as any).emit('space:ghost_leave');
    setState({ joined: false, mySocketId: '', players: new Map(), chatHistory: [], space: null, reactions: [], projectiles: [], knockout: null, ghost: false, duelInvite: null, activeDuel: null, duelResult: null });
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
    function onMetaUpdate(patch: { theme?: string }) {
      setState(prev => prev.space ? { ...prev, space: { ...prev.space, ...patch } } : prev);
    }
    function onHit({ targetSocketId, hp, weapon, bySocketId }: { targetSocketId: string; byName: string; hp: number; weapon?: Weapon; bySocketId?: string }) {
      if (weapon === 'tomato' || weapon === 'snowball') SFX.splat(); else SFX.punch();
      setState(prev => {
        const t = prev.players.get(targetSocketId);
        const next = new Map(prev.players);
        if (t) next.set(targetSocketId, { ...t, hp });
        // Spawn a flying projectile from attacker → target (auto-expires).
        let projectiles = prev.projectiles;
        const from = bySocketId ? prev.players.get(bySocketId) : null;
        if (from && t) {
          const id = ++projId.current;
          projectiles = [...prev.projectiles, { id, fromX: from.x, fromY: from.y, toX: t.x, toY: t.y, weapon: weapon ?? 'fist' }];
          setTimeout(() => setState(p2 => ({ ...p2, projectiles: p2.projectiles.filter(pr => pr.id !== id) })), 800);
        }
        return { ...prev, players: next, projectiles };
      });
    }
    function onKnockout({ byName }: { byName: string }) {
      // I was knocked out — drop out of the space; must re-enter.
      setState(prev => ({ ...prev, joined: false, players: new Map(), reactions: [], knockout: { byName }, duelInvite: null, activeDuel: null }));
    }

    // ── Duels ──────────────────────────────────────────────────────────
    function onDuelInvite(d: DuelInvite) {
      setState(prev => (prev.activeDuel ? prev : { ...prev, duelInvite: d }));
    }
    function onDuelStart(d: { aSocketId: string; aName: string; aHp: number; bSocketId: string; bName: string; bHp: number; maxHp: number }) {
      SFX.punch();
      setState(prev => {
        const next = new Map(prev.players);
        const a = next.get(d.aSocketId); if (a) next.set(d.aSocketId, { ...a, hp: d.aHp });
        const b = next.get(d.bSocketId); if (b) next.set(d.bSocketId, { ...b, hp: d.bHp });
        return {
          ...prev, players: next, duelInvite: null, duelResult: null,
          activeDuel: { aSocketId: d.aSocketId, aName: d.aName, bSocketId: d.bSocketId, bName: d.bName, maxHp: d.maxHp },
        };
      });
    }
    function onDuelEnd(d: { winnerName: string; loserName: string; forfeit?: boolean }) {
      setState(prev => {
        // Restore both fighters to full HP visually.
        let next = prev.players;
        if (prev.activeDuel) {
          next = new Map(prev.players);
          for (const sid of [prev.activeDuel.aSocketId, prev.activeDuel.bSocketId]) {
            const p = next.get(sid); if (p) next.set(sid, { ...p, hp: SPACE_MAX_HP });
          }
        }
        return { ...prev, players: next, activeDuel: null, duelInvite: null };
      });
      // Winner/loser card stays until the player closes it with ✕.
      if (duelResultTimer.current) { clearTimeout(duelResultTimer.current); duelResultTimer.current = null; }
      setState(prev => ({ ...prev, duelResult: { text: d.winnerName, win: true, sticky: true, winner: d.winnerName, loser: d.loserName, forfeit: d.forfeit } }));
    }
    function onDuelDeclined(d: { byName: string; expired?: boolean }) {
      flashDuelResult(d.expired ? `${d.byName}-მ ვერ მოასწრო პასუხი` : `${d.byName}-მ უარყო დუელი`, false, 2600);
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
    (socket as any).on('space:meta-update',     onMetaUpdate);
    (socket as any).on('space:hit',             onHit);
    (socket as any).on('space:knockout',        onKnockout);
    (socket as any).on('space:duel_invite',     onDuelInvite);
    (socket as any).on('space:duel_start',      onDuelStart);
    (socket as any).on('space:duel_end',        onDuelEnd);
    (socket as any).on('space:duel_declined',   onDuelDeclined);
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
      (socket as any).off('space:meta-update',     onMetaUpdate);
      (socket as any).off('space:hit',             onHit);
      (socket as any).off('space:knockout',        onKnockout);
      (socket as any).off('space:duel_invite',     onDuelInvite);
      (socket as any).off('space:duel_start',      onDuelStart);
      (socket as any).off('space:duel_end',        onDuelEnd);
      (socket as any).off('space:duel_declined',   onDuelDeclined);
      if (duelResultTimer.current) clearTimeout(duelResultTimer.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { ...state, join, leave, moveLocal, sendChat, sit, stand, react, gesture, setTyping, listSpaces, createSpace, resolveSpace, inviteToSpace, setSpaceTheme, hit, clearKnockout, challengeDuel, respondDuel, dismissDuelInvite, dismissDuelResult, ghostJoin, ghostLeave };
}
