import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useT } from '@/store/langStore';
import { useAuthStore } from '@/store/authStore';
import { useCommunityStore } from '@/store/communityStore';
import type { CommunityLounge } from '@/types/index';
import {
  Accent, ACCENT_COLORS, Spinner, EmptyState, SectionHeader, PillButton,
  ModalShell, TextInput, TextArea,
} from '@/components/community/shared';
import { LoungeRoom } from '@/components/community/LoungeRoom';

function accentFor(lounge: CommunityLounge): Accent {
  return lounge.kind === 'void_radio' ? 'cyan' : 'purple';
}

function LoungeCard({ lounge, onEnter, onDelete }: { lounge: CommunityLounge; onEnter: () => void; onDelete?: () => void }) {
  const t = useT();
  const accent = accentFor(lounge);
  const c = ACCENT_COLORS[accent];
  const isSpecial = lounge.kind !== 'lounge';

  const title = lounge.kind === 'max_lounge' ? t.community.lounges.maxLounge
    : lounge.kind === 'void_radio' ? t.community.lounges.voidRadio
    : lounge.name;
  const desc = lounge.kind === 'max_lounge' ? t.community.lounges.maxLoungeDesc
    : lounge.kind === 'void_radio' ? t.community.lounges.voidRadioDesc
    : lounge.description;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border px-4 py-3.5 space-y-2.5"
      style={{ borderColor: c.border, background: c.bg, boxShadow: isSpecial ? c.shadow : undefined }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-display font-bold text-white text-sm truncate">{title}</p>
          {desc && <p className="font-mono text-[12px] text-white/40 mt-0.5 line-clamp-2">{desc}</p>}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span
            className="font-mono text-[12px] uppercase tracking-wider px-2 py-0.5 rounded-full border"
            style={lounge.isLive
              ? { color: '#00ff88', borderColor: 'rgba(0,255,136,0.3)', background: 'rgba(0,255,136,0.08)' }
              : { color: 'rgba(255,255,255,0.35)', borderColor: 'rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.03)' }}
          >
            {lounge.isLive ? t.community.lounges.live : t.community.lounges.offline}
          </span>
          {onDelete && (
            <button
              onClick={e => { e.stopPropagation(); if (window.confirm('Delete this lounge?')) onDelete(); }}
              className="font-mono text-[11px] text-red-400/50 hover:text-red-400/80 transition-colors leading-none"
              title="Delete lounge"
            >
              🗑
            </button>
          )}
        </div>
      </div>

      {lounge.isLive && lounge.lastTopic && (
        <p className="font-mono text-[12px] text-white/50 italic truncate">"{lounge.lastTopic}"</p>
      )}

      <div className="flex items-center justify-between">
        <p className="font-mono text-[12px] text-white/35">
          {lounge.speakerCount} {t.community.lounges.speakers} · {lounge.listenerCount} {t.community.lounges.listeners}
        </p>
        <PillButton onClick={onEnter} accent={accent}>
          {t.community.lounges.enterLounge}
        </PillButton>
      </div>
    </motion.div>
  );
}

function CreateLoungeModal({ onClose, onCreated }: { onClose: () => void; onCreated: (lounge: CommunityLounge) => void }) {
  const t = useT();
  const createLounge = useCommunityStore(s => s.createLounge);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit() {
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const lounge = await createLounge(name.trim(), description.trim());
      onCreated(lounge);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to create lounge.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell onClose={onClose} accent="purple">
      <h3 className="font-display font-bold text-white text-xl mb-4">{t.community.lounges.createLoungeTitle}</h3>
      {error && <p className="mb-3 text-xs text-red-400/80 font-mono">{error}</p>}
      <div className="space-y-3">
        <div>
          <label className="font-mono text-[12px] uppercase tracking-wider text-white/40 block mb-1">
            {t.community.lounges.loungeName}
          </label>
          <TextInput value={name} onChange={setName} placeholder={t.community.lounges.loungeNamePh} maxLength={40} accent="purple" />
        </div>
        <div>
          <label className="font-mono text-[12px] uppercase tracking-wider text-white/40 block mb-1">
            {t.community.lounges.loungeDesc}
          </label>
          <TextArea value={description} onChange={setDescription} placeholder={t.community.lounges.loungeDescPh} maxLength={200} rows={3} accent="purple" />
        </div>
        <button
          onClick={handleSubmit}
          disabled={!name.trim() || submitting}
          className="w-full py-3 rounded-xl font-display font-semibold text-sm uppercase tracking-wider transition-all active:scale-[0.98] disabled:opacity-40"
          style={{ background: 'linear-gradient(135deg, rgba(155,0,255,0.4), rgba(0,245,255,0.25))', border: '1px solid rgba(155,0,255,0.4)', color: '#fff' }}
        >
          {submitting ? '…' : t.community.lounges.createLounge}
        </button>
      </div>
    </ModalShell>
  );
}

