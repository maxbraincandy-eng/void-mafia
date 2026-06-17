import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useT } from '@/store/langStore';
import { useCommunityStore } from '@/store/communityStore';
import { Avatar, BadgeRow, Spinner } from '@/components/community/shared';

type ResultTab = 'posts' | 'people' | 'hashtags';

interface Props {
  onClose: () => void;
  onOpenProfile: (id: string) => void;
}

export function CommunitySearchPanel({ onClose, onOpenProfile }: Props) {
  const t = useT();
  const { searchResults, searchLoading, search, setActiveHashtag } = useCommunityStore();
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<ResultTab>('posts');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    const timer = setTimeout(() => { if (query.trim().length >= 2) search(query); }, 350);
    return () => clearTimeout(timer);
  }, [query, search]);

  const hasResults = searchResults && (
    searchResults.posts.length > 0 || searchResults.people.length > 0 || searchResults.hashtags.length > 0
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex flex-col"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -20, opacity: 0 }}
        className="max-w-lg w-full mx-auto pt-safe"
        onClick={e => e.stopPropagation()}
      >
        {/* Search bar */}
        <div className="flex items-center gap-3 px-4 pt-8 pb-3">
          <div
            className="flex-1 flex items-center gap-2 rounded-2xl px-4 py-3"
            style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(155,0,255,0.3)' }}
          >
            <span className="text-white/40">🔍</span>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={t.community.search.placeholder}
              className="flex-1 bg-transparent font-mono text-sm text-white outline-none placeholder:text-white/30"
            />
            {query && (
              <button onClick={() => setQuery('')} className="text-white/40 hover:text-white/70 transition-colors font-mono text-xs">✕</button>
            )}
          </div>
          <button onClick={onClose} className="font-mono text-sm text-white/50 hover:text-white/80 transition-colors">✕</button>
        </div>

        {/* Result tabs */}
        {hasResults && (
          <div className="flex gap-2 px-4 pb-2">
            {(['posts', 'people', 'hashtags'] as ResultTab[]).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className="px-3 py-1 rounded-full font-mono text-[10px] uppercase tracking-wider transition-all"
                style={{
                  background: activeTab === tab ? 'rgba(155,0,255,0.2)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${activeTab === tab ? 'rgba(155,0,255,0.4)' : 'rgba(255,255,255,0.08)'}`,
                  color: activeTab === tab ? '#fff' : 'rgba(255,255,255,0.4)',
                }}
              >
                {t.community.search[tab]}
              </button>
            ))}
          </div>
        )}

        {/* Results */}
        <div className="px-4 max-h-[65vh] overflow-y-auto space-y-2 pb-8">
          {searchLoading ? (
            <Spinner color="#9b00ff" />
          ) : !searchResults || !hasResults ? (
            query.trim().length >= 2 ? (
              <p className="font-mono text-sm text-white/25 text-center py-8">{t.community.search.noResults}</p>
            ) : null
          ) : (
            <>
              {activeTab === 'posts' && searchResults.posts.map(post => (
                <div
                  key={post.id}
                  className="rounded-xl border border-white/10 px-3 py-2.5 space-y-1"
                  style={{ background: 'rgba(255,255,255,0.02)' }}
                >
                  <div className="flex items-center gap-2">
                    <Avatar avatar={post.authorAvatar} avatarUrl={post.authorAvatarUrl} size={24} />
                    <span className="font-mono text-[10px] text-white/50">{post.authorName}</span>
                  </div>
                  <p className="font-mono text-xs text-white/70 line-clamp-2">{post.content}</p>
                </div>
              ))}

              {activeTab === 'people' && searchResults.people.map(person => (
                <button
                  key={person.id}
                  onClick={() => { onOpenProfile(person.id); onClose(); }}
                  className="w-full flex items-center gap-3 rounded-xl border border-white/10 px-3 py-2.5 text-left transition-all hover:bg-white/5 active:scale-[0.98]"
                  style={{ background: 'rgba(255,255,255,0.02)' }}
                >
                  <Avatar avatar={person.avatar} avatarUrl={person.avatarUrl} size={36} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-sm text-white/80 truncate">{person.username}</span>
                      {person.badges?.length > 0 && <BadgeRow badges={person.badges} max={2} />}
                    </div>
                    <p className="font-mono text-[10px] text-white/35">{person.followersCount} {t.community.profile.followers}</p>
                  </div>
                </button>
              ))}

              {activeTab === 'hashtags' && searchResults.hashtags.map(h => (
                <button
                  key={h.hashtag}
                  onClick={() => { setActiveHashtag(h.hashtag); onClose(); }}
                  className="w-full flex items-center justify-between rounded-xl border border-white/10 px-3 py-2.5 text-left transition-all hover:bg-white/5"
                  style={{ background: 'rgba(0,245,255,0.03)' }}
                >
                  <span className="font-mono text-sm" style={{ color: '#00f5ff' }}>#{h.hashtag}</span>
                  <span className="font-mono text-[10px] text-white/35">{h.count} posts</span>
                </button>
              ))}
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
