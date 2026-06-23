import { useEffect } from 'react';
import { usePWAInstall } from '@/hooks/usePWAInstall';

export const PWA_BANNER_H = 44;

export function PWAInstallBanner() {
  const { canInstall, install, isIOS } = usePWAInstall();

  // Push all page content down by setting a CSS variable on :root
  useEffect(() => {
    document.documentElement.style.setProperty(
      '--vm-banner-h',
      canInstall ? `${PWA_BANNER_H}px` : '0px',
    );
    return () => {
      document.documentElement.style.setProperty('--vm-banner-h', '0px');
    };
  }, [canInstall]);

  if (!canInstall) return null;

  return (
    <div
      className="fixed left-0 right-0 z-[200] flex items-center gap-3 px-4"
      style={{
        top: 'env(safe-area-inset-top, 0px)',
        height: `${PWA_BANNER_H}px`,
        background: 'rgba(3, 0, 19, 0.97)',
        borderBottom: '1px solid rgba(0, 245, 255, 0.18)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
    >
      {/* Icon */}
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center text-base flex-shrink-0"
        style={{ background: 'rgba(0,245,255,0.1)', border: '1px solid rgba(0,245,255,0.2)' }}
      >
        🎮
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        {isIOS ? (
          <p className="font-mono text-[11px] text-white/70 leading-tight truncate">
            Install: tap <span className="text-neon-cyan">Share ↑</span> → "Add to Home Screen"
          </p>
        ) : (
          <>
            <p className="font-display font-bold text-[12px] text-white leading-tight">
              Void Mafia
            </p>
            <p className="font-mono text-[10px] text-white/40 leading-tight">
              Install as app — play faster, offline-ready
            </p>
          </>
        )}
      </div>

      {/* Install button (Android/Chrome only) */}
      {!isIOS && (
        <button
          onClick={install}
          className="flex-shrink-0 px-3 py-1 rounded-lg font-display font-bold text-[11px] tracking-widest uppercase border border-neon-cyan/40 bg-neon-cyan/10 text-neon-cyan active:scale-95 transition-all"
        >
          Install
        </button>
      )}
    </div>
  );
}
