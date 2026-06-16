import { useState, useEffect } from 'react';
import { useT } from '@/store/langStore';
import { useCommunityStore } from '@/store/communityStore';
import type { CommunityReport } from '@/types/index';
import { Spinner, EmptyState, PillButton, ModalShell, TextInput } from '@/components/community/shared';

const STATUS_STYLE: Record<string, { color: string; border: string; bg: string }> = {
  pending: { color: '#ffc800', border: 'rgba(255,200,0,0.3)', bg: 'rgba(255,200,0,0.08)' },
  resolved: { color: '#00ff88', border: 'rgba(0,255,136,0.3)', bg: 'rgba(0,255,136,0.08)' },
  rejected: { color: 'rgba(255,255,255,0.4)', border: 'rgba(255,255,255,0.15)', bg: 'rgba(255,255,255,0.03)' },
};

function BanForm({ targetProfileId, onClose }: { targetProfileId: string; onClose: () => void }) {
  const t = useT();
  const banPlayer = useCommunityStore(s => s.banPlayer);
  const [reason, setReason] = useState('');
  const [hours, setHours] = useState('0');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit() {
    if (!reason.trim() || submitting) return;
    const hoursNum = Number(hours) || 0;
    const durationMs = hoursNum > 0 ? hoursNum * 3600 * 1000 : 0;
    setSubmitting(true);
    setError('');
    try {
      await banPlayer(targetProfileId, reason.trim(), durationMs);
      onClose();
    } catch (e: any) {
      setError(e?.message ?? 'Failed to ban player.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-2 pt-2 border-t border-red-500/20 space-y-2">
      {error && <p className="text-[10px] text-red-400/80 font-mono">{error}</p>}
      <div>
        <label className="font-mono text-[9px] uppercase tracking-wider text-white/40 block mb-1">{t.community.moderation.banReason}</label>
        <TextInput value={reason} onChange={setReason} placeholder={t.community.moderation.banReason} maxLength={300} accent="purple" />
      </div>
      <div>
        <label className="font-mono text-[9px] uppercase tracking-wider text-white/40 block mb-1">{t.community.moderation.banDuration} (h, 0 = permanent)</label>
        <input
          type="number"
          min={0}
          value={hours}
          onChange={e => setHours(e.target.value)}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 font-mono text-sm text-white outline-none"
        />
      </div>
      <button
        onClick={handleSubmit}
        disabled={!reason.trim() || submitting}
        className="w-full py-2 rounded-xl font-mono text-xs uppercase tracking-wider transition-all active:scale-95 disabled:opacity-40"
        style={{ background: 'rgba(255,68,68,0.15)', border: '1px solid rgba(255,68,68,0.4)', color: '#ff4444' }}
      >
        {submitting ? '…' : t.community.moderation.ban}
      </button>
    </div>
  );
}

function ReportCard({ report, onResolve }: {
  report: CommunityReport;
  onResolve: (id: string, status: 'resolved' | 'rejected') => void;
}) {
  const t = useT();
  const [banOpen, setBanOpen] = useState(false);
  const status = STATUS_STYLE[report.status] ?? STATUS_STYLE.pending;

  return (
    <div className="rounded-2xl border px-4 py-3.5 space-y-2.5" style={{ borderColor: 'rgba(155,0,255,0.25)', background: 'rgba(255,255,255,0.02)' }}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-full border" style={{ color: status.color, borderColor: status.border, background: status.bg }}>
          {t.community.moderation.status[report.status as 'pending' | 'resolved' | 'rejected'] ?? report.status}
        </span>
        <span className="font-mono text-[10px] text-white/30">{report.reporterName}</span>
      </div>

      <p className="font-mono text-xs text-white/60 italic">
        {report.postContent ?? '[deleted post]'}
      </p>
      <p className="font-mono text-[11px] text-white/45">{report.reason}</p>

      <div className="flex items-center gap-2 pt-1">
        {report.status === 'pending' && (
          <>
            <PillButton onClick={() => onResolve(report.id, 'resolved')} accent="cyan">
              {t.community.moderation.resolve}
            </PillButton>
            <PillButton onClick={() => onResolve(report.id, 'rejected')} accent="purple">
              {t.community.moderation.reject}
            </PillButton>
          </>
        )}
        {report.postAuthorId && (
          <button
            onClick={() => setBanOpen(v => !v)}
            className="ml-auto font-mono text-[10px] uppercase tracking-wider text-red-400/70 hover:text-red-400 transition-colors"
          >
            {t.community.moderation.ban}
          </button>
        )}
      </div>

      {banOpen && report.postAuthorId && (
        <BanForm targetProfileId={report.postAuthorId} onClose={() => setBanOpen(false)} />
      )}
    </div>
  );
}

export function ModerationPanel({ onClose }: { onClose: () => void }): JSX.Element {
  const t = useT();
  const { reports, fetchReports, resolveReport } = useCommunityStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchReports();
      setLoading(false);
    })();
  }, [fetchReports]);

  async function handleResolve(id: string, status: 'resolved' | 'rejected') {
    setError('');
    try {
      await resolveReport(id, status);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to update report.');
    }
  }

  const sorted = [...reports].sort((a, b) => b.createdAt - a.createdAt);

  return (
    <ModalShell onClose={onClose} accent="purple" maxWidthClass="max-w-md">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display font-bold text-white text-xl">{t.community.moderation.title}</h3>
        <button
          onClick={onClose}
          className="font-mono text-sm text-white/40 hover:text-white/80 transition-colors px-1"
          aria-label={t.common.close}
        >
          ✕
        </button>
      </div>

      {error && <p className="mb-3 text-xs text-red-400/80 font-mono">{error}</p>}

      <h4 className="font-mono text-[10px] uppercase tracking-[0.25em] text-white/30 mb-3">{t.community.moderation.reports}</h4>

      {loading ? (
        <Spinner color="#9b00ff" />
      ) : sorted.length === 0 ? (
        <EmptyState text={t.community.moderation.noReports} />
      ) : (
        <div className="space-y-3">
          {sorted.map(report => (
            <ReportCard key={report.id} report={report} onResolve={handleResolve} />
          ))}
        </div>
      )}
    </ModalShell>
  );
}
