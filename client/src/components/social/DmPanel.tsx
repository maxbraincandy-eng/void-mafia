import { useEffect, useState, useRef, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { socket, emitWithAck } from '@/lib/socket';
import { useSocialStore } from '@/store/socialStore';
import { useAuthStore } from '@/store/authStore';
import type { DmConversation, DirectMessage, Res } from '@/types/index';

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
  const { dmPanelOpen, activeDmUserId, closeDm, setUnreadDmCount } = useSocialStore();
  const myProfileId = useAuthStore(s => s.profile?.id);

  const [conversations, setConversations] = useState<DmConversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [activeUsername, setActiveUsername] = useState('');
  const [activeAvatar, setActiveAvatar] = useState('');
  const [activeAvatarUrl, setActiveAvatarUrl] = useState<string | null>(null);
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

  const openConversation = useCallback(async (convId: string, username: string, avatar: string, avatarUrl?: string | null) => {
    setActiveConvId(convId);
    setActiveUsername(username);
    setActiveAvatar(avatar);
    setActiveAvatarUrl(avatarUrl ?? null);
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
          // New conversation not in list yet — reload
          loadConversations();
          return prev;
        });
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
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-sm shrink-0 overflow-hidden"
                  style={{ background: 'linear-gradient(135deg, #ff0080, #8a2be2)' }}
                >
                  {activeAvatarUrl
                    ? <img src={activeAvatarUrl} alt={activeUsername} className="w-full h-full object-cover rounded-full" />
                    : activeAvatar
                  }
                </div>
              ) : (
                !activeConvId && (
                  <span className="text-neon-purple/60">
                    <ChatIcon size={18} />
                  </span>
                )
              )}
              <div className="flex-1 min-w-0">
                <h3 className="font-display font-bold text-sm text-white tracking-wide truncate">
                  {activeConvId ? activeUsername : 'MESSAGES'}
                </h3>
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
                    {conversations.map(conv => (
                      <button
                        key={conv.id}
                        onClick={() => openConversation(conv.id, conv.otherUsername, conv.otherAvatar, conv.otherAvatarUrl)}
                        className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-white/[0.03] transition-colors text-left border-b border-white/[0.04]"
                      >
                        <div className="relative shrink-0">
                          <div
                            className="w-10 h-10 rounded-full flex items-center justify-center text-lg overflow-hidden"
                            style={{ background: 'linear-gradient(135deg, #ff0080, #8a2be2)' }}
                          >
                            {conv.otherAvatarUrl
                              ? <img src={conv.otherAvatarUrl} alt={conv.otherUsername} className="w-full h-full object-cover rounded-full" />
                              : conv.otherAvatar
                            }
                          </div>
                          {conv.unread && (
                            <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-neon-pink rounded-full border-2 border-void" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-0.5">
                            <p className={`font-display font-semibold text-sm truncate ${conv.unread ? 'text-white' : 'text-white/55'}`}>
                              {conv.otherUsername}
                            </p>
                            {conv.lastMessageAt && (
                              <span className="text-white/20 font-mono text-[9px] shrink-0 ml-2">
                                {formatTime(conv.lastMessageAt)}
                              </span>
                            )}
                          </div>
                          <p className={`font-mono text-[11px] truncate ${conv.unread ? 'text-white/50' : 'text-white/20'}`}>
                            {conv.lastMessage ?? 'No messages yet'}
                          </p>
                        </div>
                      </button>
                    ))}
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
                        onClick={() => openConversation(activeConvId, activeUsername, activeAvatar, activeAvatarUrl)}
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
