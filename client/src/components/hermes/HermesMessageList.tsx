import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useHermesStore } from '@/store/hermesStore';
import { useT } from '@/store/langStore';

export function HermesMessageList() {
  const { messages, isThinking, error } = useHermesStore();
  const t = useT();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isThinking]);

  if (messages.length === 0 && !isThinking && !error) return null;

  return (
    <div className="flex-1 overflow-y-auto px-4 py-2 space-y-3 min-h-0">
      <AnimatePresence initial={false}>
        {messages.map(msg => (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} items-end gap-2`}
          >
            {msg.role === 'assistant' && (
              <div
                className="w-6 h-6 rounded-lg flex items-center justify-center text-sm flex-shrink-0 mb-0.5"
                style={{
                  background: 'linear-gradient(135deg, rgba(0,245,255,0.1), rgba(155,0,255,0.1))',
                  border: '1px solid rgba(0,245,255,0.18)',
                }}
              >
                🤖
              </div>
            )}
            <div
              className={`
                max-w-[82%] rounded-2xl px-4 py-3 font-mono text-sm leading-relaxed
                ${msg.role === 'user'
                  ? 'bg-neon-cyan/8 border border-neon-cyan/18 text-white/88 rounded-br-sm'
                  : 'bg-white/4 border border-white/8 text-white/78 rounded-bl-sm'}
              `}
              style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
            >
              {msg.content}
            </div>
          </motion.div>
        ))}

        {isThinking && (
          <motion.div
            key="thinking"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex justify-start items-end gap-2"
          >
            <div
              className="w-6 h-6 rounded-lg flex items-center justify-center text-sm flex-shrink-0"
              style={{
                background: 'linear-gradient(135deg, rgba(0,245,255,0.1), rgba(155,0,255,0.1))',
                border: '1px solid rgba(0,245,255,0.18)',
              }}
            >
              🤖
            </div>
            <div className="bg-white/4 border border-white/8 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-2">
              <span className="font-mono text-[12px] text-neon-cyan/55 uppercase tracking-widest">
                {t.hermes.thinking}
              </span>
              <div className="flex gap-1">
                {[0, 1, 2].map(i => (
                  <motion.div
                    key={i}
                    className="w-1 h-1 rounded-full bg-neon-cyan/45"
                    animate={{ opacity: [0.25, 1, 0.25] }}
                    transition={{ duration: 1.2, delay: i * 0.22, repeat: Infinity }}
                  />
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {error && !isThinking && (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center px-2"
          >
            <p className="font-mono text-xs text-neon-pink/65 px-4 py-2.5 bg-neon-pink/5 rounded-xl border border-neon-pink/12">
              {error}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
      <div ref={bottomRef} />
    </div>
  );
}
