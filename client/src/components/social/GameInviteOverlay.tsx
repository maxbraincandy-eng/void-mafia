import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { socket } from '@/lib/socket';
import { useAuthStore } from '@/store/authStore';
import { useCheckersStore } from '@/store/checkersStore';
import { useLudoStore } from '@/store/ludoStore';
import { useUnoStore } from '@/store/unoStore';
import { useJokerStore } from '@/store/jokerStore';
import { useWWWStore } from '@/store/wwwStore';
import { useLiesStore } from '@/store/liesStore';
import { useSpyfallStore } from '@/store/spyfallStore';
import { useCodenamesStore } from '@/store/codenamesStore';
import { useAliasStore } from '@/store/aliasStore';
import { useDrawStore } from '@/store/drawStore';
import { tNow } from '@/store/langStore';

interface GameInvite { game: string; code: string; fromName: string; fromAvatar: string }

const GAME_LABEL: Record<string, string> = {
  checkers: 'შაშკი', ludo: 'ლუდო', uno: 'UNO', joker: 'ჯოკერი', www: 'ვინ იქნება მილიონერი',
  lies: 'ტყუილების ოსტატი', spyfall: 'ჯაშუში', codenames: 'Codenames', alias: 'ალიასი', draw: 'დახაზე & გამოიცანი',
};
const GAME_EMOJI: Record<string, string> = {
  checkers: '⚪', ludo: '🎲', uno: '🎴', joker: '🃏', www: '❓',
  lies: '🎭', spyfall: '🕵️', codenames: '🔤', alias: '🗣', draw: '🎨',
};

/**
 * App-wide strict overlay for incoming game invites (Checkers/Ludo/UNO/…).
 * Accept → joins that game's match; Reject → ignore. Auto-dismisses after 15s.
 */
export function GameInviteOverlay() {
  const [invite, setInvite] = useState<GameInvite | null>(null);

  useEffect(() => {
    const onInvite = (data: GameInvite) => setInvite(data);
    (socket as any).on('game:invite_received', onInvite);
    return () => { (socket as any).off('game:invite_received', onInvite); };
  }, []);

  useEffect(() => {
    if (!invite) return;
    const t = setTimeout(() => setInvite(null), 15000);
    return () => clearTimeout(t);
  }, [invite]);

  if (!invite) return null;

  const accept = () => {
    const name = useAuthStore.getState().profile?.username ?? 'Player';
    const { game, code } = invite;
    setInvite(null);
    const join =
      game === 'checkers' ? useCheckersStore.getState().joinMatch :
      game === 'ludo' ? useLudoStore.getState().joinMatch :
      game === 'uno' ? useUnoStore.getState().joinMatch :
      game === 'joker' ? useJokerStore.getState().joinMatch :
      game === 'www' ? useWWWStore.getState().joinMatch :
      game === 'lies' ? useLiesStore.getState().joinMatch :
      game === 'spyfall' ? useSpyfallStore.getState().joinMatch :
      game === 'codenames' ? useCodenamesStore.getState().joinMatch :
      game === 'alias' ? useAliasStore.getState().joinMatch :
      game === 'draw' ? useDrawStore.getState().joinMatch : null;
    join?.(code, name)?.catch?.(() => {});
  };

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 2900, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 360, damping: 26 }}
        style={{ width: 'min(340px, 100%)', background: 'rgba(10,4,26,0.99)', border: '1px solid rgba(0,229,255,0.4)', borderRadius: 22, padding: '24px 20px', textAlign: 'center', boxShadow: '0 24px 70px rgba(0,0,0,0.7), 0 0 40px rgba(0,229,255,0.12)', overflow: 'hidden', position: 'relative' }}
      >
        <motion.div initial={{ width: '100%' }} animate={{ width: '0%' }} transition={{ duration: 15, ease: 'linear' }}
          style={{ position: 'absolute', top: 0, left: 0, height: 3, background: 'linear-gradient(90deg,#00e5ff,#9b00ff)' }} />
        <div style={{ fontSize: 40, marginBottom: 6 }}>{GAME_EMOJI[invite.game] ?? '🎮'}</div>
        <p style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>🎮 Game Invite</p>
        <p style={{ fontFamily: '"Space Grotesk",sans-serif', fontWeight: 700, fontSize: 16, color: 'white', lineHeight: 1.3 }}><b>{invite.fromName}</b> {tNow().misc.invitesYou}</p>
        <p style={{ fontFamily: 'monospace', fontSize: 13, color: '#00e5ff', marginBottom: 20 }}>{GAME_LABEL[invite.game] ?? invite.game}</p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => setInvite(null)}
            style={{ flex: 1, padding: '13px', borderRadius: 14, fontFamily: 'monospace', fontSize: 14, background: 'rgba(255,45,85,0.12)', border: '1px solid rgba(255,45,85,0.4)', color: '#ff2d55', cursor: 'pointer' }}>✕ Reject</button>
          <button onClick={accept}
            style={{ flex: 1, padding: '13px', borderRadius: 14, fontFamily: 'monospace', fontSize: 14, fontWeight: 700, background: 'rgba(0,255,136,0.16)', border: '1px solid rgba(0,255,136,0.45)', color: '#00ff88', cursor: 'pointer' }}>✓ Accept</button>
        </div>
      </motion.div>
    </div>,
    document.body
  );
}
