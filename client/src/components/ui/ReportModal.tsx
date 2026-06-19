import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ReportReason } from '@/types/index';
import { socket } from '@/lib/socket';
import { useT } from '@/store/langStore';
import type { Res } from '@/types/index';

interface Props {
  targetProfileId: string;
  targetName: string;
  roomId: string | null;
  onClose: () => void;
  onSuccess: (msg: string) => void;
}

const REASON_KEYS: ReportReason[] = [
  'cheating',
  'offensive_language',
  'voice_abuse',
  'spamming',
  'inappropriate_nickname',
  'harassment',
  'game_sabotage',
  'bug_abuse',
  'other',
];

export function ReportModal({ targetProfileId, targetName, roomId, onClose, onSuccess }: Props) {
  const t = useT();
  const [reason, setReason] = useState<ReportReason | ''>('');
  const [details, setDetails] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!reason) return;
    setLoading(true);
    setError('');

    socket.emit('player:report', {
      targetProfileId,
      roomId,
      reason: reason as ReportReason,
      details,
    }, (res: Res<null>) => {
      setLoading(false);
      if (res.ok) {
        onSuccess(t.report.successMsg);
        onClose();
      } else {
        setError(res.error);
      }
    });
  };

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center sm:p-4 bg-black/70 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl overflow-hidden"
          style={{
            background: 'rgba(6, 3, 18, 0.97)',
            border: '1px solid rgba(255,30,60,0.2)',
            boxShadow: '0 -4px 40px rgba(255,30,60,0.08), 0 0 0 1px rgba(255,255,255,0.04)',
          }}
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', stiffness: 380, damping: 36 }}
          onClick={e => e.stopPropagation()}
        >
          {/* Drag handle (mobile) */}
          <div className="flex justify-center pt-3 pb-1 sm:hidden">
            <div className="w-9 h-1 rounded-full bg-white/15" />
          </div>

          <div className="px-5 pt-4 pb-6">
            {/* Header */}
            <div className="mb-5">
              <h3
                className="font-display font-bold text-lg tracking-widest uppercase mb-0.5"
                style={{ color: '#ff2d55' }}
              >
                {t.report.title}
              </h3>
              <p className="text-white/40 font-mono text-xs">{targetName}</p>
            </div>

            {/* Categories */}
            <div className="grid grid-cols-3 gap-1.5 mb-4">
              {REASON_KEYS.map(r => {
                const label = t.report.categories[r as keyof typeof t.report.categories] ?? r;
                const active = reason === r;
                return (
                  <button
                    key={r}
                    onClick={() => setReason(r)}
                    className="py-2.5 px-2 text-[12px] font-mono rounded-xl border transition-all text-center leading-tight"
                    style={active ? {
                      borderColor: 'rgba(255,45,85,0.6)',
                      background: 'rgba(255,45,85,0.12)',
                      color: '#ff2d55',
                    } : {
                      borderColor: 'rgba(255,255,255,0.07)',
                      background: 'rgba(255,255,255,0.03)',
                      color: 'rgba(255,255,255,0.40)',
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Details */}
            <textarea
              value={details}
              onChange={e => setDetails(e.target.value)}
              placeholder={t.report.detailsPlaceholder}
              maxLength={500}
              rows={3}
              className="w-full rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/20 font-mono resize-none focus:outline-none transition-all mb-1"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: reason ? '1px solid rgba(255,45,85,0.25)' : '1px solid rgba(255,255,255,0.08)',
              }}
            />
            <p className="text-right text-[12px] font-mono text-white/20 mb-4">{details.length}/500</p>

            {error && (
              <p className="text-[11px] font-mono mb-3" style={{ color: '#ff2d55' }}>{error}</p>
            )}

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="flex-1 py-3 border border-white/10 text-white/40 font-mono text-xs rounded-xl hover:text-white/60 transition-all"
              >
                {t.report.cancel}
              </button>
              <button
                onClick={handleSubmit}
                disabled={!reason || loading}
                className="flex-1 py-3 font-mono font-bold text-xs rounded-xl transition-all disabled:opacity-40"
                style={{
                  background: reason ? 'rgba(255,45,85,0.15)' : 'rgba(255,255,255,0.04)',
                  border: reason ? '1px solid rgba(255,45,85,0.4)' : '1px solid rgba(255,255,255,0.08)',
                  color: reason ? '#ff2d55' : 'rgba(255,255,255,0.3)',
                }}
              >
                {loading ? '…' : t.report.submit}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
