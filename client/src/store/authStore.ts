import { create } from 'zustand';
import { PlayerProfilePublic } from '@/types/index';
import { socket } from '@/lib/socket';
import type { Res } from '@/types/index';

const UID_KEY    = 'void-mafia-uid';
const NAME_KEY   = 'void-mafia-username';
const AVATAR_KEY = 'void-mafia-avatar';

function generateUid(): string {
  return 'u_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

interface AuthStore {
  uid: string | null;
  username: string | null;
  profile: PlayerProfilePublic | null;
  localAvatar: string | null;
  isAuthed: boolean;
  isLoading: boolean;
  error: string | null;

  login: (username: string) => Promise<void>;
  register: (email: string, password: string, username: string) => Promise<void>;
  loginEmail: (email: string, password: string) => Promise<void>;
  logout: () => void;
  setLocalAvatar: (src: string | null) => void;
}

export const useAuthStore = create<AuthStore>((set, get) => {
  socket.on('player:profile', (profile: PlayerProfilePublic) => {
    set({ profile, isAuthed: true });
  });

  // Re-authenticate on every connect (handles reconnects — server loses socket.data on reconnect)
  socket.on('connect', () => {
    const { uid, username } = get();
    if (uid && username) {
      socket.emit('player:auth', { uid, username }, (res: any) => {
        if (res?.ok) set({ profile: res.data, isAuthed: true, isLoading: false });
      });
    }
  });

  return {
    uid: localStorage.getItem(UID_KEY),
    username: localStorage.getItem(NAME_KEY),
    profile: null,
    localAvatar: localStorage.getItem(AVATAR_KEY),
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

    register: async (email: string, password: string, username: string) => {
      set({ isLoading: true, error: null });
      try {
        const res = await new Promise<Res<{ uid: string; profile: PlayerProfilePublic }>>((resolve) => {
          (socket as any).emit('player:register', { email, password, username }, resolve);
        });
        if (!res.ok) throw new Error(res.error);
        localStorage.setItem(UID_KEY, res.data.uid);
        localStorage.setItem(NAME_KEY, res.data.profile.username);
        set({ uid: res.data.uid, username: res.data.profile.username, profile: res.data.profile, isAuthed: true, isLoading: false, error: null });
      } catch (e: any) {
        set({ isLoading: false, error: e.message ?? 'Registration failed.' });
        throw e;
      }
    },

    loginEmail: async (email: string, password: string) => {
      set({ isLoading: true, error: null });
      try {
        const res = await new Promise<Res<{ uid: string; profile: PlayerProfilePublic }>>((resolve) => {
          (socket as any).emit('player:login_email', { email, password }, resolve);
        });
        if (!res.ok) throw new Error(res.error);
        localStorage.setItem(UID_KEY, res.data.uid);
        localStorage.setItem(NAME_KEY, res.data.profile.username);
        set({ uid: res.data.uid, username: res.data.profile.username, profile: res.data.profile, isAuthed: true, isLoading: false, error: null });
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

    setLocalAvatar: (src) => {
      if (src) localStorage.setItem(AVATAR_KEY, src);
      else localStorage.removeItem(AVATAR_KEY);
      set({ localAvatar: src });
    },
  };
});
