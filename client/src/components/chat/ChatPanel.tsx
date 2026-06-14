import React, { useState, useRef, useEffect, KeyboardEvent, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import { useGameStore } from '@/store/gameStore';
import { useT } from '@/store/langStore';
import { ChatMessage, ChatChannel } from '@/types/index';

const SPECTATOR_REACTIONS = ['👀', '🔥', '💀', '😮', '👏', '❓', '😂', '🤫'];
const MAX_VOICE_SECONDS = 30;

function formatDuration(s: number) {
  const sec = Math.floor(s);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

// ── Voice Message Bubble ────────────────────────────────────────────

function VoiceMessageBubble({ msg, isMe }: { msg: ChatMessage; isMe: boolean }) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const toggle = useCallback(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio(msg.text);
      audioRef.current.ontimeupdate = () => {
        const a = audioRef.current!;
        setProgress(a.duration ? a.currentTime / a.duration : 0);
      };
      audioRef.current.onended = () => { setPlaying(false); setProgress(0); };
    }
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      audioRef.current.play().catch(() => {});
      setPlaying(true);
    }
  }, [playing, msg.text]);

  useEffect(() => () => { audioRef.current?.pause(); }, []);

  const dur = msg.audioDuration ?? 0;
  const isMafiaMsg = msg.channel === 'mafia';
  const isSpecMsg  = msg.channel === 'spectator';
  const accentClass = isMafiaMsg ? 'text-neon-pink' : isSpecMsg ? 'text-neon-purple' : 'text-neon-cyan';
  const bubbleBg = isMe
    ? isMafiaMsg ? 'bg-neon-pink/10 border-neon-pink/20'
      : isSpecMsg ? 'bg-neon-purple/10 border-neon-purple/20'
      : 'bg-neon-cyan/8 border-neon-cyan/18'
    : 'bg-white/4 border-white/8';

  return (
    <motion.div
      initial={{ opacity: 0, x: isMe ? 8 : -8 }}
      animate={{ opacity: 1, x: 0 }}
      className={clsx('flex flex-col gap-0.5', isMe ? 'items-end' : 'items-start')}
    >
      <div className="flex items-baseline gap-1.5">
        <span className={clsx('text-xs font-mono', accentClass + '/70')}>
          {msg.seat ? `#${msg.seat} ` : ''}{msg.senderName}
          {msg.isMod && <span className="ml-1 text-[9px] font-bold text-neon-green border border-neon-green/30 px-1 rounded bg-neon-green/10">MOD</span>}
        </span>
        <span className="text-[9px] font-mono text-white/15">
          {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
      <div className={clsx('flex items-center gap-2.5 px-3 py-2.5 rounded-2xl border min-w-[140px] max-w-[220px]', bubbleBg)}>
        {/* Play/Pause button */}
        <button
          onClick={toggle}
          className={clsx(
            'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all active:scale-90',
            playing
              ? isMafiaMsg ? 'bg-neon-pink/25 text-neon-pink' : isSpecMsg ? 'bg-neon-purple/25 text-neon-purple' : 'bg-neon-cyan/20 text-neon-cyan'
              : 'bg-white/8 text-white/60 hover:bg-white/14 hover:text-white/90',
          )}
        >
          {playing ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
          )}
        </button>

        {/* Waveform bar + progress */}
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-0.5 h-5">
            {Array.from({ length: 18 }).map((_, i) => {
              const h = 20 + Math.sin(i * 1.3) * 50 + Math.cos(i * 2.1) * 30;
              const filled = i / 18 <= progress;
              return (
                <div
                  key={i}
                  className="flex-1 rounded-full transition-colors duration-75"
                  style={{
                    height: `${Math.max(15, h)}%`,
                    background: filled
                      ? isMafiaMsg ? '#f472b6' : isSpecMsg ? '#a855f7' : '#00e5ff'
                      : 'rgba(255,255,255,0.12)',
                  }}
                />
              );
            })}
          </div>
          <p className="text-[9px] font-mono text-white/30">{formatDuration(dur)}</p>
        </div>
      </div>
    </motion.div>
  );
}

