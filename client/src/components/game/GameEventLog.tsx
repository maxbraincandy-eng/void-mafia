import { useRef, useEffect } from 'react';
import { ChatMessage } from '@/types/index';
import clsx from 'clsx';

interface Props {
  messages: ChatMessage[];
  className?: string;
}

export function GameEventLog({ messages, className }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const events = messages.filter(m => m.isSystem);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events.length]);

  return (
    <div className={clsx('overflow-y-auto flex flex-col gap-1 pr-1 scrollbar-thin', className)}>
      {events.length === 0 && (
        <p className="text-center text-xs text-white/20 font-mono py-4">No events yet…</p>
      )}
      {events.map(msg => (
        <div
          key={msg.id}
          className="text-xs font-mono text-white/50 py-1.5 px-2 rounded-lg bg-white/3 border border-white/5 leading-relaxed"
        >
          {msg.text}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
