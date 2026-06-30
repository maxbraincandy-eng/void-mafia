import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { socket } from '@/lib/socket';

// Global system surfaces shown to EVERY user: owner/mod announcements
// (banner or popup) and a maintenance banner. Mounted once in App.
export function SystemAnnounce() {
  const [banner, setBanner] = useState<string | null>(null);
  const [popup, setPopup] = useState<string | null>(null);
  const [maintenance, setMaintenance] = useState(false);

  useEffect(() => {
    const onAnnounce = (d: { message: string; style: 'banner' | 'popup' }) => {
      if (d.style === 'popup') setPopup(d.message);
      else setBanner(d.message);
    };
    const onMaintenance = (d: { enabled: boolean }) => setMaintenance(!!d.enabled);
    (socket as any).on('system:announce', onAnnounce);
    (socket as any).on('maintenance:status', onMaintenance);
    return () => {
      (socket as any).off('system:announce', onAnnounce);
      (socket as any).off('maintenance:status', onMaintenance);
    };
  }, []);

  return createPortal(
    <>
      {/* Stacked top banners (maintenance first, then announcement) */}
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 500, pointerEvents: 'none', paddingTop: 'env(safe-area-inset-top,0px)' }}>
        <AnimatePresence>
          {maintenance && (
            <motion.div key="maint" initial={{ y: -40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -40, opacity: 0 }}
              style={{ pointerEvents: 'auto', textAlign: 'center', padding: '6px 14px', fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: '#ffb84d', background: 'rgba(60,30,0,0.96)', borderBottom: '1px solid rgba(255,160,0,0.45)', backdropFilter: 'blur(8px)' }}>
              🛠 სერვერი ტექნიკურ რეჟიმშია — ზოგი ფუნქცია დროებით შეზღუდულია
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {banner && (
            <motion.div key="banner" initial={{ y: -40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -40, opacity: 0 }}
              style={{ pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', background: 'rgba(10,4,28,0.97)', borderBottom: '1px solid rgba(155,0,255,0.4)', backdropFilter: 'blur(10px)' }}>
              <span style={{ fontSize: 14 }}>📢</span>
              <span style={{ flex: 1, fontFamily: 'monospace', fontSize: 12, color: '#e9d5ff', lineHeight: 1.4 }}>{banner}</span>
              <button onClick={() => setBanner(null)} style={{ fontFamily: 'monospace', fontSize: 14, color: 'rgba(255,255,255,0.5)', background: 'transparent', border: 'none', flexShrink: 0 }}>✕</button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Centered popup announcement */}
      <AnimatePresence>
        {popup && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setPopup(null)}
            style={{ position: 'fixed', inset: 0, zIndex: 600, background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <motion.div initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              style={{ width: 'min(360px,100%)', textAlign: 'center', background: 'rgba(10,4,28,0.99)', border: '1px solid rgba(155,0,255,0.5)', borderRadius: 20, padding: '28px 22px', boxShadow: '0 0 50px rgba(155,0,255,0.3)' }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>📢</div>
              <p style={{ fontFamily: '"Space Grotesk",sans-serif', fontWeight: 700, fontSize: 14, color: '#c084fc', letterSpacing: '0.1em', marginBottom: 10 }}>VOID MAFIA</p>
              <p style={{ fontFamily: 'monospace', fontSize: 14, color: '#fff', lineHeight: 1.55, marginBottom: 20, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{popup}</p>
              <button onClick={() => setPopup(null)}
                style={{ width: '100%', padding: '12px', borderRadius: 12, fontFamily: 'monospace', fontSize: 14, fontWeight: 700, background: 'rgba(155,0,255,0.18)', border: '1px solid rgba(155,0,255,0.5)', color: '#c084fc' }}>
                OK
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>,
    document.body
  );
}