// ── Text Message Bubble ─────────────────────────────────────────────

function MessageBubble({ msg, isMe }: { msg: ChatMessage; isMe: boolean }) {
  if (msg.isSystem) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center text-xs text-white/35 py-1 px-2 font-mono"
      >
        ⬡ {msg.text}
      </motion.div>
    );
  }

  if (msg.type === 'voice') return <VoiceMessageBubble msg={msg} isMe={isMe} />;

  const isMafiaMsg = msg.channel === 'mafia';
  const isSpectatorMsg = msg.channel === 'spectator';

  const isReaction = isSpectatorMsg && /^\p{Emoji}+$/u.test(msg.text.trim()) && msg.text.trim().length <= 4;
  if (isReaction) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.7 }}
        animate={{ opacity: 1, scale: 1 }}
        className={clsx('flex items-center gap-1.5', isMe ? 'justify-end' : 'justify-start')}
      >
        <span className="text-[10px] font-mono text-neon-purple/50">{msg.senderName}</span>
        <span className="text-lg">{msg.text}</span>
      </motion.div>
    );
  }

  const accentColor = isMafiaMsg ? 'text-neon-pink/70' : isSpectatorMsg ? 'text-neon-purple/70' : 'text-neon-cyan/60';
  const bubbleStyle = isMe
    ? isMafiaMsg ? 'bg-neon-pink/12 border border-neon-pink/22 text-white'
      : isSpectatorMsg ? 'bg-neon-purple/12 border border-neon-purple/22 text-white'
      : 'bg-neon-cyan/8 border border-neon-cyan/18 text-white'
    : 'bg-white/5 border border-white/8 text-white/90';

  return (
    <motion.div
      initial={{ opacity: 0, x: isMe ? 8 : -8 }}
      animate={{ opacity: 1, x: 0 }}
      className={clsx('flex flex-col gap-0.5', isMe ? 'items-end' : 'items-start')}
    >
      <div className="flex items-baseline gap-1.5">
        <span className={clsx('text-xs font-mono', accentColor)}>
          {msg.seat ? `#${msg.seat} ` : ''}{msg.senderName}
          {msg.isMod && <span className="ml-1 text-[9px] font-bold text-neon-green border border-neon-green/30 px-1 rounded bg-neon-green/10">MOD</span>}
        </span>
        <span className="text-[9px] font-mono text-white/15">
          {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
      <div className={clsx('max-w-[80%] px-3 py-2 rounded-2xl text-sm break-words leading-relaxed', bubbleStyle)}>
        {msg.text}
      </div>
    </motion.div>
  );
}

// ── Voice Recorder Hook ─────────────────────────────────────────────

function useVoiceRecorder(onComplete: (dataUrl: string, duration: number) => void) {
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startRef  = useRef<number>(0);
  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds]     = useState(0);

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm' });
      chunksRef.current = [];
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        const dur = (Date.now() - startRef.current) / 1000;
        const blob = new Blob(chunksRef.current, { type: mr.mimeType });
        stream.getTracks().forEach(t => t.stop());
        const reader = new FileReader();
        reader.onload = () => onComplete(reader.result as string, dur);
        reader.readAsDataURL(blob);
      };
      mr.start(100);
      mediaRef.current = mr;
      startRef.current = Date.now();
      setRecording(true);
      setSeconds(0);
      timerRef.current = setInterval(() => {
        const s = (Date.now() - startRef.current) / 1000;
        setSeconds(s);
        if (s >= MAX_VOICE_SECONDS) stop();
      }, 200);
    } catch { /* mic denied — ignore */ }
  }, [onComplete]);

  const stop = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (mediaRef.current && mediaRef.current.state !== 'inactive') {
      mediaRef.current.stop();
    }
    setRecording(false);
    setSeconds(0);
  }, []);

  useEffect(() => () => { stop(); }, [stop]);

  return { recording, seconds, start, stop };
}

