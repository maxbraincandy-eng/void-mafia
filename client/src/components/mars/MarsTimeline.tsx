/**
 * A life, in the order it happened.
 *
 * WHY A TIMELINE AND NOT MORE PROSE
 * ─────────────────────────────────
 * The record already holds a paragraph about the person. What a paragraph
 * cannot do is answer "what year was that?" or show a life as a shape — born
 * here, moved there, this is when the children came, this is the gap nobody
 * ever explained. Families reconstruct exactly this, out loud, every time they
 * sit down together; the archive should hold the result.
 *
 * The birth and death years are drawn as the first and last points but are NOT
 * stored as events — they already live on the record, and duplicating them
 * would let the two disagree.
 */
import { useState } from 'react';
import { motion } from 'framer-motion';
import { emitWithAck } from '@/lib/socket';
import type { Res } from '@/types/index';
import type { LifeEvent } from './types';
import * as sfx from './sfx';

interface Point {
  key: string;
  year: number;
  month: number | null;
  title: string;
  note: string;
  /** Derived from the record itself, so it cannot be edited or deleted here. */
  fixed?: boolean;
  id?: string;
}

export function MarsTimeline({
  subjectId, events, bornYear, diedYear, canEdit, accent, onChange,
}: {
  subjectId: string;
  events: LifeEvent[];
  bornYear: number | null;
  diedYear: number | null;
  canEdit: boolean;
  accent: string;
  onChange: (next: LifeEvent[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [year, setYear] = useState('');
  const [month, setMonth] = useState('');
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const points: Point[] = [
    ...(bornYear ? [{ key: 'born', year: bornYear, month: null, title: 'დაიბადა', note: '', fixed: true }] : []),
    ...events.map(e => ({ key: e.id, id: e.id, year: e.year, month: e.month, title: e.title, note: e.note })),
    ...(diedYear ? [{ key: 'died', year: diedYear, month: null, title: 'გარდაიცვალა', note: '', fixed: true }] : []),
  ].sort((a, b) => (a.year - b.year) || ((a.month ?? 13) - (b.month ?? 13)));

  const add = async () => {
    setBusy(true); setError(null);
    try {
      const res = await emitWithAck<any, Res<LifeEvent>>('mars:event_add', {
        subjectId,
        year: Number(year),
        month: month ? Number(month) : null,
        title: title.trim(),
        note: note.trim(),
      });
      if ('ok' in res && res.ok) {
        onChange([...events, res.data]);
        setYear(''); setMonth(''); setTitle(''); setNote('');
        setAdding(false);
        sfx.accept();
      } else { setError(('error' in res && res.error) || 'ვერ დაემატა'); sfx.reject(); }
    } catch { setError('კავშირი დაიკარგა.'); }
    finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    const res = await emitWithAck<any, Res<{ deleted: boolean }>>('mars:event_delete', { eventId: id });
    if ('ok' in res && res.ok && res.data.deleted) onChange(events.filter(e => e.id !== id));
  };

  if (!canEdit && points.length === 0) return null;

  const ready = /^\d{4}$/.test(year.trim()) && title.trim().length >= 2;

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <p className="font-mono text-[12px]" style={{ color: accent }}>🕰 ცხოვრების ხაზი</p>
        {canEdit && !adding && (
          <button onClick={() => setAdding(true)}
            className="ml-auto px-2 py-1 rounded-lg font-mono text-[11px] transition-all active:scale-95"
            style={{ border: `1px dashed ${accent}55`, color: accent }}>
            + მოვლენა
          </button>
        )}
      </div>

      {points.length === 0 ? (
        <p className="font-mono text-[11px] py-3 text-center" style={{ color: 'rgba(255,255,255,0.3)' }}>
          ჯერ არაფერია. დაამატე დაბადება, სკოლა, სამსახური, ქორწინება, შვილები…
        </p>
      ) : (
        <ol className="relative" style={{ listStyle: 'none', margin: 0, padding: '0 0 0 18px', borderLeft: `1px solid ${accent}35` }}>
          {points.map((p, i) => (
            <motion.li key={p.key}
              initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i * 0.04, 0.4) }}
              className="relative pb-3">
              <span aria-hidden className="absolute rounded-full" style={{
                left: -22, top: 6, width: p.fixed ? 9 : 7, height: p.fixed ? 9 : 7,
                background: p.fixed ? accent : 'rgba(255,255,255,0.45)',
                boxShadow: p.fixed ? `0 0 8px ${accent}aa` : 'none',
              }} />
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-[12px] shrink-0" style={{ color: accent, minWidth: 58 }}>
                  {p.year}{p.month ? `.${String(p.month).padStart(2, '0')}` : ''}
                </span>
                <span className="font-mono text-[12px] flex-1" style={{ color: 'rgba(230,255,240,0.88)' }}>
                  {p.title}
                </span>
                {canEdit && p.id && (
                  <button onClick={() => void remove(p.id!)}
                    className="font-mono text-[10px] shrink-0" style={{ color: 'rgba(255,95,109,0.55)' }}>✕</button>
                )}
              </div>
              {p.note && (
                <p className="font-mono text-[11px] mt-0.5 leading-relaxed" style={{ color: 'rgba(255,255,255,0.45)', marginLeft: 66 }}>
                  {p.note}
                </p>
              )}
            </motion.li>
          ))}
        </ol>
      )}

      {adding && (
        <div className="mt-2 rounded-xl p-2.5" style={{ border: `1px solid ${accent}44`, background: `${accent}0b` }}>
          <div className="flex gap-2">
            <input value={year} onChange={e => setYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="წელი" inputMode="numeric" autoFocus
              className="rounded-lg px-2 py-2 font-mono text-[12px] outline-none" style={{
                width: 72, background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.14)', color: '#d9ffe4',
              }} />
            <input value={month} onChange={e => setMonth(e.target.value.replace(/\D/g, '').slice(0, 2))}
              placeholder="თვე" inputMode="numeric"
              className="rounded-lg px-2 py-2 font-mono text-[12px] outline-none" style={{
                width: 62, background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.14)', color: '#d9ffe4',
              }} />
            <input value={title} onChange={e => setTitle(e.target.value.slice(0, 80))}
              placeholder="რა მოხდა"
              onKeyDown={e => { if (e.key === 'Enter' && ready) void add(); }}
              className="flex-1 min-w-0 rounded-lg px-2.5 py-2 font-mono text-[12px] outline-none"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', color: '#d9ffe4' }} />
          </div>
          <textarea value={note} onChange={e => setNote(e.target.value.slice(0, 400))} rows={2}
            placeholder="დეტალები (არასავალდებულო)"
            className="w-full mt-2 rounded-lg px-2.5 py-2 font-mono text-[12px] outline-none resize-none"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', color: '#d9ffe4' }} />
          <div className="flex gap-2 mt-2">
            <button onClick={() => { setAdding(false); setError(null); }}
              className="flex-1 py-2 rounded-lg font-mono text-[11px]"
              style={{ border: '1px solid rgba(255,255,255,0.14)', color: 'rgba(255,255,255,0.5)' }}>
              გაუქმება
            </button>
            <button onClick={() => void add()} disabled={busy || !ready}
              className="flex-1 py-2 rounded-lg font-mono text-[11px] font-bold disabled:opacity-40"
              style={{ border: `1px solid ${accent}88`, background: `${accent}22`, color: accent }}>
              {busy ? '…' : 'დამატება'}
            </button>
          </div>
        </div>
      )}

      {error && <p className="font-mono text-[10px] mt-1" style={{ color: '#ff5f6d' }}>{error}</p>}
    </div>
  );
}
