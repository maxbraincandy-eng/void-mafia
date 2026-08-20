import { create } from 'zustand';
import { emitWithAck } from '@/lib/socket';
import { setLiveKitDisguise, getLiveKitDisguise, onDisguiseChange } from '@/services/livekitVoice';
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
 * nothing to leak. It belongs to the room it was chosen for and is dropped when
 * another room is joined — a disguise that followed you into a private call was
 * a surprise, never a feature — so this store only MIRRORS what the audio layer
 * currently has (see services/livekitVoice).
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

const HIDE_KEY = 'vm.incognito.hide';

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
  voice: getLiveKitDisguise(),
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
    // The audio layer owns the wish (and where it applies); this is the mirror.
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

// The audio layer drops the disguise by itself when a different room is joined.
// The UI has to hear about that, or the button would keep claiming a voice the
// microphone is no longer wearing.
onDisguiseChange(d => {
  if (useIncognitoStore.getState().voice !== d) useIncognitoStore.setState({ voice: d });
});
