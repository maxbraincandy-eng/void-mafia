import { useState, useRef } from 'react';
import { useT } from '@/store/langStore';
import { useAuthStore } from '@/store/authStore';
import { useCommunityStore } from '@/store/communityStore';
import type { PostType } from '@/types/index';
import { ModalShell, Avatar, TextArea, TextInput, PillButton } from '@/components/community/shared';
import { compressImage } from '@/lib/imageUtils';
import { GifPicker } from '@/components/community/GifPicker';
import { MemeBuilder } from '@/components/community/MemeBuilder';
import { VoicePostRecorder } from '@/components/community/VoicePostRecorder';
import { useMyLimits } from '@/store/vipStore';

const TYPE_ICONS: Record<PostType, string> = {
  text: '📝', image: '🖼', gif: '🎞', video: '🎬', poll: '📊', voice: '🎙',
  movie_rec: '🎬', series_rec: '📺', book_rec: '📚', music_rec: '🎵', philosophy: '🧠',
};

interface PollBuilderProps {
  question: string;
  setQuestion: (v: string) => void;
  options: string[];
  setOptions: (opts: string[]) => void;
}

function PollBuilder({ question, setQuestion, options, setOptions }: PollBuilderProps) {
  const t = useT();
  return (
    <div className="space-y-2">
      <TextInput value={question} onChange={setQuestion} placeholder={t.community.poll.questionPh} maxLength={200} />
      {options.map((opt, i) => (
        <div key={i} className="flex items-center gap-2">
          <TextInput
            value={opt}
            onChange={v => { const next = [...options]; next[i] = v; setOptions(next); }}
            placeholder={`Option ${i + 1}`}
            maxLength={100}
          />
          {options.length > 2 && (
            <button
              onClick={() => setOptions(options.filter((_, j) => j !== i))}
              className="text-white/30 hover:text-red-400/80 transition-colors font-mono text-sm flex-shrink-0"
            >✕</button>
          )}
        </div>
      ))}
      {options.length < 4 && (
        <button
          onClick={() => setOptions([...options, ''])}
          className="font-mono text-[11px] text-white/40 hover:text-white/70 transition-colors"
        >
          + {t.community.poll.addOption}
        </button>
      )}
    </div>
  );
}

function ImagePicker({
  preview, onFile, onUrl, urlValue, setUrlValue, compressing, onMeme,
}: {
  preview: string | null;
  onFile: (file: File) => void;
  onUrl: () => void;
  urlValue: string;
  setUrlValue: (v: string) => void;
  compressing: boolean;
  onMeme: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-2">
      {/* Upload + Meme buttons */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={compressing}
          className="flex items-center gap-2 px-3 py-2 rounded-xl font-mono text-xs transition-all active:scale-95 disabled:opacity-40"
          style={{ background: 'rgba(155,0,255,0.12)', border: '1px solid rgba(155,0,255,0.3)', color: '#c084fc' }}
        >
          {compressing ? '⏳ Compressing…' : '📷 Upload photo'}
        </button>
        <button
          type="button"
          onClick={onMeme}
          className="flex items-center gap-2 px-3 py-2 rounded-xl font-mono text-xs transition-all active:scale-95"
          style={{ background: 'rgba(0,245,255,0.08)', border: '1px solid rgba(0,245,255,0.25)', color: '#67e8f9' }}
        >
          🎨 Meme Builder
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) { onFile(f); e.target.value = ''; } }}
        />
      </div>

      {/* Preview */}
      {preview && (
        <div className="relative rounded-xl overflow-hidden border border-white/10 bg-black flex items-center justify-center">
          <img src={preview} alt="preview" className="max-w-full" style={{ maxHeight: 360, width: 'auto', height: 'auto', objectFit: 'contain' }} />
          <button
            type="button"
            onClick={() => setUrlValue('')}
            className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 flex items-center justify-center font-mono text-xs text-white/70 hover:text-white transition-colors"
          >✕</button>
        </div>
      )}

      {/* URL fallback */}
      {!preview && (
        <TextInput value={urlValue} onChange={setUrlValue} placeholder="https://…" />
      )}
    </div>
  );
}

/** Matches the server's ceiling in communityService.createPostV2. */
const MAX_IMAGES = 6;

