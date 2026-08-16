/**
 * The photographs.
 *
 * WHY THE IMAGES COME OVER HTTP AND NOT WITH THE RECORD
 * ────────────────────────────────────────────────────
 * The record page loads ids; each <img> then fetches /mars/photo/<id>. That
 * means the browser caches them like any other image — the second visit to a
 * memorial costs nothing — and opening a record with twenty pictures does not
 * hold the whole page behind twenty megabytes of base64 arriving over a socket.
 *
 * WHY A LIGHTBOX AND NOT A NEW PAGE
 * ─────────────────────────────────
 * People look through family photographs one after another. A viewer that
 * opens in place, moves with the arrow keys or a swipe, and closes back to the
 * same scroll position is the behaviour they already know from every phone
 * gallery.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { emitWithAck } from '@/lib/socket';
import { compressImage } from '@/lib/imageUtils';
import type { Res } from '@/types/index';
import type { MarsPhoto } from './types';
import * as sfx from './sfx';

const IMAGE_ACCEPT = 'image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif';

export function MarsGallery({
  subjectId, photos, canEdit, accent, onChange,
}: {
  subjectId: string;
  photos: MarsPhoto[];
  canEdit: boolean;
  accent: string;
  onChange: (next: MarsPhoto[]) => void;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement | null>(null);

  const add = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true); setError(null);
    const picked = Array.from(files).slice(0, 24);
    const added: MarsPhoto[] = [];
    for (let i = 0; i < picked.length; i++) {
      setProgress(picked.length > 1 ? `${i + 1}/${picked.length}` : '…');
      try {
        const data = await compressImage(picked[i], 1600, 0.72);
        const res = await emitWithAck<any, Res<MarsPhoto>>('mars:media_add', {
          subjectId, kind: 'photo', data,
        });
        if ('ok' in res && res.ok) added.push(res.data);
        else { setError(('error' in res && res.error) || 'ვერ აიტვირთა'); break; }
      } catch { setError('სურათი ვერ დამუშავდა.'); break; }
      // The server keeps a short floor between media writes; pacing here means
      // picking eight photos at once succeeds instead of half-failing.
      await new Promise(r => setTimeout(r, 450));
    }
    if (added.length) { onChange([...photos, ...added]); sfx.accept(); }
    setBusy(false); setProgress(null);
    if (input.current) input.current.value = '';
  };

  const remove = async (id: string) => {
    const res = await emitWithAck<any, Res<{ deleted: boolean }>>('mars:media_delete', { mediaId: id });
    if ('ok' in res && res.ok && res.data.deleted) {
      onChange(photos.filter(p => p.id !== id));
      setOpen(null);
    }
  };

  if (!canEdit && photos.length === 0) return null;

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <p className="font-mono text-[12px]" style={{ color: accent }}>
          🖼 ფოტოები{photos.length ? ` (${photos.length})` : ''}
        </p>
        {canEdit && (
          <button onClick={() => input.current?.click()} disabled={busy}
            className="ml-auto px-2 py-1 rounded-lg font-mono text-[11px] transition-all active:scale-95 disabled:opacity-40"
            style={{ border: `1px dashed ${accent}55`, color: accent }}>
            {busy ? (progress ?? '…') : '+ დამატება'}
          </button>
        )}
        <input ref={input} type="file" accept={IMAGE_ACCEPT} multiple style={{ display: 'none' }}
          onChange={e => void add(e.target.files)} />
      </div>

      {photos.length === 0 ? (
        <p className="font-mono text-[11px] py-3 text-center" style={{ color: 'rgba(255,255,255,0.3)' }}>
          ჯერ ფოტო არ არის. აირჩიე რამდენიმე ერთდროულად.
        </p>
      ) : (
        <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          {photos.map((p, i) => (
            <button key={p.id} onClick={() => setOpen(i)}
              className="relative rounded-lg overflow-hidden"
              style={{ aspectRatio: '1 / 1', border: '1px solid rgba(255,255,255,0.10)', background: 'rgba(0,0,0,0.35)' }}>
              <img src={`/mars/photo/${p.id}`} alt={p.caption || ''} loading="lazy"
                className="w-full h-full object-cover" />
              {p.year && (
                <span className="absolute bottom-0 right-0 px-1 font-mono text-[9px]"
                  style={{ background: 'rgba(0,0,0,0.6)', color: 'rgba(255,255,255,0.75)' }}>{p.year}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {error && <p className="font-mono text-[10px] mt-1" style={{ color: '#ff5f6d' }}>{error}</p>}

      <AnimatePresence>
        {open !== null && photos[open] && (
          <Lightbox
            photos={photos} index={open} canEdit={canEdit}
            onIndex={setOpen} onClose={() => setOpen(null)}
            onDelete={remove}
            onCaption={(id, caption, year) => {
              onChange(photos.map(p => (p.id === id ? { ...p, caption, year } : p)));
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function Lightbox({
  photos, index, canEdit, onIndex, onClose, onDelete, onCaption,
}: {
  photos: MarsPhoto[];
  index: number;
  canEdit: boolean;
  onIndex: (i: number) => void;
  onClose: () => void;
  onDelete: (id: string) => void;
  onCaption: (id: string, caption: string, year: number | null) => void;
}) {
  const photo = photos[index];
  const [editing, setEditing] = useState(false);
  const [caption, setCaption] = useState(photo.caption ?? '');
  const [year, setYear] = useState(photo.year ? String(photo.year) : '');
  const touch = useRef<number | null>(null);

  useEffect(() => {
    setEditing(false);
    setCaption(photo.caption ?? '');
    setYear(photo.year ? String(photo.year) : '');
  }, [photo.id, photo.caption, photo.year]);

  const go = (d: number) => {
    const next = index + d;
    if (next >= 0 && next < photos.length) onIndex(next);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const save = async () => {
    const y = year.trim() ? Number(year.trim()) : null;
    await emitWithAck<any, Res<any>>('mars:media_update', {
      mediaId: photo.id, caption: caption.trim(), year: y,
    });
    onCaption(photo.id, caption.trim(), Number.isFinite(y as number) ? y : null);
    setEditing(false);
  };

  // Portalled for the same reason the console is: a transformed ancestor would
  // make `fixed` resolve against it rather than the viewport.
  return createPortal(
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[2147483002] flex flex-col"
      style={{ background: 'rgba(0,3,2,0.96)' }}
      onClick={onClose}
      onTouchStart={e => { touch.current = e.touches[0].clientX; }}
      onTouchEnd={e => {
        if (touch.current == null) return;
        const dx = e.changedTouches[0].clientX - touch.current;
        if (dx < -50) go(1); else if (dx > 50) go(-1);
        touch.current = null;
      }}
    >
      <div className="flex items-center gap-2 px-4 py-3 shrink-0" onClick={e => e.stopPropagation()}>
        <span className="font-mono text-[12px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
          {index + 1} / {photos.length}
        </span>
        {canEdit && (
          <button onClick={() => onDelete(photo.id)}
            className="ml-auto font-mono text-[11px] px-2 py-1 rounded"
            style={{ border: '1px solid rgba(255,95,109,0.4)', color: '#ff8a94' }}>წაშლა</button>
        )}
        <button onClick={onClose} aria-label="დახურვა"
          className={`font-mono text-[13px] px-2 py-1 rounded ${canEdit ? '' : 'ml-auto'}`}
          style={{ border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.7)' }}>✕</button>
      </div>

      <div className="flex-1 min-h-0 flex items-center justify-center px-2" onClick={e => e.stopPropagation()}>
        <img src={`/mars/photo/${photo.id}`} alt={photo.caption || ''}
          className="max-w-full max-h-full object-contain rounded-lg" />
      </div>

      <div className="px-4 py-3 shrink-0" onClick={e => e.stopPropagation()}>
        {editing ? (
          <div className="flex gap-2">
            <input value={caption} onChange={e => setCaption(e.target.value.slice(0, 160))}
              placeholder="ვინ, სად, როდის" autoFocus
              className="flex-1 min-w-0 rounded-lg px-2.5 py-2 font-mono text-[12px] outline-none"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: '#d9ffe4' }} />
            <input value={year} onChange={e => setYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="წელი" inputMode="numeric"
              className="rounded-lg px-2 py-2 font-mono text-[12px] outline-none" style={{
                width: 68, background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.15)', color: '#d9ffe4',
              }} />
            <button onClick={() => void save()}
              className="px-3 rounded-lg font-mono text-[12px]"
              style={{ border: '1px solid rgba(57,255,106,0.5)', background: 'rgba(57,255,106,0.15)', color: '#39ff6a' }}>
              ✓
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <p className="font-mono text-[12px] flex-1" style={{ color: 'rgba(255,255,255,0.7)' }}>
              {photo.caption || (canEdit ? 'წარწერის დამატება…' : '')}
              {photo.year ? <span style={{ color: 'rgba(57,255,106,0.7)' }}> · {photo.year}</span> : null}
            </p>
            {canEdit && (
              <button onClick={() => setEditing(true)}
                className="font-mono text-[11px]" style={{ color: 'rgba(125,249,255,0.75)' }}>რედაქტირება</button>
            )}
          </div>
        )}
      </div>
    </motion.div>,
    document.body,
  );
}
