/**
 * Detective's Notebook perk — private per-player notes during a game.
 *
 * WHY THE NOTES NEVER LEAVE THE DEVICE
 * ────────────────────────────────────
 * They are stored in localStorage, keyed by room id. Notes about who you
 * suspect are the single most damaging thing that could leak out of this app,
 * and the safest way to guarantee they don't is for the server to never hold
 * them. Ownership of the perk IS checked server-side (that's the paid part);
 * the content is not the server's business.
 *
 * WHY IT IS OFF IN RANKED
 * ───────────────────────
 * Written notes are a real advantage in a game about tracking claims. Selling
 * that advantage in the rated ladder would be selling wins, so ranked rooms
 * disable it for everyone — the perk is for casual rooms only, and the panel
 * says so rather than silently doing nothing.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

export type NoteTag = 'none' | 'suspect' | 'clear' | 'mafia' | 'watch';

const TAG_LABEL: Record<NoteTag, string> = {
  none: '—', suspect: 'ეჭვი', clear: 'სუფთა', mafia: 'მაფია', watch: 'თვალი',
};
const TAG_COLOR: Record<NoteTag, string> = {
  none: '148,163,184', suspect: '251,146,60', clear: '52,211,153', mafia: '244,63,94', watch: '56,189,248',
};
const TAGS: NoteTag[] = ['none', 'suspect', 'clear', 'mafia', 'watch'];

interface Entry { tag: NoteTag; text: string }
type Book = Record<string, Entry>;

const key = (roomId: string) => `vm-notebook:${roomId}`;

function load(roomId: string): Book {
  try { return JSON.parse(localStorage.getItem(key(roomId)) ?? '{}') || {}; } catch { return {}; }
}
function save(roomId: string, book: Book): void {
  try { localStorage.setItem(key(roomId), JSON.stringify(book)); } catch { /* quota — notes are best-effort */ }
}

/** Colour for a player's seat/row elsewhere in the UI, or null if untagged. */
export function useNotebookTags(roomId: string | null, enabled: boolean): Record<string, NoteTag> {
  const [tags, setTags] = useState<Record<string, NoteTag>>({});
  useEffect(() => {
    if (!roomId || !enabled) { setTags({}); return; }
    const read = () => {
      const book = load(roomId);
      const out: Record<string, NoteTag> = {};
      for (const [id, e] of Object.entries(book)) if (e.tag !== 'none') out[id] = e.tag;
      setTags(out);
    };
    read();
    // Same-tab writes don't fire `storage`, so the panel announces its own edits.
    window.addEventListener('vm-notebook-changed', read);
    return () => window.removeEventListener('vm-notebook-changed', read);
  }, [roomId, enabled]);
  return tags;
}

export function notebookTagColor(tag: NoteTag | undefined): string | null {
  return tag && tag !== 'none' ? TAG_COLOR[tag] : null;
}

