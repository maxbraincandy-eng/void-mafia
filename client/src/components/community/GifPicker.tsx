import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import { useT } from '@/store/langStore';

interface GifResult {
  id: string;
  url: string;
  preview: string;
}

interface Props {
  onSelect: (url: string) => void;
  onClose: () => void;
}

export function GifPicker({ onSelect, onClose }: Props) {
  const t = useT();
  const [query, setQuery] = useState('');
  const [gifs, setGifs] = useState<GifResult[]>([]);
  const [loading, setLoading] = useState(false);
  /**
   * Why there is nothing to show.
   *
   * "No results" and "the service is switched off" looked identical here, and
   * that is how a dead endpoint sat in production reading as an empty search.
   * The server now says which it is, and so does this.
   */
  const [problem, setProblem] = useState<'none' | 'not_configured' | 'failed'>('none');
  /** The paste-a-link way in, for when search cannot answer. */
  const [pasted, setPasted] = useState('');
  /*
   * Only an http(s) address is offered — the same rule the server enforces on
   * the way in, applied here so the button is dead rather than the post being
   * refused after you have written the caption.
   */
  const pastedOk = /^https?:\/\/\S+$/i.test(pasted.trim());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = async (q: string) => {
    setLoading(true);
    try {
      // Server-side proxy — the API key never reaches the browser.
      const res = await fetch(`/api/gif/search?q=${encodeURIComponent(q.trim())}&limit=24`);
      const data = await res.json();
      const found = ((data.gifs ?? []) as GifResult[]).filter(g => g.url);
      setGifs(found);
      setProblem(data.reason === 'not_configured' ? 'not_configured'
        : data.ok === false ? 'failed'
        : 'none');
    } catch { setGifs([]); setProblem('failed'); }
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
            placeholder={t.commB.searchGif}
            autoFocus
            style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(0,229,255,0.2)', borderRadius: 10, padding: '8px 12px', color: 'white', fontFamily: 'monospace', fontSize: 12, outline: 'none' }}
          />
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)', borderRadius: 10, width: 32, height: 32, fontSize: 14, cursor: 'pointer', flexShrink: 0 }}>✕</button>
        </div>

        {/* Results */}
        <div className="overflow-y-auto flex-1 px-3 pb-4">
          {loading && (
            <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace', fontSize: 11, padding: '24px 0' }}>{t.commB.searching}</p>
          )}
          {!loading && gifs.length === 0 && problem === 'none' && (
            <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.25)', fontFamily: 'monospace', fontSize: 11, padding: '24px 0' }}>
              {query.trim() ? t.commB.gifNotFound : t.commB.loadingGifs}
            </p>
          )}
          {!loading && problem !== 'none' && (
            <div style={{ textAlign: 'center', padding: '18px 14px' }}>
              <p style={{ fontSize: 24, marginBottom: 8 }}>{problem === 'not_configured' ? '🔌' : '⚠️'}</p>
              <p style={{ color: 'rgba(255,255,255,0.7)', fontFamily: 'monospace', fontSize: 12, lineHeight: 1.6 }}>
                {problem === 'not_configured'
                  ? 'GIF-ის ძებნა გამორთულია.'
                  : 'GIF-ის ძებნა ვერ მოხერხდა.'}
              </p>
              {problem === 'failed' && (
                <button onClick={() => search(query)}
                  style={{ marginTop: 12, background: 'rgba(0,229,255,0.1)', border: '1px solid rgba(0,229,255,0.3)', color: '#67e8f9', borderRadius: 10, padding: '7px 16px', fontFamily: 'monospace', fontSize: 12, cursor: 'pointer' }}>
                  ხელახლა
                </button>
              )}

              {/*
                Search is not the only way to get a GIF into a post.
                Posting one has always been a URL, and a GIF anybody finds
                anywhere has one — so when search cannot answer, the picker asks
                for the link instead of being a dead end.
              */}
              <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                <p style={{ color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace', fontSize: 11, marginBottom: 8 }}>
                  ჩასვი GIF-ის ბმული
                </p>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    value={pasted} onChange={e => setPasted(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && pastedOk) { onSelect(pasted.trim()); onClose(); } }}
                    placeholder="https://…/something.gif"
                    style={{ flex: 1, minWidth: 0, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '8px 10px', color: 'white', fontFamily: 'monospace', fontSize: 11, outline: 'none' }}
                  />
                  <button
                    onClick={() => { if (pastedOk) { onSelect(pasted.trim()); onClose(); } }}
                    disabled={!pastedOk}
                    style={{ background: pastedOk ? 'rgba(0,229,255,0.14)' : 'rgba(255,255,255,0.04)', border: `1px solid ${pastedOk ? 'rgba(0,229,255,0.35)' : 'rgba(255,255,255,0.08)'}`, color: pastedOk ? '#67e8f9' : 'rgba(255,255,255,0.25)', borderRadius: 10, padding: '8px 14px', fontFamily: 'monospace', fontSize: 11, cursor: pastedOk ? 'pointer' : 'default', flexShrink: 0 }}
                  >დადება</button>
                </div>
                {pasted.trim() && pastedOk && (
                  <img src={pasted.trim()} alt="" style={{ marginTop: 10, maxWidth: '100%', maxHeight: 160, borderRadius: 10, display: 'block', marginLeft: 'auto', marginRight: 'auto' }} />
                )}
              </div>
            </div>
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
