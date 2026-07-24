import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuthStore } from '@/store/authStore';
import { useWatchPartyStore } from '@/store/watchPartyStore';
import { useLiveKitGate, useLivekitRoomVoice } from '@/hooks/useLivekitVoice';
import { getLiveKitSpeaking } from '@/services/livekitVoice';
import { haptic } from '@/lib/haptics';
import { SyncedPlayer } from './SyncedPlayer';
import type { WpSource } from '@/types/watchParty';

const ACCENT = '#ff5d5d';
const AV = ['#7c5cff', '#3f8cff', '#2fb8a0', '#e0803c', '#d84f7a', '#5cbe6a', '#c78cff', '#4aa0d8'];
function tint(id: string): string { let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0; return AV[Math.abs(h) % AV.length]; }
function initials(name: string): string { return (name || '?').trim().slice(0, 2).toUpperCase(); }

const PROVIDER_ICON: Record<string, string> = { youtube: '▶️', video: '🎞️', vimeo: '🎬', twitch: '🟣', tiktok: '🎵', embed: '🌐' };

export function WatchPartyRoom({ onClose }: { onClose: () => void }) {
  const profile = useAuthStore(s => s.profile);
  const myId = profile?.id ?? 'me';
  const { match, receivedAt, leaveMatch, setSource, clearSource, play, pause, seek, setRate, queueAdd, queueRemove, queueNext, transferHost, sendChat, requestSync, error, clearError } = useWatchPartyStore();

  const { enabled: lkEnabled } = useLiveKitGate();
  const voice = useLivekitRoomVoice({ roomId: match ? `watchparty_${match.id}` : '', identity: myId, active: lkEnabled && !!match });

  const [tab, setTab] = useState<'chat' | 'people'>('chat');
  const [linkInput, setLinkInput] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Re-sync from the server shortly after mount (covers late join / reconnect).
  useEffect(() => { const t = setTimeout(() => requestSync(), 800); return () => clearTimeout(t); }, [requestSync]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ block: 'end' }); }, [match?.chat.length]);
  useEffect(() => { if (error) { const t = setTimeout(clearError, 3500); return () => clearTimeout(t); } }, [error, clearError]);
  // Auto-cancel a pending "confirm host transfer" if the host doesn't confirm.
  useEffect(() => { if (menuFor) { const t = setTimeout(() => setMenuFor(null), 4000); return () => clearTimeout(t); } }, [menuFor]);

  if (!match) return null;
  const isHost = match.you.isHost;
  const speaking = getLiveKitSpeaking();

  const playNow = () => {
    const url = linkInput.trim();
    if (!url) return;
    setSource(url); // server replaces the current source immediately
    setLinkInput('');
    haptic('tap');
  };
  const addToQueue = () => {
    const url = linkInput.trim();
    if (!url) return;
    queueAdd(url);
    setLinkInput('');
    haptic('tap');
  };

  const leave = () => { leaveMatch(); onClose(); };

  const copyCode = () => { try { navigator.clipboard?.writeText(match.code); haptic('tap'); } catch { /* ignore */ } };

  const sendMsg = () => { const t = chatInput.trim(); if (!t) return; sendChat(t); setChatInput(''); };

  const Sidebar = (
    <div className="flex flex-col h-full min-h-0">
      {/* tabs */}
      <div className="flex gap-1 p-2 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        {(['chat', 'people'] as const).map(tk => (
          <button key={tk} onClick={() => setTab(tk)}
            className="flex-1 py-1.5 rounded-lg font-mono text-[11px] uppercase tracking-wider transition-all"
            style={tab === tk ? { background: `${ACCENT}22`, color: ACCENT, border: `1px solid ${ACCENT}44` } : { color: 'rgba(255,255,255,0.4)' }}>
            {tk === 'chat' ? '💬 ჩატი' : `👥 ${match.members.length}`}
          </button>
        ))}
      </div>

      {tab === 'people' ? (
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {isHost && match.members.length > 1 && (
            <p className="font-mono text-[10px] text-white/30 text-center pb-1">👑 ღილაკით ჰოსტობა გადაეცი — ის მართავს დაკვრას და რთავს ვიდეოს</p>
          )}
          {match.members.map(mem => {
            const isSpeaking = speaking.has(mem.userId);
            const canPromote = isHost && !mem.isHost && mem.userId !== myId;
            const confirming = menuFor === mem.userId;
            return (
              <div key={mem.userId} className="w-full flex items-center gap-2.5 p-2 rounded-xl"
                style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${isSpeaking ? '#39d98a66' : 'rgba(255,255,255,0.06)'}` }}>
                <div className="w-8 h-8 rounded-full flex items-center justify-center font-display font-bold text-[12px] text-white flex-shrink-0"
                  style={{ background: tint(mem.userId), boxShadow: isSpeaking ? '0 0 0 2px #39d98a' : 'none' }}>
                  {mem.avatar && mem.avatar.length <= 2 ? mem.avatar : initials(mem.name)}
                </div>
                <span className="flex-1 font-display text-[13px] text-white/85 truncate">{mem.name}{mem.userId === myId ? ' (შენ)' : ''}</span>
                {mem.isHost && <span className="font-mono text-[9px] uppercase px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: `${ACCENT}22`, color: ACCENT }}>ჰოსტი</span>}
                {isSpeaking && <span className="text-[11px] flex-shrink-0">🔊</span>}
                {canPromote && (
                  confirming ? (
                    <button onClick={() => { transferHost(mem.userId); setMenuFor(null); haptic('tap'); }}
                      className="px-2 py-1 rounded-lg font-mono text-[10px] uppercase tracking-wider flex-shrink-0"
                      style={{ background: ACCENT, color: '#fff' }}>დაადასტურე</button>
                  ) : (
                    <button onClick={() => setMenuFor(mem.userId)} title="ჰოსტობა გადაეცი"
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-[14px] flex-shrink-0"
                      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>👑</button>
                  )
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {match.chat.length === 0 && <p className="text-center font-mono text-[11px] text-white/25 py-6">ჯერ შეტყობინებები არაა</p>}
            {match.chat.map(msg => (
              <div key={msg.id} className="flex flex-col">
                <span className="font-mono text-[10px]" style={{ color: tint(msg.userId) }}>{msg.name}</span>
                <span className="font-display text-[13px] text-white/85 break-words leading-snug">{msg.text}</span>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <div className="flex-shrink-0 p-2 flex gap-1.5" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
            <input value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendMsg()}
              placeholder="დაწერე…" maxLength={500}
              className="flex-1 bg-white/5 rounded-lg px-3 py-2 font-display text-[13px] text-white outline-none" style={{ border: '1px solid rgba(255,255,255,0.08)' }} />
            <button onClick={sendMsg} className="px-3 rounded-lg font-mono text-[12px]" style={{ background: `${ACCENT}22`, color: ACCENT }}>➤</button>
          </div>
        </>
      )}
    </div>
  );

  return createPortal(
    <div className="fixed inset-0 z-[200] flex flex-col" style={{ background: '#08080c' }}>
      {/* Header */}
      <div className="flex-shrink-0 flex items-center gap-2 px-3 h-12" style={{ background: 'rgba(0,0,0,0.5)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <span className="text-lg">🎬</span>
        <div className="min-w-0 flex-1">
          <p className="font-display font-bold text-[14px] text-white truncate leading-none">{match.title}</p>
          <button onClick={copyCode} className="font-mono text-[10px] text-white/40 tracking-widest hover:text-white/70">კოდი: {match.code} ⧉</button>
        </div>
        {voice.audioBlocked && (
          <button onClick={voice.unlockAudio} className="px-2 h-8 rounded-lg font-mono text-[10px]" style={{ background: '#ffd34d22', color: '#ffd34d' }}>🔊 ხმა</button>
        )}
        <button onClick={() => { voice.toggleMic(); haptic('tap'); }}
          className="w-9 h-9 rounded-full flex items-center justify-center text-base flex-shrink-0"
          style={{ background: voice.micEnabled ? '#39d98a22' : 'rgba(255,255,255,0.08)', border: `1px solid ${voice.micEnabled ? '#39d98a55' : 'rgba(255,255,255,0.12)'}` }}
          title={voice.micEnabled ? 'მიკ ჩართული' : 'მიკ გამორთული'}>
          {voice.micEnabled ? '🎙️' : '🔇'}
        </button>
        <button onClick={leave} className="px-3 h-8 rounded-lg font-mono text-[11px] uppercase tracking-wider flex-shrink-0" style={{ background: 'rgba(255,60,70,0.15)', color: '#ff8a92', border: '1px solid rgba(255,60,70,0.3)' }}>გასვლა</button>
      </div>

      {error && <div className="flex-shrink-0 px-3 py-1.5 font-mono text-[11px] text-center" style={{ background: 'rgba(255,60,70,0.15)', color: '#ff9aa2' }}>{error}</div>}

      {/* Body */}
      <div className="flex-1 flex flex-col md:flex-row min-h-0">
        {/* Player + host source bar */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0">
          <div className="flex-1 min-h-0" style={{ background: '#000' }}>
            <SyncedPlayer
              source={match.source}
              playing={match.playing}
              positionSec={match.positionSec}
              receivedAt={receivedAt}
              rate={match.rate}
              isHost={isHost}
              onPlay={pos => play(pos)}
              onPause={pos => pause(pos)}
              onSeek={pos => seek(pos)}
              onRate={r => setRate(r)}
            />
          </div>

          {/* Host: now-playing + link input + queue */}
          {isHost && (
            <div className="flex-shrink-0 p-2 space-y-2" style={{ background: 'rgba(0,0,0,0.4)', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
              {match.source && (
                <div className="flex items-center gap-2 px-1">
                  <span className="text-[13px]">{PROVIDER_ICON[match.source.provider] ?? '🎞️'}</span>
                  <span className="flex-1 font-mono text-[11px] text-white/50 truncate">ახლა: {match.source.title}</span>
                  <button onClick={() => { clearSource(); haptic('tap'); }}
                    className="px-2 py-1 rounded-lg font-mono text-[10px] uppercase tracking-wider flex-shrink-0"
                    style={{ background: 'rgba(255,60,70,0.15)', color: '#ff8a92', border: '1px solid rgba(255,60,70,0.3)' }}>
                    ✕ წაშლა
                  </button>
                </div>
              )}
              <div className="flex gap-1.5">
                <input value={linkInput} onChange={e => setLinkInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && playNow()}
                  placeholder="ჩააგდე ლინკი — YouTube, ვიდეო, Vimeo, Twitch…"
                  className="flex-1 bg-white/5 rounded-lg px-3 py-2 font-display text-[13px] text-white outline-none" style={{ border: '1px solid rgba(255,255,255,0.1)' }} />
                <button onClick={playNow} className="px-3 rounded-lg font-mono text-[11px] uppercase tracking-wider font-bold flex-shrink-0" style={{ background: ACCENT, color: '#fff' }}>
                  {match.source ? 'ახლა' : 'ჩართვა'}
                </button>
                {match.source && (
                  <button onClick={addToQueue} className="px-3 rounded-lg font-mono text-[11px] uppercase tracking-wider font-bold flex-shrink-0" style={{ background: 'rgba(255,255,255,0.1)', color: '#fff' }}>
                    + რიგში
                  </button>
                )}
              </div>
              {match.queue.length > 0 && (
                <div className="flex items-center gap-2">
                  <button onClick={queueNext} className="px-2 py-1 rounded-lg font-mono text-[10px] uppercase flex-shrink-0" style={{ background: 'rgba(255,255,255,0.08)', color: '#fff' }}>⏭ შემდეგი</button>
                  <div className="flex-1 flex gap-1.5 overflow-x-auto">
                    {match.queue.map((q, i) => <QueueChip key={i} src={q} onRemove={() => queueRemove(i)} />)}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sidebar (desktop) / bottom sheet (mobile) */}
        <div className="hidden md:flex flex-col flex-shrink-0" style={{ width: 340, background: 'rgba(255,255,255,0.02)', borderLeft: '1px solid rgba(255,255,255,0.08)' }}>
          {Sidebar}
        </div>
        <div className="md:hidden flex flex-col flex-shrink-0" style={{ height: '38%', background: 'rgba(255,255,255,0.02)', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          {Sidebar}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function QueueChip({ src, onRemove }: { src: WpSource; onRemove: () => void }) {
  return (
    <div className="flex items-center gap-1 px-2 py-1 rounded-lg flex-shrink-0" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <span className="text-[11px]">{PROVIDER_ICON[src.provider] ?? '🎞️'}</span>
      <span className="font-mono text-[10px] text-white/60 max-w-[120px] truncate">{src.title}</span>
      <button onClick={onRemove} className="text-white/30 hover:text-white/70 text-[11px]">✕</button>
    </div>
  );
}
