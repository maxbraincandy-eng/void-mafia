import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useHermesStore } from '@/store/hermesStore';
import { useAuthStore } from '@/store/authStore';
import { useT } from '@/store/langStore';
import { HermesModeSelector } from './HermesModeSelector';
import { HermesMessageList } from './HermesMessageList';
import { HermesInput } from './HermesInput';
import { HermesQuickPrompts } from './HermesQuickPrompts';
import { HermesGlyph } from './HermesGlyph';

export function HermesPanel() {
  const { isOpen, close, checkStatus, isEnabled, messages, clearMessages } = useHermesStore();
  const profile = useAuthStore(s => s.profile);
  const t = useT();

  useEffect(() => {
    if (isOpen) checkStatus();
  }, [isOpen, checkStatus]);

  const showQuickPrompts = isEnabled && messages.length === 0;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="hermes-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={close}
            className="fixed inset-0 z-[70] bg-black/55 backdrop-blur-sm"
          />

          {/* Sheet */}
          <motion.div
            key="hermes-panel"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 310, damping: 34 }}
            className="fixed bottom-0 left-0 right-0 z-[75] flex flex-col"
            style={{
              height: '87vh',
              borderRadius: '20px 20px 0 0',
              background: 'linear-gradient(180deg, rgba(7,2,18,0.99) 0%, rgba(3,0,10,1) 100%)',
              border: '1px solid rgba(0,245,255,0.12)',
              borderBottom: 'none',
              boxShadow: '0 -8px 48px rgba(0,0,0,0.75), 0 0 0 1px rgba(0,245,255,0.05)',
            }}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-10 h-1 rounded-full bg-white/12" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-4 pb-3 flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
                  style={{
                    background: 'linear-gradient(135deg, rgba(0,245,255,0.12), rgba(155,0,255,0.12))',
                    border: '1px solid rgba(0,245,255,0.28)',
                    boxShadow: '0 0 16px rgba(0,245,255,0.1)',
                  }}
                >
                  <HermesGlyph size={22} />
                </div>
                <div>
                  <p
                    className="font-display text-sm font-bold tracking-widest uppercase"
                    style={{ color: 'rgba(0,245,255,0.9)', textShadow: '0 0 12px rgba(0,245,255,0.3)' }}
                  >
                    {t.hermes.name}
                  </p>
                  <p className="font-mono text-[12px] uppercase tracking-widest"
                    style={{ color: isEnabled ? 'rgba(0,245,255,0.42)' : 'rgba(255,80,80,0.5)' }}
                  >
                    {isEnabled ? t.hermes.online : t.hermes.offline}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {messages.length > 0 && (
                  <button
                    onClick={clearMessages}
                    className="font-mono text-[12px] uppercase tracking-widest text-white/18 hover:text-white/45 transition-colors px-2 py-1"
                  >
                    {t.hermes.clearChat}
                  </button>
                )}
                <button
                  onClick={close}
                  className="w-7 h-7 rounded-full flex items-center justify-center text-white/28 hover:text-white/65 hover:bg-white/7 transition-all"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            </div>

            {/* Mode selector */}
            <HermesModeSelector />

            {/* Body */}
            {!isEnabled ? (
              <div className="flex-1 flex items-center justify-center px-6">
                <div className="text-center space-y-3">
                  <div className="opacity-70 flex justify-center"><HermesGlyph size={60} /></div>
                  <p className="font-display text-base font-bold text-white/30 tracking-widest uppercase">
                    {t.hermes.offline}
                  </p>
                  <p className="font-mono text-xs text-white/20">{t.hermes.tryLater}</p>
                </div>
              </div>
            ) : (
              <>
                <HermesMessageList />
                {showQuickPrompts && <HermesQuickPrompts />}
              </>
            )}

            {/* Input */}
            {isEnabled && <HermesInput uid={profile?.id ?? ''} />}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
