import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSocialStore } from '@/store/socialStore';
import { useAuthStore } from '@/store/authStore';
import { emitWithAck } from '@/lib/socket';
import type { LobbyMessage, Res } from '@/types/index';

function AvatarBubble({ avatar, avatarUrl, size = 28 }: { avatar: string; avatarUrl?: string | null; size?: number }) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt=""
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
      />
    );
  }
  return (
    <div
      className="flex items-center justify-center rounded-full bg-white/[0.06] text-white/50 font-mono font-bold shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {avatar}
    </div>
  );
}

export function LobbyChatPanel() {
  const { lobbyChatOpen, closeLobbyChat, clearLobbyChatUnread } = useSocialStore(s => ({
    lobbyChatOpen: s.lobbyChatOpen,
    closeLobbyChat: s.closeLobbyChat,
    clearLobbyChatUnread: s.clearLobbyChatUnread,
  }));
  const msgs = useSocialStore(s => s.lobbyMessages);
  const myProfileId = useAuthStore(s => s.profile?.id);
  const isMod = useAuthStore(s => s.profile?.isModerator ?? false);

  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const loadedRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadHistory = useCallback(async () => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    try {
      const res = await emitWithAck<Record<string, never>, Res<LobbyMessage[]>>('lobby:history', {});
      if (res.ok && Array.isArray(res.data) && res.data.length > 0) {
        useSocialStore.setState(s => {
          const existing = new Set(s.lobbyMessages.map(m => m.id));
          const fresh = res.data.filter(m => !existing.has(m.id));
          return { lobbyMessages: [...fresh, ...s.lobbyMessages].slice(-100) };
        });
      }
    } catch {
      loadedRef.current = false; // allow retry on error
    }
  }, []);

  useEffect(() => {
    if (lobbyChatOpen) {
      clearLobbyChatUnread();
      loadHistory();
      setSendError('');
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [lobbyChatOpen, clearLobbyChatUnread, loadHistory]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !lobbyChatOpen) return;
    // Pin to bottom — instant on open, smooth for new messages
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (msgs.length <= 1 || isAtBottom) {
      el.scrollTop = el.scrollHeight;
    }
  }, [msgs.length, lobbyChatOpen]);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setSendError('');
    try {
      const res = await emitWithAck<{ text: string }, Res<LobbyMessage>>('lobby:send', { text: trimmed });
      if (res.ok && res.data) {
        setText('');
        useSocialStore.setState(s => {
          if (s.lobbyMessages.some(m => m.id === res.data!.id)) return {};
          return { lobbyMessages: [...s.lobbyMessages.slice(-99), res.data!] };
        });
      } else if (!res.ok) {
        setSendError(res.error ?? 'Failed to send');
      }
    } catch {
      setSendError('Connection error — try again');
    }
    setSending(false);
  };

  const handleDelete = async (msgId: string) => {
    try {
      await emitWithAck('lobby:delete_msg', { msgId });
    } catch {}
  };

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSend();
    }
  };

  const fmt = (ts: number) =>
    new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <AnimatePresence>
      {lobbyChatOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60]"
          onClick={closeLobbyChat}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" />

          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
            className="absolute bottom-0 left-0 right-0 flex flex-col"
            style={{
              height: '65vh',
              background: 'rgba(8, 4, 22, 0.98)',
              borderRadius: '20px 20px 0 0',
              borderTop: '1px solid rgba(255,255,255,0.08)',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-white/[0.06] shrink-0">
              <div className="flex-1">
                <p className="font-mono text-xs font-bold text-white/55 tracking-widest uppercase">Lobby Chat</p>
                <p className="text-[12px] font-mono text-white/22 mt-0.5">All online players</p>
              </div>
              <button
                onClick={closeLobbyChat}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-white/30 hover:text-white/60 hover:bg-white/5 transition-all"
              >
                ✕
              </button>
            </div>

            {/* Messages — pinned to bottom */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0" style={{ overflowAnchor: 'none' }}>
              {msgs.length === 0 && (
                <p className="text-center text-white/20 font-mono text-xs py-8">
                  No messages yet. Say something!
                </p>
              )}
              {msgs.map(msg => {
                const isMe = msg.profileId === myProfileId;
                return (
                  <div key={msg.id} className={`flex items-start gap-2.5 group ${isMe ? 'flex-row-reverse' : ''}`}>
                    <AvatarBubble avatar={msg.avatar} avatarUrl={msg.avatarUrl} size={30} />
                    <div className={`max-w-[72%] flex flex-col gap-0.5 ${isMe ? 'items-end' : 'items-start'}`}>
                      <div className={`flex items-center gap-1.5 ${isMe ? 'flex-row-reverse' : ''}`}>
                        <span
                          className="text-[12px] font-mono font-semibold"
                          style={{ color: msg.nameColor ?? 'rgba(255,255,255,0.4)' }}
                        >{msg.username}</span>
                        <span className="text-[12px] font-mono text-neon-cyan/30">Lv{msg.level}</span>
                        <span className="text-[12px] font-mono text-white/18">{fmt(msg.createdAt)}</span>
                        {isMod && (
                          <button
                            onClick={() => handleDelete(msg.id)}
                            className="text-[12px] font-mono text-neon-red/40 hover:text-neon-red/80 transition-colors opacity-0 group-hover:opacity-100 ml-1"
                            title="Delete message"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                      <div className={`px-3 py-2 rounded-2xl text-sm font-mono leading-snug break-anywhere ${
                        isMe
                          ? 'bg-neon-cyan/[0.12] text-neon-cyan/80 rounded-tr-sm'
                          : 'bg-white/[0.06] text-white/65 rounded-tl-sm'
                      }`}>
                        {msg.text}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="px-4 pt-3 pb-4 border-t border-white/[0.06] shrink-0">
              {sendError && (
                <p className="text-neon-red/70 font-mono text-[12px] mb-1.5 px-1">{sendError}</p>
              )}
              <div className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={text}
                  onChange={e => { setText(e.target.value); if (sendError) setSendError(''); }}
                  onKeyDown={handleKey}
                  maxLength={200}
                  placeholder="Message everyone…"
                  className="flex-1 bg-white/[0.04] border border-white/[0.07] rounded-xl px-4 py-2.5 text-white/70 placeholder-white/20 font-mono text-sm focus:outline-none focus:border-white/18 transition-colors"
                  style={{ fontSize: 16 }}
                />
                <button
                  onClick={handleSend}
                  disabled={!text.trim() || sending}
                  className="w-10 h-10 rounded-xl flex items-center justify-center bg-neon-cyan/[0.12] text-neon-cyan/70 hover:bg-neon-cyan/[0.2] hover:text-neon-cyan disabled:opacity-30 disabled:cursor-not-allowed transition-all shrink-0"
                >
                  {sending ? <span className="text-xs opacity-50">…</span> : '↑'}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
