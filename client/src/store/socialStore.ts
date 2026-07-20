import { create } from 'zustand';
import { socket, emitWithAck } from '@/lib/socket';
import { SFX } from '@/lib/audioEngine';
import type { LobbyMessage } from '@/types/index';
import { tNow } from '@/store/langStore';

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

export interface InviteToast {
  inviterName: string;
  inviterAvatar: string;
  roomCode: string;
  playerCount: number;
  maxPlayers: number;
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

  // Request the app to open a Virtual Space by code (presence "Join" from anywhere).
  loungeJoinCode: string | null;
  requestJoinLounge: (code: string) => void;
  clearLoungeJoin: () => void;

  // Request the app to open Virtual Space lobby (no specific code).
  openSpaceRequested: boolean;
  requestOpenSpace: () => void;
  clearOpenSpace: () => void;

  // Request the app to open the Ganab Simulator (from a feed @mention).
  openGanabRequested: boolean;
  requestOpenGanab: () => void;
  clearOpenGanab: () => void;
  openVoidIQRequested: boolean;
  requestOpenVoidIQ: () => void;
  clearOpenVoidIQ: () => void;

  onlineCount: number;
  unreadDmCount: number;
  setUnreadDmCount: (n: number) => void;
  incUnread: () => void;

  dmToast: DmToast | null;
  showDmToast: (toast: DmToast) => void;
  clearDmToast: () => void;

  inviteToast: InviteToast | null;
  clearInviteToast: () => void;

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

  // Initialize the unread-DM badge as soon as the player is authenticated —
  // messages received while offline previously showed no badge until the DM
  // panel was opened. `player:profile` fires exactly once auth completes
  // (login, register, token restore, reconnect).
  const syncUnread = () => {
    emitWithAck<void, { ok: boolean; data?: number }>('dm:unread_count')
      .then(res => { if (res?.ok && typeof res.data === 'number') set({ unreadDmCount: res.data }); })
      .catch(() => {});
  };
  socket.on('player:profile', () => { syncUnread(); });

  socket.on('dm:new_message', (payload: {
    conversationId: string;
    message: { senderId: string; text: string };
    senderUsername?: string;
    senderAvatar?: string;
  }) => {
    // Notify unless the user is already looking at THIS sender's conversation —
    // a message from someone else should toast even with the DM panel open.
    const { dmPanelOpen, activeDmUserId } = get();
    const viewingThisChat = dmPanelOpen && activeDmUserId === payload.message.senderId;
    if (!viewingThisChat) {
      const rawText = payload.message.text ?? '';
      const preview = rawText.startsWith('data:audio') ? tNow().misc.voiceMsg
        : rawText.startsWith('📸story:') ? tNow().misc.storyReply
        : rawText.startsWith('data:image/gif') ? '✨ GIF'
        : rawText.startsWith('data:image') ? tNow().misc.imageMsg
        : rawText.length > 80 ? rawText.slice(0, 77) + '…'
        : rawText;
      const toast: DmToast | null = payload.senderUsername
        ? {
            senderUserId: payload.message.senderId,
            senderUsername: payload.senderUsername,
            senderAvatar: payload.senderAvatar ?? '?',
            preview,
          }
        : null;
      set(s => ({
        unreadDmCount: s.unreadDmCount + 1,
        ...(toast ? { dmToast: toast } : {}),
      }));
      try { SFX.dmPing(); } catch { /* audio not unlocked yet */ }
      navigator.vibrate?.([40, 60, 40]);
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

  socket.on('room:invite_received' as any, (data: InviteToast) => {
    set({ inviteToast: data });
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
    openDmWith: (userId) => set({ dmPanelOpen: true, activeDmUserId: userId, profilePopupId: null, unreadDmCount: 0, dmToast: null }),
    openDmList: () => set({ dmPanelOpen: true, activeDmUserId: null, unreadDmCount: 0, dmToast: null }),
    loungeJoinCode: null,
    requestJoinLounge: (code: string) => set({ loungeJoinCode: code }),
    clearLoungeJoin: () => set({ loungeJoinCode: null }),

    openSpaceRequested: false,
    requestOpenSpace: () => set({ openSpaceRequested: true }),
    clearOpenSpace: () => set({ openSpaceRequested: false }),

    openGanabRequested: false,
    requestOpenGanab: () => set({ openGanabRequested: true }),
    clearOpenGanab: () => set({ openGanabRequested: false }),
    openVoidIQRequested: false,
    requestOpenVoidIQ: () => set({ openVoidIQRequested: true }),
    clearOpenVoidIQ: () => set({ openVoidIQRequested: false }),
    closeDm: () => set({ dmPanelOpen: false, activeDmUserId: null }),

    onlineCount: 0,
    unreadDmCount: 0,
    setUnreadDmCount: (n) => set({ unreadDmCount: n }),
    incUnread: () => set(s => ({ unreadDmCount: s.unreadDmCount + 1 })),

    dmToast: null,
    showDmToast: (toast) => set({ dmToast: toast }),
    clearDmToast: () => set({ dmToast: null }),

    inviteToast: null,
    clearInviteToast: () => set({ inviteToast: null }),

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
