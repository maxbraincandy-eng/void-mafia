import { ReactNode, HTMLAttributes } from 'react';
import clsx from 'clsx';

interface Props extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  glow?: 'cyan' | 'pink' | 'purple' | 'green' | 'red' | 'none';
  padding?: 'sm' | 'md' | 'lg' | 'none';
}

const glowMap = {
  cyan:   'border-neon-cyan/20 shadow-neon-cyan',
  pink:   'border-neon-pink/20 shadow-neon-pink',
  purple: 'border-neon-purple/20 shadow-neon-purple',
  green:  'border-neon-green/20 shadow-neon-green',
  red:    'border-neon-red/20 shadow-neon-red',
  none:   'border-white/6',
};

const padMap = {
  none: '',
  sm:   'p-3',
  md:   'p-5',
  lg:   'p-7',
};

export function Card({ children, glow = 'none', padding = 'md', className, ...rest }: Props) {
  return (
    <div
      className={clsx(
        'glass-card border transition-all duration-300',
        glowMap[glow],
        padMap[padding],
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
