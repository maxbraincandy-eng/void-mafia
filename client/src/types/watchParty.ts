// Watch Party — client-side mirror of the server safe-state shapes.

export type WpProvider = 'youtube' | 'video' | 'vimeo' | 'twitch' | 'tiktok' | 'embed';

export interface WpSource {
  raw: string;
  provider: WpProvider;
  refId: string;
  title: string;
  synced: boolean;
}

export interface WpMemberView {
  userId: string;
  name: string;
  avatar: string;
  isHost: boolean;
}

export interface WpChatMsg {
  id: string;
  userId: string;
  name: string;
  text: string;
  at: number;
}

export interface WpSafeState {
  id: string;
  code: string;
  title: string;
  hostId: string;
  hostName: string;
  you: { userId: string; isHost: boolean };
  members: WpMemberView[];
  source: WpSource | null;
  queue: WpSource[];
  playing: boolean;
  positionSec: number;
  rate: number;
  serverTime: number;
  chat: WpChatMsg[];
}

export interface WpListItem {
  id: string;
  code: string;
  hostName: string;
  title: string;
  memberCount: number;
  nowPlaying: string | null;
  provider: WpProvider | null;
  createdAt: number;
}
