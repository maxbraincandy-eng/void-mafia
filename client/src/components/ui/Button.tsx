import { ButtonHTMLAttributes, ReactNode } from 'react';
import { motion } from 'framer-motion';
import clsx from 'clsx';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'neon-cyan' | 'neon-pink' | 'neon-green' | 'neon-purple';
type Size = 'sm' | 'md' | 'lg';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  children: ReactNode;
  fullWidth?: boolean;
}

const variantClasses: Record<Variant, string> = {
  primary:
    'bg-gradient-to-r from-neon-pink via-neon-purple to-neon-cyan text-white shadow-neon-pink hover:shadow-neon-purple',
  secondary:
    'bg-transparent border border-white/10 text-white hover:border-neon-cyan/40 hover:shadow-neon-cyan',
  danger:
    'bg-transparent border border-neon-red/40 text-neon-red hover:bg-neon-red/10 hover:shadow-neon-red',
  ghost:
    'bg-transparent text-white/60 hover:text-white hover:bg-white/5',
  'neon-cyan':
    'bg-transparent border border-neon-cyan/40 text-neon-cyan hover:bg-neon-cyan/10 hover:shadow-neon-cyan',
  'neon-pink':
    'bg-transparent border border-neon-pink/40 text-neon-pink hover:bg-neon-pink/10 hover:shadow-neon-pink',
  'neon-green':
    'bg-transparent border border-neon-green/40 text-neon-green hover:bg-neon-green/10 hover:shadow-neon-green',
  'neon-purple':
    'bg-transparent border border-neon-purple/40 text-neon-purple hover:bg-neon-purple/10 hover:shadow-neon-purple',
};

const sizeClasses: Record<Size, string> = {
  sm: 'px-4 py-2 text-xs tracking-widest',
  md: 'px-6 py-3 text-sm tracking-widest',
  lg: 'px-8 py-4 text-base tracking-widest',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  children,
  fullWidth = false,
  className,
  disabled,
  ...rest
}: Props) {
  return (
    <motion.button
      whileTap={{ scale: disabled || loading ? 1 : 0.96 }}
      transition={{ duration: 0.1 }}
      className={clsx(
        'btn-neon font-display rounded-xl transition-all duration-200 select-none',
        'disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none',
        variantClasses[variant],
        sizeClasses[size],
        fullWidth && 'w-full',
        className,
      )}
      disabled={disabled || loading}
      {...(rest as any)}
    >
      {loading ? (
        <span className="flex items-center justify-center gap-2">
          <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          <span>Loading…</span>
        </span>
      ) : children}
    </motion.button>
  );
}
