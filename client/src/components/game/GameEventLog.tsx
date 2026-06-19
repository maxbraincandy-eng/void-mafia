import { useRef, useEffect } from 'react';
import clsx from 'clsx';
import { ChatMessage } from '@/types/index';

function eventIcon(text: string): string {
  if (/eliminat|killed|💀|died/i.test(text)) return '💀';
  if (/saved|protect|💊|doctor/i.test(text)) return '💊';
  if (/night|🌙/i.test(text)) return '🌙';
  if (/day \d|dawn|☀|morning/i.test(text)) return '☀️';
  if (/vote|⚖|tribunal|exiled/i.test(text)) return '⚖️';
  if (/start|game begin|🎮/i.test(text)) return '🎮';
  if (/recruit|cult|🕯/i.test(text)) return '🕯️';
  if (/sheriff|invest|🔍/i.test(text)) return '🔍';
  return '·';
}

interface Props {
  messages: ChatMessage[];
  className?: string;
}

export function GameEventLog({ messages, className }: Props) {
  const systemMsgs = messages.filter(m => m.isSystem);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [systemMsgs.length]);

  if (systemMsgs.length === 0) {
    return (
      <div className={clsx('flex items-center justify-center py-8', className)}>
        <p className="text-white/15 font-mono text-[11px] text-center leading-relaxed">
          Game events will<br />appear here
        </p>
      </div>
    );
  }

  return (
    <div className={clsx('overflow-y-auto space-y-2 pr-0.5', className)}>
      {systemMsgs.map(msg => (
        <div key={msg.id} className="flex items-start gap-2">
          <span className="flex-shrink-0 text-xs leading-4 mt-0.5 w-4 text-center">
            {eventIcon(msg.text)}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-mono text-white/65 leading-snug">{msg.text}</p>
            <p className="text-[12px] font-mono text-white/20 mt-0.5">
              {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
}