// ── Main ChatPanel ──────────────────────────────────────────────────

interface Props { compact?: boolean; }

export function ChatPanel({ compact = false }: Props) {
  const { room, myPlayer, sendChat, sendVoiceMessage, amAlive } = useGameStore(s => ({
    room: s.room,
    myPlayer: s.myPlayer(),
    sendChat: s.sendChat,
    sendVoiceMessage: s.sendVoiceMessage,
    amAlive: s.amAlive(),
  }));
  const t = useT();

  const [text, setText] = useState('');
  const [channel, setChannel] = useState<ChatChannel>(() =>
    myPlayer?.isSpectator ? 'spectator' : 'room',
  );
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);

  const amSpectator = myPlayer?.isSpectator ?? false;
  const isNight     = room?.phase === 'night';
  const isMafia     = myPlayer?.team === 'mafia';
  const canChat     = amAlive && !isNight && !amSpectator;
  const canMafiaChat  = isMafia && isNight && !amSpectator;
  const canDeadChat   = !amAlive && !amSpectator;

  const canSendInChannel = channel === 'spectator' ? amSpectator
    : channel === 'mafia' ? canMafiaChat
    : channel === 'dead'  ? canDeadChat
    : canChat;

  useEffect(() => {
    if (amSpectator && channel !== 'spectator') setChannel('spectator');
  }, [amSpectator, channel]);

  const messages = channel === 'mafia' ? (room?.mafiaChat ?? [])
    : channel === 'dead'      ? (room?.deadChat ?? [])
    : channel === 'spectator' ? (room?.spectatorChat ?? [])
    : (room?.chat ?? []).filter(m => m.channel !== 'dead');

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || !room) return;
    setText('');
    await sendChat(trimmed, channel);
  };

  const handleKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleVoiceComplete = useCallback(async (dataUrl: string, duration: number) => {
    if (!room || !canSendInChannel) return;
    await sendVoiceMessage(dataUrl, duration, channel);
  }, [room, canSendInChannel, channel, sendVoiceMessage]);

  const { recording, seconds, start: startRecording, stop: stopRecording } = useVoiceRecorder(handleVoiceComplete);

  const availableChannels: ChatChannel[] = amSpectator
    ? ['spectator']
    : (['room', ...(isMafia ? ['mafia'] : []), ...(!amAlive ? ['dead'] : [])] as ChatChannel[]);

  const channelAccent = channel === 'mafia' ? 'neon-pink' : channel === 'spectator' ? 'neon-purple' : 'neon-cyan';

  return (
    <div className={clsx('flex flex-col', compact ? 'h-full' : 'h-80 md:h-full')}>
      {/* Channel selector */}
      {availableChannels.length > 1 && (
        <div className="flex gap-1 mb-2 flex-shrink-0">
          {availableChannels.map(ch => (
            <button
              key={ch}
              onClick={() => setChannel(ch)}
              className={clsx(
                'px-3 py-1 rounded-lg text-xs font-display font-semibold tracking-widest uppercase transition-all',
                channel === ch
                  ? ch === 'mafia' ? 'bg-neon-pink/20 text-neon-pink border border-neon-pink/40'
                  : ch === 'dead'  ? 'bg-white/10 text-white/50 border border-white/20'
                  : 'bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/30'
                  : 'text-white/30 hover:text-white/60',
              )}
            >
              {ch === 'mafia' ? t.game.chat.mafiaChannel
                : ch === 'dead' ? t.game.chat.deadChannel
                : t.game.chat.roomChannel}
            </button>
          ))}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1 mb-2 min-h-0">
        <AnimatePresence initial={false}>
          {messages.map(msg => (
            <MessageBubble key={msg.id} msg={msg} isMe={msg.senderId === myPlayer?.id} />
          ))}
        </AnimatePresence>
        <div ref={bottomRef} />
      </div>

      {/* Spectator reaction bar */}
      {amSpectator && channel === 'spectator' && (
        <div className="flex gap-1.5 mb-2 flex-wrap flex-shrink-0">
          {SPECTATOR_REACTIONS.map(emoji => (
            <button key={emoji} onClick={() => sendChat(emoji, 'spectator')}
              className="text-base px-2 py-1 rounded-lg border border-white/10 hover:border-neon-purple/40 hover:bg-neon-purple/10 transition-all active:scale-90">
              {emoji}
            </button>
          ))}
        </div>
      )}

      {/* Recording indicator */}
      <AnimatePresence>
        {recording && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            className="flex items-center gap-2 mb-1.5 px-3 py-1.5 rounded-xl flex-shrink-0"
            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }}
          >
            <motion.div
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ repeat: Infinity, duration: 1 }}
              className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0"
            />
            <span className="text-xs font-mono text-red-400 flex-1">Recording... {formatDuration(seconds)}</span>
            <span className="text-[10px] font-mono text-white/30">{formatDuration(MAX_VOICE_SECONDS - seconds)} left</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input bar */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {/* Text input */}
        <div
          className="flex-1 flex items-center rounded-2xl px-3 py-1.5 transition-all duration-200"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: canSendInChannel
              ? channel === 'mafia' ? '1px solid rgba(244,114,182,0.2)' : channel === 'spectator' ? '1px solid rgba(168,85,247,0.2)' : '1px solid rgba(0,229,255,0.15)'
              : '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <input
            ref={inputRef}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={handleKey}
            placeholder={
              !canSendInChannel
                ? isNight && channel === 'room' ? t.game.chat.nightSilence : t.game.chat.cannotSend
                : channel === 'mafia' ? t.game.chat.mafiaChatPlaceholder
                : channel === 'spectator' ? 'Spectators…'
                : t.game.chat.sendPlaceholder
            }
            disabled={!canSendInChannel || recording}
            maxLength={400}
            className="flex-1 bg-transparent text-sm text-white placeholder-white/20 focus:outline-none disabled:opacity-40 min-w-0"
          />
          {/* Char count hint */}
          {text.length > 300 && (
            <span className={clsx('text-[10px] font-mono flex-shrink-0 ml-1', text.length > 380 ? 'text-neon-red/70' : 'text-white/25')}>
              {400 - text.length}
            </span>
          )}
        </div>

        {/* Mic button (hold to record) */}
        {canSendInChannel && !text.trim() && (
          <motion.button
            whileTap={{ scale: 0.92 }}
            onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); startRecording(); }}
            onPointerUp={stopRecording}
            onPointerLeave={stopRecording}
            onPointerCancel={stopRecording}
            className={clsx(
              'w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 transition-all duration-150',
              recording
                ? 'bg-red-500/30 border border-red-500/50 text-red-400'
                : 'border text-white/50 hover:text-white/80',
            )}
            style={!recording ? {
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              touchAction: 'none',
              userSelect: 'none',
            } : { touchAction: 'none', userSelect: 'none' } as React.CSSProperties}
            title="Hold to record voice message"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill={recording ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="23"/>
              <line x1="8" y1="23" x2="16" y2="23"/>
            </svg>
          </motion.button>
        )}

        {/* Send button */}
        {(text.trim() || !canSendInChannel) && (
          <button
            onClick={handleSend}
            disabled={!canSendInChannel || !text.trim()}
            className={clsx(
              'w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 transition-all active:scale-90',
              canSendInChannel && text.trim()
                ? channel === 'mafia'     ? 'bg-neon-pink/20 border border-neon-pink/30 text-neon-pink hover:bg-neon-pink/30'
                : channel === 'spectator' ? 'bg-neon-purple/20 border border-neon-purple/30 text-neon-purple hover:bg-neon-purple/30'
                : 'bg-neon-cyan/15 border border-neon-cyan/25 text-neon-cyan hover:bg-neon-cyan/25'
                : 'bg-white/4 border border-white/8 text-white/20 cursor-not-allowed',
            )}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
