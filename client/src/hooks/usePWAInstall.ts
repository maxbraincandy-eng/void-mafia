import { useState, useEffect } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// Capture the event as early as possible (before React mounts)
let _deferredPrompt: BeforeInstallPromptEvent | null = null;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    _deferredPrompt = e as BeforeInstallPromptEvent;
  });
}

export function usePWAInstall() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(
    () => _deferredPrompt,
  );
  const [installed, setInstalled] = useState(false);

  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true;

  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const isAndroid = /Android/.test(navigator.userAgent);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      _deferredPrompt = e as BeforeInstallPromptEvent;
      setInstallPrompt(_deferredPrompt);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = async () => {
    if (!installPrompt) return;
    try {
      await installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;
      if (outcome === 'accepted') {
        setInstallPrompt(null);
        _deferredPrompt = null;
        setInstalled(true);
      }
    } catch { /* user cancelled */ }
  };

  // ?pwa-debug=1 in URL forces banner visible even in standalone for diagnostics
  const debugMode = new URLSearchParams(window.location.search).get('pwa-debug') === '1';

  // Show banner when not standalone and not installed.
  // Android: always show (even without native prompt — fallback to manual instructions).
  // iOS: always show manual instructions.
  // Desktop/other: only show when native prompt is available.
  const canInstall =
    (debugMode || (!isStandalone && !installed)) && (!!installPrompt || isIOS || isAndroid || debugMode);
  const hasNativePrompt = !!installPrompt;

  return { canInstall, install, isIOS, isAndroid, isStandalone, hasNativePrompt, debugMode };
}
