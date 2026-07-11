import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import { useGameStore } from '@/store/gameStore';
import { useT } from '@/store/langStore';
import { ChatMessage, ChatChannel } from '@/types/index';
import { PlayerName } from '@/components/ui/PlayerName';

const SPECTATOR_REACTIONS = ['👀', '🔥', '💀', '😮', '👏', '❓', '😂', '🤫'];

// ── Message Bubble ──────────────────────────────────────────────────

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
        <PlayerName profileId={msg.senderId === 'system' ? null : msg.senderId} name={msg.senderName} className="text-[12px] font-mono text-neon-purple/50" />
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
          {msg.seat ? `#${msg.seat} ` : ''}
          <PlayerName profileId={msg.senderId === 'system' ? null : msg.senderId} name={msg.senderName} />
          {msg.isMod && <span className="ml-1 text-[12px] font-bold text-neon-green border border-neon-green/30 px-1 rounded bg-neon-green/10">MOD</span>}
        </span>
        <span className="text-[12px] font-mono text-white/15">
          {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
      <div className={clsx('max-w-[80%] px-3 py-2 rounded-2xl text-sm break-words leading-relaxed', bubbleStyle)}>
        {msg.text}
      </div>
    </motion.div>
  );
}

// ── Main ChatPanel ──────────────────────────────────────────────────

interface Props { compact?: boolean; }

export function ChatPanel({ compact = false }: Props) {
  const { room, myPlayer, sendChat, amAlive } = useGameStore(s => ({
    room: s.room,
    myPlayer: s.myPlayer(),
    sendChat: s.sendChat,
    amAlive: s.amAlive(),
  }));
  const t = useT();

  const [text, setText] = useState('');
  const [channel, setChannel] = useState<ChatChannel>(() =>
    myPlayer?.isSpectator && room?.phase !== 'lobby' ? 'spectator' : 'room',
  );
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);

  const amSpectator = myPlayer?.isSpectator ?? false;
  const isLobby     = room?.phase === 'lobby';
  const isNight     = room?.phase === 'night';
  const isMafia     = myPlayer?.team === 'mafia';
  const isYakuza    = myPlayer?.team === 'yakuza';

  // Mirrors server-side validateChat in chatService.ts
  const isMySpeakingTurn = room?.phase === 'speech' ? room.currentSpeakerId === myPlayer?.id
    : room?.phase === 'final_words' ? room.deathSpeakerId === myPlayer?.id
    : false;
  const roomChatOpenThisPhase = room?.phase === 'day' || room?.phase === 'game_over'
    || ((room?.phase === 'speech' || room?.phase === 'final_words') && isMySpeakingTurn);

  const canChat     = isLobby ? true : (amAlive && !amSpectator && roomChatOpenThisPhase);
  const canMafiaChat  = isMafia && isNight && !amSpectator;
  const canYakuzaChat = isYakuza && isNight && !amSpectator;
  const canDeadChat   = !amAlive && !amSpectator;

  const canSendInChannel = channel === 'spectator' ? amSpectator
    : channel === 'mafia' ? canMafiaChat
    : channel === 'yakuza' ? canYakuzaChat
    : channel === 'dead'  ? canDeadChat
    : canChat;

  useEffect(() => {
    if (isLobby && channel !== 'room') setChannel('room');
    else if (!isLobby && amSpectator && channel !== 'spectator') setChannel('spectator');
  }, [amSpectator, isLobby, channel]);

  const messages = channel === 'mafia' ? (room?.mafiaChat ?? [])
    : channel === 'yakuza'    ? (room?.yakuzaChat ?? [])
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

  const availableChannels: ChatChannel[] = isLobby
    ? ['room']
    : amSpectator
      ? ['spectator']
      : (['room', ...(isMafia ? ['mafia'] : []), ...(isYakuza ? ['yakuza'] : []), ...(!amAlive ? ['dead'] : [])] as ChatChannel[]);

  const channelAccent = channel === 'mafia' || channel === 'yakuza' ? 'neon-pink' : channel === 'spectator' ? 'neon-purple' : 'neon-cyan';

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
                  ? ch === 'mafia' || ch === 'yakuza' ? 'bg-neon-pink/20 text-neon-pink border border-neon-pink/40'
                  : ch === 'dead'  ? 'bg-white/10 text-white/50 border border-white/20'
                  : 'bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/30'
                  : 'text-white/30 hover:text-white/60',
              )}
            >
              {ch === 'mafia' ? t.game.chat.mafiaChannel
                : ch === 'yakuza' ? ((t.game.chat as Record<string, string>).yakuzaChannel ?? '🐉 Yakuza')
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
      {amSpectator && (channel === 'spectator' || isLobby) && (
        <div className="flex gap-1.5 mb-2 flex-wrap flex-shrink-0">
          {SPECTATOR_REACTIONS.map(emoji => (
            <button key={emoji} onClick={() => sendChat(emoji, channel)}
              className="text-base px-2 py-1 rounded-lg border border-white/10 hover:border-neon-purple/40 hover:bg-neon-purple/10 transition-all active:scale-90">
              {emoji}
            </button>
          ))}
        </div>
      )}

      {/* Input bar */}
      <div className="flex items-center gap-2 flex-shrink-0">
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
            disabled={!canSendInChannel}
            maxLength={400}
            className="flex-1 bg-transparent text-sm text-white placeholder-white/20 focus:outline-none disabled:opacity-40 min-w-0"
          />
          {text.length > 300 && (
            <span className={clsx('text-[12px] font-mono flex-shrink-0 ml-1', text.length > 380 ? 'text-neon-red/70' : 'text-white/25')}>
              {400 - text.length}
            </span>
          )}
        </div>

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
      </div>
    </div>
  );
}
