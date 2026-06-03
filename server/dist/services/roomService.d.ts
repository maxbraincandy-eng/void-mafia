import { Room, Player, GameSettings, RoomPublic, RoomListItem } from '../types/index.js';
export declare const DEFAULT_SETTINGS: GameSettings;
export declare function createRoom(hostSocketId: string, hostName: string, profileId: string | null, settings?: Partial<GameSettings>): Room;
export declare function getRoom(id: string): Room | undefined;
export declare function getRoomByCode(code: string): Room | undefined;
export declare function deleteRoom(id: string): void;
export declare function addPlayer(room: Room, socketId: string, name: string, profileId: string | null): Player;
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