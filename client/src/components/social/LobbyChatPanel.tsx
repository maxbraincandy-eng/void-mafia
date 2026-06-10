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

  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadHistory = useCallback(async () => {
    if (loaded) return;
    try {
      const res = await emitWithAck<Record<string, never>, Res<LobbyMessage[]>>('lobby:history', {});
      if (res.ok && res.data) {
        useSocialStore.setState(s => {
          const existing = new Set(s.lobbyMessages.map(m => m.id));
          const fresh = (res.data as LobbyMessage[]).filter(m => !existing.has(m.id));
          return { lobbyMessages: [...fresh, ...s.lobbyMessages].slice(-100) };
        });
      }
    } catch {}
    setLoaded(true);
  }, [loaded]);

  useEffect(() => {
    if (lobbyChatOpen) {
      clearLobbyChatUnread();
      loadHistory();
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [lobbyChatOpen]);

  useEffect(() => {
    if (lobbyChatOpen) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [msgs.length, lobbyChatOpen]);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setText('');
    try {
      await emitWithAck('lobby:send', { text: trimmed });
    } catch {}
    setSending(false);
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const fmt = (ts: number) =>
    new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <AnimatePresence>
      {lobbyChatOpen && (
        // Full-screen overlay at z-[60] — above the bottom nav (z-50)
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60]"
          onClick={closeLobbyChat}
        >
          {/* Backdrop blur */}
          <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" />

          {/* Sheet — slides up from bottom, covers 65% of screen */}
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
                <p className="text-[10px] font-mono text-white/22 mt-0.5">All online players</p>
              </div>
              <button
                onClick={closeLobbyChat}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-white/30 hover:text-white/60 hover:bg-white/5 transition-all"
              >
                ✕
              </button>
            </div>

            {/* Messages — flex-1 with min-h-0 so input is never pushed out */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
              {msgs.length === 0 && (
                <p className="text-center text-white/20 font-mono text-xs py-8">
                  No messages yet. Say something!
                </p>
              )}
              {msgs.map(msg => {
                const isMe = msg.profileId === myProfileId;
                return (
                  <div key={msg.id} className={`flex items-start gap-2.5 ${isMe ? 'flex-row-reverse' : ''}`}>
                    <AvatarBubble avatar={msg.avatar} avatarUrl={msg.avatarUrl} size={30} />
                    <div className={`max-w-[72%] flex flex-col gap-0.5 ${isMe ? 'items-end' : 'items-start'}`}>
                      <div className={`flex items-center gap-1.5 ${isMe ? 'flex-row-reverse' : ''}`}>
                        <span className="text-[10px] font-mono text-white/40">{msg.username}</span>
                        <span className="text-[9px] font-mono text-neon-cyan/30">Lv{msg.level}</span>
                        <span className="text-[9px] font-mono text-white/18">{fmt(msg.createdAt)}</span>
                      </div>
                      <div className={`px-3 py-2 rounded-2xl text-sm font-mono leading-snug ${
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

            {/* Input — always visible, shrink-0 */}
            <div
              className="px-4 pt-3 pb-4 border-t border-white/[0.06] shrink-0"
              style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom, 16px))' }}
            >
              <div className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={text}
                  onChange={e => setText(e.target.value)}
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
                  ↑
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
