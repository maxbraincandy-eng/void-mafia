import { useEffect, useState, useRef, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { socket, emitWithAck } from '@/lib/socket';
import { useSocialStore } from '@/store/socialStore';
import { useAuthStore } from '@/store/authStore';
import { useGameStore } from '@/store/gameStore';
import { GifPicker } from '@/components/community/GifPicker';
import type { DmConversation, DirectMessage, Res } from '@/types/index';

const MAX_VOICE_SECONDS = 30;
const GROUP_WINDOW_MS = 4 * 60 * 1000; // messages within 4min from same sender stack together

// Quick-reaction set (mirrors the server's DM_REACTION_EMOJIS whitelist)
const REACTION_EMOJIS = ['❤️', '🔥', '😂', '👍', '😮', '😢'] as const;

// Void-themed sticker pack (keys mirror the server whitelist)
const DM_STICKERS: { key: string; emoji: string; label: string }[] = [
  { key: 'don',     emoji: '🎩', label: 'დონი' },
  { key: 'gun',     emoji: '🔫', label: 'ქილი' },
  { key: 'night',   emoji: '🌃', label: 'ღამე' },
  { key: 'eye',     emoji: '👁️', label: 'შერიფი' },
  { key: 'skull',   emoji: '💀', label: 'GG' },
  { key: 'joker',   emoji: '🃏', label: 'ჯოკერი' },
  { key: 'rose',    emoji: '🌹', label: 'ვარდი' },
  { key: 'whiskey', emoji: '🥃', label: 'ვისკი' },
  { key: 'smoke',   emoji: '🚬', label: 'ბოსი' },
  { key: 'shades',  emoji: '🕶️', label: 'მაგარი' },
  { key: 'chess',   emoji: '♟️', label: 'სვლა' },
  { key: 'heart',   emoji: '🖤', label: 'void' },
];
const stickerByKey = (k: string) => DM_STICKERS.find(s => s.key === k);

// My-message gradient (Instagram-ish purple → magenta)
const MY_BUBBLE_BG = 'linear-gradient(135deg, #6d28d9 0%, #9333ea 55%, #c026d3 100%)';
const THEIR_BUBBLE_BG = 'rgba(255,255,255,0.09)';

function formatDuration(s: number) {
  const sec = Math.floor(s);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

// ── Voice Recorder Hook ──────────────────────────────────────────────
// Uses tap-to-start + explicit Send/Cancel instead of hold-to-record
// (hold events are unreliable on mobile — pointerLeave fires mid-touch)

function useVoiceRecorder(onSend: (dataUrl: string, duration: number) => void) {
  const mediaRef   = useRef<MediaRecorder | null>(null);
  const chunksRef  = useRef<Blob[]>([]);
  const startRef   = useRef<number>(0);
  const timerRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  // Sync assignment during render so onstop always calls the freshest callback
  const onSendRef  = useRef(onSend);
  onSendRef.current = onSend;

  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);

  const stopMedia = useCallback((doSend: boolean) => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    const mr = mediaRef.current;
    mediaRef.current = null;
    setRecording(false);
    setSeconds(0);
    if (!mr || mr.state === 'inactive') return;

    const dur = (Date.now() - startRef.current) / 1000;

    mr.onstop = () => {
      mr.stream.getTracks().forEach(t => t.stop());
      if (!doSend || dur < 0.5) return; // too short or cancelled
      const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' });
      const reader = new FileReader();
      reader.onload = () => onSendRef.current(reader.result as string, dur);
      reader.readAsDataURL(blob);
    };
    mr.stop();
  }, []);

  const send   = useCallback(() => stopMedia(true),  [stopMedia]);
  const cancel = useCallback(() => stopMedia(false), [stopMedia]);

  const start = useCallback(async () => {
    if (mediaRef.current) return; // already recording
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
      const mimeType = MIME_TYPES.find(t => MediaRecorder.isTypeSupported(t));
      const mr = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 32000 });
      chunksRef.current = [];
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = null;
      mr.start(200);
      mediaRef.current = mr;
      startRef.current = Date.now();
      setRecording(true);
      setSeconds(0);
      timerRef.current = setInterval(() => {
        const s = (Date.now() - startRef.current) / 1000;
        setSeconds(s);
        if (s >= MAX_VOICE_SECONDS) stopMedia(true);
      }, 200);
    } catch { /* mic denied or not available */ }
  }, [stopMedia]);

  useEffect(() => () => { stopMedia(false); }, [stopMedia]);

  return { recording, seconds, start, send, cancel };
}

// ── Image helpers ────────────────────────────────────────────────────

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error('read failed'));
    r.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load failed'));
    img.src = src;
  });
}

