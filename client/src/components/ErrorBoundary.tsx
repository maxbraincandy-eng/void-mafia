import { Component, type ReactNode } from 'react';
import { tNow } from '@/store/langStore';

interface Props { children: ReactNode }
interface State { error: Error | null; recovering: boolean }

/**
 * Global crash guard. A render error would otherwise unmount the whole tree and
 * leave a black screen (the user had to close and reopen the app).
 *
 * Most in-game crashes are TRANSIENT — a render race during a socket reconnect,
 * a half-applied room:update, etc. So instead of dead-ending on a "Something
 * went wrong / Reload" wall, we SELF-HEAL:
 *   1st crash → clear the error and re-render (the transient state has usually
 *               passed a few hundred ms later).
 *   crashes again quickly → one guarded hard reload (rejoins the game cleanly
 *               and re-establishes voice), can't loop.
 *   still crashing → finally show the manual recovery panel.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, recovering: false };
  private lastCrashAt = 0;
  private softTimer: ReturnType<typeof setTimeout> | null = null;

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error('[ErrorBoundary] caught render crash:', error, info);

    const now = Date.now();
    const sinceLast = now - this.lastCrashAt;
    this.lastCrashAt = now;

    // First crash in a while → attempt a silent soft recovery (no reload).
    if (sinceLast > 9000) {
      if (this.softTimer) clearTimeout(this.softTimer);
      this.softTimer = setTimeout(() => this.setState({ error: null, recovering: false }), 350);
      this.setState({ recovering: true });
      return;
    }

    // Crashed again right after a soft recovery → one guarded hard reload,
    // which rejoins the game from scratch (also clears stuck voice state).
    const RELOAD_KEY = 'vm_eb_reloaded_at';
    const lastReload = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (now - lastReload > 25000) {
      try { sessionStorage.setItem(RELOAD_KEY, String(now)); } catch { /* ignore */ }
      this.setState({ recovering: true });
      window.location.reload();
      return;
    }
    // Reloaded recently and still crashing → fall through to the manual panel.
  }

  componentWillUnmount() {
    if (this.softTimer) clearTimeout(this.softTimer);
  }

  render() {
    if (this.state.recovering) {
      return (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 99999, display: 'flex', alignItems: 'center',
          justifyContent: 'center', background: 'radial-gradient(ellipse at 50% 30%, #14082a, #05030e 70%)',
          color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace', fontSize: 13, letterSpacing: 2,
        }}>…</div>
      );
    }
    if (!this.state.error) return this.props.children;
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 99999, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 16, padding: 28, textAlign: 'center',
        background: 'radial-gradient(ellipse at 50% 30%, #14082a, #05030e 70%)',
        fontFamily: '"Space Grotesk", sans-serif',
      }}>
        <div style={{ fontSize: 48, filter: 'drop-shadow(0 0 14px rgba(155,0,255,0.6))' }}>⚠️</div>
        <p style={{ fontWeight: 700, fontSize: 18, color: '#fff' }}>{tNow().uiMisc.errTitle}</p>
        <p style={{ fontFamily: 'monospace', fontSize: 12, color: 'rgba(255,255,255,0.45)', maxWidth: 320, lineHeight: 1.5 }}>
          {tNow().uiMisc.errDesc}
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{
            marginTop: 6, padding: '12px 26px', borderRadius: 14, fontFamily: 'monospace',
            fontWeight: 700, fontSize: 14, cursor: 'pointer',
            background: 'linear-gradient(135deg, rgba(155,0,255,0.5), rgba(0,229,255,0.35))',
            border: '1px solid rgba(155,0,255,0.5)', color: '#fff',
          }}
        >
          {tNow().uiMisc.errReload}
        </button>
      </div>
    );
  }
}
