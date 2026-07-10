import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '@/store/langStore';
import { motion } from 'framer-motion';
import { emitWithAck } from '@/lib/socket';
import { PostCardV2 } from '@/components/community/PostCardV2';
import { Spinner } from '@/components/community/shared';
import type { CommunityPostV2, Res } from '@/types/index';

interface Props {
  postId: string;
  onClose: () => void;
  onOpenProfile: (id: string) => void;
}

export function PostDetailModal({ postId, onClose, onOpenProfile }: Props) {
  const t = useT();
  const [post, setPost] = useState<CommunityPostV2 | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    emitWithAck<any, Res<CommunityPostV2>>('community:post_get', { postId }).then(r => {
      if (cancelled) return;
      if (r.ok) setPost(r.data);
      else setError(r.error ?? 'Not found');
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [postId]);

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] flex flex-col"
      style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 340, damping: 32 }}
        className="absolute bottom-0 left-0 right-0 flex flex-col rounded-t-2xl overflow-hidden"
        style={{
          maxHeight: '90vh',
          background: 'linear-gradient(180deg, #120d24 0%, #0a0715 100%)',
          border: '1px solid rgba(155,0,255,0.18)',
          borderBottom: 'none',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.18)' }} />
        </div>

        {/* Header */}
        <div className="px-4 pb-3 flex items-center justify-between flex-shrink-0">
          <h3 className="font-display font-bold text-white text-lg">{t.commB.post}</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center transition-opacity active:opacity-60"
            style={{ background: 'rgba(255,255,255,0.08)' }}
          >
            <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>✕</span>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-6">
          {loading ? (
            <div className="py-16 flex justify-center"><Spinner color="#9b00ff" /></div>
          ) : error ? (
            <div className="py-16 flex flex-col items-center gap-2">
              <span style={{ fontSize: 32, opacity: 0.3 }}>📝</span>
              <p className="font-mono text-white/25 text-sm">{error}</p>
            </div>
          ) : post ? (
            <PostCardV2 post={post} onOpenProfile={onOpenProfile} />
          ) : null}
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}
