import { useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { socket } from '@/lib/socket';
import { useGameStore } from '@/store/gameStore';
import { useLangStore, useT } from '@/store/langStore';
import type { PlayerPublic } from '@/types/index';

interface Props {
  player: PlayerPublic | null;
  isHostOrMod: boolean;
  onClose: () => void;
  onOpenProfile: (profileId: string) => void;
  onSendGift: (profileId: string, name: string, avatar: string, avatarUrl: string | null) => void;
}

export function PlayerActionMenu({ player, isHostOrMod, onClose, onOpenProfile, onSendGift }: Props) {
  const t = useT();
  const addToast = useGameStore(s => s.addToast);
  const lang = useLangStore(s => s.lang);
  const isKa = lang === 'ka';
  const touchY = useRef(0);

  if (!player) return null;

  const handleWarn = () => {
    socket.emit('room:warn' as any, { playerId: player.id }, (res: any) => {
      if (!res?.ok) addToast(res?.error ?? 'Error', 'error');
    });
    onClose();
  };

  const handleKick = () => {
    socket.emit('room:kick' as any, { playerId: player.id }, (res: any) => {
      if (!res?.ok) addToast(res?.error ?? 'Error', 'error');
    });
    onClose();
  };

  return (
    <AnimatePresence>
      {player && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          onTouchStart={e => { touchY.current = e.touches[0].clientY; }}
          onTouchEnd={e => { if (e.changedTouches[0].clientY - touchY.current > 60) onClose(); }}
        >
          <div className="absolute inset-0 bg-black/55 backdrop-blur-[4px]" />
          <motion.div
            className="relative w-[220px]"
            style={{
              background: 'rgba(6,2,18,0.98)',
              border: '1px solid rgba(155,0,255,0.20)',
              borderRadius: '22px',
              boxShadow: '0 12px 48px rgba(0,0,0,0.7), 0 0 0 1px rgba(155,0,255,0.06)',
            }}
            initial={{ scale: 0.82, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.82, opacity: 0, y: 10 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            onClick={e => e.stopPropagation()}
          >
            {/* Player mini-header */}
            <div className="flex items-center gap-2.5 px-4 pt-3.5 pb-2.5 border-b border-white/[0.055]">
              <div
                className="w-9 h-9 rounded-full flex-shrink-0 overflow-hidden flex items-center justify-center text-base"
                style={{ background: 'linear-gradient(135deg, rgba(155,0,255,0.35), rgba(0,229,255,0.20))' }}
              >
                {player.avatarUrl
                  ? <img src={player.avatarUrl} alt="" className="w-full h-full object-cover" />
                  : <span>{player.avatar}</span>}
              </div>
              <div className="min-w-0">
                <p className="font-display font-bold text-white/90 text-[13px] truncate">{player.name}</p>
                {player.isHost && (
                  <p className="font-mono text-[11px]" style={{ color: 'rgba(255,180,0,0.60)' }}>
                    {t.uiMisc.host}
                  </p>
                )}
              </div>
            </div>

            <div className="p-2.5 space-y-1.5">
              {/* Statistics — larger, visually primary */}
              <button
                onClick={() => { if (player.profileId) onOpenProfile(player.profileId); onClose(); }}
                className="w-full py-3 rounded-[16px] font-mono font-bold text-[15px] transition-all hover:scale-[1.02] active:scale-[0.97]"
                style={{
                  background: 'linear-gradient(135deg, rgba(155,0,255,0.14) 0%, rgba(0,229,255,0.07) 100%)',
                  border: '1px solid rgba(155,0,255,0.30)',
                  color: 'rgba(210,155,255,0.95)',
                  boxShadow: '0 0 20px rgba(155,0,255,0.08), inset 0 1px 0 rgba(255,255,255,0.05)',
                  letterSpacing: '0.01em',
                }}
              >
                📊 {t.uiMisc.statistics}
              </button>

              {/* Send Gift */}
              <button
                onClick={() => {
                  if (player.profileId) onSendGift(player.profileId, player.name, player.avatar, player.avatarUrl);
                  onClose();
                }}
                className="w-full py-2.5 rounded-[14px] font-mono font-bold text-sm transition-all hover:scale-[1.02] active:scale-[0.97]"
                style={{
                  background: 'rgba(255,180,0,0.07)',
                  border: '1px solid rgba(255,180,0,0.20)',
                  color: 'rgba(255,200,60,0.88)',
                  boxShadow: 'inset 0 1px 0 rgba(255,180,0,0.07)',
                }}
              >
                🎁 {t.uiMisc.sendGift}
              </button>

              {/* Host / mod-only actions */}
              {isHostOrMod && (
                <div className="pt-1 border-t border-white/[0.055] space-y-1.5 mt-1">
                  <button
                    onClick={handleWarn}
                    className="w-full py-2.5 rounded-[14px] font-mono font-bold text-sm transition-all hover:scale-[1.02] active:scale-[0.97]"
                    style={{
                      background: 'rgba(255,152,0,0.07)',
                      border: '1px solid rgba(255,152,0,0.24)',
                      color: 'rgba(255,175,50,0.88)',
                    }}
                  >
                    ⚠️ {t.uiMisc.warning}
                  </button>
                  <button
                    onClick={handleKick}
                    className="w-full py-2.5 rounded-[14px] font-mono font-bold text-sm transition-all hover:scale-[1.02] active:scale-[0.97]"
                    style={{
                      background: 'rgba(255,30,60,0.07)',
                      border: '1px solid rgba(255,30,60,0.22)',
                      color: 'rgba(255,80,80,0.88)',
                    }}
                  >
                    🚪 {t.uiMisc.kick}
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
