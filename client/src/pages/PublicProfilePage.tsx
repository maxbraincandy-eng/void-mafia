import { useEffect, useState } from 'react';
import { ProfileCard, CARD_TEMPLATES, downloadProfileCardImage } from '@/components/ui/ProfileCard';
import type { CardTemplate, ProfileCardData } from '@/components/ui/ProfileCard';

interface Props {
  publicId: number;
  onEnterApp: () => void;
}

export function PublicProfilePage({ publicId, onEnterApp }: Props) {
  const [data, setData] = useState<ProfileCardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [template, setTemplate] = useState<CardTemplate>('classic_void');
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch(`/api/u/${publicId}`)
      .then(r => r.json())
      .then(res => {
        if (res.ok) setData(res.data as ProfileCardData);
        else setNotFound(true);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [publicId]);

  const profileUrl = `${window.location.origin}/u/${publicId}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(profileUrl);
    } catch {
      const el = document.createElement('input');
      el.value = profileUrl;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadCard = async () => {
    if (!data || downloading) return;
    setDownloading(true);
    try { await downloadProfileCardImage(data, template); }
    finally { setDownloading(false); }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#060314' }}>
        <div className="w-8 h-8 border-2 border-neon-cyan/50 border-t-neon-cyan rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4" style={{ background: '#060314' }}>
        <p className="text-white/30 font-mono text-base mb-6">Profile not found</p>
        <button
          onClick={onEnterApp}
          className="px-6 py-3 rounded-xl border border-neon-cyan/30 bg-neon-cyan/8 text-neon-cyan font-display font-bold text-sm tracking-widest uppercase"
        >
          ↗ Play Void Mafia
        </button>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-10"
      style={{ background: '#060314' }}
    >
      {/* Branding header */}
      <div className="mb-6 text-center">
        <p className="font-mono text-[10px] tracking-[0.4em] uppercase text-white/25 mb-0.5">VOID MAFIA</p>
        <p className="font-mono text-[10px] text-white/15">Player Profile</p>
      </div>

      {/* Card preview */}
      <ProfileCard data={data} template={template} />

      {/* Template picker */}
      <div className="mt-5 flex gap-2 flex-wrap justify-center">
        {CARD_TEMPLATES.map(t => (
          <button
            key={t.key}
            onClick={() => setTemplate(t.key)}
            className={`px-3 py-1.5 rounded-lg border text-xs font-mono transition-all ${
              template === t.key
                ? 'border-neon-cyan/50 bg-neon-cyan/10 text-neon-cyan'
                : 'border-white/10 text-white/40 hover:border-white/25 hover:text-white/60'
            }`}
          >
            {t.emoji} {t.label}
          </button>
        ))}
      </div>

      {/* Actions */}
      <div className="mt-5 w-full max-w-sm space-y-2">
        <button
          onClick={copyLink}
          className={`w-full py-3 rounded-xl font-display font-bold text-sm tracking-widest uppercase transition-all border ${
            copied
              ? 'border-neon-green/50 bg-neon-green/10 text-neon-green'
              : 'border-neon-cyan/40 bg-neon-cyan/10 text-neon-cyan hover:bg-neon-cyan/15'
          }`}
        >
          {copied ? '✓ Copied!' : '🔗 Copy Link'}
        </button>

        <button
          onClick={downloadCard}
          disabled={downloading}
          className="w-full py-3 rounded-xl font-display font-bold text-sm tracking-widest uppercase transition-all border border-neon-purple/40 bg-neon-purple/10 text-neon-purple hover:bg-neon-purple/15 disabled:opacity-50"
        >
          {downloading ? '⏳ Saving…' : '⬇ Download Card'}
        </button>

        <button
          onClick={onEnterApp}
          className="w-full py-3 rounded-xl font-display font-bold text-sm tracking-widest uppercase transition-all border border-white/20 bg-white/5 text-white/70 hover:bg-white/10"
        >
          ↗ Play on Void Mafia
        </button>
      </div>

      <p className="mt-8 font-mono text-[10px] text-white/12">voidmafia.one</p>
    </div>
  );
}
