import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import { useGameStore } from '@/store/gameStore';
import { useT } from '@/store/langStore';
import { ChatMessage, ChatChannel } from '@/types/index';

const SPECTATOR_REACTIONS = ['👀', '🔥', '💀', '😮', '👏', '❓', '😂', '🤫'];

interface Props {
  compact?: boolean;
}

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
    myPlayer?.isSpectator ? 'spectator' : 'room',
  );
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const amSpectator = myPlayer?.isSpectator ?? false;
  const isNight = room?.phase === 'night';
  const isMafia = myPlayer?.team === 'mafia';
  const canChat = amAlive && !isNight && !amSpectator;
  const canMafiaChat = isMafia && isNight && !amSpectator;
  const canDeadChat = !amAlive && !amSpectator;

  // Spectators are forced into spectator channel; switch if channel is wrong
  useEffect(() => {
    if (amSpectator && channel !== 'spectator') setChannel('spectator');
  }, [amSpectator, channel]);

  const spectatorChat: ChatMessage[] = room?.spectatorChat ?? [];

  const messages = channel === 'mafia'
    ? (room?.mafiaChat ?? [])
    : channel === 'dead'
      ? (room?.deadChat ?? [])
      : channel === 'spectator'
        ? spectatorChat
        : (room?.chat ?? []).filter(m => m.channel !== 'dead');

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSend = async () => {
    const t = text.trim();
    if (!t || !room) return;
    setText('');
    await sendChat(t, channel);
  };

  const handleKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const sendReaction = (emoji: string) => {
    if (!room) return;
    sendChat(emoji, 'spectator');
  };

  const canSendInChannel = channel === 'spectator'
    ? amSpectator
    : channel === 'mafia' ? canMafiaChat
    : channel === 'dead' ? canDeadChat
    : canChat;

  // Spectators get only spectator channel; regular players get room + mafia/dead if applicable
  const availableChannels: ChatChannel[] = amSpectator
    ? ['spectator']
    : (['room', ...(isMafia ? ['mafia'] : []), ...(!amAlive ? ['dead'] : [])] as ChatChannel[]);

  return (
    <div className={clsx('flex flex-col', compact ? 'h-full' : 'h-80 md:h-full')}>
      {/* Channel selector */}
      <div className="flex gap-1 mb-2 flex-shrink-0">
        {availableChannels.map(ch => (
          <button
            key={ch}
            onClick={() => setChannel(ch)}
            className={clsx(
              'px-3 py-1 rounded-lg text-xs font-display font-semibold tracking-widest uppercase transition-all',
              channel === ch
                ? ch === 'mafia' ? 'bg-neon-pink/20 text-neon-pink border border-neon-pink/40'
                : ch === 'dead' ? 'bg-white/10 text-white/50 border border-white/20'
                : ch === 'spectator' ? 'bg-neon-purple/20 text-neon-purple border border-neon-purple/40'
                : 'bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/30'
                : 'text-white/30 hover:text-white/60',
            )}
          >
            {ch === 'mafia' ? t.game.chat.mafiaChannel
              : ch === 'dead' ? t.game.chat.deadChannel
              : ch === 'spectator' ? '👁 Spectators'
              : t.game.chat.roomChannel}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-1 pr-1 mb-2 min-h-0">
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
            <button
              key={emoji}
              onClick={() => sendReaction(emoji)}
              className="text-base px-2 py-1 rounded-lg border border-white/10 hover:border-neon-purple/40 hover:bg-neon-purple/10 transition-all active:scale-90"
              title={`React with ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="flex gap-2 flex-shrink-0">
        <input
          ref={inputRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKey}
          placeholder={
            !canSendInChannel
              ? isNight && channel === 'room' ? t.game.chat.nightSilence : t.game.chat.cannotSend
              : channel === 'mafia' ? t.game.chat.mafiaChatPlaceholder
              : channel === 'spectator' ? 'Chat with spectators…'
              : t.game.chat.sendPlaceholder
          }
          disabled={!canSendInChannel}
          maxLength={400}
          className={clsx(
            'flex-1 bg-void-50/80 border rounded-xl px-3 py-2 text-sm',
            'text-white placeholder-white/25 focus:outline-none transition-all duration-200',
            canSendInChannel
              ? channel === 'spectator'
                ? 'border-neon-purple/20 focus:border-neon-purple/50'
                : 'border-white/10 focus:border-neon-cyan/40'
              : 'border-white/5 opacity-40 cursor-not-allowed',
          )}
        />
        <button
          onClick={handleSend}
          disabled={!canSendInChannel || !text.trim()}
          className={clsx(
            'px-4 py-2 rounded-xl font-display font-bold text-sm tracking-widest uppercase transition-all',
            channel === 'spectator'
              ? 'border border-neon-purple/30 text-neon-purple hover:bg-neon-purple/10'
              : 'border border-neon-cyan/30 text-neon-cyan hover:bg-neon-cyan/10 hover:shadow-neon-cyan',
            'disabled:opacity-30 disabled:cursor-not-allowed',
          )}
        >
          ➤
        </button>
      </div>
    </div>
  );
}

function MessageBubble({ msg, isMe }: { msg: ChatMessage; isMe: boolean }) {
  if (msg.isSystem) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center text-xs text-white/40 py-1 px-2 font-mono"
      >
        ⬡ {msg.text}
      </motion.div>
    );
  }

  const isMafiaMsg = msg.channel === 'mafia';
  const isSpectatorMsg = msg.channel === 'spectator';

  // Spectator reactions (single emoji messages) get a compact pill style
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

  return (
    <motion.div
      initial={{ opacity: 0, x: isMe ? 8 : -8 }}
      animate={{ opacity: 1, x: 0 }}
      className={clsx('flex flex-col gap-0.5', isMe ? 'items-end' : 'items-start')}
    >
      <div className="flex items-baseline gap-1.5">
        <span className={clsx(
          'text-xs font-mono',
          isMafiaMsg ? 'text-neon-pink/70'
            : isSpectatorMsg ? 'text-neon-purple/70'
            : 'text-neon-cyan/60',
        )}>
          {msg.seat ? `#${msg.seat} ` : ''}{msg.senderName}
          {msg.isMod && <span className="ml-1 text-[9px] font-bold text-neon-green border border-neon-green/30 px-1 rounded bg-neon-green/10">MOD</span>}
        </span>
        <span className="text-[9px] font-mono text-white/15">
          {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
      <div
        className={clsx(
          'max-w-[80%] px-3 py-2 rounded-xl text-sm break-words',
          isMe
            ? isMafiaMsg ? 'bg-neon-pink/15 border border-neon-pink/25 text-white'
              : isSpectatorMsg ? 'bg-neon-purple/15 border border-neon-purple/25 text-white'
              : 'bg-neon-cyan/10 border border-neon-cyan/20 text-white'
            : 'bg-white/5 border border-white/8 text-white/90',
        )}
      >
        {msg.text}
      </div>
    </motion.div>
  );
}
