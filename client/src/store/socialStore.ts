import { create } from 'zustand';
import { socket } from '@/lib/socket';

export interface DmToast {
  senderUserId: string;
  senderUsername: string;
  senderAvatar: string;
  preview: string;
}

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

  dmToast: DmToast | null;
  showDmToast: (toast: DmToast) => void;
  clearDmToast: () => void;
}

export const useSocialStore = create<SocialStore>((set, get) => {
  socket.on('online:count', ({ count }: { count: number }) => {
    set({ onlineCount: count });
  });

  socket.on('dm:new_message', (payload: {
    conversationId: string;
    message: { senderId: string; text: string };
    senderUsername?: string;
    senderAvatar?: string;
  }) => {
    if (!get().dmPanelOpen) {
      const toast: DmToast | null = payload.senderUsername
        ? {
            senderUserId: payload.message.senderId,
            senderUsername: payload.senderUsername,
            senderAvatar: payload.senderAvatar ?? '?',
            preview: payload.message.text.length > 80
              ? payload.message.text.slice(0, 77) + '…'
              : payload.message.text,
          }
        : null;
      set(s => ({
        unreadDmCount: s.unreadDmCount + 1,
        ...(toast ? { dmToast: toast } : {}),
      }));
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

    dmToast: null,
    showDmToast: (toast) => set({ dmToast: toast }),
    clearDmToast: () => set({ dmToast: null }),
  };
});
