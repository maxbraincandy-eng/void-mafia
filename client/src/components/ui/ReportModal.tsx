import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ReportReason } from '@/types/index';
import { socket } from '@/lib/socket';
import type { Res } from '@/types/index';

interface Props {
  targetProfileId: string;
  targetName: string;
  roomId: string | null;
  onClose: () => void;
  onSuccess: () => void;
}

const REASONS: { id: ReportReason; label: string }[] = [
  { id: 'harassment',          label: 'Harassment' },
  { id: 'hate_speech',         label: 'Hate Speech' },
  { id: 'cheating',            label: 'Cheating' },
  { id: 'spamming',            label: 'Spamming' },
  { id: 'inappropriate_nickname', label: 'Inappropriate Name' },
  { id: 'inappropriate_chat',  label: 'Inappropriate Chat' },
  { id: 'toxic_behavior',      label: 'Toxic Behavior' },
  { id: 'other',               label: 'Other' },
];

export function ReportModal({ targetProfileId, targetName, roomId, onClose, onSuccess }: Props) {
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
      if (res.ok) { onSuccess(); onClose(); }
      else setError(res.error);
    });
  };

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="glass-panel border border-neon-red/20 rounded-2xl p-6 w-full max-w-sm shadow-glass-lg"
          initial={{ scale: 0.9, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.9, y: 20 }}
          onClick={e => e.stopPropagation()}
        >
          <h3 className="font-display font-bold text-neon-red tracking-widest uppercase mb-1">
            Report Player
          </h3>
          <p className="text-white/40 font-mono text-xs mb-5">{targetName}</p>

          <div className="grid grid-cols-2 gap-2 mb-4">
            {REASONS.map(r => (
              <button
                key={r.id}
                onClick={() => setReason(r.id)}
                className={`py-2 px-3 text-xs font-mono rounded-xl border transition-all text-left ${
                  reason === r.id
                    ? 'border-neon-red/60 bg-neon-red/10 text-neon-red'
                    : 'border-white/5 text-white/40 hover:text-white/70'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>

          <textarea
            value={details}
            onChange={e => setDetails(e.target.value)}
            placeholder="Additional details (optional)…"
            maxLength={500}
            rows={3}
            className="w-full bg-void-50/80 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-white/20 font-mono resize-none focus:outline-none focus:border-neon-red/40 mb-4"
          />

          {error && <p className="text-neon-red text-xs font-mono mb-3">{error}</p>}

          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 border border-white/10 text-white/50 font-mono text-xs rounded-xl hover:text-white transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!reason || loading}
              className="flex-1 py-2.5 bg-neon-red/15 border border-neon-red/40 text-neon-red font-mono font-bold text-xs rounded-xl hover:bg-neon-red/25 transition-all disabled:opacity-40"
            >
              {loading ? 'Sending…' : 'Submit Report'}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
