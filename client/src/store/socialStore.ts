import { create } from 'zustand';
import { socket } from '@/lib/socket';
import type { LobbyMessage } from '@/types/index';

export interface ModAlert {
  id: string;
  type: string;
  message: string;
  targetName?: string;
  createdAt: number;
}

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

  morePanelOpen: boolean;
  openMoreMenu: () => void;
  closeMoreMenu: () => void;

  // Lobby chat
  lobbyChatOpen: boolean;
  openLobbyChat: () => void;
  closeLobbyChat: () => void;
  lobbyChatUnread: number;
  clearLobbyChatUnread: () => void;
  lobbyMessages: LobbyMessage[];

  // Mod alerts
  modAlerts: ModAlert[];
  dismissModAlert: (id: string) => void;
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

  socket.on('lobby:message', (msg: LobbyMessage) => {
    set(s => {
      if (s.lobbyMessages.some(m => m.id === msg.id)) return {};
      return {
        lobbyMessages: [...s.lobbyMessages.slice(-99), msg],
        lobbyChatUnread: s.lobbyChatOpen ? 0 : s.lobbyChatUnread + 1,
      };
    });
  });

  socket.on('lobby:msg_deleted', ({ msgId }: { msgId: string }) => {
    set(s => ({ lobbyMessages: s.lobbyMessages.filter(m => m.id !== msgId) }));
  });

  socket.on('mod:notification', (data: { type: string; message: string; targetName?: string }) => {
    const alert: ModAlert = {
      id: crypto.randomUUID(),
      type: data.type,
      message: data.message,
      targetName: data.targetName,
      createdAt: Date.now(),
    };
    set(s => ({ modAlerts: [...s.modAlerts.slice(-9), alert] }));
    setTimeout(() => {
      set(s => ({ modAlerts: s.modAlerts.filter(a => a.id !== alert.id) }));
    }, 9000);
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

    morePanelOpen: false,
    openMoreMenu: () => set({ morePanelOpen: true }),
    closeMoreMenu: () => set({ morePanelOpen: false }),

    lobbyChatOpen: false,
    openLobbyChat: () => set({ lobbyChatOpen: true, lobbyChatUnread: 0 }),
    closeLobbyChat: () => set({ lobbyChatOpen: false }),
    lobbyChatUnread: 0,
    clearLobbyChatUnread: () => set({ lobbyChatUnread: 0 }),
    lobbyMessages: [],

    modAlerts: [],
    dismissModAlert: (id) => set(s => ({ modAlerts: s.modAlerts.filter(a => a.id !== id) })),
  };
});
