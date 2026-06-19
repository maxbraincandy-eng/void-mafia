import { useState, useEffect, useRef, useCallback } from 'react';
import { socket, emitWithAck } from '@/lib/socket';
import { useAuthStore } from '@/store/authStore';
import type { SpecMessage } from '@/types/index';
import type { PlayerPublic, RoomPublic } from '@/types/index';

interface Props {
  room: RoomPublic;
  myPlayer: PlayerPublic | null;
}

type PanelTab = 'chat' | 'suspicion';

export function SpectatorTheaterPanel({ room, myPlayer }: Props) {
  const [tab, setTab] = useState<PanelTab>('chat');
  const [collapsed, setCollapsed] = useState(false);
  const [messages, setMessages] = useState<SpecMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [myVote, setMyVote] = useState<string | null>(null);
  const [voting, setVoting] = useState(false);
  const [roleReveals, setRoleReveals] = useState<Record<string, string> | null>(null);
  const [unreadChat, setUnreadChat] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const profileId = useAuthStore(s => s.profile?.id ?? null);

  const isGameActive = room.phase !== 'lobby' && room.phase !== 'game_over';
  const isGameOver = room.phase === 'game_over';
  const alivePlayers = room.players.filter(p => !p.isSpectator && p.isAlive);

  // Listen for spec:message
  useEffect(() => {
    const handler = (msg: SpecMessage) => {
      setMessages(prev => [...prev, msg]);
      if (tab !== 'chat') setUnreadChat(n => n + 1);
    };
    socket.on('spec:message' as any, handler);
    return () => { socket.off('spec:message' as any, handler); };
  }, [tab]);

  // Listen for spec:game_over
  useEffect(() => {
    const handler = (data: { roleReveals: Record<string, string> }) => {
      setRoleReveals(data.roleReveals);
      setTab('suspicion');
    };
    socket.on('spec:game_over' as any, handler);
    return () => { socket.off('spec:game_over' as any, handler); };
  }, []);

  // Clear unread when switching to chat tab
  useEffect(() => {
    if (tab === 'chat') setUnreadChat(0);
  }, [tab]);

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setInput('');
    try {
      await emitWithAck('spec:chat' as any, { roomId: room.id, text });
    } catch { /* ignore */ } finally {
      setSending(false);
    }
  }, [input, sending, room.id]);

  const castVote = useCallback(async (playerId: string) => {
    if (myVote || voting) return;
    setVoting(true);
    try {
      const res = await emitWithAck('spec:vote_suspect' as any, { roomId: room.id, suspectedPlayerId: playerId });
      if ((res as any).ok) setMyVote(playerId);
    } catch { /* ignore */ } finally {
      setVoting(false);
    }
  }, [myVote, voting, room.id]);

  // Determine if a role is mafia-faction
  const isMafiaRole = (role: string) =>
    ['mafia', 'don', 'godfather'].includes(role);

  // Find player name by id from room
  const getPlayerName = (pid: string) =>
    room.players.find(p => p.id === pid)?.name ?? pid;

  return (
    <div
      className="rounded-xl overflow-hidden flex flex-col"
      style={{
        background: 'rgba(3,0,13,0.95)',
        border: '1px solid rgba(0,229,255,0.15)',
        boxShadow: '0 0 20px rgba(0,229,255,0.06)',
        maxHeight: collapsed ? 'auto' : '40vh',
      }}
    >
      {/* Header */}
      <button
        onClick={() => setCollapsed(c => !c)}
        className="flex items-center gap-2 px-3 py-2 flex-shrink-0 w-full text-left"
        style={{ borderBottom: collapsed ? 'none' : '1px solid rgba(0,229,255,0.08)' }}
      >
        <span className="text-xs" style={{ filter: 'drop-shadow(0 0 4px rgba(0,229,255,0.8))' }}>👁</span>
        <span className="font-mono text-[12px] tracking-[0.25em] uppercase flex-1"
          style={{ color: 'rgba(0,229,255,0.7)' }}>
          Spec Theater
        </span>
        <span className="text-[12px] font-mono text-white/25">{collapsed ? '▼' : '▲'}</span>
      </button>

      {!collapsed && (
        <>
          {/* Tabs */}
          <div className="flex gap-1 p-2 flex-shrink-0">
            {(['chat', 'suspicion'] as PanelTab[]).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="flex-1 py-1 rounded-lg text-[12px] font-mono font-bold tracking-widest uppercase transition-all relative"
                style={{
                  background: tab === t ? 'rgba(0,229,255,0.08)' : 'transparent',
                  border: tab === t ? '1px solid rgba(0,229,255,0.25)' : '1px solid rgba(255,255,255,0.06)',
                  color: tab === t ? 'rgba(0,229,255,0.85)' : 'rgba(255,255,255,0.3)',
                }}
              >
                {t === 'chat' ? '💬 Chat' : '🔍 Suspicion'}
                {t === 'chat' && unreadChat > 0 && (
                  <span
                    className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[12px] flex items-center justify-center font-bold"
                    style={{ background: 'rgba(0,229,255,1)', color: '#03000d' }}
                  >
                    {unreadChat > 9 ? '9+' : unreadChat}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Chat Tab */}
          {tab === 'chat' && (
            <div className="flex flex-col flex-1 min-h-0" style={{ minHeight: 0 }}>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-2 pb-1 space-y-1" style={{ minHeight: '80px', maxHeight: '160px' }}>
                {messages.length === 0 && (
                  <p className="text-[12px] font-mono text-white/20 text-center py-4">
                    No messages yet. Spec chat is private to spectators.
                  </p>
                )}
                {messages.map(msg => (
                  <div key={msg.id} className="flex flex-col gap-0.5">
                    <span
                      className="text-[12px] font-mono font-bold"
                      style={{ color: msg.senderId === (profileId ?? '') ? 'rgba(138,43,226,0.9)' : 'rgba(0,229,255,0.7)' }}
                    >
                      {msg.senderName}
                    </span>
                    <span className="text-[12px] font-mono text-white/60 leading-snug">{msg.text}</span>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
              {/* Input */}
              <div className="flex gap-1.5 p-2 flex-shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendMessage()}
                  maxLength={200}
                  placeholder="Spec chat..."
                  className="flex-1 rounded-lg px-2.5 py-1.5 text-[11px] font-mono text-white placeholder-white/20 outline-none"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(0,229,255,0.12)',
                  }}
                />
                <button
                  onClick={sendMessage}
                  disabled={!input.trim() || sending}
                  className="px-2.5 py-1.5 rounded-lg text-[12px] font-mono font-bold transition-all disabled:opacity-30"
                  style={{
                    background: 'rgba(0,229,255,0.1)',
                    border: '1px solid rgba(0,229,255,0.25)',
                    color: 'rgba(0,229,255,0.85)',
                  }}
                >
                  ↑
                </button>
              </div>
            </div>
          )}

          {/* Suspicion Tab */}
          {tab === 'suspicion' && (
            <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-2" style={{ maxHeight: '200px' }}>
              {/* Post-game results */}
              {isGameOver && roleReveals ? (
                <div className="space-y-1.5">
                  <p className="text-[12px] font-mono tracking-widest uppercase text-white/30 pt-1">Game Over — Role Reveals</p>
                  {room.players.filter(p => !p.isSpectator).map(p => {
                    const role = roleReveals[p.id];
                    const wasMafia = role ? isMafiaRole(role) : false;
                    const votedFor = myVote === p.id;
                    return (
                      <div key={p.id} className="flex items-center gap-2 px-2 py-1 rounded-lg"
                        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <span className={`text-[12px] font-mono flex-1 ${p.isAlive ? 'text-white/60' : 'text-white/30 line-through'}`}>{p.name}</span>
                        <span className="text-[12px] font-mono px-1.5 py-0.5 rounded"
                          style={{
                            background: wasMafia ? 'rgba(255,30,60,0.12)' : 'rgba(0,255,136,0.08)',
                            color: wasMafia ? 'rgba(255,30,60,0.85)' : 'rgba(0,255,136,0.7)',
                          }}>
                          {role ?? '?'}
                        </span>
                        {votedFor && (
                          <span className="text-[11px]">{wasMafia ? '✓' : '✗'}</span>
                        )}
                      </div>
                    );
                  })}
                  {myVote && (
                    <p className="text-[12px] font-mono text-white/30 text-center pt-1">
                      Your pick: {getPlayerName(myVote)} — {roleReveals[myVote] ? (isMafiaRole(roleReveals[myVote]) ? '✓ Correct!' : '✗ Wrong') : '?'}
                    </p>
                  )}
                </div>
              ) : isGameActive ? (
                /* During game: vote UI */
                <div className="space-y-1.5">
                  <p className="text-[12px] font-mono tracking-widest uppercase text-white/30 pt-1">
                    {myVote ? '✓ Voted — results after game' : 'Who do you think is Mafia?'}
                  </p>
                  {alivePlayers.map(p => (
                    <button
                      key={p.id}
                      disabled={!!myVote || voting}
                      onClick={() => castVote(p.id)}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[12px] font-mono transition-all disabled:opacity-60 text-left"
                      style={{
                        background: myVote === p.id ? 'rgba(138,43,226,0.15)' : 'rgba(255,255,255,0.03)',
                        border: myVote === p.id ? '1px solid rgba(138,43,226,0.4)' : '1px solid rgba(255,255,255,0.07)',
                        color: myVote === p.id ? 'rgba(138,43,226,0.9)' : 'rgba(255,255,255,0.5)',
                      }}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${p.isAlive ? 'bg-neon-green' : 'bg-white/20'}`} />
                      <span className="flex-1">{p.name}</span>
                      {myVote === p.id && <span>✓</span>}
                    </button>
                  ))}
                  {alivePlayers.length === 0 && (
                    <p className="text-[12px] font-mono text-white/20 text-center py-2">No alive players</p>
                  )}
                </div>
              ) : (
                <p className="text-[12px] font-mono text-white/20 text-center py-4">
                  Suspicion voting available during active game.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