export function PostComposerV2({ onClose }: { onClose: () => void }) {
  const t = useT();
  const profile = useAuthStore(s => s.profile);
  const createPostV2 = useCommunityStore(s => s.createPostV2);
  const limits = useMyLimits();

  const [postType, setPostType] = useState<PostType>('text');
  const [content, setContent] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [imageUrl, setImageUrl] = useState('');   // the URL-paste fallback
  const [gifUrl, setGifUrl] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [audioFx, setAudioFx] = useState<string | null>(null);
  const [audioDuration, setAudioDuration] = useState(0);
  const [recTitle, setRecTitle] = useState('');
  const [recImageUrl, setRecImageUrl] = useState('');
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [visibility, setVisibility] = useState<'public' | 'friends_only'>('public');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [posting, setPosting] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [imgError, setImgError] = useState('');

  const multiFileRef = useRef<HTMLInputElement>(null);
  const [showGif, setShowGif] = useState(false);
  const [showMeme, setShowMeme] = useState(false);
  const [showVoice, setShowVoice] = useState(false);

  /*
   * Six kinds of post.
   *
   * The four recommendation types and the philosophy thought were removed:
   * eleven chips is a decision the composer was making on the poster's behalf
   * before they had written anything, and a recommendation is a text post with
   * extra required fields. Posts already made under those types still render —
   * the type is only consulted here, when something new is being written.
   */
  const TYPES: { id: PostType; label: string }[] = [
    { id: 'text',   label: t.community.composer.text },
    { id: 'image',  label: t.community.composer.image },
    { id: 'gif',    label: t.community.composer.gif },
    { id: 'voice',  label: 'Voice' },
    { id: 'video',  label: t.community.composer.video },
    { id: 'poll',   label: t.community.composer.poll },
  ];

  async function handleFiles(files: File[]) {
    setImgError('');
    const room = MAX_IMAGES - images.length;
    if (room <= 0) { setImgError(`მაქსიმუმ ${MAX_IMAGES} სურათი.`); return; }
    const picked = files.filter(f => f.type.startsWith('image/')).slice(0, room);
    if (!picked.length) { setImgError('აირჩიე სურათი.'); return; }
    if (picked.some(f => f.size > 20 * 1024 * 1024)) { setImgError('სურათი 20MB-ზე ნაკლები უნდა იყოს.'); return; }

    setCompressing(true);
    try {
      // A stack of six is six times the storage of one, so each frame in a
      // stack is compressed harder than a single image would be. The server
      // enforces the same ceiling; this is what keeps the upload from being
      // refused after the person has already waited for it.
      const many = images.length + picked.length > 1;
      const out: string[] = [];
      for (const f of picked) {
        out.push(many ? await compressImage(f, 1080, 0.6) : await compressImage(f));
      }
      setImages(prev => [...prev, ...out].slice(0, MAX_IMAGES));
    } catch {
      setImgError('სურათი ვერ დამუშავდა, სცადე სხვა.');
    } finally {
      setCompressing(false);
    }
  }

  async function handlePost() {
    if (posting || !canPost) return;
    setPosting(true);
    try {
      const data: any = {
        postType,
        content: content.trim(),
        imageUrl: pickedImages[0] ?? null,
        imageUrls: pickedImages,
        gifUrl: gifUrl.trim() || null,
        videoUrl: videoUrl.trim() || null,
        audioUrl: audioUrl || null,
        audioFx,
        visibility,
        isAnonymous,
      };
      if (postType === 'poll') {
        data.poll = {
          question: pollQuestion.trim(),
          options: pollOptions.filter(o => o.trim()),
          endsAt: null,
        };
      }
      await createPostV2(data);
      onClose();
    } finally {
      setPosting(false);
    }
  }

  /*
   * What makes a post postable.
   *
   * Every type except poll and voice used to require text, so an image with no
   * caption simply would not send — the button stayed dead and said nothing
   * about why. A picture IS the post; the caption is optional on every medium
   * that carries its own content.
   */
  const pickedImages = images.length ? images : (imageUrl.trim() ? [imageUrl.trim()] : []);
  const canPost = Boolean(
    postType === 'poll'  ? pollQuestion.trim() && pollOptions.filter(o => o.trim()).length >= 2
    : postType === 'voice' ? audioUrl
    : postType === 'image' ? pickedImages.length
    : postType === 'gif'   ? gifUrl.trim()
    : postType === 'video' ? videoUrl.trim()
    : content.trim(),
  );

  return (
    <>
      <ModalShell onClose={onClose} accent="purple" maxWidthClass="max-w-lg">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-bold text-white text-lg">{t.community.feed.post}</h3>
          <button onClick={onClose} className="font-mono text-sm text-white/40 hover:text-white/80 transition-colors px-1">✕</button>
        </div>

        {/* Type picker */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          {TYPES.map(tp => (
            <button
              key={tp.id}
              onClick={() => setPostType(tp.id)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full font-mono text-[12px] uppercase tracking-wider transition-all"
              style={{
                background: postType === tp.id
                  ? 'linear-gradient(135deg, rgba(155,0,255,0.28), rgba(0,245,255,0.16))'
                  : 'rgba(255,255,255,0.03)',
                border: `1px solid ${postType === tp.id ? 'rgba(155,0,255,0.45)' : 'rgba(255,255,255,0.08)'}`,
                color: postType === tp.id ? '#fff' : 'rgba(255,255,255,0.4)',
              }}
            >
              <span>{TYPE_ICONS[tp.id]}</span>{tp.label}
            </button>
          ))}
        </div>

        {/* Text area — hidden for pure voice posts */}
        {postType !== 'voice' && (
          <div className="flex items-start gap-2.5 mb-3">
            {isAnonymous ? (
              <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-base" style={{ background: 'rgba(155,0,255,0.2)', border: '1px solid rgba(155,0,255,0.4)' }}>🕵</div>
            ) : (
              <Avatar avatar={profile?.avatar ?? '?'} avatarUrl={profile?.avatarUrl ?? null} size={36} />
            )}
            <div className="flex-1 min-w-0">
              <TextArea value={content} onChange={setContent} placeholder={t.community.feed.composerPh} maxLength={limits.postChars} rows={3} />
            </div>
          </div>
        )}

        {/* Type-specific fields */}
        <div className="space-y-2 mb-4">
          {postType === 'image' && (
            <>
              {/* A stack, the way Threads and Instagram do it: thumbnails in
                  order, each removable, and the first one is the cover. */}
              {images.length > 0 && (
                <div className="flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                  {images.map((src, i) => (
                    <div key={i} className="relative flex-shrink-0 rounded-xl overflow-hidden"
                      style={{ width: 86, height: 86, border: '1px solid rgba(255,255,255,0.12)' }}>
                      <img src={src} alt="" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setImages(prev => prev.filter((_, k) => k !== i))}
                        className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center font-mono"
                        style={{ background: 'rgba(0,0,0,0.66)', color: '#fff', fontSize: 10 }}
                      >✕</button>
                      {i === 0 && images.length > 1 && (
                        <span className="absolute bottom-1 left-1 px-1 rounded font-mono"
                          style={{ background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 8.5 }}>ყდა</span>
                      )}
                    </div>
                  ))}
                  {images.length < MAX_IMAGES && (
                    <button
                      type="button"
                      onClick={() => multiFileRef.current?.click()}
                      disabled={compressing}
                      className="flex-shrink-0 rounded-xl flex flex-col items-center justify-center font-mono disabled:opacity-50"
                      style={{ width: 86, height: 86, border: '1px dashed rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.45)', fontSize: 20 }}
                    >
                      {compressing ? '…' : '+'}
                      <span style={{ fontSize: 9 }}>{images.length}/{MAX_IMAGES}</span>
                    </button>
                  )}
                </div>
              )}

              {images.length === 0 && (
                <ImagePicker
                  preview={null}
                  onFile={f => void handleFiles([f])}
                  onUrl={() => {}}
                  urlValue={imageUrl.startsWith('data:') ? '' : imageUrl}
                  setUrlValue={setImageUrl}
                  compressing={compressing}
                  onMeme={() => setShowMeme(true)}
                />
              )}

              <input
                ref={multiFileRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={e => {
                  const files = Array.from(e.target.files ?? []);
                  e.target.value = '';
                  if (files.length) void handleFiles(files);
                }}
              />
              {images.length === 0 && (
                <button
                  type="button"
                  onClick={() => multiFileRef.current?.click()}
                  className="w-full py-2 rounded-xl font-mono transition-all active:scale-[0.99]"
                  style={{ fontSize: 11.5, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)' }}
                >🖼 რამდენიმე სურათი ერთად</button>
              )}
              {imgError && <p className="font-mono text-[12px] text-red-400">{imgError}</p>}
            </>
          )}
          {postType === 'gif' && (
            <div className="space-y-2">
              {gifUrl ? (
                <div className="relative rounded-xl overflow-hidden border border-white/10">
                  <img src={gifUrl} alt="gif" className="w-full max-h-40 object-cover" />
                  <button
                    type="button"
                    onClick={() => setGifUrl('')}
                    className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 flex items-center justify-center font-mono text-xs text-white/70 hover:text-white transition-colors"
                  >✕</button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowGif(true)}
                  className="w-full flex items-center justify-center gap-2 px-3 py-3 rounded-xl font-mono text-sm transition-all active:scale-95"
                  style={{ background: 'rgba(0,245,255,0.08)', border: '1px solid rgba(0,245,255,0.25)', color: '#67e8f9' }}
                >
                  🎞 Search GIFs
                </button>
              )}
            </div>
          )}
          {postType === 'voice' && (
            <div className="space-y-2">
              {audioUrl ? (
                <div className="p-3 rounded-xl border border-white/10 space-y-2" style={{ background: 'rgba(155,0,255,0.06)' }}>
                  <div className="flex items-center gap-3">
                    <span className="text-xl">🎙</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-mono text-xs text-white/60">Voice message · {audioDuration}s</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setAudioUrl(''); setAudioDuration(0); }}
                      className="font-mono text-xs text-white/30 hover:text-red-400/80 transition-colors"
                    >✕</button>
                  </div>
                  <audio src={audioUrl} controls className="w-full h-8" style={{ filter: 'invert(1) hue-rotate(180deg)' }} />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowVoice(true)}
                  className="w-full flex items-center justify-center gap-2 px-3 py-3 rounded-xl font-mono text-sm transition-all active:scale-95"
                  style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5' }}
                >
                  🎙 Record Voice (max 60s)
                </button>
              )}
              <div className="flex items-start gap-2.5 mt-2">
                {isAnonymous ? (
                  <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-base" style={{ background: 'rgba(155,0,255,0.2)', border: '1px solid rgba(155,0,255,0.4)' }}>🕵</div>
                ) : (
                  <Avatar avatar={profile?.avatar ?? '?'} avatarUrl={profile?.avatarUrl ?? null} size={36} />
                )}
                <div className="flex-1 min-w-0">
                  <TextArea value={content} onChange={setContent} placeholder="Add a caption… (optional)" maxLength={500} rows={2} />
                </div>
              </div>
            </div>
          )}
          {postType === 'video' && (
            <TextInput value={videoUrl} onChange={setVideoUrl} placeholder={t.community.composer.videoUrlPh} />
          )}
          {['movie_rec', 'series_rec', 'book_rec', 'music_rec'].includes(postType) && (
            <>
              <TextInput value={recTitle} onChange={setRecTitle} placeholder={t.community.composer.recTitlePh} maxLength={200} />
              <TextInput value={recImageUrl} onChange={setRecImageUrl} placeholder={t.community.composer.recImagePh} />
            </>
          )}
          {postType === 'poll' && (
            <PollBuilder
              question={pollQuestion}
              setQuestion={setPollQuestion}
              options={pollOptions}
              setOptions={setPollOptions}
            />
          )}
        </div>

        {/* Visibility + Anonymous toggles */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {(['public', 'friends_only'] as const).map(v => (
            <button
              key={v}
              onClick={() => setVisibility(v)}
              className="px-2.5 py-1 rounded-full font-mono text-[12px] uppercase tracking-wider transition-all"
              style={{
                background: visibility === v ? 'rgba(155,0,255,0.2)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${visibility === v ? 'rgba(155,0,255,0.4)' : 'rgba(255,255,255,0.08)'}`,
                color: visibility === v ? '#fff' : 'rgba(255,255,255,0.4)',
              }}
            >
              {v === 'public' ? '🌍 Public' : '🔒 Friends'}
            </button>
          ))}
          <button
            onClick={() => setIsAnonymous(v => !v)}
            className="px-2.5 py-1 rounded-full font-mono text-[12px] uppercase tracking-wider transition-all"
            style={{
              background: isAnonymous ? 'rgba(155,0,255,0.25)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${isAnonymous ? 'rgba(155,0,255,0.5)' : 'rgba(255,255,255,0.08)'}`,
              color: isAnonymous ? '#c084fc' : 'rgba(255,255,255,0.4)',
            }}
          >
            🕵 {isAnonymous ? 'Anonymous ON' : 'Anonymous'}
          </button>
        </div>

        <button
          onClick={handlePost}
          disabled={!canPost || posting || compressing}
          className="w-full py-3 rounded-xl font-display font-semibold text-sm uppercase tracking-wider transition-all active:scale-[0.98] disabled:opacity-40"
          style={{
            background: 'linear-gradient(135deg, rgba(155,0,255,0.4), rgba(0,245,255,0.25))',
            border: '1px solid rgba(155,0,255,0.4)',
            color: '#fff',
          }}
        >
          {posting ? '…' : t.community.feed.post}
        </button>
      </ModalShell>

      {showGif && (
        <GifPicker
          onSelect={url => { setGifUrl(url); setShowGif(false); }}
          onClose={() => setShowGif(false)}
        />
      )}
      {showMeme && (
        <MemeBuilder
          onClose={() => setShowMeme(false)}
          onPost={(imageData, caption) => {
            setImages(prev => [...prev, imageData].slice(0, MAX_IMAGES));
            if (caption) setContent(prev => prev || caption);
            setShowMeme(false);
          }}
        />
      )}
      {showVoice && (
        <VoicePostRecorder
          onDone={(data, duration, fx) => { setAudioUrl(data); setAudioDuration(duration); setAudioFx(fx); setShowVoice(false); }}
          onClose={() => setShowVoice(false)}
        />
      )}
    </>
  );
}
