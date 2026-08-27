/**
 * Going live: set up, broadcast, and the summary at the end.
 *
 * THREE STATES, ONE SCREEN
 * ────────────────────────
 * Setting up, broadcasting and reading the summary are one continuous thing to
 * the person doing it — the camera is already on, and it does not turn off
 * between them. Split into three routes, the preview would tear down and
 * rebuild on the way from the title field to the air, which is a black frame at
 * exactly the moment somebody is deciding whether they look ready.
 *
 * THE MEDIA IS LIVEKIT'S
 * ──────────────────────
 * A broadcast is a LiveKit room with one publisher — the same infrastructure
 * every voice room in the app already runs on. Nothing here signals, negotiates
 * or holds a peer connection; it asks for a room and turns the camera on.
 *
 * THE HEARTBEAT IS NOT OPTIONAL
 * ─────────────────────────────
 * A host whose battery dies never presses "end". The server reaps a session
 * that stops beating, and the beat's answer coming back false is how this
 * screen finds out its own stream is gone — which is a real case: the app was
 * backgrounded long enough for the reaper to get there first.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { socket } from '@/lib/socket';
import { useAuthStore } from '@/store/authStore';
import { useLivekitRoomVoice, useLiveKitGate } from '@/hooks/useLivekitVoice';
import { setLiveKitCamera, getLiveKitLocalVideo } from '@/services/livekitVoice';
import { LIVE_BEAT_MS, type LiveSession, type LiveVisibility, type LiveComment } from '@/types/live';
import { LiveStage, LiveComments, HeartBurst, useHearts } from './LiveStage';

const RED = '#ff2d55';

type Phase = 'setup' | 'onair' | 'summary';

export function GoLive({ onClose, gameContext }: { onClose: () => void; gameContext?: string | null }) {
  const profile = useAuthStore(s => s.profile);
  const myId = profile?.id ?? '';
  const { enabled: lkEnabled } = useLiveKitGate();

  const [phase, setPhase] = useState<Phase>('setup');
  const [title, setTitle] = useState('');
  const [visibility, setVisibility] = useState<LiveVisibility>('public');
  const [session, setSession] = useState<LiveSession | null>(null);
  const [summary, setSummary] = useState<LiveSession | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [viewers, setViewers] = useState(0);
  const [comments, setComments] = useState<LiveComment[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [micOn, setMicOn] = useState(true);
  const { hearts, burst } = useHearts();

  /*
   * The camera runs from the setup screen onwards.
   *
   * On the setup screen it is a mirror — nobody is watching yet, because the
   * session does not exist until "start" is pressed. Joining the LiveKit room
   * only once live is what makes that true rather than a promise.
   */
  const voice = useLivekitRoomVoice({
    roomId: session ? session.room : null,
    identity: myId || null,
    active: lkEnabled && phase === 'onair' && !!session,
  });

  /*
   * The preview owns the camera on the setup screen, and hands it over.
   *
   * A phone gives the camera to one capture at a time. Leaving this stream open
   * meant LiveKit's own `getUserMedia` could not get it, so the host published
   * nothing — while still seeing themselves, because the self-view was falling
   * back to the very preview that was blocking the publish. Everything looked
   * right on the host's screen and every viewer got a black rectangle.
   *
   * So the preview is stopped the moment we go on air, before LiveKit asks.
   */
  const [preview, setPreview] = useState<MediaStream | null>(null);
  useEffect(() => {
    if (phase !== 'setup') return;
    let cancelled = false;
    let got: MediaStream | null = null;
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: 'user' }, audio: false })
      .then(s => { got = s; if (cancelled) s.getTracks().forEach(t => t.stop()); else setPreview(s); })
      .catch(() => setError('კამერაზე წვდომა ვერ მოხერხდა'));
    return () => { cancelled = true; got?.getTracks().forEach(t => t.stop()); };
  }, [phase]);

  // Whatever is left of it when this screen closes, or the light stays on.
  useEffect(() => () => { preview?.getTracks().forEach(t => t.stop()); }, [preview]);

  /*
   * Turn the camera on once the room is actually connected.
   *
   * `setLiveKitCamera` returns silently when there is no room yet, and joining
   * takes a moment — so keying this on the phase change meant it usually ran
   * before the connection existed and never ran again. Nothing retried, and
   * nothing said so.
   */
  useEffect(() => {
    if (phase !== 'onair' || !voice.connected) return;
    // Release the preview first: one capture at a time.
    preview?.getTracks().forEach(t => t.stop());
    setPreview(null);
    setLiveKitCamera(true).catch(() => setError('კამერა ვერ ჩაირთო'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, voice.connected]);

  useEffect(() => { if (phase === 'summary') setLiveKitCamera(false).catch(() => {}); }, [phase]);

  // ── Live room events ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!session) return;
    const onViewers = (d: any) => {
      if (d?.sessionId !== session.id) return;
      setViewers(d.viewers ?? 0);
      if (d.joined?.name) {
        setToast(`${d.joined.name} შემოგიერთდა`);
        setTimeout(() => setToast(null), 2600);
      }
    };
    const onComment = (d: any) => {
      if (d?.sessionId !== session.id) return;
      setComments(c => [...c.slice(-40), { id: `${d.userId}_${d.at}`, userId: d.userId, name: d.name, text: d.text, at: d.at }]);
    };
    const onHeart = (d: any) => { if (d?.sessionId === session.id) burst(); };
    socket.on('live:viewers' as any, onViewers);
    socket.on('live:comment' as any, onComment);
    socket.on('live:hearted' as any, onHeart);
    return () => {
      socket.off('live:viewers' as any, onViewers);
      socket.off('live:comment' as any, onComment);
      socket.off('live:hearted' as any, onHeart);
    };
  }, [session?.id, burst]);

  /*
   * The beat.
   *
   * `false` back means the server has already ended this session — the app was
   * backgrounded long enough for the reaper to get there — and the screen has
   * to stop claiming to be on air rather than carry on into a room nobody is
   * subscribed to.
   */
  useEffect(() => {
    if (phase !== 'onair' || !session) return;
    const t = setInterval(() => {
      socket.emit('live:beat' as any, {}, (res: any) => {
        if (res?.ok && res.data === false) finish();
      });
    }, LIVE_BEAT_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, session?.id]);

  const start = useCallback(() => {
    if (starting) return;
    setStarting(true);
    setError(null);
    socket.emit('live:start' as any, { title: title.trim(), visibility, gameContext: gameContext ?? null }, (res: any) => {
      setStarting(false);
      if (!res?.ok) { setError(res?.error ?? 'ვერ დაიწყო'); return; }
      setSession(res.data);
      setViewers(0);
      setComments([]);
      setPhase('onair');
    });
  }, [starting, title, visibility, gameContext]);

  const finish = useCallback(() => {
    socket.emit('live:end' as any, {}, (res: any) => {
      if (res?.ok && res.data) setSummary(res.data);
      setPhase('summary');
      setSession(null);
    });
  }, []);

  const [confirmEnd, setConfirmEnd] = useState(false);

  return createPortal(
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[700] flex flex-col" style={{ background: '#05030c' }}>

      {/* The camera, behind everything, from setup to air. */}
      {phase !== 'summary' && (
        // `voice.rev` bumps when a track is published or dropped, which is what
        // makes the self-view swap from the preview to the track that is
        // actually going out. Reading it without that is a stale null.
        <LiveStage
          key={`stage_${phase}`}
          stream={phase === 'onair' ? (pickLocal(voice.rev) ?? preview) : preview}
          mirror
        />
      )}

      {/* ── Setup ──────────────────────────────────────────────────────────── */}
      {phase === 'setup' && (
        <div className="relative z-10 flex flex-col h-full">
          <div className="flex items-center justify-between px-4 pt-4">
            <p className="font-display font-bold text-white text-[17px]">პირდაპირი ეთერი</p>
            <button onClick={onClose} className="w-9 h-9 rounded-full flex items-center justify-center text-white/60"
              style={{ background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(255,255,255,0.16)' }}>✕</button>
          </div>

          <div className="mt-auto px-4 pb-6" style={{ background: 'linear-gradient(180deg, transparent, rgba(5,3,12,0.92) 38%)' }}>
            <input
              value={title} onChange={e => setTitle(e.target.value.slice(0, 120))}
              placeholder="დაწერე რაზე იქნება ლაივი"
              className="w-full rounded-2xl px-4 py-3.5 font-mono text-[13px] text-white outline-none"
              style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.18)' }}
            />

            <div className="flex gap-2 mt-3">
              {([['public', '🌍 ყველა'], ['friends', '🔒 მეგობრები']] as const).map(([v, label]) => (
                <button key={v} onClick={() => setVisibility(v)}
                  className="flex-1 py-2.5 rounded-xl font-mono text-[12px] transition-all"
                  style={{
                    background: visibility === v ? `${RED}22` : 'rgba(255,255,255,0.05)',
                    border: `1px solid ${visibility === v ? RED : 'rgba(255,255,255,0.14)'}`,
                    color: visibility === v ? '#ff8fa8' : 'rgba(255,255,255,0.55)',
                  }}>{label}</button>
              ))}
            </div>

            {gameContext && (
              <p className="font-mono text-[11px] text-white/45 mt-3 text-center">🎩 მიბმულია თამაშზე · {gameContext}</p>
            )}
            {error && <p className="font-mono text-[11px] mt-3 text-center" style={{ color: '#ff8a92' }}>{error}</p>}

            <button onClick={start} disabled={starting}
              className="w-full mt-4 py-4 rounded-2xl font-display font-bold text-white text-[15px] transition-all active:scale-[0.98] disabled:opacity-50"
              style={{ background: RED, boxShadow: `0 8px 30px ${RED}55` }}>
              {starting ? '…' : '🔴 დაწყება'}
            </button>
          </div>
        </div>
      )}

      {/* ── On air ─────────────────────────────────────────────────────────── */}
      {phase === 'onair' && session && (
        <div className="relative z-10 flex flex-col h-full">
          <div className="flex items-center gap-2 px-4 pt-4">
            <span className="px-2 py-1 rounded-lg font-mono font-bold text-[11px] text-white" style={{ background: RED }}>LIVE</span>
            <span className="px-2 py-1 rounded-lg font-mono text-[11px] text-white"
              style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.14)' }}>
              👁 {viewers}
            </span>
            <span className="flex-1 min-w-0 font-mono text-[11px] text-white/60 truncate">{session.title}</span>
            <button onClick={() => setConfirmEnd(true)}
              className="px-3 py-1.5 rounded-xl font-mono text-[11px] text-white"
              style={{ background: 'rgba(0,0,0,0.5)', border: `1px solid ${RED}66` }}>დასრულება</button>
          </div>

          <AnimatePresence>
            {toast && (
              <motion.p initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="mx-auto mt-3 px-3 py-1.5 rounded-full font-mono text-[11px] text-white"
                style={{ background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.16)' }}>
                {toast}
              </motion.p>
            )}
          </AnimatePresence>

          <div className="mt-auto">
            <LiveComments comments={comments} />
            <div className="flex items-center gap-2 px-4 pb-6 pt-3">
              <button onClick={() => { setMicOn(m => !m); }}
                className="w-11 h-11 rounded-full flex items-center justify-center text-[17px]"
                style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.16)' }}>
                {micOn ? '🎙' : '🔇'}
              </button>
              <div className="flex-1" />
              <span className="font-mono text-[11px] text-white/35">{session.gameContext ? `🎩 ${session.gameContext}` : ''}</span>
            </div>
          </div>

          <HeartBurst hearts={hearts} />
        </div>
      )}

      {/* ── Summary ────────────────────────────────────────────────────────── */}
      {phase === 'summary' && (
        <div className="relative z-10 flex flex-col h-full items-center justify-center px-8 text-center">
          <p className="text-5xl mb-3">📡</p>
          <p className="font-display font-black text-white" style={{ fontSize: 23 }}>ეთერი დასრულდა</p>
          {summary && (
            <>
              <p className="font-mono text-[12px] text-white/45 mt-1">{summary.title}</p>
              <div className="grid grid-cols-3 gap-3 mt-6 w-full max-w-xs">
                {([
                  ['👁', summary.totalViewers, 'მაყურებელი'],
                  ['📈', summary.peakViewers, 'პიკი'],
                  ['❤️', summary.totalHearts, 'გული'],
                ] as const).map(([icon, n, label]) => (
                  <div key={label} className="rounded-2xl py-3"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)' }}>
                    <p className="text-lg">{icon}</p>
                    <p className="font-display font-bold text-white text-[18px]">{n}</p>
                    <p className="font-mono text-[9.5px] text-white/35">{label}</p>
                  </div>
                ))}
              </div>
              <p className="font-mono text-[11px] text-white/35 mt-4">
                ხანგრძლივობა {fmtDuration((summary.endedAt ?? Date.now()) - summary.startedAt)}
              </p>
            </>
          )}
          <button onClick={onClose}
            className="mt-8 px-8 py-3 rounded-2xl font-display font-bold text-white text-[14px]"
            style={{ background: RED }}>დახურვა</button>
        </div>
      )}

      {/* Ending is not undoable, so it asks — the same rule the mafia table follows. */}
      <AnimatePresence>
        {confirmEnd && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[710] flex items-center justify-center px-8" style={{ background: 'rgba(4,2,10,0.9)' }}
            onClick={() => setConfirmEnd(false)}>
            <motion.div initial={{ scale: 0.92 }} animate={{ scale: 1 }} onClick={e => e.stopPropagation()}
              className="w-full max-w-xs rounded-2xl p-5 text-center"
              style={{ background: 'rgba(20,10,16,0.99)', border: `1px solid ${RED}55` }}>
              <p className="font-display font-bold text-white text-[15px]">ეთერის დასრულება?</p>
              <p className="font-mono text-[11px] text-white/45 mt-2">მაყურებლები გამოვლენ და ეთერი დაიხურება.</p>
              <div className="mt-4 flex gap-2">
                <button onClick={() => setConfirmEnd(false)} className="flex-1 py-2.5 rounded-xl font-mono text-[12px]"
                  style={{ color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.15)' }}>გაგრძელება</button>
                <button onClick={() => { setConfirmEnd(false); finish(); }} className="flex-1 py-2.5 rounded-xl font-mono text-[12px] text-white"
                  style={{ background: RED }}>დასრულება</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>,
    document.body,
  );
}

/** Reads the published local track. The argument is only there to re-run it. */
function pickLocal(_rev: unknown): MediaStream | null {
  return getLiveKitLocalVideo();
}

function fmtDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}წთ ${s}წმ` : `${s}წმ`;
}
