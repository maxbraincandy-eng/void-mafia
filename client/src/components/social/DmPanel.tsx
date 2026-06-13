import { useEffect, useState, useRef, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { socket, emitWithAck } from '@/lib/socket';
import { useSocialStore } from '@/store/socialStore';
import { useAuthStore } from '@/store/authStore';
import type { DmConversation, DirectMessage, Res } from '@/types/index';

// Swipeable row: swipe left to reveal delete button
function SwipeableRow({
  children,
  onDelete,
}: {
  children: React.ReactNode;
  onDelete: () => void;
}) {
  const [swipeX, setSwipeX] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const startX = useRef(0);
  const DELETE_THRESHOLD = 72;

  const onTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    setConfirming(false);
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const delta = startX.current - e.touches[0].clientX;
    setSwipeX(Math.max(0, Math.min(delta, DELETE_THRESHOLD)));
  };
  const onTouchEnd = () => {
    if (swipeX >= DELETE_THRESHOLD) {
      setConfirming(true);
      setSwipeX(DELETE_THRESHOLD);
    } else {
      setSwipeX(0);
    }
  };
  const cancel = () => { setSwipeX(0); setConfirming(false); };

  return (
    <div className="relative overflow-hidden border-b border-white/[0.04]">
      {/* Delete button revealed behind */}
      <div
        className="absolute right-0 top-0 bottom-0 flex items-center justify-end pr-2"
        style={{ width: DELETE_THRESHOLD }}
      >
        {confirming ? (
          <div className="flex gap-1">
            <button
              onClick={cancel}
              className="px-2 py-1 text-[10px] font-mono text-white/40 border border-white/10 rounded-lg"
            >
              Cancel
            </button>
            <button
              onClick={onDelete}
              className="px-2 py-1 text-[10px] font-mono text-neon-pink border border-neon-pink/30 bg-neon-pink/10 rounded-lg"
            >
              Delete
            </button>
          </div>
        ) : (
          <span className="text-neon-pink/70 text-base">🗑</span>
        )}
      </div>
      {/* Sliding content */}
      <div
        style={{ transform: `translateX(-${swipeX}px)`, transition: swipeX === 0 ? 'transform 0.2s ease' : 'none' }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {children}
      </div>
    </div>
  );
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function ChatIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

export function DmPanel() {
  const { dmPanelOpen, activeDmUserId, closeDm, setUnreadDmCount, openProfile } = useSocialStore();
  const myProfileId = useAuthStore(s => s.profile?.id);

  const [conversations, setConversations] = useState<DmConversation[]>([]);
  const [unreadCounts, setUnreadCounts] = useState<Map<string, number>>(new Map());
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [activeUsername, setActiveUsername] = useState('');
  const [activeAvatar, setActiveAvatar] = useState('');
  const [activeAvatarUrl, setActiveAvatarUrl] = useState<string | null>(null);
  const [activeOtherProfileId, setActiveOtherProfileId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [loadingConvs, setLoadingConvs] = useState(false);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [convError, setConvError] = useState<string | null>(null);
  const [msgError, setMsgError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const refreshUnreadCount = useCallback(async () => {
    try {
      const res = await emitWithAck<void, Res<number>>('dm:unread_count');
      if (res.ok) setUnreadDmCount(res.data);
    } catch {}
  }, [setUnreadDmCount]);

  const loadConversations = useCallback(async () => {
    setLoadingConvs(true);
    setConvError(null);
    try {
      const res = await emitWithAck<void, Res<DmConversation[]>>('dm:list');
      if (res.ok) {
        setConversations(res.data ?? []);
      } else {
        setConvError(res.error ?? 'Failed to load conversations');
      }
    } catch (e: any) {
      setConvError(e.message ?? 'Connection error — tap to retry');
    } finally {
      setLoadingConvs(false);
    }
  }, []);

  const openConversation = useCallback(async (convId: string, username: string, avatar: string, profileId?: string | null, avatarUrl?: string | null) => {
    setActiveConvId(convId);
    setActiveUsername(username);
    setActiveAvatar(avatar);
    setActiveAvatarUrl(avatarUrl ?? null);
    setActiveOtherProfileId(profileId ?? null);
    setUnreadCounts(prev => { const m = new Map(prev); m.delete(convId); return m; });
    setMsgError(null);
    setLoadingMsgs(true);
    try {
      const res = await emitWithAck<{ conversationId: string }, Res<DirectMessage[]>>('dm:messages', { conversationId: convId });
      if (res.ok) {
        setMessages(res.data ?? []);
      } else {
        setMsgError(res.error ?? 'Failed to load messages');
      }
    } catch (e: any) {
      setMsgError(e.message ?? 'Connection error');
    } finally {
      setLoadingMsgs(false);
    }
    try {
      await emitWithAck('dm:mark_read', { conversationId: convId });
      await refreshUnreadCount();
    } catch {}
    setConversations(prev => prev.map(c => c.id === convId ? { ...c, unread: false } : c));
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [refreshUnreadCount]);

  // Start DM with specific user
  useEffect(() => {
    if (!activeDmUserId || !dmPanelOpen) return;
    (async () => {
      try {
        const res = await emitWithAck<
          { profileId: string },
          Res<{ id: string; otherUsername: string; otherAvatar: string; messages: DirectMessage[] }>
        >('dm:start', { profileId: activeDmUserId });
        if (res.ok) {
          setActiveConvId(res.data.id);
          setActiveUsername(res.data.otherUsername);
          setActiveAvatar(res.data.otherAvatar);
          setActiveAvatarUrl((res.data as any).otherAvatarUrl ?? null);
          setActiveOtherProfileId(activeDmUserId);
          setMessages(res.data.messages ?? []);
          setMsgError(null);
          try {
            await emitWithAck('dm:mark_read', { conversationId: res.data.id });
            await refreshUnreadCount();
            await loadConversations();
          } catch {}
        } else {
          setMsgError(res.error ?? 'Failed to open conversation');
        }
      } catch (e: any) {
        setMsgError(e.message ?? 'Connection error');
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDmUserId, dmPanelOpen]);

  // Load conversation list when panel opens to list view
  useEffect(() => {
    if (dmPanelOpen && !activeDmUserId) {
      setActiveConvId(null);
      setMessages([]);
      loadConversations();
      refreshUnreadCount();
    }
    if (!dmPanelOpen) {
      setActiveConvId(null);
      setMessages([]);
      setConvError(null);
      setMsgError(null);
      setUnreadCounts(new Map());
    }
  }, [dmPanelOpen, activeDmUserId, loadConversations, refreshUnreadCount]);

  // Real-time messages while panel is open
  useEffect(() => {
    if (!dmPanelOpen) return;
    const handler = ({ conversationId: convId, message }: { conversationId: string; message: DirectMessage }) => {
      if (convId === activeConvId) {
        setMessages(prev => [...prev, message]);
        emitWithAck('dm:mark_read', { conversationId: convId }).catch(() => {});
        refreshUnreadCount();
      } else {
        setConversations(prev => {
          const exists = prev.some(c => c.id === convId);
          if (exists) {
            return prev.map(c => c.id === convId
              ? { ...c, unread: true, lastMessage: message.text, lastMessageAt: message.createdAt }
              : c);
          }
          loadConversations();
          return prev;
        });
        setUnreadCounts(prev => new Map(prev).set(convId, (prev.get(convId) ?? 0) + 1));
      }
    };
    socket.on('dm:new_message', handler);
    return () => { socket.off('dm:new_message', handler); };
  }, [dmPanelOpen, activeConvId, refreshUnreadCount, loadConversations]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!text.trim() || !activeConvId || sending) return;
    setSending(true);
    const t = text.trim();
    setText('');
    try {
      const res = await emitWithAck<{ conversationId: string; text: string }, Res<DirectMessage>>(
        'dm:send', { conversationId: activeConvId, text: t }
      );
      if (res.ok) {
        setMessages(prev => [...prev, res.data]);
        setConversations(prev => prev.map(c =>
          c.id === activeConvId ? { ...c, lastMessage: t, lastMessageAt: res.data.createdAt } : c
        ));
      } else {
        setText(t);
      }
    } catch {
      setText(t);
    } finally {
      setSending(false);
    }
    inputRef.current?.focus();
  };

  const handleBack = () => {
    setActiveConvId(null);
    setMessages([]);
    setMsgError(null);
    loadConversations();
  };

  const handleDeleteConversation = async (convId: string) => {
    try {
      await emitWithAck('dm:delete', { conversationId: convId });
    } catch {}
    setConversations(prev => prev.filter(c => c.id !== convId));
    setUnreadCounts(prev => { const m = new Map(prev); m.delete(convId); return m; });
    await refreshUnreadCount();
  };

  return (
    <AnimatePresence>
      {dmPanelOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm"
          onClick={closeDm}
        >
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="absolute right-0 top-0 bottom-0 w-full max-w-sm flex flex-col"
            style={{ background: 'rgba(8,5,20,0.97)', borderLeft: '1px solid rgba(138,43,226,0.2)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5 flex-shrink-0">
              {activeConvId ? (
                <button
                  onClick={handleBack}
                  className="text-white/40 hover:text-white/70 transition-colors text-lg leading-none mr-1"
                >
                  ←
                </button>
              ) : null}
              {activeConvId && (activeAvatar || activeAvatarUrl) ? (
                <button
                  className="w-7 h-7 rounded-full flex items-center justify-center text-sm shrink-0 overflow-hidden hover:ring-2 ring-neon-purple/60 transition-all"
                  style={{ background: 'linear-gradient(135deg, #ff0080, #8a2be2)' }}
                  onClick={() => activeOtherProfileId && openProfile(activeOtherProfileId)}
                  title={`View ${activeUsername}'s profile`}
                >
                  {activeAvatarUrl
                    ? <img src={activeAvatarUrl} alt={activeUsername} className="w-full h-full object-cover rounded-full" />
                    : activeAvatar
                  }
                </button>
              ) : (
                !activeConvId && (
                  <span className="text-neon-purple/60">
                    <ChatIcon size={18} />
                  </span>
                )
              )}
              <div className="flex-1 min-w-0">
                {activeConvId && activeOtherProfileId ? (
                  <button
                    className="font-display font-bold text-sm text-white tracking-wide truncate hover:text-neon-purple/90 transition-colors text-left"
                    onClick={() => openProfile(activeOtherProfileId)}
                  >
                    {activeUsername}
                  </button>
                ) : (
                  <h3 className="font-display font-bold text-sm text-white tracking-wide truncate">
                    {activeConvId ? activeUsername : 'MESSAGES'}
                  </h3>
                )}
              </div>
              <button
                onClick={closeDm}
                className="text-white/30 hover:text-white/60 transition-colors text-lg leading-none"
              >
                ✕
              </button>
            </div>

            {/* Conversation list */}
            {!activeConvId ? (
              <div className="flex-1 overflow-y-auto">
                {loadingConvs ? (
                  <div className="flex justify-center py-10">
                    <div className="w-5 h-5 border-2 border-neon-purple/40 border-t-neon-purple rounded-full animate-spin" />
                  </div>
                ) : convError ? (
                  <div className="text-center py-14 px-4">
                    <p className="text-white/25 font-mono text-xs mb-3">{convError}</p>
                    <button
                      onClick={loadConversations}
                      className="px-4 py-2 rounded-xl border border-neon-purple/30 text-neon-purple/70 font-mono text-xs hover:bg-neon-purple/10 transition-colors"
                    >
                      Retry
                    </button>
                  </div>
                ) : conversations.length === 0 ? (
                  <div className="text-center py-14 px-4">
                    <div className="flex justify-center mb-3 opacity-15">
                      <ChatIcon size={40} />
                    </div>
                    <p className="text-white/20 font-mono text-sm">No messages yet.</p>
                    <p className="text-white/10 font-mono text-xs mt-1">
                      Open a player profile and tap Message
                    </p>
                  </div>
                ) : (
                  <div>
                    {conversations.map(conv => {
                      const count = unreadCounts.get(conv.id) ?? 0;
                      const hasUnread = conv.unread || count > 0;
                      return (
                        <SwipeableRow
                          key={conv.id}
                          onDelete={() => handleDeleteConversation(conv.id)}
                        >
                          <div className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-white/[0.03] transition-colors bg-transparent">
                            {/* Avatar — tap to view profile */}
                            <button
                              className="relative shrink-0 group"
                              onClick={() => openProfile(conv.otherUserId)}
                              title={`View ${conv.otherUsername}'s profile`}
                            >
                              <div
                                className="w-10 h-10 rounded-full flex items-center justify-center text-lg overflow-hidden ring-0 group-hover:ring-2 ring-neon-purple/50 transition-all"
                                style={{ background: 'linear-gradient(135deg, #ff0080, #8a2be2)' }}
                              >
                                {conv.otherAvatarUrl
                                  ? <img src={conv.otherAvatarUrl} alt={conv.otherUsername} className="w-full h-full object-cover rounded-full" />
                                  : conv.otherAvatar
                                }
                              </div>
                            </button>
                            {/* Text area — tap to open chat */}
                            <button
                              className="flex-1 min-w-0 text-left"
                              onClick={() => openConversation(conv.id, conv.otherUsername, conv.otherAvatar, conv.otherUserId, conv.otherAvatarUrl)}
                            >
                              <div className="flex items-center justify-between mb-0.5">
                                <p className={`font-display font-semibold text-sm truncate ${hasUnread ? 'text-white' : 'text-white/55'}`}>
                                  {conv.otherUsername}
                                </p>
                                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                                  {count > 0 ? (
                                    <span
                                      className="min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center text-[10px] font-mono font-bold"
                                      style={{
                                        background: 'rgba(255,0,204,0.8)',
                                        color: '#fff',
                                        boxShadow: '0 0 6px rgba(255,0,204,0.5)',
                                      }}
                                    >
                                      {count > 99 ? '99+' : count}
                                    </span>
                                  ) : conv.unread ? (
                                    <span className="w-2 h-2 rounded-full bg-neon-pink" />
                                  ) : null}
                                  {conv.lastMessageAt && (
                                    <span className="text-white/20 font-mono text-[9px]">
                                      {formatTime(conv.lastMessageAt)}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <p className={`font-mono text-[11px] truncate ${hasUnread ? 'text-white/50' : 'text-white/20'}`}>
                                {conv.lastMessage ?? 'No messages yet'}
                              </p>
                            </button>
                          </div>
                        </SwipeableRow>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              /* Chat view */
              <>
                <div className="flex-1 overflow-y-auto p-4 space-y-2 min-h-0">
                  {loadingMsgs ? (
                    <div className="flex justify-center py-10">
                      <div className="w-5 h-5 border-2 border-neon-purple/40 border-t-neon-purple rounded-full animate-spin" />
                    </div>
                  ) : msgError ? (
                    <div className="text-center py-10">
                      <p className="text-white/25 font-mono text-xs mb-3">{msgError}</p>
                      <button
                        onClick={() => openConversation(activeConvId, activeUsername, activeAvatar, activeOtherProfileId, activeAvatarUrl)}
                        className="px-4 py-2 rounded-xl border border-neon-purple/30 text-neon-purple/70 font-mono text-xs hover:bg-neon-purple/10 transition-colors"
                      >
                        Retry
                      </button>
                    </div>
                  ) : messages.length === 0 ? (
                    <p className="text-center text-white/15 font-mono text-xs pt-10">
                      Say hello!
                    </p>
                  ) : (
                    messages.map(msg => {
                      const isMe = msg.senderId === myProfileId;
                      return (
                        <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                          <div
                            className={`max-w-[78%] px-3 py-2 rounded-2xl text-sm font-mono break-words ${
                              isMe
                                ? 'rounded-br-sm'
                                : 'rounded-bl-sm'
                            }`}
                            style={isMe ? {
                              background: 'rgba(138,43,226,0.2)',
                              border: '1px solid rgba(138,43,226,0.3)',
                              color: '#ffffff',
                            } : {
                              background: 'rgba(255,255,255,0.07)',
                              border: '1px solid rgba(255,255,255,0.08)',
                              color: 'rgba(255,255,255,0.82)',
                            }}
                          >
                            <p>{msg.text}</p>
                            <p className={`text-[9px] mt-1 ${isMe ? 'text-right' : ''}`}
                               style={{ color: 'rgba(255,255,255,0.22)' }}>
                              {formatTime(msg.createdAt)}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={bottomRef} />
                </div>

                {/* Input bar — uses inline styles to override iOS Safari defaults */}
                <div
                  className="flex gap-2 px-3 pt-2 border-t border-white/5 flex-shrink-0"
                  style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}
                >
                  <input
                    ref={inputRef}
                    value={text}
                    onChange={e => setText(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
                    }}
                    placeholder="Message…"
                    maxLength={500}
                    className="flex-1 rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none transition-all"
                    style={{
                      background: 'rgba(12, 5, 28, 0.95)',
                      border: '1px solid rgba(138,43,226,0.25)',
                      color: '#ffffff',
                      WebkitTextFillColor: '#ffffff',
                      caretColor: '#c084fc',
                      colorScheme: 'dark',
                    }}
                    onFocus={e => {
                      (e.target as HTMLInputElement).style.borderColor = 'rgba(138,43,226,0.55)';
                    }}
                    onBlur={e => {
                      (e.target as HTMLInputElement).style.borderColor = 'rgba(138,43,226,0.25)';
                    }}
                  />
                  <button
                    onClick={handleSend}
                    disabled={!text.trim() || sending}
                    className="px-3 py-2.5 rounded-xl font-mono text-sm transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center"
                    style={{
                      background: 'rgba(138,43,226,0.2)',
                      border: '1px solid rgba(138,43,226,0.35)',
                      color: '#c084fc',
                      minWidth: '2.5rem',
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="22" y1="2" x2="11" y2="13" />
                      <polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
