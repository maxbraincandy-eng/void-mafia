import { useState } from 'react';
import { useHermesStore } from '@/store/hermesStore';
import { useT } from '@/store/langStore';

interface Props { uid: string; }

export function HermesInput({ uid }: Props) {
  const { sendMessage, isThinking } = useHermesStore();
  const t = useT();
  const [text, setText] = useState('');

  const canSend = !!text.trim() && !isThinking && !!uid;

  const handleSend = async () => {
    if (!canSend) return;
    const trimmed = text.trim();
    setText('');
    await sendMessage(trimmed, uid);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  return (
    <div
      className="flex-shrink-0 px-4 pb-6 pt-3"
      style={{ borderTop: '1px solid rgba(255,255,255,0.055)' }}
    >
      <div
        className="flex items-end gap-2 rounded-2xl px-3 py-2.5"
        style={{
          background: 'rgba(255,255,255,0.035)',
          border: `1px solid ${canSend ? 'rgba(0,245,255,0.22)' : 'rgba(255,255,255,0.08)'}`,
          transition: 'border-color 0.15s',
        }}
      >
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t.hermes.inputPlaceholder}
          rows={1}
          disabled={isThinking}
          className="flex-1 bg-transparent text-white/80 font-mono text-sm resize-none outline-none placeholder-white/18 leading-relaxed"
          style={{ maxHeight: '80px', minHeight: '22px' }}
        />
        <button
          onClick={handleSend}
          disabled={!canSend}
          className="w-8 h-8 rounded-xl flex items-center justify-center transition-all flex-shrink-0"
          style={{
            background: canSend
              ? 'linear-gradient(135deg, rgba(0,245,255,0.22), rgba(155,0,255,0.18))'
              : 'rgba(255,255,255,0.04)',
            border: canSend ? '1px solid rgba(0,245,255,0.45)' : '1px solid rgba(255,255,255,0.07)',
            boxShadow: canSend ? '0 0 14px rgba(0,245,255,0.18)' : 'none',
          }}
        >
          <svg
            width="13" height="13" viewBox="0 0 24 24" fill="none"
            stroke={canSend ? '#00f5ff' : 'rgba(255,255,255,0.18)'}
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          >
            <line x1="22" y1="2" x2="11" y2="13"/>
            <polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
      </div>
      <p className="text-center font-mono text-[12px] text-white/12 mt-1.5 uppercase tracking-widest">
        {t.hermes.sendHint}
      </p>
    </div>
  );
}
