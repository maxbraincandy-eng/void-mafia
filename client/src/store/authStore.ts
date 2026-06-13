import { create } from 'zustand';
import { PlayerProfilePublic, ClanRole } from '@/types/index';
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
  localAvatar: string | null; // mirrors profile.avatarUrl for ProfilePage compat
  isAuthed: boolean;
  isLoading: boolean;
  error: string | null;
  myClanId: string | null;
  myClanRole: ClanRole | null;

  login: (username: string) => Promise<void>;
  loginOAuth: () => Promise<void>;
  register: (email: string, password: string, username: string) => Promise<void>;
  loginEmail: (email: string, password: string) => Promise<void>;
  logout: () => void;
  changeName: (newName: string) => Promise<{ ok: boolean; error?: string }>;
  uploadAvatar: (imageData: string) => Promise<{ ok: boolean; error?: string }>;
  removeAvatar: () => Promise<{ ok: boolean; error?: string }>;
  setLocalAvatar: (src: string | null) => void;
  refreshClanMembership: () => void;
}

export const useAuthStore = create<AuthStore>((set, get) => {
  socket.on('player:profile', (profile: PlayerProfilePublic) => {
    set({ profile, isAuthed: true, localAvatar: profile.avatarUrl ?? null });
  });

  function fetchClanMembership() {
    socket.emit('clan:my_membership' as any, (res: any) => {
      if (res?.ok) {
        set({ myClanId: res.data?.id ?? null, myClanRole: res.data?.memberRole ?? null });
      }
    });
  }

  socket.on('connect', () => {
    const { uid, username } = get();
    if (uid && username) {
      socket.emit('player:auth', { uid, username }, (res: any) => {
        if (res?.ok) {
          set({ profile: res.data, isAuthed: true, isLoading: false, localAvatar: res.data?.avatarUrl ?? null });
          fetchClanMembership();
          // Signal gameStore to attempt session restore after page refresh
          window.dispatchEvent(new Event('vm:auth-ready'));
        }
      });
    }
  });

  return {
    uid: localStorage.getItem(UID_KEY),
    username: localStorage.getItem(NAME_KEY),
    profile: null,
    localAvatar: null,
    isAuthed: false,
    isLoading: false,
    error: null,
    myClanId: null,
    myClanRole: null,

    loginOAuth: async () => {
      set({ isLoading: true, error: null });
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include' });
        const data = await res.json();
        if (!data.ok || !data.uid) throw new Error('OAuth session not found');
        const uid = data.uid as string;
        const username = data.username as string;
        localStorage.setItem(UID_KEY, uid);
        localStorage.setItem(NAME_KEY, username);
        const authRes = await new Promise<Res<PlayerProfilePublic>>((resolve) => {
          socket.emit('player:auth', { uid, username }, resolve);
        });
        if (!authRes.ok) throw new Error(authRes.error);
        set({
          uid,
          username,
          profile: authRes.data,
          localAvatar: authRes.data?.avatarUrl ?? null,
          isAuthed: true,
          isLoading: false,
          error: null,
        });
      } catch (e: any) {
        set({ isLoading: false, error: e.message ?? 'OAuth login failed.' });
        throw e;
      }
    },

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
          localAvatar: res.data?.avatarUrl ?? null,
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
        set({
          uid: res.data.uid,
          username: res.data.profile.username,
          profile: res.data.profile,
          localAvatar: res.data.profile?.avatarUrl ?? null,
          isAuthed: true,
          isLoading: false,
          error: null,
        });
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
        set({
          uid: res.data.uid,
          username: res.data.profile.username,
          profile: res.data.profile,
          localAvatar: res.data.profile?.avatarUrl ?? null,
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
      set({ uid: null, username: null, profile: null, localAvatar: null, isAuthed: false, myClanId: null, myClanRole: null });
    },

    refreshClanMembership: fetchClanMembership,

    changeName: async (newName: string) => {
      try {
        const res = await new Promise<any>((resolve) => {
          (socket as any).emit('player:update_name', { newName }, resolve);
        });
        if (res.ok) {
          localStorage.setItem(NAME_KEY, res.data.username);
          set({ username: res.data.username, profile: res.data });
          return { ok: true };
        }
        return { ok: false, error: res.error };
      } catch (e: any) {
        return { ok: false, error: e.message ?? 'Name change failed.' };
      }
    },

    uploadAvatar: async (imageData: string) => {
      try {
        const res = await new Promise<any>((resolve) => {
          socket.emit('player:update_avatar' as any, { imageData }, resolve);
        });
        if (res.ok) {
          set({ profile: res.data, localAvatar: res.data?.avatarUrl ?? null });
          return { ok: true };
        }
        return { ok: false, error: res.error };
      } catch (e: any) {
        return { ok: false, error: e.message ?? 'Upload failed.' };
      }
    },

    removeAvatar: async () => {
      try {
        const res = await new Promise<any>((resolve) => {
          socket.emit('player:remove_avatar' as any, resolve);
        });
        if (res.ok) {
          set({ profile: res.data, localAvatar: null });
          return { ok: true };
        }
        return { ok: false, error: res.error };
      } catch (e: any) {
        return { ok: false, error: e.message ?? 'Remove failed.' };
      }
    },

    setLocalAvatar: (_src) => {
      // no-op — avatar now managed server-side
    },
  };
});
