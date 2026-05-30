import { ChatMessage, ChatChannel, Room, Player } from '../types/index.js';
export declare function createPlayerMessage(sender: Player, text: string, channel: ChatChannel): ChatMessage;
export declare function createSystemMessage(text: string, channel?: ChatChannel): ChatMessage;
export declare function addMessage(room: Room, msg: ChatMessage): void;
/** Validate chat permissions. Returns error string or null. */
export declare function validateChat(room: Room, player: Player, channel: ChatChannel): string | null;
//# sourceMappingURL=chatService.d.ts.map