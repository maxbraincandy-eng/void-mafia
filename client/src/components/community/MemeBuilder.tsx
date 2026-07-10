import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { useT } from '@/store/langStore';

interface Props {
  onClose: () => void;
  onPost: (imageData: string, caption: string) => void;
}

export function MemeBuilder({ onClose, onPost }: Props) {
  const t = useT();
  const [image, setImage] = useState<string | null>(null);
  const [topText, setTopText] = useState('');
  const [bottomText, setBottomText] = useState('');
  const [fontSize, setFontSize] = useState(32);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);

  const drawMeme = useCallback((canvas: HTMLCanvasElement, imgSrc: string, top: string, bottom: string, fs: number) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = new Image();
    img.onload = () => {
      const MAX = 600;
      let w = img.width, h = img.height;
      if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
      canvas.width = w; canvas.height = h;
      ctx.drawImage(img, 0, 0, w, h);
      ctx.font = `bold ${fs}px Impact, Arial Black, sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = fs / 8;
      ctx.strokeStyle = '#000';
      ctx.fillStyle = '#fff';
      if (top) {
        ctx.strokeText(top.toUpperCase(), w / 2, fs + 8);
        ctx.fillText(top.toUpperCase(), w / 2, fs + 8);
      }
      if (bottom) {
        ctx.strokeText(bottom.toUpperCase(), w / 2, h - 12);
        ctx.fillText(bottom.toUpperCase(), w / 2, h - 12);
      }
    };
    img.src = imgSrc;
  }, []);

  const handleImagePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const src = reader.result as string;
      setImage(src);
      setTimeout(() => {
        if (previewRef.current) drawMeme(previewRef.current, src, topText, bottomText, fontSize);
      }, 50);
    };
    reader.readAsDataURL(file);
  };

  const updatePreview = () => {
    if (image && previewRef.current) drawMeme(previewRef.current, image, topText, bottomText, fontSize);
  };

  const handlePost = () => {
    if (!image || !previewRef.current) return;
    const data = previewRef.current.toDataURL('image/jpeg', 0.85);
    onPost(data, topText || bottomText || 'Meme');
  };

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[300] flex items-end justify-center"
      style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        className="w-full max-w-lg rounded-t-3xl flex flex-col"
        style={{ background: '#0d0a1a', border: '1px solid rgba(155,0,255,0.2)', borderBottom: 'none', maxHeight: '92dvh' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 pt-4 pb-3 flex-shrink-0">
          <span style={{ fontFamily: 'monospace', fontSize: 13, color: '#c084fc', letterSpacing: '0.1em' }}>🎭 MEME BUILDER</span>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)', borderRadius: 10, width: 30, height: 30, fontSize: 14, cursor: 'pointer' }}>✕</button>
        </div>

        <div className="overflow-y-auto flex-1 px-4 pb-4 space-y-3">
          {!image ? (
            <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '40px 20px', borderRadius: 16, border: '2px dashed rgba(155,0,255,0.3)', cursor: 'pointer', background: 'rgba(155,0,255,0.04)' }}>
              <span style={{ fontSize: 32 }}>🖼️</span>
              <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{t.commB.pickImage}</span>
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImagePick} />
            </label>
          ) : (
            <canvas ref={previewRef} style={{ width: '100%', borderRadius: 12, display: 'block' }} />
          )}

          <input
            value={topText} onChange={e => { setTopText(e.target.value); updatePreview(); }}
            placeholder={t.commB.topText}
            style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(155,0,255,0.2)', borderRadius: 10, padding: '10px 12px', color: 'white', fontFamily: 'monospace', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
          />
          <input
            value={bottomText} onChange={e => { setBottomText(e.target.value); updatePreview(); }}
            placeholder={t.commB.bottomText}
            style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(155,0,255,0.2)', borderRadius: 10, padding: '10px 12px', color: 'white', fontFamily: 'monospace', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>{t.commB.size}: {fontSize}</span>
            <input type="range" min={16} max={60} value={fontSize}
              onChange={e => { setFontSize(Number(e.target.value)); updatePreview(); }}
              style={{ flex: 1, accentColor: '#9b00ff' }}
            />
          </div>
          {image && (
            <button
              onClick={handlePost}
              style={{ width: '100%', padding: '12px 0', borderRadius: 14, fontFamily: 'monospace', fontSize: 13, background: 'rgba(155,0,255,0.18)', border: '1.5px solid rgba(155,0,255,0.5)', color: '#c084fc', cursor: 'pointer', letterSpacing: '0.08em' }}
            >
              {t.commB.shareMeme}
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>,
    document.body
  );
}
