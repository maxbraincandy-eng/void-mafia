import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { useAuthStore } from '@/store/authStore';
import { useWatchPartyStore } from '@/store/watchPartyStore';
import { haptic } from '@/lib/haptics';

const ACCENT = '#ff5d5d';
const PROVIDER_ICON: Record<string, string> = { youtube: '▶️', video: '🎞️', vimeo: '🎬', twitch: '🟣', tiktok: '🎵', embed: '🌐' };

/**
 * Watch Party lobby — create a room or join by code / from the live list.
 * On success the store's `match` is set and App mounts <WatchPartyRoom> over
 * everything, so this launcher just closes.
 */
export function WatchPartyLauncher({ onClose }: { onClose: () => void }) {
  const profile = useAuthStore(s => s.profile);
  const name = profile?.username ?? 'Guest';
  const avatar = profile?.avatar ?? '🎬';
  const { match, matchList, isLoading, error, fetchList, createMatch, joinMatch, clearError } = useWatchPartyStore();

  const [title, setTitle] = useState('');
  const [code, setCode] = useState('');

  useEffect(() => { fetchList(); const iv = setInterval(fetchList, 5000); return () => clearInterval(iv); }, [fetchList]);
  // Once we're in a room, hand off to the full-screen room and close the lobby.
  useEffect(() => { if (match) onClose(); }, [match, onClose]);
  useEffect(() => { if (error) { const t = setTimeout(clearError, 3500); return () => clearTimeout(t); } }, [error, clearError]);

  const create = () => { haptic('tap'); createMatch(name, title.trim(), avatar); };
  const join = (c: string) => { const cc = c.trim().toUpperCase(); if (cc.length < 4) return; haptic('tap'); joinMatch(cc, name, avatar); };

  return createPortal(
    <motion.div className="fixed inset-0 z-[190] flex flex-col overflow-y-auto"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ background: 'radial-gradient(120% 80% at 50% 0%, #241016 0%, #0a0709 60%)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-14 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🎬</span>
          <div>
            <p className="font-display font-bold text-white text-[16px] leading-none">კინო სივრცე</p>
            <p className="font-mono text-[10px] text-white/40 tracking-widest mt-0.5">ერთად უყურეთ · სინქრონში</p>
          </div>
        </div>
        <button onClick={onClose} className="w-9 h-9 rounded-xl flex items-center justify-center text-white/50" style={{ background: 'rgba(255,255,255,0.06)' }}>✕</button>
      </div>

      {error && <div className="mx-4 mb-2 px-3 py-2 rounded-lg font-mono text-[11px] text-center" style={{ background: 'rgba(255,60,70,0.15)', color: '#ff9aa2' }}>{error}</div>}

      <div className="px-4 pb-8 space-y-4 max-w-md w-full mx-auto">
        {/* Create */}
        <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${ACCENT}33` }}>
          <p className="font-display font-bold text-white text-[14px] mb-2">ახალი ოთახი</p>
          <input value={title} onChange={e => setTitle(e.target.value)} maxLength={60}
            placeholder="ოთახის სახელი (არასავალდებულო)"
            className="w-full bg-white/5 rounded-xl px-3 py-2.5 font-display text-[14px] text-white outline-none mb-2" style={{ border: '1px solid rgba(255,255,255,0.1)' }} />
          <button onClick={create} disabled={isLoading}
            className="w-full py-3 rounded-xl font-display font-bold text-white text-[14px] disabled:opacity-50" style={{ background: ACCENT }}>
            {isLoading ? '…' : '🎬 ოთახის შექმნა'}
          </button>
        </div>

        {/* Join by code */}
        <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <p className="font-display font-bold text-white text-[14px] mb-2">კოდით შესვლა</p>
          <div className="flex gap-2">
            <input value={code} onChange={e => setCode(e.target.value.toUpperCase().slice(0, 4))} onKeyDown={e => e.key === 'Enter' && join(code)}
              placeholder="ABCD" maxLength={4}
              className="flex-1 bg-white/5 rounded-xl px-3 py-2.5 font-mono text-[18px] tracking-[0.4em] text-center text-white outline-none" style={{ border: '1px solid rgba(255,255,255,0.1)' }} />
            <button onClick={() => join(code)} disabled={code.trim().length < 4}
              className="px-5 rounded-xl font-display font-bold text-white text-[14px] disabled:opacity-40" style={{ background: 'rgba(255,255,255,0.1)' }}>შესვლა</button>
          </div>
        </div>

        {/* Live rooms */}
        <div>
          <p className="font-mono text-[11px] text-white/40 uppercase tracking-widest mb-2 px-1">ღია ოთახები · {matchList.length}</p>
          <div className="space-y-1.5">
            {matchList.length === 0 && <p className="text-center font-mono text-[11px] text-white/25 py-6">ჯერ ღია ოთახი არაა — შექმენი პირველი!</p>}
            {matchList.map(m => (
              <button key={m.id} onClick={() => join(m.code)}
                className="w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all active:scale-[0.99]"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <span className="text-xl">{m.provider ? PROVIDER_ICON[m.provider] : '🎬'}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-display font-bold text-[13px] text-white/90 truncate">{m.title}</p>
                  <p className="font-mono text-[10px] text-white/40 truncate">{m.nowPlaying ?? 'ვიდეო არ უკრავს'} · {m.hostName}</p>
                </div>
                <span className="font-mono text-[11px] text-white/50 flex-shrink-0">👥 {m.memberCount}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </motion.div>,
    document.body,
  );
}
