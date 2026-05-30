import clsx from 'clsx';

interface Props {
  seconds: number;
  max: number;
  size?: 'sm' | 'md' | 'lg';
}

function fmt(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export function Timer({ seconds, max, size = 'md' }: Props) {
  const pct = max > 0 ? seconds / max : 0;
  const isUrgent = pct < 0.25;
  const isWarning = pct < 0.5;

  const color = isUrgent
    ? 'text-neon-red text-glow-red'
    : isWarning
    ? 'text-yellow-400'
    : 'text-neon-green text-glow-green';

  const sizeClass = {
    sm: 'text-xl',
    md: 'text-3xl',
    lg: 'text-5xl',
  }[size];

  return (
    <div className="flex flex-col items-center gap-2">
      <span className={clsx('font-mono font-bold tabular-nums transition-colors duration-500', color, sizeClass)}>
        {fmt(seconds)}
      </span>
      {max > 0 && (
        <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
          <div
            className={clsx(
              'h-full rounded-full transition-all duration-1000',
              isUrgent ? 'bg-neon-red' : isWarning ? 'bg-yellow-400' : 'bg-neon-green',
            )}
            style={{ width: `${pct * 100}%` }}
          />
        </div>
      )}
    </div>
  );
}
