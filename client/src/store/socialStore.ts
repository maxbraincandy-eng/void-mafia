import { create } from 'zustand';
import { socket } from '@/lib/socket';

interface SocialStore {
  profilePopupId: string | null;
  openProfile: (profileId: string) => void;
  closeProfile: () => void;

  dmPanelOpen: boolean;
  activeDmUserId: string | null;
  openDmWith: (userId: string) => void;
  openDmList: () => void;
  closeDm: () => void;

  onlineCount: number;
  unreadDmCount: number;
  setUnreadDmCount: (n: number) => void;
  incUnread: () => void;
}

export const useSocialStore = create<SocialStore>((set, get) => {
  socket.on('online:count', ({ count }: { count: number }) => {
    set({ onlineCount: count });
  });

  socket.on('dm:new_message', () => {
    if (!get().dmPanelOpen) {
      set(s => ({ unreadDmCount: s.unreadDmCount + 1 }));
    }
  });

  return {
    profilePopupId: null,
    openProfile: (profileId) => set({ profilePopupId: profileId }),
    closeProfile: () => set({ profilePopupId: null }),

    dmPanelOpen: false,
    activeDmUserId: null,
    openDmWith: (userId) => set({ dmPanelOpen: true, activeDmUserId: userId, profilePopupId: null }),
    openDmList: () => set({ dmPanelOpen: true, activeDmUserId: null }),
    closeDm: () => set({ dmPanelOpen: false, activeDmUserId: null }),

    onlineCount: 0,
    unreadDmCount: 0,
    setUnreadDmCount: (n) => set({ unreadDmCount: n }),
    incUnread: () => set(s => ({ unreadDmCount: s.unreadDmCount + 1 })),
  };
});
