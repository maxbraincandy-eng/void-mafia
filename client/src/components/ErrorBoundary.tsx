import { Component, type ReactNode } from 'react';
import { tNow } from '@/store/langStore';

interface Props { children: ReactNode }
interface State { error: Error | null }

/**
 * Global crash guard. Without this, any unhandled render error unmounts the
 * whole React tree and leaves a permanently black screen (the user had to
 * fully close and reopen the app). Now a render crash shows a recoverable
 * panel that reloads the app instead.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error('[ErrorBoundary] caught render crash:', error, info);
  }

  render() {
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
