import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { socket, emitWithAck } from '@/lib/socket';
import { useAuthStore } from '@/store/authStore';
import { getNameColorById } from '@/constants/cosmetics';
import type { Res } from '@/types/index';

type ClanMsg = {
  id: string; clanId: string; profileId: string; username: string;
  avatar: string; avatarUrl: string | null; text: string;
  level: number; nameColor: string | null; createdAt: number;
};

function AvatarBubble({ avatar, avatarUrl, size = 30 }: { avatar: string; avatarUrl?: string | null; size?: number }) {
  if (avatarUrl) {
    return <img src={avatarUrl} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />;
  }
  return (
    <div className="flex items-center justify-center rounded-full bg-white/[0.06] text-white/50 font-mono font-bold shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {avatar}
    </div>
  );
}

export function ClanChatPanel({ open, onClose, clanName, isLeader }: {
  open: boolean;
  onClose: () => void;
  clanName: string;
  isLeader: boolean;
}) {
  const myProfileId = useAuthStore(s => s.profile?.id);
  const isMod = useAuthStore(s => s.profile?.isModerator ?? false);

  const [msgs, setMsgs] = useState<ClanMsg[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Join the clan chat room on open, leave on close; subscribe to live events.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setSendError('');
    emitWithAck<undefined, Res<ClanMsg[]>>('clan:chat_join')
      .then(res => { if (alive && res.ok) setMsgs(res.data); })
      .catch(() => {});
    const onMsg = (m: ClanMsg) => setMsgs(prev => prev.some(x => x.id === m.id) ? prev : [...prev.slice(-99), m]);
    const onDel = ({ msgId }: { msgId: string }) => setMsgs(prev => prev.filter(m => m.id !== msgId));
    (socket as any).on('clan:message', onMsg);
    (socket as any).on('clan:msg_deleted', onDel);
    setTimeout(() => inputRef.current?.focus(), 300);
    return () => {
      alive = false;
      (socket as any).off('clan:message', onMsg);
      (socket as any).off('clan:msg_deleted', onDel);
      (socket as any).emit('clan:chat_leave', () => {});
    };
  }, [open]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !open) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (msgs.length <= 1 || atBottom) el.scrollTop = el.scrollHeight;
  }, [msgs.length, open]);

  const handleSend = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setSendError('');
    try {
      const res = await emitWithAck<{ text: string }, Res<ClanMsg>>('clan:chat_send', { text: trimmed });
      if (res.ok && res.data) {
        setText('');
        setMsgs(prev => prev.some(m => m.id === res.data!.id) ? prev : [...prev.slice(-99), res.data!]);
      } else if (!res.ok) {
        setSendError((res as any).error ?? 'Failed to send');
      }
    } catch {
      setSendError('Connection error — try again');
    }
    setSending(false);
  }, [text, sending]);

  const handleDelete = async (msgId: string) => {
    try { await emitWithAck('clan:chat_delete', { msgId }); } catch {}
  };

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); handleSend(); }
  };

  const fmt = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[260]" onClick={onClose}>
          <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" />
          <motion.div
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
            className="absolute bottom-0 left-0 right-0 flex flex-col"
            style={{ height: '68vh', background: 'rgba(6,8,20,0.98)', borderRadius: '20px 20px 0 0', borderTop: '1px solid rgba(0,229,255,0.14)', maxWidth: 560, margin: '0 auto' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 px-5 py-4 border-b border-white/[0.06] shrink-0">
              <div className="flex-1 min-w-0">
                <p className="font-mono text-xs font-bold text-neon-cyan/70 tracking-widest uppercase truncate">⚔ {clanName} Chat</p>
                <p className="text-[12px] font-mono text-white/22 mt-0.5">Members only</p>
              </div>
              <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center text-white/30 hover:text-white/60 hover:bg-white/5 transition-all">✕</button>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0" style={{ overflowAnchor: 'none' }}>
              {msgs.length === 0 && (
                <p className="text-center text-white/20 font-mono text-xs py-8">No messages yet. Rally the clan!</p>
              )}
              {msgs.map(msg => {
                const isMe = msg.profileId === myProfileId;
                const canDelete = isMe || isLeader || isMod;
                return (
                  <div key={msg.id} className={`flex items-start gap-2.5 group ${isMe ? 'flex-row-reverse' : ''}`}>
                    <AvatarBubble avatar={msg.avatar} avatarUrl={msg.avatarUrl} size={30} />
                    <div className={`max-w-[72%] flex flex-col gap-0.5 ${isMe ? 'items-end' : 'items-start'}`}>
                      <div className={`flex items-center gap-1.5 ${isMe ? 'flex-row-reverse' : ''}`}>
                        <span className="text-[12px] font-mono font-semibold" style={{ color: getNameColorById(msg.nameColor ?? null) ?? 'rgba(255,255,255,0.4)' }}>{msg.username}</span>
                        <span className="text-[12px] font-mono text-neon-cyan/30">Lv{msg.level}</span>
                        <span className="text-[12px] font-mono text-white/18">{fmt(msg.createdAt)}</span>
                        {canDelete && (
                          <button onClick={() => handleDelete(msg.id)} className="text-[12px] font-mono text-neon-red/40 hover:text-neon-red/80 transition-colors opacity-0 group-hover:opacity-100 ml-1" title="Delete">✕</button>
                        )}
                      </div>
                      <div className={`px-3 py-2 rounded-2xl text-sm font-mono leading-snug break-anywhere ${isMe ? 'bg-neon-cyan/[0.12] text-neon-cyan/80 rounded-tr-sm' : 'bg-white/[0.06] text-white/65 rounded-tl-sm'}`}>
                        {msg.text}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="px-4 pt-3 pb-4 border-t border-white/[0.06] shrink-0">
              {sendError && <p className="text-neon-red/70 font-mono text-[12px] mb-1.5 px-1">{sendError}</p>}
              <div className="flex items-center gap-2">
                <input
                  ref={inputRef} type="text" value={text}
                  onChange={e => { setText(e.target.value); if (sendError) setSendError(''); }}
                  onKeyDown={handleKey} maxLength={300} placeholder="Message your clan…"
                  className="flex-1 bg-white/[0.04] border border-white/[0.07] rounded-xl px-4 py-2.5 text-white/70 placeholder-white/20 font-mono text-sm focus:outline-none focus:border-neon-cyan/30 transition-colors"
                  style={{ fontSize: 16 }}
                />
                <button onClick={handleSend} disabled={!text.trim() || sending}
                  className="w-10 h-10 rounded-xl flex items-center justify-center bg-neon-cyan/[0.12] text-neon-cyan/70 hover:bg-neon-cyan/[0.2] hover:text-neon-cyan disabled:opacity-30 disabled:cursor-not-allowed transition-all shrink-0">
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
