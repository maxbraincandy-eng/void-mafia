import clsx from 'clsx';

interface Props {
  name: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  isAlive?: boolean;
  isHost?: boolean;
  src?: string;
  className?: string;
}

const sizeMap = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
  xl: 'w-16 h-16 text-xl',
};

export function Avatar({ name, size = 'md', isAlive = true, isHost = false, src, className }: Props) {
  const initials = name
    .trim()
    .split(/\s+/)
    .map(w => w[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('');

  return (
    <div className={clsx('relative flex-shrink-0', className)}>
      <div
        className={clsx(
          'rounded-full flex items-center justify-center font-display font-bold overflow-hidden',
          'transition-all duration-300',
          sizeMap[size],
          isAlive
            ? 'bg-gradient-to-br from-neon-purple/30 to-neon-cyan/20 border border-neon-cyan/30 text-neon-cyan'
            : 'bg-white/5 border border-white/10 text-white/30 grayscale',
        )}
      >
        {src
          ? <img src={src} alt={name} className="w-full h-full object-cover rounded-full" />
          : (initials || '?')
        }
      </div>
      {isHost && (
        <span className="absolute -top-1 -right-1 text-xs">👑</span>
      )}
      {!isAlive && (
        <span className="absolute inset-0 flex items-center justify-center text-xs">💀</span>
      )}
    </div>
  );
}
