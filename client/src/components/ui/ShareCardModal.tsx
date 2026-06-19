import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import { ProfileCard, CARD_TEMPLATES, downloadProfileCardImage } from './ProfileCard';
import type { CardTemplate, ProfileCardData } from './ProfileCard';

interface Props {
  open: boolean;
  data: ProfileCardData | null;
  onClose: () => void;
}

export function ShareCardModal({ open, data, onClose }: Props) {
  const [template, setTemplate] = useState<CardTemplate>('classic_void');
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  if (!open || !data) return null;

  const profileUrl = data.profile.publicId
    ? `${window.location.origin}/u/${data.profile.publicId}`
    : `${window.location.origin}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(profileUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const el = document.createElement('input');
      el.value = profileUrl;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const downloadCard = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      await downloadProfileCardImage(data, template);
    } finally {
      setDownloading(false);
    }
  };

  const shareCard = async () => {
    if (!navigator.share) { await copyLink(); return; }
    try {
      await navigator.share({
        title: `${data.profile.username}'s Void Mafia Profile`,
        text: `Check out ${data.profile.username}'s profile on Void Mafia!`,
        url: profileUrl,
      });
    } catch { /* user cancelled */ }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }}
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 60, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            className="w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl overflow-hidden"
            style={{ background: 'rgba(6,3,20,0.98)', border: '1px solid rgba(0,229,255,0.15)', maxHeight: '92vh' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
              <h2 className="font-display font-bold text-base tracking-widest uppercase text-white">
                Share Profile
              </h2>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-white/40 hover:text-white/80 hover:bg-white/8 transition-all"
              >
                ✕
              </button>
            </div>

            <div className="overflow-y-auto" style={{ maxHeight: 'calc(92vh - 64px)' }}>
              {/* Card preview */}
              <div className="p-5 flex justify-center">
                <ProfileCard ref={cardRef} data={data} template={template} compact />
              </div>

              {/* Template selector */}
              <div className="px-5 mb-4">
                <p className="text-[12px] font-mono tracking-[0.2em] uppercase text-white/30 mb-2">Card Style</p>
                <div className="grid grid-cols-3 gap-2">
                  {CARD_TEMPLATES.map(t => (
                    <button
                      key={t.key}
                      onClick={() => setTemplate(t.key)}
                      className={clsx(
                        'flex flex-col items-center gap-1 px-2 py-2.5 rounded-xl border text-xs font-mono transition-all',
                        template === t.key
                          ? 'border-neon-cyan/50 bg-neon-cyan/10 text-neon-cyan'
                          : 'border-white/10 text-white/40 hover:border-white/25 hover:text-white/60',
                      )}
                    >
                      <span className="text-base">{t.emoji}</span>
                      <span className="text-[12px] tracking-wide leading-tight text-center">{t.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Profile link */}
              {data.profile.publicId && (
                <div className="px-5 mb-4">
                  <p className="text-[12px] font-mono tracking-[0.2em] uppercase text-white/30 mb-2">Profile Link</p>
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-white/10 bg-white/3">
                    <span className="text-xs font-mono text-white/50 flex-1 truncate">{profileUrl}</span>
                  </div>
                </div>
              )}

              {!data.profile.publicId && (
                <div className="px-5 mb-4">
                  <div className="px-3 py-2 rounded-xl border border-white/8 bg-white/3">
                    <p className="text-[11px] font-mono text-white/35 text-center">
                      Profile link available after playing your first game
                    </p>
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div className="px-5 pb-6 space-y-2">
                <button
                  onClick={copyLink}
                  disabled={!data.profile.publicId}
                  className={clsx(
                    'w-full py-3 rounded-xl font-display font-bold text-sm tracking-widest uppercase transition-all',
                    data.profile.publicId
                      ? copied
                        ? 'border border-neon-green/50 bg-neon-green/10 text-neon-green'
                        : 'border border-neon-cyan/40 bg-neon-cyan/10 text-neon-cyan hover:bg-neon-cyan/15'
                      : 'border border-white/10 text-white/25 cursor-not-allowed',
                  )}
                >
                  {copied ? '✓ Copied!' : '🔗 Copy Link'}
                </button>

                <button
                  onClick={downloadCard}
                  disabled={downloading}
                  className="w-full py-3 rounded-xl font-display font-bold text-sm tracking-widest uppercase transition-all border border-neon-purple/40 bg-neon-purple/10 text-neon-purple hover:bg-neon-purple/15 disabled:opacity-50"
                >
                  {downloading ? '⏳ Saving…' : '⬇ Download Card'}
                </button>

                {typeof navigator !== 'undefined' && 'share' in navigator && (
                  <button
                    onClick={shareCard}
                    disabled={!data.profile.publicId}
                    className={clsx(
                      'w-full py-3 rounded-xl font-display font-bold text-sm tracking-widest uppercase transition-all',
                      data.profile.publicId
                        ? 'border border-white/20 bg-white/5 text-white/70 hover:bg-white/10'
                        : 'border border-white/10 text-white/25 cursor-not-allowed',
                    )}
                  >
                    ↗ Share
                  </button>
                )}

                {/* Social CTA */}
                <div className="text-center pt-2">
                  <p className="text-[12px] font-mono text-white/20">
                    Join me on Void Mafia · Play at voidmafia.one
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
