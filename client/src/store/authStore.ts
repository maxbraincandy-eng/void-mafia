import { create } from 'zustand';
import { PlayerProfilePublic } from '@/types/index';
import { socket } from '@/lib/socket';
import type { Res } from '@/types/index';

const UID_KEY  = 'void-mafia-uid';
const NAME_KEY = 'void-mafia-username';

function generateUid(): string {
  return 'u_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

interface AuthStore {
  uid: string | null;
  username: string | null;
  profile: PlayerProfilePublic | null;
  isAuthed: boolean;
  isLoading: boolean;
  error: string | null;

  login: (username: string) => Promise<void>;
  logout: () => void;
  refreshProfile: () => void;
}

export const useAuthStore = create<AuthStore>((set, get) => {
  // Listen for profile updates pushed by server
  socket.on('player:profile', (profile: PlayerProfilePublic) => {
    set({ profile, isAuthed: true });
  });

  return {
    uid: localStorage.getItem(UID_KEY),
    username: localStorage.getItem(NAME_KEY),
    profile: null,
    isAuthed: false,
    isLoading: false,
    error: null,

    login: async (username: string) => {
      set({ isLoading: true, error: null });
      try {
        let uid = localStorage.getItem(UID_KEY);
        if (!uid) {
          uid = generateUid();
          localStorage.setItem(UID_KEY, uid);
        }
        localStorage.setItem(NAME_KEY, username);

        const res = await new Promise<Res<PlayerProfilePublic>>((resolve) => {
          socket.emit('player:auth', { uid, username }, resolve);
        });

        if (!res.ok) throw new Error(res.error);

        set({
          uid,
          username,
          profile: res.data,
          isAuthed: true,
          isLoading: false,
          error: null,
        });
      } catch (e: any) {
        set({ isLoading: false, error: e.message ?? 'Login failed.' });
        throw e;
      }
    },

    logout: () => {
      localStorage.removeItem(UID_KEY);
      localStorage.removeItem(NAME_KEY);
      set({ uid: null, username: null, profile: null, isAuthed: false });
    },

    refreshProfile: () => {
      const uid = get().uid;
      const username = get().username;
      if (uid && username) get().login(username).catch(() => {});
    },
  };
});
