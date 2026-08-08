/**
 * Spectator invisibility control.
 *
 * Shown only to spectators. If the viewer owns the Invisibility perk it lets
 * them vanish from / reappear in everyone else's spectator list for THIS
 * session (a live toggle, independent of the saved "always" default set in the
 * shop). If they don't own it, it's a quiet hint that the perk exists.
 *
 * `invisible` comes from the server (PlayerPublic.invisibleSpectator, sent only
 * to the player themselves), so this indicator always reflects the real
 * server-side state rather than a hopeful local guess.
 */
import { useEffect, useState } from 'react';
import { emitWithAck } from '@/lib/socket';

export function SpectatorInvisibilityBar({ invisible }: { invisible: boolean }) {
  const [owns, setOwns] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // No payload — server handler is (cb)=>…, so send only the ack callback.
        const r = await emitWithAck<undefined, any>('perks:get');
        if (alive && r?.ok) setOwns(!!r.data?.perks?.ownsInvisible);
      } catch { /* leave unknown */ }
    })();
    return () => { alive = false; };
  }, []);

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    try { await emitWithAck<{ on: boolean }, any>('spectator:toggle_invisible', { on: !invisible }); }
    catch { /* server rejects → state simply won't change */ }
    finally { setBusy(false); }
  };

  // Owns unknown yet, and not currently invisible → render nothing (avoids a flash).
  if (owns === null && !invisible) return null;
  // Doesn't own it and isn't invisible → nothing to show here.
  if (owns === false && !invisible) return null;

  return (
    <div className="mb-2 px-3 py-1.5 rounded-lg flex items-center gap-2"
      style={{
        border: `1px solid ${invisible ? 'rgba(155,0,255,0.35)' : 'rgba(255,255,255,0.10)'}`,
        background: invisible ? 'rgba(155,0,255,0.10)' : 'rgba(255,255,255,0.04)',
      }}>
      <span className="text-[13px]">{invisible ? '🕵️' : '👁'}</span>
      <span className="text-[12px] font-mono flex-1" style={{ color: invisible ? '#d9b8ff' : 'rgba(255,255,255,0.5)' }}>
        {invisible ? 'უჩინარი ხარ — სხვები ვერ გხედავენ' : 'ხილული ხარ დამკვირვებლების სიაში'}
      </span>
      <button onClick={toggle} disabled={busy}
        className="px-2.5 py-1 rounded-md font-mono text-[11px] font-bold transition-all active:scale-95 disabled:opacity-50"
        style={{
          border: `1px solid ${invisible ? 'rgba(255,255,255,0.14)' : 'rgba(155,0,255,0.4)'}`,
          background: invisible ? 'rgba(255,255,255,0.05)' : 'rgba(155,0,255,0.16)',
          color: invisible ? '#e8edf7' : '#d9b8ff',
        }}>
        {invisible ? 'გამოჩნდი' : 'გახდი უჩინარი'}
      </button>
    </div>
  );
}
