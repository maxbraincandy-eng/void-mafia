import { useState, useRef } from 'react';
import { useT } from '@/store/langStore';
import { useAuthStore } from '@/store/authStore';
import { useCommunityStore } from '@/store/communityStore';
import type { PostType } from '@/types/index';
import { ModalShell, Avatar, TextArea, TextInput, PillButton } from '@/components/community/shared';
import { compressImage } from '@/lib/imageUtils';

const TYPE_ICONS: Record<PostType, string> = {
  text: '📝', image: '🖼', gif: '🎞', video: '🎬', poll: '📊',
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
  preview, onFile, onUrl, urlValue, setUrlValue, compressing,
}: {
  preview: string | null;
  onFile: (file: File) => void;
  onUrl: () => void;
  urlValue: string;
  setUrlValue: (v: string) => void;
  compressing: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-2">
      {/* Upload button + preview */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={compressing}
          className="flex items-center gap-2 px-3 py-2 rounded-xl font-mono text-xs transition-all active:scale-95 disabled:opacity-40"
          style={{ background: 'rgba(155,0,255,0.12)', border: '1px solid rgba(155,0,255,0.3)', color: '#c084fc' }}
        >
          {compressing ? '⏳ Compressing…' : '📷 Upload photo'}
        </button>
        <span className="font-mono text-[10px] text-white/25">or paste URL below</span>
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
        <div className="relative rounded-xl overflow-hidden border border-white/10">
          <img src={preview} alt="preview" className="w-full max-h-48 object-cover" />
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

export function PostComposerV2({ onClose }: { onClose: () => void }) {
  const t = useT();
  const profile = useAuthStore(s => s.profile);
  const createPostV2 = useCommunityStore(s => s.createPostV2);

  const [postType, setPostType] = useState<PostType>('text');
  const [content, setContent] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [gifUrl, setGifUrl] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [recTitle, setRecTitle] = useState('');
  const [recImageUrl, setRecImageUrl] = useState('');
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [visibility, setVisibility] = useState<'public' | 'friends_only'>('public');
  const [posting, setPosting] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [imgError, setImgError] = useState('');

  const TYPES: { id: PostType; label: string }[] = [
    { id: 'text',        label: t.community.composer.text },
    { id: 'image',       label: t.community.composer.image },
    { id: 'gif',         label: t.community.composer.gif },
    { id: 'video',       label: t.community.composer.video },
    { id: 'poll',        label: t.community.composer.poll },
    { id: 'movie_rec',   label: t.community.composer.movieRec },
    { id: 'series_rec',  label: t.community.composer.seriesRec },
    { id: 'book_rec',    label: t.community.composer.bookRec },
    { id: 'music_rec',   label: t.community.composer.musicRec },
    { id: 'philosophy',  label: t.community.composer.philosophyThought },
  ];

  const recCategoryMap: Partial<Record<PostType, string>> = {
    movie_rec: 'movie', series_rec: 'series', book_rec: 'book', music_rec: 'music',
  };

  async function handleFileSelect(file: File) {
    setImgError('');
    if (!file.type.startsWith('image/')) { setImgError('Please select an image file.'); return; }
    if (file.size > 20 * 1024 * 1024) { setImgError('Image must be under 20MB.'); return; }
    setCompressing(true);
    try {
      const compressed = await compressImage(file);
      setImageUrl(compressed);
    } catch {
      setImgError('Could not compress image, try another file.');
    } finally {
      setCompressing(false);
    }
  }

  async function handlePost() {
    if ((!content.trim() && postType !== 'poll') || posting) return;
    if (postType === 'poll' && (!pollQuestion.trim() || pollOptions.filter(o => o.trim()).length < 2)) return;
    setPosting(true);
    try {
      const isRec = ['movie_rec', 'series_rec', 'book_rec', 'music_rec'].includes(postType);
      const data: any = {
        postType,
        content: content.trim(),
        imageUrl: isRec ? (recImageUrl.trim() || null) : (imageUrl.trim() || null),
        gifUrl: gifUrl.trim() || null,
        videoUrl: videoUrl.trim() || null,
        recTitle: recTitle.trim() || null,
        recCategory: recCategoryMap[postType] ?? null,
        visibility,
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

  const canPost = postType === 'poll'
    ? pollQuestion.trim() && pollOptions.filter(o => o.trim()).length >= 2
    : content.trim();

  const imagePreview = imageUrl.startsWith('data:') ? imageUrl : null;

  return (
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
            className="flex items-center gap-1 px-2.5 py-1 rounded-full font-mono text-[10px] uppercase tracking-wider transition-all"
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

      {/* Text area */}
      <div className="flex items-start gap-2.5 mb-3">
        <Avatar avatar={profile?.avatar ?? '?'} avatarUrl={profile?.avatarUrl ?? null} size={36} />
        <div className="flex-1 min-w-0">
          <TextArea value={content} onChange={setContent} placeholder={t.community.feed.composerPh} maxLength={2000} rows={3} />
        </div>
      </div>

      {/* Type-specific fields */}
      <div className="space-y-2 mb-4">
        {postType === 'image' && (
          <>
            <ImagePicker
              preview={imagePreview}
              onFile={handleFileSelect}
              onUrl={() => {}}
              urlValue={imageUrl.startsWith('data:') ? '' : imageUrl}
              setUrlValue={setImageUrl}
              compressing={compressing}
            />
            {imgError && <p className="font-mono text-[10px] text-red-400">{imgError}</p>}
          </>
        )}
        {postType === 'gif' && (
          <TextInput value={gifUrl} onChange={setGifUrl} placeholder={t.community.composer.gifUrlPh} />
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

      {/* Visibility toggle */}
      <div className="flex items-center gap-2 mb-4">
        {(['public', 'friends_only'] as const).map(v => (
          <button
            key={v}
            onClick={() => setVisibility(v)}
            className="px-2.5 py-1 rounded-full font-mono text-[10px] uppercase tracking-wider transition-all"
            style={{
              background: visibility === v ? 'rgba(155,0,255,0.2)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${visibility === v ? 'rgba(155,0,255,0.4)' : 'rgba(255,255,255,0.08)'}`,
              color: visibility === v ? '#fff' : 'rgba(255,255,255,0.4)',
            }}
          >
            {v === 'public' ? '🌍 Public' : '🔒 Friends'}
          </button>
        ))}
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
  );
}
