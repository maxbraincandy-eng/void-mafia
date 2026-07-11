import { create } from 'zustand';

export type CallStatus = 'idle' | 'outgoing' | 'incoming' | 'connected';

export interface CallPeer {
  profileId: string;
  username: string;
  avatar: string;
  avatarUrl: string | null;
}

interface CallStore {
  status: CallStatus;
  /** LiveKit room the two participants share (deterministic from both ids). */
  roomId: string | null;
  conversationId: string | null;
  peer: CallPeer | null;
  /** true → video call (camera on), false → audio-only. */
  video: boolean;

  /** Local player initiates a call. roomId is filled once the server replies. */
  startOutgoing: (p: { peer: CallPeer; conversationId: string; video: boolean }) => void;
  /** An incoming ring arrived. */
  startIncoming: (p: { peer: CallPeer; conversationId: string; roomId: string; video: boolean }) => void;
  setRoomId: (roomId: string) => void;
  markConnected: () => void;
  reset: () => void;
}

export const useCallStore = create<CallStore>((set) => ({
  status: 'idle',
  roomId: null,
  conversationId: null,
  peer: null,
  video: false,

  startOutgoing: ({ peer, conversationId, video }) =>
    set({ status: 'outgoing', peer, conversationId, video, roomId: null }),
  startIncoming: ({ peer, conversationId, roomId, video }) =>
    set({ status: 'incoming', peer, conversationId, roomId, video }),
  setRoomId: (roomId) => set({ roomId }),
  markConnected: () => set({ status: 'connected' }),
  reset: () => set({ status: 'idle', roomId: null, conversationId: null, peer: null, video: false }),
}));
