import { Room, Player, GameSettings, RoomPublic, RoomListItem, SpectatorQueueSettings } from '../types/index.js';
export declare function generateVoiceSessionId(): string;
export declare const DEFAULT_SPECTATOR_QUEUE: SpectatorQueueSettings;
export declare const DEFAULT_SETTINGS: GameSettings;
export declare function createRoom(hostSocketId: string, hostName: string, profileId: string | null, settings?: Partial<GameSettings>, clanId?: string | null, roomName?: string): Room;
export declare function getRoom(id: string): Room | undefined;
export declare function getRoomByCode(code: string): Room | undefined;
export declare function deleteRoom(id: string): void;
export declare function addPlayer(room: Room, socketId: string, name: string, profileId: string | null): Player;
/** Add a spectator-only player (no seat, no role). Can later queue for next round. */
export declare function addSpectatorPlayer(room: Room, socketId: string, name: string, profileId: string | null): Player;
/**
 * Move a spectator into the next-round queue.
 * Returns the assigned queue position (1-based).
 */
export declare function enqueueForNextRound(room: Room, playerId: string): number;
/**
 * Remove a player from the next-round queue and re-number remaining positions.
 */
export declare function dequeueFromNextRound(room: Room, playerId: string): void;
/**
 * Promote queued players to active slots at the start of a new round.
 */
export declare function promoteQueuedPlayers(room: Room): Player[];
export declare function removePlayer(room: Room, playerId: string): void;
export declare function transferHost(room: Room, newHostId: string): void;
export declare function getPlayerBySocket(room: Room, socketId: string): Player | undefined;
export declare function getPlayerByProfile(room: Room, profileId: string): Player | undefined;
export declare function getHostPlayer(room: Room): Player | undefined;
export declare function getAlivePlayers(room: Room): Player[];
export declare function toPublicRoom(room: Room, viewerPlayerId: string): RoomPublic;
export declare function toRoomListItem(room: Room): RoomListItem;
export declare function getAllRooms(): Room[];
export declare function setPlayerAvatarUrl(room: Room, profileId: string, avatarUrl: string | null): void;
export declare function rematchRoom(room: Room): void;
//# sourceMappingURL=roomService.d.ts.map