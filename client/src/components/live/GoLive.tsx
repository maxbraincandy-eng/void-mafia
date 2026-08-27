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
 *
 * OPENING THIS WHILE ALREADY LIVE RESUMES
 * ───────────────────────────────────────
 * It used to start over. Tapping your own tile in the strip dropped you on the
 * setup screen, and pressing the only button there ended the broadcast people
 * were watching and started a new one they were not. So the first thing this
 * asks is whether there is already a stream to walk back into.
 */

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { socket } from '@/lib/socket';
import { useAuthStore } from '@/store/authStore';
import { useLivekitRoomVoice, useLiveKitGate } from '@/hooks/useLivekitVoice';
import { setLiveKitCamera, setLiveKitMic, getLiveKitLocalVideo } from '@/services/livekitVoice';
import { LIVE_BEAT_MS, type LiveSession, type LiveVisibility, type LiveViewer } from '@/types/live';
import { LiveStage, LiveComments, HeartBurst, LiveStat } from './LiveStage';
import { useLiveRoom } from './useLiveRoom';

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
  const [resuming, setResuming] = useState(true);

  const [micOn, setMicOn] = useState(true);
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const [draft, setDraft] = useState('');
  const [showViewers, setShowViewers] = useState(false);

  const room = useLiveRoom({
    sessionId: session?.id ?? null,
    hostId: myId,
    myId,
    initial: { viewers: session?.viewers, hearts: session?.totalHearts },
  });

  /*
   * Are we already on air?
   *
   * Opening this from your own tile in the strip means "take me back to my
   * broadcast", and answering that with a fresh setup screen is how somebody
   * ends their own stream by pressing the obvious button. `live:mine` also
   * re-joins the socket to the broadcast room, which is what makes the chat
   * work on the second device rather than showing an empty overlay.
   */
  useEffect(() => {
    socket.emit('live:mine' as any, {}, (res: any) => {
      setResuming(false);
      if (res?.ok && res.data) {
        setSession(res.data);
        setTitle(res.data.title ?? '');
        setPhase('onair');
      }
    });
  }, []);

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
    if (phase !== 'setup' || resuming) return;
    let cancelled = false;
    let got: MediaStream | null = null;
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: facing }, audio: false })
      .then(s => { got = s; if (cancelled) s.getTracks().forEach(t => t.stop()); else setPreview(s); })
      .catch(() => setError('კამერაზე წვდომა ვერ მოხერხდა'));
    return () => { cancelled = true; got?.getTracks().forEach(t => t.stop()); };
  }, [phase, resuming, facing]);

  // Whatever is left of it when this screen closes, or the light stays on.
  useEffect(() => () => { preview?.getTracks().forEach(t => t.stop()); }, [preview]);

  const voice = useLivekitRoomVoice({
    roomId: session ? session.room : null,
    identity: myId || null,
    active: lkEnabled && phase === 'onair' && !!session,
  });

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
    /*
     * `facing` is a dependency because a flip is a re-acquire: there is no way
     * to turn a published front-camera track around, so the capture is
     * replaced. Without it the button changed the mirror and nothing else, and
     * the viewers kept getting the front camera.
     */
    setLiveKitCamera(true, { facingMode: facing }).catch(() => setError('კამერა ვერ ჩაირთო'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, voice.connected, facing]);

  /*
   * The mic button used to be a picture of a mic button.
   *
   * It flipped an emoji and called nothing — a host who muted themselves to
   * cough carried on broadcasting every word of it, with a 🔇 on screen telling
   * them they were safe. A control that lies about what it did is worse than
   * no control.
   */
  useEffect(() => {
    if (phase !== 'onair' || !voice.connected) return;
    setLiveKitMic(micOn).catch(() => {});
  }, [micOn, phase, voice.connected]);

  useEffect(() => { if (phase === 'summary') setLiveKitCamera(false).catch(() => {}); }, [phase]);

  /*
   * The beat.
   *
   * `false` back means the server has already ended this session — the app was
   * backgrounded long enough for the reaper to get there — and the screen has
   * to stop claiming to be on air rather than carry on into a room nobody is
   * subscribed to. It is also what re-joins a reconnected socket to the
   * broadcast room, so a host who changed networks gets their chat back.
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

  // The host's own screen also learns that the stream is over from the room.
  useEffect(() => { if (room.ended && phase === 'onair') finish(); }, [room.ended]);

  // "X შემოგიერთდა", then gone. The hook holds it; this screen decides how long.
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!room.joined) return;
    setToast(`${room.joined.name} შემოგიერთდა`);
    room.clearJoined();
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [room.joined]);

  const start = useCallback(() => {
    if (starting) return;
    setStarting(true);
    setError(null);
    socket.emit('live:start' as any, { title: title.trim(), visibility, gameContext: gameContext ?? null }, (res: any) => {
      setStarting(false);
      if (!res?.ok) { setError(res?.error ?? 'ვერ დაიწყო'); return; }
      setSession(res.data);
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

  const say = () => {
    const text = draft.trim();
    if (!text) return;
    room.say(text);
    setDraft('');
  };

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
          mirror={facing === 'user'}
        />
      )}

      {/* ── Setup ──────────────────────────────────────────────────────────── */}
      {phase === 'setup' && (
        <div className="relative z-10 flex flex-col h-full">
          <div className="flex items-center justify-between px-4 pt-4">
            <p className="font-display font-bold text-white text-[17px]">პირდაპირი ეთერი</p>
            <div className="flex items-center gap-2">
              <button onClick={() => setFacing(f => (f === 'user' ? 'environment' : 'user'))} aria-label="კამერის შეცვლა"
                className="w-9 h-9 rounded-full flex items-center justify-center text-[15px]"
                style={{ background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(255,255,255,0.16)' }}>🔄</button>
              <button onClick={onClose} aria-label="დახურვა"
                className="w-9 h-9 rounded-full flex items-center justify-center text-white/60"
                style={{ background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(255,255,255,0.16)' }}>✕</button>
            </div>
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
            {/* Anybody who follows you is told the moment this starts. Saying so
                first is the difference between a feature and a surprise. */}
            <p className="font-mono text-[10.5px] text-white/30 mt-3 text-center">
              მიმდევრებს შეატყობინებთ რომ ეთერში ხართ
            </p>
            {error && <p className="font-mono text-[11px] mt-3 text-center" style={{ color: '#ff8a92' }}>{error}</p>}

            <button onClick={start} disabled={starting || resuming}
              className="w-full mt-4 py-4 rounded-2xl font-display font-bold text-white text-[15px] transition-all active:scale-[0.98] disabled:opacity-50"
              style={{ background: RED, boxShadow: `0 8px 30px ${RED}55` }}>
              {starting || resuming ? '…' : '🔴 დაწყება'}
            </button>
          </div>
        </div>
      )}

      {/* ── On air ─────────────────────────────────────────────────────────── */}
      {phase === 'onair' && session && (
        <div className="relative z-10 flex flex-col h-full">
          <div className="flex items-center gap-1.5 px-4 pt-4">
            <span className="px-2 py-1 rounded-lg font-mono font-bold text-[11px] text-white flex-shrink-0" style={{ background: RED }}>LIVE</span>
            {/* The count opens the list behind it — "is anyone there" and "who"
                are the same glance, and only one of them had an answer. */}
            <LiveStat icon="👁" value={room.viewers} onClick={() => setShowViewers(true)} />
            {room.hearts > 0 && <LiveStat icon="❤️" value={room.hearts} tint={`${RED}55`} />}
            <span className="flex-1 min-w-0 font-mono text-[11px] text-white/60 truncate">{session.title}</span>
            <button onClick={() => setConfirmEnd(true)}
              className="px-3 py-1.5 rounded-xl font-mono text-[11px] text-white flex-shrink-0"
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

          {!micOn && (
            <p className="mx-auto mt-3 px-3 py-1.5 rounded-full font-mono text-[10.5px]"
              style={{ background: 'rgba(0,0,0,0.6)', border: `1px solid ${RED}66`, color: '#ff9fb4' }}>
              მიკროფონი გამორთულია
            </p>
          )}

          <div className="mt-auto">
            <LiveComments comments={room.comments} />
            <div className="flex items-center gap-2 px-4 pb-6 pt-3">
              <button onClick={() => setMicOn(m => !m)} aria-label={micOn ? 'მიკროფონის გამორთვა' : 'მიკროფონის ჩართვა'}
                className="w-11 h-11 rounded-full flex items-center justify-center text-[17px] flex-shrink-0 transition-transform active:scale-90"
                style={{
                  background: micOn ? 'rgba(0,0,0,0.5)' : `${RED}33`,
                  border: `1px solid ${micOn ? 'rgba(255,255,255,0.16)' : RED}`,
                }}>
                {micOn ? '🎙' : '🔇'}
              </button>

              {/*
                * The host answering the chat.
                *
                * Most of what a host does is reply to a question somebody just
                * asked, and there was nowhere to type it — the conversation only
                * ran one way, into a screen that could not respond.
                */}
              <div className="flex-1 min-w-0 flex items-center rounded-full pr-1"
                style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.18)' }}>
                <input
                  value={draft} onChange={e => setDraft(e.target.value.slice(0, 200))}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); say(); } }}
                  placeholder="უპასუხე…"
                  enterKeyHint="send"
                  className="flex-1 min-w-0 bg-transparent px-3.5 py-2.5 font-mono text-[12px] text-white outline-none"
                />
                <button onClick={say} disabled={!draft.trim()} aria-label="გაგზავნა"
                  className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all active:scale-90"
                  style={{ background: draft.trim() ? RED : 'rgba(255,255,255,0.08)' }}>
                  <SendMark dim={!draft.trim()} />
                </button>
              </div>

              <button onClick={() => setFacing(f => (f === 'user' ? 'environment' : 'user'))} aria-label="კამერის შეცვლა"
                className="w-11 h-11 rounded-full flex items-center justify-center text-[16px] flex-shrink-0 transition-transform active:scale-90"
                style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.16)' }}>🔄</button>
            </div>
            {session.gameContext && (
              <p className="px-4 pb-3 font-mono text-[10.5px] text-white/30">🎩 {session.gameContext}</p>
            )}
          </div>

          <HeartBurst hearts={room.heartAnim} />
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
              {/* Everything else in the app pays XP for playing; this pays for
                  showing up, and saying so is what makes it a reward. */}
              {liveXP(summary) > 0 && (
                <p className="font-mono text-[11px] mt-2" style={{ color: '#ff9fb4' }}>
                  +{liveXP(summary)} XP · ეთერი
                </p>
              )}
            </>
          )}
          <button onClick={onClose}
            className="mt-8 px-8 py-3 rounded-2xl font-display font-bold text-white text-[14px]"
            style={{ background: RED }}>დახურვა</button>
        </div>
      )}

      {/* Who is actually in the room. */}
      <AnimatePresence>
        {showViewers && session && (
          <ViewerSheet sessionId={session.id} onClose={() => setShowViewers(false)} />
        )}
      </AnimatePresence>

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
              <p className="font-mono text-[11px] text-white/45 mt-2">
                {room.viewers > 0
                  ? `${room.viewers} მაყურებელი გამოვა და ეთერი დაიხურება.`
                  : 'მაყურებლები გამოვლენ და ეთერი დაიხურება.'}
              </p>
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

