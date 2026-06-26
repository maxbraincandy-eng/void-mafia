import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { createPortal } from 'react-dom';

interface GifResult {
  id: string;
  url: string;
  preview: string;
}

interface Props {
  onSelect: (url: string) => void;
  onClose: () => void;
}

const TENOR_KEY = import.meta.env.VITE_TENOR_API_KEY ?? 'LIVDSRZULELA';

export function GifPicker({ onSelect, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [gifs, setGifs] = useState<GifResult[]>([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = async (q: string) => {
    setLoading(true);
    try {
      // Tenor v1 works with the LIVDSRZULELA demo key
      const endpoint = q.trim()
        ? `https://api.tenor.com/v1/search?q=${encodeURIComponent(q.trim())}&key=${TENOR_KEY}&limit=20&contentfilter=medium`
        : `https://api.tenor.com/v1/trending?key=${TENOR_KEY}&limit=20&contentfilter=medium`;
      const res = await fetch(endpoint);
      const data = await res.json();
      const results: GifResult[] = (data.results ?? []).map((r: any) => ({
        id: r.id,
        url: r.media?.[0]?.gif?.url ?? '',
        preview: r.media?.[0]?.tinygif?.url ?? r.media?.[0]?.gif?.url ?? '',
      })).filter((r: GifResult) => r.url);
      setGifs(results);
    } catch { setGifs([]); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => search(query), 400);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [query]);

  // Load trending on mount
  useEffect(() => { search(''); }, []);

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[300] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        className="w-full max-w-md rounded-3xl flex flex-col"
        style={{ background: '#0d0a1a', border: '1px solid rgba(0,229,255,0.2)', maxHeight: '70dvh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 pt-4 pb-3 flex-shrink-0">
          <span style={{ fontSize: 18 }}>🎞</span>
          <input
            value={query} onChange={e => setQuery(e.target.value)}
            placeholder="GIF-ის ძიება…"
            autoFocus
            style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(0,229,255,0.2)', borderRadius: 10, padding: '8px 12px', color: 'white', fontFamily: 'monospace', fontSize: 12, outline: 'none' }}
          />
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)', borderRadius: 10, width: 32, height: 32, fontSize: 14, cursor: 'pointer', flexShrink: 0 }}>✕</button>
        </div>

        {/* Results */}
        <div className="overflow-y-auto flex-1 px-3 pb-4">
          {loading && (
            <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace', fontSize: 11, padding: '24px 0' }}>ძიება…</p>
          )}
          {!loading && gifs.length === 0 && (
            <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.25)', fontFamily: 'monospace', fontSize: 11, padding: '24px 0' }}>
              {query.trim() ? 'GIF ვერ მოიძებნა' : 'ვტვირთავ…'}
            </p>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
            {gifs.map(gif => (
              <button key={gif.id} onClick={() => { onSelect(gif.url); onClose(); }}
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', padding: 0, cursor: 'pointer', borderRadius: 8, overflow: 'hidden', aspectRatio: '4/3' }}
              >
                <img src={gif.preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} loading="lazy" />
              </button>
            ))}
          </div>
        </div>
      </motion.div>
    </motion.div>,
    document.body
  );
}
