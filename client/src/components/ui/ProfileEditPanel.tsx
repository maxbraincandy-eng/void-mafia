import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { useAuthStore } from '@/store/authStore';
import { useT } from '@/store/langStore';

const ALLOWED = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const MAX_SIZE = 5 * 1024 * 1024;

async function resizeImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const maxDim = 200;
      let w = img.width, h = img.height;
      if (w > h) { if (w > maxDim) { h = Math.round(h * maxDim / w); w = maxDim; } }
      else { if (h > maxDim) { w = Math.round(w * maxDim / h); h = maxDim; } }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/webp', 0.7));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load image.')); };
    img.src = url;
  });
}

/** Lightweight profile editor — just name + picture. Opens from the menu. */
export function ProfileEditPanel({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { profile, localAvatar, uploadAvatar, removeAvatar, changeName } = useAuthStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(profile?.username ?? '');
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [nameMsg, setNameMsg] = useState('');

  const avatarSrc = preview ?? localAvatar ?? profile?.avatarUrl ?? null;

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    setErr('');
    if (!ALLOWED.includes(file.type)) { setErr(t.uiMisc.onlyImages); return; }
    if (file.size > MAX_SIZE) { setErr(t.uiMisc.imageTooBig); return; }
    setBusy(true);
    try {
      const resized = await resizeImage(file);
      setPreview(resized);
      const res = await uploadAvatar(resized);
      if (!res.ok) { setErr(res.error ?? t.uiMisc.uploadFailed); setPreview(null); }
      else setPreview(null);
    } catch { setErr(t.uiMisc.uploadFailed); setPreview(null); }
    finally { setBusy(false); }
  };

  const onRemove = async () => {
    setBusy(true); setErr(''); setPreview(null);
    const res = await removeAvatar();
    if (!res.ok) setErr(res.error ?? t.uiMisc.deleteFailed);
    setBusy(false);
  };

  const saveName = async () => {
    const v = name.trim();
    if (!v || v === profile?.username) return;
    setBusy(true); setNameMsg('');
    const res = await changeName(v);
    setBusy(false);
    setNameMsg(res.ok ? t.uiMisc.savedMark : (res.error ?? t.uiMisc.changeFailed));
  };

  return createPortal(
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 1500, background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <motion.div onClick={e => e.stopPropagation()}
        initial={{ opacity: 0, y: 20, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 360, damping: 28 }}
        style={{ width: 'min(360px, 100%)', background: 'rgba(10,4,26,0.99)', border: '1px solid rgba(155,0,255,0.3)', borderRadius: 22, padding: '22px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <p style={{ fontFamily: '"Space Grotesk",sans-serif', fontWeight: 700, fontSize: 17, color: 'white' }}>{t.uiMisc.editProfile}</p>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.4)', fontSize: 17, cursor: 'pointer' }}>✕</button>
        </div>

        {/* Avatar */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <div style={{ width: 96, height: 96, borderRadius: '50%', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(155,0,255,0.15)', border: '2px solid rgba(155,0,255,0.4)', fontSize: 40 }}>
            {avatarSrc ? <img src={avatarSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (profile?.avatar ?? '👤')}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => fileRef.current?.click()} disabled={busy}
              style={{ padding: '8px 14px', borderRadius: 12, fontFamily: 'monospace', fontSize: 12, background: 'rgba(155,0,255,.14)', border: '1px solid rgba(155,0,255,.4)', color: '#c084fc', cursor: 'pointer' }}>
              {busy ? '…' : t.uiMisc.changeImage}
            </button>
            {avatarSrc && (
              <button onClick={onRemove} disabled={busy}
                style={{ padding: '8px 12px', borderRadius: 12, fontFamily: 'monospace', fontSize: 12, background: 'rgba(255,45,85,.1)', border: '1px solid rgba(255,45,85,.3)', color: '#ff2d55', cursor: 'pointer' }}>{t.uiMisc.deleteBtn}</button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/jpeg,image/jpg,image/png,image/webp" style={{ display: 'none' }} onChange={onFile} />
        </div>

        {/* Name */}
        <label style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(255,255,255,.3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{t.uiMisc.nameLabel}</label>
        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          <input value={name} onChange={e => { setName(e.target.value); setNameMsg(''); }} maxLength={20}
            style={{ flex: 1, background: 'rgba(255,255,255,.04)', fontFamily: 'monospace', fontSize: 14, color: 'white', outline: 'none', padding: '10px 12px', borderRadius: 12, border: '1px solid rgba(255,255,255,.12)' }} />
          <button onClick={saveName} disabled={busy || !name.trim() || name.trim() === profile?.username}
            style={{ padding: '10px 16px', borderRadius: 12, fontFamily: 'monospace', fontSize: 13, background: 'rgba(0,255,136,.14)', border: '1px solid rgba(0,255,136,.4)', color: '#00ff88', cursor: 'pointer', opacity: (!name.trim() || name.trim() === profile?.username) ? 0.4 : 1 }}>{t.uiMisc.saveBtn}</button>
        </div>
        {nameMsg && <p style={{ fontFamily: 'monospace', fontSize: 11, color: nameMsg.startsWith('✓') ? '#00ff88' : '#ff2d55', marginTop: 6 }}>{nameMsg}</p>}
        {err && <p style={{ fontFamily: 'monospace', fontSize: 11, color: '#ff2d55', marginTop: 8 }}>{err}</p>}
      </motion.div>
    </div>,
    document.body
  );
}
