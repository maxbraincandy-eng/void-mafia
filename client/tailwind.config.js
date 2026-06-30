/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        void: {
          DEFAULT: '#03000d',
          50: '#0a0520',
          100: '#0d0826',
          200: '#130e35',
        },
        neon: {
          cyan:   '#00f5ff',
          pink:   '#ff00cc',
          purple: '#9b00ff',
          green:  '#00ff88',
          blue:   '#3b82f6',
          red:    '#ff1654',
        },
        glass: 'rgba(255,255,255,0.04)',
      },
      fontFamily: {
        // Latin glyphs use the cyber faces; Georgian glyphs (which those faces
        // don't cover) fall through to Noto Sans Georgian per-glyph.
        sans:    ['Inter', '"Noto Sans Georgian"', 'system-ui', 'sans-serif'],
        mono:    ['"Share Tech Mono"', '"JetBrains Mono"', '"Noto Sans Georgian"', 'monospace'],
        display: ['Rajdhani', '"Noto Sans Georgian"', 'sans-serif'],
      },
      backgroundImage: {
        'neon-grid': `
          linear-gradient(rgba(0,245,255,0.04) 1px, transparent 1px),
          linear-gradient(90deg, rgba(0,245,255,0.04) 1px, transparent 1px)
        `,
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
      },
      backgroundSize: {
        'grid': '48px 48px',
      },
      boxShadow: {
        'neon-cyan':   '0 0 20px rgba(0,245,255,0.45), 0 0 60px rgba(0,245,255,0.15)',
        'neon-pink':   '0 0 20px rgba(255,0,204,0.45), 0 0 60px rgba(255,0,204,0.15)',
        'neon-purple': '0 0 20px rgba(155,0,255,0.45), 0 0 60px rgba(155,0,255,0.15)',
        'neon-green':  '0 0 20px rgba(0,255,136,0.45), 0 0 60px rgba(0,255,136,0.15)',
        'neon-red':    '0 0 20px rgba(255,22,84,0.45),  0 0 60px rgba(255,22,84,0.15)',
        'glass':       '0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)',
        'glass-lg':    '0 16px 64px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.06)',
      },
      animation: {
        'grid-scroll':  'gridScroll 24s linear infinite',
        'pulse-glow':   'pulseGlow 2.5s ease-in-out infinite',
        'float':        'float 6s ease-in-out infinite',
        'glitch':       'glitch 6s infinite',
        'scan':         'scan 4s linear infinite',
        'fade-in':      'fadeIn 0.4s ease forwards',
        'slide-up':     'slideUp 0.4s ease forwards',
        'flip-card':    'flipCard 0.8s ease forwards',
        'border-flame':  'borderFlame 2s ease-in-out infinite',
        'border-glitch': 'borderGlitch 1.5s ease-in-out infinite',
        'border-pulse':  'borderPulse 2s ease-in-out infinite',
        'border-void':   'borderVoid 3s ease-in-out infinite',
      },
      keyframes: {
        gridScroll: {
          '0%':   { backgroundPosition: '0 0' },
          '100%': { backgroundPosition: '48px 48px' },
        },
        pulseGlow: {
          '0%, 100%': { opacity: '0.7' },
          '50%':      { opacity: '1' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%':      { transform: 'translateY(-12px)' },
        },
        glitch: {
          '0%, 88%, 100%': { transform: 'none', clipPath: 'none' },
          '90%': { transform: 'skewX(3deg) translateX(3px)', clipPath: 'inset(10% 0 60% 0)' },
          '92%': { transform: 'skewX(-2deg) translateX(-3px)', clipPath: 'inset(55% 0 10% 0)' },
          '94%': { transform: 'skewX(1deg)', clipPath: 'none' },
        },
        scan: {
          '0%':   { top: '-4px', opacity: '0.6' },
          '100%': { top: '100%', opacity: '0' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(20px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        flipCard: {
          '0%':   { transform: 'rotateY(90deg)', opacity: '0' },
          '100%': { transform: 'rotateY(0deg)',  opacity: '1' },
        },
        borderFlame: {
          '0%, 100%': { boxShadow: '0 0 8px #ff6b00, 0 0 20px #ff2d5580' },
          '50%':      { boxShadow: '0 0 16px #ff2d55, 0 0 40px #ff6b0080' },
        },
        borderGlitch: {
          '0%, 100%': { boxShadow: '0 0 10px #00e5ff, 0 0 20px #00e5ff60', filter: 'hue-rotate(0deg)' },
          '25%':      { boxShadow: '0 0 10px #ff00cc, 0 0 20px #ff00cc60', filter: 'hue-rotate(90deg)' },
          '50%':      { boxShadow: '0 0 14px #00e5ff, 0 0 28px #00e5ff80', filter: 'hue-rotate(180deg)' },
          '75%':      { boxShadow: '0 0 10px #ff00cc, 0 0 20px #ff00cc60', filter: 'hue-rotate(270deg)' },
        },
        borderPulse: {
          '0%, 100%': { boxShadow: '0 0 6px #9b00ff, 0 0 12px #9b00ff60' },
          '50%':      { boxShadow: '0 0 18px #9b00ff, 0 0 36px #9b00ffaa' },
        },
        borderVoid: {
          '0%, 100%': { boxShadow: '0 0 8px #00ff88, 0 0 16px #00ff8860' },
          '50%':      { boxShadow: '0 0 16px #00e5ff, 0 0 32px #00e5ff80' },
        },
      },
    },
  },
  plugins: [],
};