export function DetectiveNotebook({
  roomId, players, owned, ranked, onClose,
}: {
  roomId: string;
  players: Array<{ id: string; name: string; seat?: number }>;
  owned: boolean;
  ranked: boolean;
  onClose: () => void;
}) {
  const [book, setBook] = useState<Book>(() => load(roomId));
  const [editing, setEditing] = useState<string | null>(null);

  const update = useCallback((playerId: string, patch: Partial<Entry>) => {
    setBook(prev => {
      const base: Entry = prev[playerId] ?? { tag: 'none', text: '' };
      const next = { ...prev, [playerId]: { ...base, ...patch } };
      save(roomId, next);
      window.dispatchEvent(new Event('vm-notebook-changed'));
      return next;
    });
  }, [roomId]);

  const tagged = useMemo(
    () => players.filter(p => (book[p.id]?.tag ?? 'none') !== 'none' || (book[p.id]?.text ?? '') !== '').length,
    [players, book],
  );

  const blocked = !owned || ranked;

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-3"
      style={{ background: 'rgba(3,2,10,0.72)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 24, scale: 0.98 }} animate={{ y: 0, scale: 1 }} exit={{ y: 16, opacity: 0 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl overflow-hidden"
        style={{ border: '1px solid rgba(148,163,184,0.25)', background: 'linear-gradient(165deg, #12121a, #08080d)' }}
      >
        <div className="px-4 py-3 flex items-center gap-2 border-b border-white/[0.06]">
          <span className="text-[16px]">📓</span>
          <div className="min-w-0 flex-1">
            <p className="font-display font-bold text-[14px] text-white/85">დეტექტივის ბლოკნოტი</p>
            <p className="font-mono text-[10px] text-white/30">
              {blocked ? 'მიუწვდომელია' : `${tagged}/${players.length} მონიშნული · მხოლოდ შენ ხედავ`}
            </p>
          </div>
          <button onClick={onClose} className="px-2 py-1 rounded-md font-mono text-[12px] text-white/40 hover:text-white/70">✕</button>
        </div>

        {blocked ? (
          <div className="px-4 py-6 text-center">
            <p className="font-mono text-[12px] text-white/50 leading-relaxed">
              {ranked
                ? 'Ranked თამაშში ბლოკნოტი ყველასთვის გამორთულია — რეიტინგში უპირატესობა არ იყიდება.'
                : 'ბლოკნოტი ჯერ არ გაქვს. იყიდე ნივთების მაღაზიაში.'}
            </p>
          </div>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto px-2 py-2 space-y-1">
            {players.map(p => {
              const e = book[p.id] ?? { tag: 'none' as NoteTag, text: '' };
              const c = TAG_COLOR[e.tag];
              const isOpen = editing === p.id;
              return (
                <div key={p.id} className="rounded-lg"
                  style={{
                    border: `1px solid rgba(${c},${e.tag === 'none' ? 0.10 : 0.34})`,
                    background: e.tag === 'none' ? 'rgba(255,255,255,0.02)' : `rgba(${c},0.08)`,
                  }}>
                  <button className="w-full px-2.5 py-2 flex items-center gap-2 text-left"
                    onClick={() => setEditing(v => (v === p.id ? null : p.id))}>
                    {p.seat != null && p.seat > 0 && (
                      <span className="font-mono text-[11px] text-white/25 w-4 shrink-0">{p.seat}</span>
                    )}
                    <span className="font-mono text-[12px] text-white/80 truncate flex-1">{p.name}</span>
                    {e.tag !== 'none' && (
                      <span className="font-mono text-[10px] px-1.5 py-0.5 rounded"
                        style={{ background: `rgba(${c},0.16)`, color: `rgb(${c})` }}>{TAG_LABEL[e.tag]}</span>
                    )}
                    {e.text && <span className="text-[11px] text-white/25">✎</span>}
                  </button>

                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.15 }} style={{ overflow: 'hidden' }}
                      >
                        <div className="px-2.5 pb-2 space-y-1.5">
                          <div className="flex flex-wrap gap-1">
                            {TAGS.map(t => (
                              <button key={t} onClick={() => update(p.id, { tag: t })}
                                className="px-2 py-0.5 rounded-md font-mono text-[10px] transition-all active:scale-95"
                                style={{
                                  border: `1px solid rgba(${TAG_COLOR[t]},${e.tag === t ? 0.5 : 0.14})`,
                                  background: e.tag === t ? `rgba(${TAG_COLOR[t]},0.18)` : 'rgba(255,255,255,0.03)',
                                  color: e.tag === t ? `rgb(${TAG_COLOR[t]})` : 'rgba(255,255,255,0.45)',
                                }}>
                                {TAG_LABEL[t]}
                              </button>
                            ))}
                          </div>
                          <textarea
                            value={e.text}
                            onChange={ev => update(p.id, { text: ev.target.value.slice(0, 200) })}
                            placeholder="ჩანაწერი…"
                            rows={2}
                            className="w-full rounded-md px-2 py-1.5 font-mono text-[11px] text-white/80 resize-none outline-none"
                            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                          />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
