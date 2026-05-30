import { InputHTMLAttributes, forwardRef } from 'react';
import clsx from 'clsx';

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, Props>(
  ({ label, error, className, ...rest }, ref) => (
    <div className="w-full">
      {label && (
        <label className="block text-xs font-display tracking-widest uppercase text-white/50 mb-2">
          {label}
        </label>
      )}
      <input
        ref={ref}
        className={clsx(
          'w-full bg-void-50/80 border border-white/10 rounded-xl px-4 py-3',
          'text-white placeholder-white/30 font-sans text-sm',
          'focus:outline-none focus:border-neon-cyan/50 focus:shadow-neon-cyan',
          'transition-all duration-200',
          error && 'border-neon-red/50',
          className,
        )}
        {...rest}
      />
      {error && <p className="mt-1 text-xs text-neon-red">{error}</p>}
    </div>
  )
);
Input.displayName = 'Input';