/** GIFs pass through untouched (resizing kills animation); photos resize to ≤1000px JPEG. */
async function prepareDmImage(file: File): Promise<string> {
  const raw = await readFileAsDataURL(file);
  if (file.type === 'image/gif') {
    if (raw.length <= 940_000) return raw;
    throw new Error('GIF ძალიან დიდია — მაქს. ~700KB');
  }
  const img = await loadImage(raw);
  const MAX = 1000;
  const scale = Math.min(1, MAX / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
  let q = 0.82;
  let out = canvas.toDataURL('image/jpeg', q);
  while (out.length > 900_000 && q > 0.4) {
    q -= 0.12;
    out = canvas.toDataURL('image/jpeg', q);
  }
  if (out.length > 940_000) throw new Error('სურათი ძალიან დიდია');
  return out;
}

function previewOf(msg: DirectMessage): string {
  const t = msg.text ?? '';
  if (msg.type === 'voice' || t.startsWith('data:audio')) return '🎙 ხმოვანი მესიჯი';
  if (msg.type === 'sticker') return `${stickerByKey(t)?.emoji ?? '🎭'} სტიკერი`;
  if (msg.type === 'invite') return '🎮 მოწვევა თამაშში';
  if (msg.viewOnce) return '📸 ერთჯერადი ფოტო';
  if (t.startsWith('data:image/gif')) return '✨ GIF';
  if (msg.type === 'image' || t.startsWith('data:image')) return '🖼 სურათი';
  return t;
}

// ── Voice Message Bubble ─────────────────────────────────────────────

const VOICE_RATES = [1, 1.5, 2] as const;

function VoiceMessageBubble({ msg, isMe }: { msg: DirectMessage; isMe: boolean }) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(false);
  const [rate, setRate] = useState<number>(1);
  const audioRef   = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  const cycleRate = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = VOICE_RATES[(VOICE_RATES.indexOf(rate as any) + 1) % VOICE_RATES.length]!;
    setRate(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  useEffect(() => () => {
    audioRef.current?.pause();
    if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
  }, []);

  const toggle = useCallback(async () => {
    if (playing) {
      audioRef.current?.pause();
      setPlaying(false);
      return;
    }
    if (!audioRef.current) {
      setLoading(true);
      let src = msg.text;
      // Convert data URL → blob URL: better seek support and memory on mobile
      if (src.startsWith('data:')) {
        try {
          const resp = await fetch(src);
          const blob = await resp.blob();
          src = URL.createObjectURL(blob);
          blobUrlRef.current = src;
        } catch { /* keep original data URL */ }
      }
      const audio = new Audio();
      audio.preload = 'auto';
      audio.src = src;
      audio.ontimeupdate = () => {
        if (audio.duration) setProgress(audio.currentTime / audio.duration);
      };
      audio.onended = () => { setPlaying(false); setProgress(0); };
      audio.onerror = () => { setPlaying(false); setLoading(false); };
      audio.playbackRate = rate;
      audioRef.current = audio;
      setLoading(false);
    }
    try {
      await audioRef.current.play();
      setPlaying(true);
    } catch {
      setPlaying(false);
    }
  }, [playing, msg.text]);

  const dur = msg.audioDuration ?? 0;

  return (
    <div
      className="flex items-center gap-2.5 px-3 py-2.5 min-w-[170px] max-w-[230px] rounded-[18px]"
      style={isMe ? { background: MY_BUBBLE_BG } : { background: THEIR_BUBBLE_BG }}
    >
      <button
        onClick={toggle}
        disabled={loading}
        className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-all active:scale-90 disabled:opacity-40"
        style={{ background: isMe ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.1)', color: '#fff' }}
      >
        {loading ? (
          <div className="w-3 h-3 border-2 border-white/30 border-t-white/70 rounded-full animate-spin" />
        ) : playing ? (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
        )}
      </button>
      <div className="flex-1 space-y-1">
        <div className="flex items-center gap-0.5 h-5">
          {Array.from({ length: 18 }).map((_, i) => {
            const h = 20 + Math.sin(i * 1.3) * 50 + Math.cos(i * 2.1) * 30;
            const filled = i / 18 <= progress;
            return (
              <div key={i} className="flex-1 rounded-full transition-colors duration-75"
                style={{
                  height: `${Math.max(15, h)}%`,
                  background: filled ? '#fff' : isMe ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.18)',
                }}
              />
            );
          })}
        </div>
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-mono" style={{ color: isMe ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.35)' }}>{formatDuration(dur)}</p>
          <button
            onClick={cycleRate}
            className="px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold active:scale-90 transition-transform"
            style={{ background: isMe ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.1)', color: isMe ? '#fff' : 'rgba(255,255,255,0.6)' }}
          >
            {rate}×
          </button>
        </div>
      </div>
    </div>
  );
}

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
  const DELETE_THRESHOLD = 84;

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
    <div className="relative overflow-hidden">
      {/* Delete action revealed behind (hidden until swiped) */}
      <div
        className="absolute right-0 top-0 bottom-0 flex items-center justify-center"
        style={{ width: DELETE_THRESHOLD, background: 'rgba(239,68,68,0.14)' }}
      >
        {confirming ? (
          <div className="flex flex-col gap-1 px-1">
            <button
              onClick={onDelete}
              className="px-2.5 py-1 text-[11px] font-mono text-white bg-red-500/80 rounded-lg"
            >
              წაშლა
            </button>
            <button onClick={cancel} className="px-2.5 py-1 text-[11px] font-mono text-white/50">
              არა
            </button>
          </div>
        ) : (
          <span className="text-red-400/90 text-lg">🗑</span>
        )}
      </div>
      {/* Sliding content — opaque so the delete layer never bleeds through */}
      <div
        style={{
          transform: `translateX(-${swipeX}px)`,
          transition: swipeX === 0 || confirming ? 'transform 0.2s ease' : 'none',
          background: 'rgb(10,6,22)',
        }}
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

function formatDayChip(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const yesterday = new Date(now.getTime() - 86_400_000);
  if (d.toDateString() === now.toDateString()) return 'დღეს';
  if (d.toDateString() === yesterday.toDateString()) return 'გუშინ';
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
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [viewImage, setViewImage] = useState<string | null>(null);
  const [otherTyping, setOtherTyping] = useState(false);
  const [replyTo, setReplyTo] = useState<DirectMessage | null>(null);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [showAttach, setShowAttach] = useState(false);
  const [showStickers, setShowStickers] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [viewOnceOpen, setViewOnceOpen] = useState<DirectMessage | null>(null);
  const viewOnceArmed = useRef(false); // next picked photo is view-once
  const typingHideRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSentRef = useRef(0);
  const lastTapRef = useRef<{ id: string; t: number } | null>(null);
  const gestureRef = useRef<{ id: string; x: number; y: number; long: ReturnType<typeof setTimeout> | null; swiped: boolean } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // Current game room code — powers the "invite to game" card.
  const myRoomCode = useGameStore(s => s.room?.code ?? null);

  // Non-memoized: closes over the current activeConvId on every render.
  // The hook stores this in a ref (onSendRef.current = onSend, sync) so
  // mr.onstop always calls the freshest version.
  const handleVoiceSend = async (dataUrl: string, duration: number) => {
    if (!activeConvId) return;
    setSending(true);
    setVoiceError(null);
    try {
      const res = await emitWithAck<{ conversationId: string; audioData: string; duration: number }, Res<DirectMessage>>(
        'dm:voice', { conversationId: activeConvId, audioData: dataUrl, duration }
      );
      if (res.ok) {
        setMessages(prev => [...prev, res.data]);
        setConversations(prev => prev.map(c =>
          c.id === activeConvId ? { ...c, lastMessage: '🎙 ხმოვანი მესიჯი', lastMessageAt: res.data.createdAt } : c
        ));
      } else {
        setVoiceError(res.error ?? 'Failed to send');
      }
    } catch (e: any) {
      setVoiceError(e?.message ?? 'Send failed');
    }
    finally { setSending(false); }
  };

  const { recording, seconds, start: startRecording, send: sendRecording, cancel: cancelRecording } = useVoiceRecorder(handleVoiceSend);

  const handleImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    const viewOnce = viewOnceArmed.current;
    viewOnceArmed.current = false;
    if (!f || !activeConvId) return;
    setSending(true);
    setVoiceError(null);
    try {
      const imageData = await prepareDmImage(f);
      const res = await emitWithAck<{ conversationId: string; imageData: string; viewOnce: boolean }, Res<DirectMessage>>(
        'dm:image', { conversationId: activeConvId, imageData, viewOnce }
      );
      if (res.ok) {
        // Sender never re-opens a view-once photo — mask it locally right away.
        const mine = viewOnce ? { ...res.data, text: '' } : res.data;
        setMessages(prev => [...prev, mine]);
        setConversations(prev => prev.map(c =>
          c.id === activeConvId ? { ...c, lastMessage: previewOf(res.data), lastMessageAt: res.data.createdAt } : c
        ));
      } else {
        setVoiceError(res.error ?? 'ვერ გაიგზავნა');
      }
    } catch (err2: any) {
      setVoiceError(err2?.message ?? 'ვერ გაიგზავნა');
    } finally { setSending(false); }
  };

  // ── Reactions ─────────────────────────────────────────────────────
  const sendReaction = (messageId: string, emoji: string) => {
    setPickerFor(null);
    if (!myProfileId) return;
    setMessages(prev => prev.map(m => {
      if (m.id !== messageId) return m;
      const r = { ...(m.reactions ?? {}) };
      if (r[myProfileId] === emoji) delete r[myProfileId]; else r[myProfileId] = emoji;
      return { ...m, reactions: r };
    }));
    navigator.vibrate?.(30);
    emitWithAck('dm:react', { messageId, emoji }).catch(() => {});
  };

  // Double-tap a bubble → ❤️ (Instagram style)
  const handleBubbleTap = (msg: DirectMessage) => {
    const now = Date.now();
    const last = lastTapRef.current;
    lastTapRef.current = { id: msg.id, t: now };
    if (last && last.id === msg.id && now - last.t < 320) {
      sendReaction(msg.id, '❤️');
      lastTapRef.current = null;
    }
  };

  // ── Stickers / invites ────────────────────────────────────────────
  const sendSpecial = async (type: 'sticker' | 'invite', payload: string) => {
    if (!activeConvId || sending) return;
    setShowStickers(false);
    setShowAttach(false);
    setSending(true);
    try {
      const res = await emitWithAck<{ conversationId: string; text: string; type: string }, Res<DirectMessage>>(
        'dm:send', { conversationId: activeConvId, text: payload, type }
      );
      if (res.ok) {
        setMessages(prev => [...prev, res.data]);
        setConversations(prev => prev.map(c =>
          c.id === activeConvId ? { ...c, lastMessage: previewOf(res.data), lastMessageAt: res.data.createdAt } : c
        ));
      }
    } catch { /* ignore */ }
    finally { setSending(false); }
  };

  // ── Tenor GIF send (CDN url via dm:image) ─────────────────────────
  const sendGifUrl = async (url: string) => {
    if (!activeConvId) return;
    setShowGifPicker(false);
    setShowAttach(false);
    setSending(true);
    try {
      const res = await emitWithAck<{ conversationId: string; imageData: string; viewOnce: boolean }, Res<DirectMessage>>(
        'dm:image', { conversationId: activeConvId, imageData: url, viewOnce: false }
      );
      if (res.ok) {
        setMessages(prev => [...prev, res.data]);
        setConversations(prev => prev.map(c =>
          c.id === activeConvId ? { ...c, lastMessage: '✨ GIF', lastMessageAt: res.data.createdAt } : c
        ));
      }
    } catch { /* ignore */ }
    finally { setSending(false); }
  };

  // ── View-once open (burn on view) ─────────────────────────────────
  const openViewOnce = (msg: DirectMessage) => {
    if (!msg.text) return;
    setViewOnceOpen(msg);
    emitWithAck('dm:viewonce_open', { messageId: msg.id }).catch(() => {});
  };
  const closeViewOnce = () => {
    if (viewOnceOpen) {
      const id = viewOnceOpen.id;
      setMessages(prev => prev.map(m => m.id === id ? { ...m, text: '', viewedAt: Date.now() } : m));
    }
    setViewOnceOpen(null);
  };

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
    setOtherTyping(false);
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
      setViewImage(null);
      setUnreadCounts(new Map());
    }
  }, [dmPanelOpen, activeDmUserId, loadConversations, refreshUnreadCount]);

  // Real-time messages while panel is open
  useEffect(() => {
    if (!dmPanelOpen) return;
    const handler = ({ conversationId: convId, message }: { conversationId: string; message: DirectMessage }) => {
      if (convId === activeConvId) {
        setOtherTyping(false);
        setMessages(prev => [...prev, message]);
        emitWithAck('dm:mark_read', { conversationId: convId }).catch(() => {});
        refreshUnreadCount();
      } else {
        setConversations(prev => {
          const exists = prev.some(c => c.id === convId);
          if (exists) {
            return prev.map(c => c.id === convId
              ? { ...c, unread: true, lastMessage: previewOf(message), lastMessageAt: message.createdAt }
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

  // Typing indicator (peer → me)
  useEffect(() => {
    if (!dmPanelOpen) return;
    const onTyping = ({ conversationId: convId }: { conversationId: string; fromUserId: string }) => {
      if (convId !== activeConvId) return;
      setOtherTyping(true);
      if (typingHideRef.current) clearTimeout(typingHideRef.current);
      typingHideRef.current = setTimeout(() => setOtherTyping(false), 3000);
    };
    (socket as any).on('dm:typing', onTyping);
    return () => {
      (socket as any).off('dm:typing', onTyping);
      if (typingHideRef.current) clearTimeout(typingHideRef.current);
    };
  }, [dmPanelOpen, activeConvId]);

  // Live seen-receipts (peer read my messages → ✓✓)
  useEffect(() => {
    if (!dmPanelOpen) return;
    const onRead = ({ conversationId: convId }: { conversationId: string; readerId: string }) => {
      if (convId !== activeConvId) return;
      setMessages(prev => prev.map(m =>
        m.senderId === myProfileId && !m.readAt ? { ...m, readAt: Date.now() } : m
      ));
    };
    (socket as any).on('dm:read', onRead);
    return () => { (socket as any).off('dm:read', onRead); };
  }, [dmPanelOpen, activeConvId, myProfileId]);

  // Live reaction updates (both sides)
  useEffect(() => {
    if (!dmPanelOpen) return;
    const onReaction = ({ conversationId: convId, messageId, reactorId, emoji }: { conversationId: string; messageId: string; reactorId: string; emoji: string | null }) => {
      if (convId !== activeConvId) return;
      setMessages(prev => prev.map(m => {
        if (m.id !== messageId) return m;
        const r = { ...(m.reactions ?? {}) };
        if (emoji === null) delete r[reactorId]; else r[reactorId] = emoji;
        return { ...m, reactions: r };
      }));
    };
    (socket as any).on('dm:reaction', onReaction);
    return () => { (socket as any).off('dm:reaction', onReaction); };
  }, [dmPanelOpen, activeConvId]);

  // Scroll to bottom on new messages / typing bubble
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, otherTyping]);

  const notifyTyping = () => {
    if (!activeConvId) return;
    const now = Date.now();
    if (now - lastTypingSentRef.current < 1500) return;
    lastTypingSentRef.current = now;
    (socket as any).emit('dm:typing', { conversationId: activeConvId });
  };

  const handleSend = async () => {
    if (!text.trim() || !activeConvId || sending) return;
    setSending(true);
    const t = text.trim();
    const rTo = replyTo?.id ?? null;
    setText('');
    setReplyTo(null);
    try {
      const res = await emitWithAck<{ conversationId: string; text: string; replyToId: string | null }, Res<DirectMessage>>(
        'dm:send', { conversationId: activeConvId, text: t, replyToId: rTo }
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
    setOtherTyping(false);
    setReplyTo(null);
    setPickerFor(null);
    setShowAttach(false);
    setShowStickers(false);
    setViewOnceOpen(null);
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
          className="fixed inset-0 z-[260] bg-black/60 backdrop-blur-sm"
          onClick={closeDm}
        >
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="absolute right-0 top-0 bottom-0 w-full sm:max-w-sm flex flex-col safe-top-only"
            style={{ background: 'rgb(10,6,22)', borderLeft: '1px solid rgba(138,43,226,0.2)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center gap-2.5 px-3.5 py-2.5 border-b border-white/[0.06] flex-shrink-0"
              style={{ background: 'rgba(14,9,30,0.9)' }}>
              {activeConvId ? (
                <button
                  onClick={handleBack}
                  className="w-8 h-8 -ml-1 rounded-full flex items-center justify-center text-white/50 hover:text-white/80 hover:bg-white/5 transition-all"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>
              ) : null}
              {activeConvId && (activeAvatar || activeAvatarUrl) ? (
                <button
                  className="w-9 h-9 rounded-full flex items-center justify-center text-base shrink-0 overflow-hidden hover:ring-2 ring-neon-purple/60 transition-all"
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
                  <span className="w-9 h-9 rounded-full flex items-center justify-center text-neon-purple/70"
                    style={{ background: 'rgba(138,43,226,0.12)', border: '1px solid rgba(138,43,226,0.25)' }}>
                    <ChatIcon size={17} />
                  </span>
                )
              )}
              <div className="flex-1 min-w-0">
                {activeConvId && activeOtherProfileId ? (
                  <button
                    className="text-left block"
                    onClick={() => openProfile(activeOtherProfileId)}
                  >
                    <span className="font-display font-bold text-sm text-white tracking-wide truncate block leading-tight">
                      {activeUsername}
                    </span>
                    <span className="font-mono text-[10px] leading-tight block" style={{ color: otherTyping ? '#4ade80' : 'rgba(255,255,255,0.28)' }}>
                      {otherTyping ? 'წერს…' : 'პროფილის ნახვა'}
                    </span>
                  </button>
                ) : (
                  <h3 className="font-display font-bold text-sm text-white tracking-[0.14em] truncate uppercase">
                    {activeConvId ? activeUsername : 'მესიჯები'}
                  </h3>
                )}
              </div>
              <button
                onClick={closeDm}
                className="w-8 h-8 rounded-full flex items-center justify-center text-white/35 hover:text-white/70 hover:bg-white/5 transition-all"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
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
                    <p className="text-white/20 font-mono text-sm">მესიჯები ჯერ არ გაქვს</p>
                    <p className="text-white/10 font-mono text-xs mt-1">
                      გახსენი მოთამაშის პროფილი და დააჭირე Message-ს
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
                          <div className="w-full flex items-center gap-3 px-3.5 py-3 active:bg-white/[0.03] transition-colors">
                            {/* Avatar — unread gets an Instagram-style gradient ring */}
                            <button
                              className="relative shrink-0"
                              onClick={() => openProfile(conv.otherUserId)}
                              title={`View ${conv.otherUsername}'s profile`}
                            >
                              <div
                                className="w-[52px] h-[52px] rounded-full p-[2px]"
                                style={{
                                  background: hasUnread
                                    ? 'linear-gradient(135deg,#9b00ff,#ff00cc,#00e5ff)'
                                    : 'rgba(255,255,255,0.08)',
                                }}
                              >
                                <div className="w-full h-full rounded-full p-[2px]" style={{ background: 'rgb(10,6,22)' }}>
                                  <div
                                    className="w-full h-full rounded-full flex items-center justify-center text-lg overflow-hidden"
                                    style={{ background: 'linear-gradient(135deg, #ff0080, #8a2be2)' }}
                                  >
                                    {conv.otherAvatarUrl
                                      ? <img src={conv.otherAvatarUrl} alt={conv.otherUsername} className="w-full h-full object-cover rounded-full" />
                                      : conv.otherAvatar
                                    }
                                  </div>
                                </div>
                              </div>
                            </button>
                            {/* Text area — tap to open chat */}
                            <button
                              className="flex-1 min-w-0 text-left"
                              onClick={() => openConversation(conv.id, conv.otherUsername, conv.otherAvatar, conv.otherUserId, conv.otherAvatarUrl)}
                            >
                              <div className="flex items-center justify-between mb-0.5">
                                <p className={`font-display text-[14px] truncate ${hasUnread ? 'text-white font-bold' : 'text-white/65 font-medium'}`}>
                                  {conv.otherUsername}
                                </p>
                                {conv.lastMessageAt && (
                                  <span className={`font-mono text-[11px] shrink-0 ml-2 ${hasUnread ? 'text-neon-purple/80' : 'text-white/20'}`}>
                                    {formatTime(conv.lastMessageAt)}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center justify-between gap-2">
                                <p className={`font-mono text-[11px] truncate ${hasUnread ? 'text-white/70' : 'text-white/25'}`}>
                                  {conv.lastMessage ?? 'მიწერე პირველი 👋'}
                                </p>
                                {count > 0 ? (
                                  <span
                                    className="min-w-[19px] h-[19px] px-1 rounded-full flex items-center justify-center text-[11px] font-mono font-bold shrink-0"
                                    style={{ background: '#c026d3', color: '#fff', boxShadow: '0 0 8px rgba(192,38,211,0.6)' }}
                                  >
                                    {count > 99 ? '99+' : count}
                                  </span>
                                ) : hasUnread ? (
                                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: '#c026d3', boxShadow: '0 0 6px rgba(192,38,211,0.7)' }} />
                                ) : null}
                              </div>
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
                <div className="flex-1 overflow-y-auto px-3 py-3 min-h-0" onClick={() => { setPickerFor(null); setShowAttach(false); }}>
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
                    <div className="text-center pt-14">
                      <div
                        className="w-16 h-16 mx-auto mb-3 rounded-full flex items-center justify-center text-2xl overflow-hidden"
                        style={{ background: 'linear-gradient(135deg, #ff0080, #8a2be2)' }}
                      >
                        {activeAvatarUrl
                          ? <img src={activeAvatarUrl} alt={activeUsername} className="w-full h-full object-cover rounded-full" />
                          : activeAvatar}
                      </div>
                      <p className="font-display font-bold text-sm text-white/70">{activeUsername}</p>
                      <p className="text-white/20 font-mono text-xs mt-1.5">მიწერე პირველი 👋</p>
                    </div>
                  ) : (
                    messages.map((msg, i) => {
                      const isMe = msg.senderId === myProfileId;
                      const prev = messages[i - 1];
                      const next = messages[i + 1];
                      const newDay = !prev || new Date(prev.createdAt).toDateString() !== new Date(msg.createdAt).toDateString();
                      const groupEnd = !next
                        || next.senderId !== msg.senderId
                        || next.createdAt - msg.createdAt >= GROUP_WINDOW_MS
                        || new Date(next.createdAt).toDateString() !== new Date(msg.createdAt).toDateString();
                      const groupStart = newDay || !prev
                        || prev.senderId !== msg.senderId
                        || msg.createdAt - prev.createdAt >= GROUP_WINDOW_MS;
                      const isImage = msg.type === 'image' || msg.text.startsWith('data:image');
                      const quoted = msg.replyToId ? messages.find(m => m.id === msg.replyToId) : null;
                      const rxList = msg.reactions ? Object.values(msg.reactions) : [];
                      const rxCounts = rxList.reduce<Record<string, number>>((a, e) => { a[e] = (a[e] ?? 0) + 1; return a; }, {});
                      const burned = msg.viewOnce && !msg.text;
                      return (
                        <div key={msg.id}>
                          {newDay && (
                            <div className="flex justify-center my-3">
                              <span className="px-3 py-1 rounded-full text-[10px] font-mono text-white/35"
                                style={{ background: 'rgba(255,255,255,0.05)' }}>
                                {formatDayChip(msg.createdAt)}
                              </span>
                            </div>
                          )}
                          <div className={`flex items-end gap-1.5 ${isMe ? 'justify-end' : 'justify-start'} ${groupStart ? 'mt-2' : 'mt-[3px]'}`}>
                            {/* Peer avatar — once per group, bottom-aligned (Messenger style) */}
                            {!isMe && (
                              <div className="w-6 shrink-0">
                                {groupEnd && (
                                  <div
                                    className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] overflow-hidden"
                                    style={{ background: 'linear-gradient(135deg, #ff0080, #8a2be2)' }}
                                  >
                                    {activeAvatarUrl
                                      ? <img src={activeAvatarUrl} alt="" className="w-full h-full object-cover rounded-full" />
                                      : activeAvatar}
                                  </div>
                                )}
                              </div>
                            )}
                            {/* Bubble wrapper — double-tap ❤️, long-press picker, swipe-right reply */}
                            <div
                              className="relative"
                              onClick={e => { e.stopPropagation(); handleBubbleTap(msg); }}
                              onContextMenu={e => { e.preventDefault(); setPickerFor(msg.id); }}
                              onTouchStart={e => {
                                const t = e.touches[0];
                                gestureRef.current = {
                                  id: msg.id, x: t.clientX, y: t.clientY, swiped: false,
                                  long: setTimeout(() => { setPickerFor(msg.id); navigator.vibrate?.(40); }, 450),
                                };
                              }}
                              onTouchMove={e => {
                                const g = gestureRef.current;
                                if (!g || g.id !== msg.id) return;
                                const t = e.touches[0];
                                const dx = t.clientX - g.x, dy = t.clientY - g.y;
                                if ((Math.abs(dx) > 10 || Math.abs(dy) > 10) && g.long) { clearTimeout(g.long); g.long = null; }
                                if (!g.swiped && dx > 56 && Math.abs(dy) < 40) {
                                  g.swiped = true;
                                  setReplyTo(msg);
                                  navigator.vibrate?.(30);
                                }
                              }}
                              onTouchEnd={() => {
                                const g = gestureRef.current;
                                if (g?.long) clearTimeout(g.long);
                                gestureRef.current = null;
                              }}
                            >
                              {/* Reaction picker popover */}
                              <AnimatePresence>
                                {pickerFor === msg.id && (
                                  <motion.div
                                    initial={{ opacity: 0, scale: 0.8, y: 6 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.8, y: 6 }}
                                    className={`absolute -top-11 z-30 flex gap-0.5 px-2 py-1.5 rounded-full ${isMe ? 'right-0' : 'left-0'}`}
                                    style={{ background: 'rgba(22,13,44,0.98)', border: '1px solid rgba(255,255,255,0.14)', boxShadow: '0 6px 24px rgba(0,0,0,0.5)' }}
                                    onClick={e => e.stopPropagation()}
                                  >
                                    {REACTION_EMOJIS.map(em => (
                                      <button key={em} onClick={() => sendReaction(msg.id, em)}
                                        className="text-lg leading-none px-1 active:scale-125 transition-transform">
                                        {em}
                                      </button>
                                    ))}
                                  </motion.div>
                                )}
                              </AnimatePresence>

                              {msg.type === 'voice' ? (
                                <VoiceMessageBubble msg={msg} isMe={isMe} />
                              ) : msg.type === 'sticker' ? (
                                <div className="flex flex-col items-center px-2 py-1">
                                  <span style={{ fontSize: 54, lineHeight: 1.1, filter: 'drop-shadow(0 0 12px rgba(155,0,255,0.55))' }}>
                                    {stickerByKey(msg.text)?.emoji ?? '🎭'}
                                  </span>
                                  <span className="text-[10px] font-mono text-white/30 mt-1">{stickerByKey(msg.text)?.label ?? ''}</span>
                                </div>
                              ) : msg.type === 'invite' ? (
                                <div className="rounded-[16px] p-3 w-[220px]"
                                  style={isMe ? { background: MY_BUBBLE_BG } : { background: THEIR_BUBBLE_BG, border: '1px solid rgba(255,255,255,0.1)' }}>
                                  <div className="flex items-center gap-2.5 mb-2.5">
                                    <span className="text-2xl">🎮</span>
                                    <div className="min-w-0">
                                      <p className="text-[12.5px] font-display font-bold text-white leading-tight">მოწვევა თამაშში</p>
                                      <p className="text-[11px] font-mono" style={{ color: 'rgba(255,255,255,0.55)' }}>ოთახი · {msg.text}</p>
                                    </div>
                                  </div>
                                  <button
                                    onClick={e => { e.stopPropagation(); window.location.href = '/join/' + msg.text; }}
                                    className="w-full py-2 rounded-xl text-[12px] font-mono font-bold active:scale-[0.98] transition-transform"
                                    style={{ background: 'rgba(255,255,255,0.18)', color: '#fff', border: '1px solid rgba(255,255,255,0.22)' }}
                                  >
                                    შესვლა →
                                  </button>
                                </div>
                              ) : msg.viewOnce ? (
                                <button
                                  disabled={!!burned || isMe}
                                  onClick={e => { e.stopPropagation(); openViewOnce(msg); }}
                                  className="flex items-center gap-2.5 px-4 py-3 rounded-[18px] disabled:opacity-100"
                                  style={isMe ? { background: MY_BUBBLE_BG } : { background: THEIR_BUBBLE_BG, border: burned ? '1px solid rgba(255,255,255,0.06)' : '1px dashed rgba(192,132,252,0.5)' }}
                                >
                                  <span className="text-lg">{burned ? '🫥' : '📸'}</span>
                                  <span className="text-[12.5px] font-mono" style={{ color: burned ? 'rgba(255,255,255,0.35)' : '#fff' }}>
                                    {burned ? 'ნანახია' : isMe ? 'ერთჯერადი ფოტო' : 'ერთჯერადი — გახსენი'}
                                  </span>
                                </button>
                              ) : isImage ? (
                                <button
                                  onClick={e => { e.stopPropagation(); handleBubbleTap(msg); setViewImage(msg.text); }}
                                  className="overflow-hidden rounded-[16px] active:scale-[0.98] transition-transform"
                                  style={{ border: '1px solid rgba(255,255,255,0.08)' }}
                                >
                                  <img src={msg.text} alt="" className="block max-w-[210px] max-h-[260px] object-cover" loading="lazy" />
                                </button>
                              ) : (
                                <div
                                  className={[
                                    'max-w-full px-3.5 py-2 text-[13.5px] leading-snug break-words rounded-[18px]',
                                    isMe
                                      ? (groupEnd ? 'rounded-br-[5px]' : '') + (groupStart ? '' : ' rounded-tr-[5px]')
                                      : (groupEnd ? 'rounded-bl-[5px]' : '') + (groupStart ? '' : ' rounded-tl-[5px]'),
                                  ].join(' ')}
                                  style={isMe
                                    ? { background: MY_BUBBLE_BG, color: '#fff' }
                                    : { background: THEIR_BUBBLE_BG, color: 'rgba(255,255,255,0.88)' }}
                                >
                                  {/* Quoted reply preview */}
                                  {msg.replyToId && (
                                    <div className="mb-1.5 pl-2 py-1 pr-2 rounded-lg text-[11px] font-mono truncate max-w-[220px]"
                                      style={{
                                        borderLeft: '2.5px solid rgba(255,255,255,0.5)',
                                        background: 'rgba(0,0,0,0.22)',
                                        color: isMe ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.5)',
                                      }}>
                                      {quoted ? previewOf(quoted) : '…'}
                                    </div>
                                  )}
                                  {msg.text}
                                </div>
                              )}

                              {/* Reaction chips */}
                              {Object.keys(rxCounts).length > 0 && (
                                <div className={`absolute -bottom-3 flex gap-0.5 ${isMe ? 'right-1' : 'left-1'}`}>
                                  {Object.entries(rxCounts).map(([em, n]) => (
                                    <span key={em}
                                      className="flex items-center px-1.5 py-0.5 rounded-full text-[11px] leading-none"
                                      style={{ background: 'rgba(24,14,46,0.97)', border: '1px solid rgba(155,0,255,0.35)', boxShadow: '0 2px 8px rgba(0,0,0,0.4)' }}>
                                      {em}{n > 1 && <span className="text-[9px] font-mono text-white/60 ml-0.5">{n}</span>}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                          {groupEnd && (
                            <p className={`text-[10px] font-mono ${Object.keys(rxCounts).length ? 'mt-3.5' : 'mt-0.5'} ${isMe ? 'text-right pr-1' : 'text-left pl-9'}`}
                               style={{ color: 'rgba(255,255,255,0.2)' }}>
                              {formatTime(msg.createdAt)}
                              {isMe && (
                                <span className="ml-1" style={{ color: msg.readAt ? '#c084fc' : 'rgba(255,255,255,0.25)' }}>
                                  {msg.readAt ? '✓✓' : '✓'}
                                </span>
                              )}
                            </p>
                          )}
                        </div>
                      );
                    })
                  )}
                  {/* Typing indicator bubble */}
                  <AnimatePresence>
                    {otherTyping && (
                      <motion.div
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 6 }}
                        className="flex items-end gap-1.5 mt-2"
                      >
                        <div
                          className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] overflow-hidden shrink-0"
                          style={{ background: 'linear-gradient(135deg, #ff0080, #8a2be2)' }}
                        >
                          {activeAvatarUrl
                            ? <img src={activeAvatarUrl} alt="" className="w-full h-full object-cover rounded-full" />
                            : activeAvatar}
                        </div>
                        <div className="px-3.5 py-2.5 rounded-[18px] rounded-bl-[5px] flex items-center gap-1"
                          style={{ background: THEIR_BUBBLE_BG }}>
                          {[0, 1, 2].map(d => (
                            <motion.span
                              key={d}
                              className="w-1.5 h-1.5 rounded-full bg-white/50"
                              animate={{ y: [0, -3, 0], opacity: [0.4, 1, 0.4] }}
                              transition={{ repeat: Infinity, duration: 0.9, delay: d * 0.15 }}
                            />
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <div ref={bottomRef} />
                </div>

                {/* Input bar */}
                <div
                  className="px-2.5 pt-2 border-t border-white/[0.06] flex-shrink-0"
                  style={{ paddingBottom: 'calc(0.7rem + env(safe-area-inset-bottom, 0px))', background: 'rgba(14,9,30,0.9)' }}
                >
                  {/* Hidden image/GIF picker */}
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImagePick} />

                  {/* Send error */}
                  <AnimatePresence>
                    {voiceError && (
                      <motion.p
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="text-[11px] font-mono text-red-400/80 px-1 mb-1"
                      >
                        ⚠ {voiceError}
                      </motion.p>
                    )}
                  </AnimatePresence>

                  {/* Reply-to bar */}
                  <AnimatePresence>
                    {replyTo && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="flex items-center gap-2 mb-1.5 px-3 py-2 rounded-xl"
                          style={{ background: 'rgba(138,43,226,0.1)', borderLeft: '3px solid rgba(192,132,252,0.7)' }}>
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-mono text-neon-purple/70 mb-0.5">
                              ↩ პასუხი · {replyTo.senderId === myProfileId ? 'შენ' : activeUsername}
                            </p>
                            <p className="text-[11.5px] font-mono text-white/55 truncate">{previewOf(replyTo)}</p>
                          </div>
                          <button onClick={() => setReplyTo(null)}
                            className="w-6 h-6 rounded-full flex items-center justify-center text-white/40 hover:text-white/70 shrink-0">
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                            </svg>
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Attach popover: photo / view-once / game invite */}
                  <AnimatePresence>
                    {showAttach && (
                      <motion.div
                        initial={{ opacity: 0, y: 8, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.96 }}
                        className="mb-1.5 rounded-2xl overflow-hidden"
                        style={{ background: 'rgba(20,12,40,0.98)', border: '1px solid rgba(138,43,226,0.3)' }}
                      >
                        <button
                          onClick={() => { viewOnceArmed.current = false; setShowAttach(false); fileRef.current?.click(); }}
                          className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-white/5"
                        >
                          <span className="text-lg">🖼</span>
                          <span className="text-[13px] font-mono text-white/80">ფოტო ან GIF</span>
                        </button>
                        <button
                          onClick={() => { setShowAttach(false); setShowGifPicker(true); }}
                          className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-white/5 border-t border-white/[0.05]"
                        >
                          <span className="text-lg">🎞</span>
                          <div>
                            <span className="text-[13px] font-mono text-white/80 block">GIF (Tenor)</span>
                            <span className="text-[10px] font-mono text-white/30">ძებნა და გაგზავნა</span>
                          </div>
                        </button>
                        <button
                          onClick={() => { viewOnceArmed.current = true; setShowAttach(false); fileRef.current?.click(); }}
                          className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-white/5 border-t border-white/[0.05]"
                        >
                          <span className="text-lg">📸</span>
                          <div>
                            <span className="text-[13px] font-mono text-white/80 block">ერთჯერადი ფოტო</span>
                            <span className="text-[10px] font-mono text-white/30">ნახვის შემდეგ ქრება</span>
                          </div>
                        </button>
                        {myRoomCode && (
                          <button
                            onClick={() => sendSpecial('invite', myRoomCode)}
                            className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-white/5 border-t border-white/[0.05]"
                          >
                            <span className="text-lg">🎮</span>
                            <div>
                              <span className="text-[13px] font-mono text-white/80 block">თამაშში მოწვევა</span>
                              <span className="text-[10px] font-mono text-white/30">ოთახი · {myRoomCode}</span>
                            </div>
                          </button>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Sticker sheet */}
                  <AnimatePresence>
                    {showStickers && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        className="mb-1.5 rounded-2xl p-3 grid grid-cols-4 gap-1.5"
                        style={{ background: 'rgba(20,12,40,0.98)', border: '1px solid rgba(138,43,226,0.3)' }}
                      >
                        {DM_STICKERS.map(s => (
                          <button
                            key={s.key}
                            onClick={() => sendSpecial('sticker', s.key)}
                            className="flex flex-col items-center gap-1 py-2 rounded-xl active:bg-white/8 active:scale-95 transition-all"
                          >
                            <span style={{ fontSize: 30, lineHeight: 1, filter: 'drop-shadow(0 0 8px rgba(155,0,255,0.4))' }}>{s.emoji}</span>
                            <span className="text-[9px] font-mono text-white/35">{s.label}</span>
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <AnimatePresence mode="wait">
                    {recording ? (
                      /* ── Recording bar: tap Send or Cancel ── */
                      <motion.div
                        key="recording"
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 6 }}
                        className="flex items-center gap-2"
                      >
                        {/* Cancel */}
                        <button
                          onClick={cancelRecording}
                          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-white/50 hover:text-white/80 transition-colors"
                          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>

                        {/* Waveform / timer */}
                        <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-full"
                          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                          <motion.div
                            animate={{ opacity: [1, 0.2, 1] }}
                            transition={{ repeat: Infinity, duration: 0.9 }}
                            className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0"
                          />
                          <div className="flex items-end gap-px flex-1 h-5">
                            {Array.from({ length: 24 }).map((_, i) => (
                              <motion.div
                                key={i}
                                className="flex-1 rounded-full bg-red-400/60"
                                animate={{ scaleY: [0.3, 1, 0.3] }}
                                transition={{ repeat: Infinity, duration: 0.5 + (i % 3) * 0.2, delay: i * 0.04 }}
                                style={{ transformOrigin: 'bottom' }}
                              />
                            ))}
                          </div>
                          <span className="text-xs font-mono text-red-400 flex-shrink-0 tabular-nums">{formatDuration(seconds)}</span>
                        </div>

                        {/* Send */}
                        <motion.button
                          whileTap={{ scale: 0.9 }}
                          onClick={sendRecording}
                          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-all"
                          style={{ background: MY_BUBBLE_BG, color: '#fff' }}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                          </svg>
                        </motion.button>
                      </motion.div>
                    ) : (
                      /* ── Normal text input bar ── */
                      <motion.div
                        key="text"
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 6 }}
                        className="flex items-center gap-1.5"
                      >
                        {/* Attach menu (photo / view-once / invite) */}
                        <button
                          onClick={() => { setShowAttach(v => !v); setShowStickers(false); }}
                          disabled={sending}
                          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-all active:scale-90 disabled:opacity-40"
                          style={{
                            background: showAttach ? 'rgba(138,43,226,0.3)' : 'rgba(138,43,226,0.13)',
                            border: '1px solid rgba(138,43,226,0.28)', color: '#c084fc',
                            transform: showAttach ? 'rotate(45deg)' : undefined,
                          }}
                          title="მიმაგრება"
                        >
                          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round">
                            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                          </svg>
                        </button>

                        {/* Stickers */}
                        <button
                          onClick={() => { setShowStickers(v => !v); setShowAttach(false); }}
                          disabled={sending}
                          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-lg transition-all active:scale-90 disabled:opacity-40"
                          style={{
                            background: showStickers ? 'rgba(138,43,226,0.3)' : 'rgba(138,43,226,0.13)',
                            border: '1px solid rgba(138,43,226,0.28)',
                          }}
                          title="სტიკერები"
                        >
                          🎭
                        </button>

                        <input
                          ref={inputRef}
                          value={text}
                          onChange={e => { setText(e.target.value); notifyTyping(); }}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
                          }}
                          placeholder="მესიჯი…"
                          maxLength={500}
                          className="flex-1 rounded-full px-4 py-2.5 text-sm focus:outline-none transition-all min-w-0"
                          style={{
                            background: 'rgba(255,255,255,0.06)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            color: '#ffffff',
                            WebkitTextFillColor: '#ffffff',
                            caretColor: '#c084fc',
                            colorScheme: 'dark',
                          }}
                          onFocus={e => { (e.target as HTMLInputElement).style.borderColor = 'rgba(138,43,226,0.55)'; }}
                          onBlur={e => { (e.target as HTMLInputElement).style.borderColor = 'rgba(255,255,255,0.1)'; }}
                        />

                        {/* Mic (no text) or gradient Send (has text) */}
                        {text.trim() ? (
                          <motion.button
                            key="send"
                            initial={{ scale: 0.6, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            whileTap={{ scale: 0.88 }}
                            onClick={handleSend}
                            disabled={sending}
                            className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 disabled:opacity-40"
                            style={{ background: MY_BUBBLE_BG, color: '#fff', boxShadow: '0 2px 12px rgba(147,51,234,0.4)' }}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                              strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                              <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                            </svg>
                          </motion.button>
                        ) : (
                          <button
                            onClick={startRecording}
                            disabled={sending}
                            className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-all active:scale-90 disabled:opacity-40"
                            style={{ background: 'rgba(138,43,226,0.13)', border: '1px solid rgba(138,43,226,0.28)', color: '#c084fc' }}
                            title="ხმოვანი მესიჯი"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                              <line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
                            </svg>
                          </button>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </>
            )}

            {/* Fullscreen image viewer */}
            <AnimatePresence>
              {viewImage && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 z-20 flex items-center justify-center"
                  style={{ background: 'rgba(0,0,0,0.94)' }}
                  onClick={() => setViewImage(null)}
                >
                  <button
                    onClick={() => setViewImage(null)}
                    className="absolute top-3 right-3 w-9 h-9 rounded-full flex items-center justify-center text-white/70 z-10"
                    style={{ background: 'rgba(255,255,255,0.1)' }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                  <img src={viewImage} alt="" className="max-w-full max-h-full object-contain" onClick={e => e.stopPropagation()} />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Tenor GIF picker */}
            <AnimatePresence>
              {showGifPicker && <GifPicker onSelect={sendGifUrl} onClose={() => setShowGifPicker(false)} />}
            </AnimatePresence>

            {/* View-once fullscreen — closing burns the photo */}
            <AnimatePresence>
              {viewOnceOpen && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 z-20 flex flex-col items-center justify-center"
                  style={{ background: 'rgba(0,0,0,0.97)' }}
                  onClick={closeViewOnce}
                >
                  <div className="absolute top-3 left-0 right-0 flex items-center justify-between px-3 z-10">
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-mono text-white/60"
                      style={{ background: 'rgba(255,255,255,0.08)' }}>
                      📸 ერთჯერადი — დახურვის შემდეგ გაქრება
                    </span>
                    <button
                      onClick={closeViewOnce}
                      className="w-9 h-9 rounded-full flex items-center justify-center text-white/70"
                      style={{ background: 'rgba(255,255,255,0.1)' }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    </button>
                  </div>
                  <img src={viewOnceOpen.text} alt="" className="max-w-full max-h-full object-contain" onClick={e => e.stopPropagation()} />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