/**
 * The list behind the count.
 *
 * Asked for when it is opened rather than streamed: a host checks who is there
 * a handful of times in an hour, and pushing every membership change to keep a
 * closed sheet current is traffic for a screen nobody is looking at.
 */
function ViewerSheet({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const [list, setList] = useState<LiveViewer[] | null>(null);

  useEffect(() => {
    const load = () => socket.emit('live:viewer_list' as any, { sessionId }, (res: any) => {
      if (res?.ok) setList(res.data ?? []);
    });
    load();
    const t = setInterval(load, 8_000);        // open and stale is its own kind of wrong
    return () => clearInterval(t);
  }, [sessionId]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[712] flex items-end" style={{ background: 'rgba(4,2,10,0.72)' }}
      onClick={onClose}>
      <motion.div initial={{ y: 60 }} animate={{ y: 0 }} exit={{ y: 60 }} onClick={e => e.stopPropagation()}
        className="w-full rounded-t-3xl px-5 pt-4 pb-8"
        style={{ background: 'rgba(16,9,20,0.99)', border: '1px solid rgba(255,255,255,0.1)', maxHeight: '62dvh', overflowY: 'auto' }}>
        <div className="w-10 h-1 rounded-full mx-auto mb-4" style={{ background: 'rgba(255,255,255,0.2)' }} />
        <p className="font-display font-bold text-white text-[15px] mb-3">
          მაყურებლები {list ? `· ${list.length}` : ''}
        </p>

        {list === null && <p className="font-mono text-[11.5px] text-white/35 py-4 text-center">…</p>}
        {list?.length === 0 && (
          <p className="font-mono text-[11.5px] text-white/35 py-6 text-center">
            ჯერ არავინ უყურებს — გააზიარე ეთერი
          </p>
        )}

        {list?.map(v => (
          <div key={v.userId} className="flex items-center gap-3 py-2">
            <span style={{
              width: 34, height: 34, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17,
              background: 'linear-gradient(135deg, #9b00ff, #00f5ff)',
            }}>
              {v.avatarUrl
                ? <img src={v.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : v.avatar}
            </span>
            <span className="font-mono text-[12.5px] text-white/85 truncate">{v.name}</span>
          </div>
        ))}
      </motion.div>
    </motion.div>
  );
}

/** Drawn rather than ➤: that glyph is a different shape on every platform. */
function SendMark({ dim }: { dim?: boolean }) {
  const c = dim ? 'rgba(255,255,255,0.45)' : '#fff';
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden style={{ display: 'block' }}>
      <path d="M3.6 11.4 20 4l-7.4 16.4-1.9-6.6-7.1-2.4Z" fill={c} />
    </svg>
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

/**
 * What the server paid for this broadcast.
 *
 * Mirrors `awardLiveXP` in `server/src/liveSocket.ts` — the server is the only
 * thing that grants XP, and this is a readout of what it just did, not a second
 * opinion. Keep the two in step.
 */
function liveXP(s: LiveSession): number {
  const minutes = Math.floor(((s.endedAt ?? Date.now()) - s.startedAt) / 60_000);
  if (minutes < 1) return 0;
  return Math.min(minutes, 60) * 2 + Math.min(s.totalViewers, 50) * 3;
}
