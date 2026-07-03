import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useT } from '@/store/langStore';
import { useCommunityStore } from '@/store/communityStore';
import { Avatar, BadgeRow, Spinner } from '@/components/community/shared';

type ResultTab = 'all' | 'posts' | 'people' | 'hashtags' | 'clans';

interface Props {
  onClose: () => void;
  onOpenProfile: (id: string) => void;
}

export function CommunitySearchPanel({ onClose, onOpenProfile }: Props) {
  const t = useT();
  const { searchResults, searchLoading, search, setActiveHashtag } = useCommunityStore();
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<ResultTab>('all');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    const timer = setTimeout(() => { if (query.trim().length >= 2) search(query); }, 350);
    return () => clearTimeout(timer);
  }, [query, search]);

  const postCount = searchResults?.posts.length ?? 0;
  const peopleCount = searchResults?.people.length ?? 0;
  const hashtagCount = searchResults?.hashtags.length ?? 0;
  const clanCount = searchResults?.clans?.length ?? 0;
  const totalCount = postCount + peopleCount + hashtagCount + clanCount;

  const tabs: { id: ResultTab; label: string; icon: string; count: number }[] = [
    { id: 'all', label: 'ყველა', icon: '🔍', count: totalCount },
    { id: 'people', label: t.community.search.people, icon: '👥', count: peopleCount },
    { id: 'posts', label: t.community.search.posts, icon: '📝', count: postCount },
    { id: 'hashtags', label: t.community.search.hashtags, icon: '#', count: hashtagCount },
    { id: 'clans', label: 'კლანები', icon: '⚔️', count: clanCount },
  ];

  const showPosts = activeTab === 'all' || activeTab === 'posts';
  const showPeople = activeTab === 'all' || activeTab === 'people';
  const showHashtags = activeTab === 'all' || activeTab === 'hashtags';
  const showClans = activeTab === 'all' || activeTab === 'clans';

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] flex flex-col"
      style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 340, damping: 32 }}
        className="absolute bottom-0 left-0 right-0 flex flex-col rounded-t-2xl overflow-hidden"
        style={{
          maxHeight: '92vh',
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

        {/* Search bar */}
        <div className="flex items-center gap-3 px-4 pt-2 pb-3 flex-shrink-0">
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
              placeholder="მოძებნე ყველაფერი..."
              className="flex-1 bg-transparent font-mono text-sm text-white outline-none placeholder:text-white/30"
            />
            {query && (
              <button onClick={() => setQuery('')} className="text-white/40 active:text-white/70 transition-colors font-mono text-xs">✕</button>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center transition-opacity active:opacity-60"
            style={{ background: 'rgba(255,255,255,0.08)' }}
          >
            <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>✕</span>
          </button>
        </div>

        {/* Result tabs */}
        {totalCount > 0 && (
          <div className="flex px-2 pb-2 gap-1 flex-shrink-0 overflow-x-auto" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            {tabs.map(tb => {
              const active = activeTab === tb.id;
              return (
                <button
                  key={tb.id}
                  onClick={() => setActiveTab(tb.id)}
                  className="flex items-center gap-1 px-3 py-2 rounded-lg font-mono transition-all active:scale-95 flex-shrink-0"
                  style={{
                    fontSize: 11,
                    background: active ? 'rgba(155,0,255,0.2)' : 'transparent',
                    color: active ? '#c084fc' : 'rgba(255,255,255,0.4)',
                    border: active ? '1px solid rgba(155,0,255,0.3)' : '1px solid transparent',
                  }}
                >
                  <span style={{ fontSize: 13 }}>{tb.icon}</span>
                  <span>{tb.label}</span>
                  {tb.count > 0 && (
                    <span className="text-white/20" style={{ fontSize: 10 }}>{tb.count}</span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Results */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-8">
          {searchLoading ? (
            <div className="py-16 flex justify-center"><Spinner color="#9b00ff" /></div>
          ) : !searchResults || totalCount === 0 ? (
            query.trim().length >= 2 ? (
              <div className="py-16 flex flex-col items-center gap-2">
                <span style={{ fontSize: 32, opacity: 0.3 }}>🔍</span>
                <p className="font-mono text-sm text-white/25 text-center">{t.community.search.noResults}</p>
              </div>
            ) : (
              <div className="py-16 flex flex-col items-center gap-3">
                <span style={{ fontSize: 40, opacity: 0.2 }}>🔍</span>
                <p className="font-mono text-sm text-white/30 text-center">მოძებნე მოთამაშეები, პოსტები,<br/>ჰეშთეგები, კლანები</p>
              </div>
            )
          ) : (
            <div className="space-y-3 pt-2">
              {/* People */}
              {showPeople && peopleCount > 0 && (
                <div>
                  {activeTab === 'all' && (
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-mono text-[11px] text-white/30 uppercase tracking-wider">👥 მოთამაშეები</p>
                      {peopleCount > 3 && (
                        <button onClick={() => setActiveTab('people')} className="font-mono text-[10px] transition-all active:scale-95" style={{ color: '#9b00ff' }}>ყველა →</button>
                      )}
                    </div>
                  )}
                  <div className="space-y-1.5">
                    {(activeTab === 'all' ? searchResults.people.slice(0, 3) : searchResults.people).map(person => (
                      <button
                        key={person.id}
                        onClick={() => { onOpenProfile(person.id); onClose(); }}
                        className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all active:scale-[0.98] active:bg-white/5"
                        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                      >
                        <Avatar avatar={person.avatar} avatarUrl={person.avatarUrl} size={40} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-sm text-white/85 truncate">{person.username}</span>
                            {person.badges?.length > 0 && <BadgeRow badges={person.badges} max={2} />}
                          </div>
                          <p className="font-mono text-[11px] text-white/30">{person.followersCount} {t.community.profile.followers}</p>
                        </div>
                        <span className="text-white/15 text-sm">›</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Posts */}
              {showPosts && postCount > 0 && (
                <div>
                  {activeTab === 'all' && (
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-mono text-[11px] text-white/30 uppercase tracking-wider">📝 პოსტები</p>
                      {postCount > 3 && (
                        <button onClick={() => setActiveTab('posts')} className="font-mono text-[10px] transition-all active:scale-95" style={{ color: '#9b00ff' }}>ყველა →</button>
                      )}
                    </div>
                  )}
                  <div className="space-y-1.5">
                    {(activeTab === 'all' ? searchResults.posts.slice(0, 3) : searchResults.posts).map(post => (
                      <div
                        key={post.id}
                        className="rounded-xl px-3 py-2.5 space-y-1"
                        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                      >
                        <div className="flex items-center gap-2">
                          <Avatar avatar={post.authorAvatar} avatarUrl={post.authorAvatarUrl} size={24} />
                          <span className="font-mono text-[12px] text-white/50">{post.authorName}</span>
                        </div>
                        <p className="font-mono text-xs text-white/70 line-clamp-2">{post.content}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Hashtags */}
              {showHashtags && hashtagCount > 0 && (
                <div>
                  {activeTab === 'all' && (
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-mono text-[11px] text-white/30 uppercase tracking-wider"># ჰეშთეგები</p>
                      {hashtagCount > 4 && (
                        <button onClick={() => setActiveTab('hashtags')} className="font-mono text-[10px] transition-all active:scale-95" style={{ color: '#9b00ff' }}>ყველა →</button>
                      )}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-1.5">
                    {(activeTab === 'all' ? searchResults.hashtags.slice(0, 6) : searchResults.hashtags).map(h => (
                      <button
                        key={h.hashtag}
                        onClick={() => { setActiveHashtag(h.hashtag); onClose(); }}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl font-mono transition-all active:scale-95"
                        style={{ background: 'rgba(0,245,255,0.06)', border: '1px solid rgba(0,245,255,0.15)' }}
                      >
                        <span className="text-[13px]" style={{ color: '#00f5ff' }}>#{h.hashtag}</span>
                        <span className="text-[10px] text-white/25">{h.count}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Clans */}
              {showClans && clanCount > 0 && (
                <div>
                  {activeTab === 'all' && (
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-mono text-[11px] text-white/30 uppercase tracking-wider">⚔️ კლანები</p>
                      {clanCount > 3 && (
                        <button onClick={() => setActiveTab('clans')} className="font-mono text-[10px] transition-all active:scale-95" style={{ color: '#9b00ff' }}>ყველა →</button>
                      )}
                    </div>
                  )}
                  <div className="space-y-1.5">
                    {(activeTab === 'all' ? searchResults.clans.slice(0, 3) : searchResults.clans).map(clan => (
                      <div
                        key={clan.id}
                        className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all"
                        style={{ background: 'rgba(255,200,0,0.04)', border: '1px solid rgba(255,200,0,0.1)' }}
                      >
                        <div
                          className="w-10 h-10 rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0"
                          style={{ background: 'rgba(255,200,0,0.1)', border: '1px solid rgba(255,200,0,0.2)' }}
                        >
                          {clan.imageUrl
                            ? <img src={clan.imageUrl} alt="" className="w-full h-full object-cover" />
                            : <span style={{ fontSize: 18 }}>⚔️</span>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-sm text-white/85 truncate">{clan.name}</span>
                            <span
                              className="px-1.5 py-0.5 rounded text-[9px] font-bold"
                              style={{ background: 'rgba(255,200,0,0.15)', color: 'rgba(255,200,0,0.8)' }}
                            >
                              [{clan.tag}]
                            </span>
                          </div>
                          <div className="flex items-center gap-3 mt-0.5">
                            <span className="font-mono text-[10px] text-white/30">👥 {clan.memberCount}</span>
                            <span className="font-mono text-[10px] text-green-400/50">{clan.wins}W</span>
                            <span className="font-mono text-[10px] text-red-400/50">{clan.losses}L</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}
