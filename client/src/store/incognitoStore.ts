import { create } from 'zustand';
import { emitWithAck } from '@/lib/socket';
import { setLiveKitDisguise } from '@/services/livekitVoice';
import type { Disguise } from '@/lib/voiceDisguise';
import type { Res } from '@/types/index';

/**
 * Incognito — the verified player's two-part disappearing act.
 *
 * The NAME half lives on the server, because a client that decided its own
 * disguise would be a client that can decide anyone's. `hideName` here is only
 * a mirror of what the server confirmed.
 *
 * The VOICE half lives entirely in this browser: the microphone is transformed
 * before it is published, so no server ever hears the real voice and there is
 * nothing to leak. It is remembered across rooms on purpose — picking your
 * voice again at the top of every game is the kind of friction that makes a
 * feature go unused.
 */
interface IncognitoState {
  /**
   * The PREFERENCE — "hide me when I join". Remembered, and sent on every join
   * path there is, so entering from the room list, a code, a friend's card or
   * the landing page all behave the same. Distinct from `hideName` below, which
   * is what the server actually did: a free account can want this and not get
   * it, and the panel must show the truth rather than the wish.
   */
  wantHidden: boolean;
  /** Server-confirmed: the room sees an alias instead of your name. */
  hideName: boolean;
  /** What the room is calling you, when hidden. */
  alias: string | null;
  /** Local: the voice the microphone is published through. */
  voice: Disguise | null;
  /** In flight, so the toggle can't be double-fired. */
  busy: boolean;
  error: string | null;

  setNameHidden: (on: boolean) => Promise<void>;
  /** Set the join-time preference without touching any room. */
  setWantHidden: (on: boolean) => void;
  setVoice: (v: Disguise | null) => Promise<void>;
  /** Reconcile with what the room actually says about us. */
  syncFromRoom: (mine: { incognito?: boolean; myAlias?: string | null } | null | undefined) => void;
  clearError: () => void;
}

const VOICE_KEY = 'vm.incognito.voice';
const HIDE_KEY = 'vm.incognito.hide';

function remembered(): Disguise | null {
  try { return (localStorage.getItem(VOICE_KEY) as Disguise | null) || null; } catch { return null; }
}
function rememberedHide(): boolean {
  try { return localStorage.getItem(HIDE_KEY) === '1'; } catch { return false; }
}
function persistHide(on: boolean): void {
  try { on ? localStorage.setItem(HIDE_KEY, '1') : localStorage.removeItem(HIDE_KEY); } catch { /* private mode */ }
}

export const useIncognitoStore = create<IncognitoState>((set, get) => ({
  wantHidden: rememberedHide(),
  hideName: false,
  alias: null,
  voice: remembered(),
  busy: false,
  error: null,

  setNameHidden: async (on) => {
    if (get().busy) return;
    set({ busy: true, error: null });
    try {
      const r = await emitWithAck<{ on: boolean }, Res<{ on: boolean; alias: string | null }>>(
        'room:set_incognito', { on },
      );
      if (r.ok) { set({ hideName: r.data.on, alias: r.data.alias, wantHidden: r.data.on }); persistHide(r.data.on); }
      else set({ error: r.error });
    } catch (e: any) {
      set({ error: e?.message ?? 'ვერ შეიცვალა' });
    } finally { set({ busy: false }); }
  },

  setWantHidden: (on) => { persistHide(on); set({ wantHidden: on }); },

  setVoice: async (v) => {
    set({ voice: v });
    try { v ? localStorage.setItem(VOICE_KEY, v) : localStorage.removeItem(VOICE_KEY); } catch { /* private mode */ }
    await setLiveKitDisguise(v);
  },

  syncFromRoom: (mine) => {
    const on = !!mine?.incognito;
    if (get().hideName !== on || get().alias !== (mine?.myAlias ?? null)) {
      set({ hideName: on, alias: mine?.myAlias ?? null });
    }
  },

  clearError: () => set({ error: null }),
}));

/** The join-time wish, for the socket layer. Read outside React on purpose. */
export function wantsHiddenName(): boolean { return useIncognitoStore.getState().wantHidden; }

/** Re-apply the remembered voice to a freshly connected room. */
export function restoreIncognitoVoice(): void {
  const v = useIncognitoStore.getState().voice;
  if (v) void setLiveKitDisguise(v);
}
