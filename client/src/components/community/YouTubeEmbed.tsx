import { useState } from 'react';

export function extractYouTubeId(text: string): string | null {
  const patterns = [
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1]!;
  }
  return null;
}

export function YouTubeEmbed({ videoId }: { videoId: string }) {
  const [playing, setPlaying] = useState(false);
  const thumb = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

  return (
    <div className="relative w-full rounded-xl overflow-hidden" style={{ aspectRatio: '16/9', background: '#000' }}>
      {playing ? (
        <iframe
          src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          loading="lazy"
          className="absolute inset-0 w-full h-full"
          style={{ border: 'none' }}
        />
      ) : (
        <button
          onClick={() => setPlaying(true)}
          className="absolute inset-0 w-full h-full group"
          aria-label="Play video"
        >
          <img
            src={thumb}
            alt="YouTube thumbnail"
            className="w-full h-full object-cover"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
          {/* Dark overlay */}
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.35)' }} />
          {/* Play button */}
          <div
            className="absolute inset-0 flex items-center justify-center"
          >
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center transition-transform group-active:scale-90"
              style={{ background: 'rgba(255,0,0,0.9)', boxShadow: '0 4px 24px rgba(0,0,0,0.5)' }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>
          {/* YouTube badge */}
          <div className="absolute bottom-2 right-2">
            <div
              className="px-2 py-0.5 rounded font-mono text-[10px] text-white font-bold"
              style={{ background: 'rgba(255,0,0,0.85)' }}
            >
              YouTube
            </div>
          </div>
        </button>
      )}
    </div>
  );
}