export function LoungesTab({ onOpenProfile }: { onOpenProfile: (playerId: string) => void }) {
  const t = useT();
  const profile = useAuthStore(s => s.profile);
  const { lounges, fetchLounges, deleteLounge } = useCommunityStore();
  const [loading, setLoading] = useState(lounges.length === 0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [activeLoungeId, setActiveLoungeId] = useState<string | null>(null);

  const cachedLenRef = useRef(lounges.length);
  cachedLenRef.current = lounges.length;

  const doLoad = useCallback(async () => {
    const hasCache = cachedLenRef.current > 0;
    if (!hasCache) setLoading(true);
    setLoadError(null);
    try {
      await fetchLounges();
    } catch (e: any) {
      if (!hasCache) setLoadError(e.message ?? 'Failed to load.');
    } finally {
      setLoading(false);
    }
  }, [fetchLounges]);

  useEffect(() => { doLoad(); }, [doLoad]);

  useEffect(() => {
    const onAuthReady = () => {
      if (loadError || cachedLenRef.current === 0) doLoad();
    };
    window.addEventListener('vm:auth-ready', onAuthReady);
    return () => window.removeEventListener('vm:auth-ready', onAuthReady);
  }, [loadError, doLoad]);

  const activeLounge = activeLoungeId ? lounges.find(l => l.id === activeLoungeId) ?? null : null;

  if (activeLounge) {
    return (
      <LoungeRoom
        lounge={activeLounge}
        onLeave={() => setActiveLoungeId(null)}
        onOpenProfile={onOpenProfile}
      />
    );
  }

  const isMod = !!profile?.moderatorLevel;
  const specialLounges = lounges.filter(l => l.kind !== 'lounge');
  const playerLounges = lounges.filter(l => l.kind === 'lounge');

  return (
    <div className="space-y-5">
      {loading ? (
        <Spinner color="#9b00ff" />
      ) : loadError ? (
        <div className="flex flex-col items-center gap-3 py-10">
          <span className="text-2xl">📡</span>
          <p className="font-mono text-[12px] text-white/40 text-center">{loadError}</p>
          <button
            onClick={doLoad}
            className="px-4 py-2 rounded-xl font-mono text-xs uppercase tracking-wider transition-all active:scale-95"
            style={{ background: 'rgba(155,0,255,0.12)', border: '1px solid rgba(155,0,255,0.35)', color: '#c084fc' }}
          >
            ხელახლა
          </button>
        </div>
      ) : (
        <>
          {specialLounges.length > 0 && (
            <div className="space-y-2.5">
              {specialLounges.map(lounge => (
                <LoungeCard key={lounge.id} lounge={lounge} onEnter={() => setActiveLoungeId(lounge.id)} />
              ))}
            </div>
          )}

          <SectionHeader
            label={t.community.lounges.title}
            action={
              profile ? (
                <PillButton onClick={() => setShowCreate(true)} accent="purple">
                  <span className="text-base leading-none">+</span> {t.community.lounges.createLounge}
                </PillButton>
              ) : undefined
            }
          />

          {playerLounges.length === 0 ? (
            <EmptyState text={t.community.lounges.noLounges} />
          ) : (
            <div className="space-y-2.5">
              {playerLounges.map(lounge => (
                <LoungeCard
                  key={lounge.id}
                  lounge={lounge}
                  onEnter={() => setActiveLoungeId(lounge.id)}
                  onDelete={(isMod || lounge.ownerId === profile?.id) ? async () => {
                    await deleteLounge(lounge.id);
                  } : undefined}
                />
              ))}
            </div>
          )}
        </>
      )}

      <AnimatePresence>
        {showCreate && (
          <CreateLoungeModal
            onClose={() => setShowCreate(false)}
            onCreated={(lounge) => {
              setShowCreate(false);
              setActiveLoungeId(lounge.id);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
