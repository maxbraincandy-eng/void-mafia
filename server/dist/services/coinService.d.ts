export type TxType = 'grant' | 'deduct' | 'gift_sent' | 'gift_received' | 'daily_reward' | 'refund';
export interface CoinTransaction {
    id: string;
    playerId: string;
    publicId: number | null;
    type: TxType;
    amount: number;
    balanceBefore: number;
    balanceAfter: number;
    relatedUserId: string | null;
    relatedGiftId: string | null;
    description: string;
    grantedBy: string | null;
    createdAt: number;
}
export interface GiftCatalogItem {
    id: string;
    name: string;
    description: string;
    icon: string;
    imageUrl: string;
    rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
    stars: number;
    price: number;
    active: boolean;
    category: string;
    limitedEdition: boolean;
    seasonalTag: string | null;
    displayOrder: number;
    createdBy: string;
    createdAt: number;
    updatedAt: number;
}
export interface PlayerGift {
    id: string;
    recipientId: string;
    receiverPublicId: number | null;
    receiverName: string;
    senderId: string;
    senderPublicId: number | null;
    senderUsername: string;
    senderAvatar: string;
    senderAvatarUrl: string | null;
    giftId: string;
    giftKey: string;
    giftName: string;
    giftIcon: string;
    giftImageUrl: string;
    giftRarity: string;
    giftStars: number;
    coinCost: number;
    message: string;
    transactionId: string;
    createdAt: number;
}
export interface GiftDetail extends GiftCatalogItem {
    totalSent: number;
    senders: Array<{
        senderId: string;
        senderUsername: string;
        senderAvatar: string;
        senderAvatarUrl: string | null;
        message: string;
        sentAt: number;
    }>;
}
export interface GiftTimelineEntry {
    id: string;
    senderId: string;
    senderPublicId: number | null;
    senderName: string;
    senderAvatar: string;
    senderAvatarUrl: string | null;
    recipientId: string;
    receiverPublicId: number | null;
    receiverName: string;
    receiverAvatar: string;
    receiverAvatarUrl: string | null;
    giftId: string;
    giftName: string;
    giftIcon: string;
    giftImageUrl: string;
    giftRarity: string;
    giftStars: number;
    coinCost: number;
    message: string;
    createdAt: number;
}
export interface GiftStats {
    totalReceived: number;
    totalSent: number;
    totalSpent: number;
    uniqueGiftTypesReceived: number;
    uniqueGiftTypesSent: number;
    legendaryReceivedCount: number;
    mostReceivedGiftName: string | null;
    mostSentGiftName: string | null;
}
export interface PinnedGiftEntry {
    giftId: string;
    giftName: string;
    giftIcon: string;
    giftImageUrl: string;
    giftRarity: string;
    giftStars: number;
    pinnedAt: number;
}
export declare function getCoins(playerId: string): Promise<number>;
export declare function claimDailyReward(playerId: string): Promise<{
    coins: number;
    balance: number;
    alreadyClaimed: boolean;
}>;
export declare function grantCoins(ownerId: string, targetId: string, amount: number, description: string): Promise<{
    newBalance: number;
}>;
export declare function deductCoins(ownerId: string, targetId: string, amount: number, description: string): Promise<{
    newBalance: number;
}>;
export declare function purchaseCosmeticItem(playerId: string, itemId: string): Promise<{
    newBalance: number;
}>;
export declare function refundGift(txId: string, ownerId: string): Promise<void>;
export declare function getTransactions(playerId: string, limit?: number): Promise<CoinTransaction[]>;
export declare function getAllTransactions(limit?: number): Promise<CoinTransaction[]>;
export declare function getGiftCatalog(includeInactive?: boolean): Promise<(GiftCatalogItem & {
    isCurrentSeason: boolean;
})[]>;
export declare function createGift(createdBy: string, data: {
    name: string;
    description?: string;
    icon: string;
    imageUrl?: string;
    rarity: string;
    stars: number;
    price: number;
    seasonalTag?: string | null;
    limitedEdition?: boolean;
}): Promise<GiftCatalogItem>;
export declare function updateGift(giftId: string, data: Partial<{
    name: string;
    description: string;
    icon: string;
    imageUrl: string;
    rarity: string;
    stars: number;
    price: number;
    active: boolean;
    seasonalTag: string | null;
    limitedEdition: boolean;
}>): Promise<GiftCatalogItem>;
export declare function sendGift(senderId: string, recipientId: string, giftId: string, message: string): Promise<{
    newSenderBalance: number;
    giftEntry: PlayerGift;
}>;
export declare function getPlayerGifts(recipientId: string): Promise<PlayerGift[]>;
export declare function getGiftDetail(giftId: string, recipientId: string): Promise<GiftDetail | null>;
export declare function getGiftsSent(senderId: string, limit?: number): Promise<PlayerGift[]>;
export declare function getGiftTimeline(playerId: string, limit?: number): Promise<GiftTimelineEntry[]>;
export declare function getGiftStats(playerId: string): Promise<GiftStats>;
export declare function getPinnedGifts(playerId: string): Promise<PinnedGiftEntry[]>;
export declare function pinGift(playerId: string, giftId: string): Promise<void>;
export declare function unpinGift(playerId: string, giftId: string): Promise<void>;
export declare function hideGift(recipientId: string, giftId: string): Promise<void>;
export declare function unhideGift(recipientId: string, giftId: string): Promise<void>;
export declare function getHiddenGifts(recipientId: string): Promise<PlayerGift[]>;
export declare function checkProfileCompletionBonus(playerId: string): Promise<{
    awarded: boolean;
    newBalance?: number;
}>;
export declare function currentSeasonTag(): string | null;
export declare function creditPurchasedCoins(profileId: string, amount: number, description: string): Promise<{
    newBalance: number;
}>;
export declare function getGiftLeaderboard(): Promise<{
    topGifters: Array<{
        profileId: string;
        username: string;
        avatar: string;
        avatarUrl: string | null;
        totalSpent: number;
        giftCount: number;
    }>;
    topRecipients: Array<{
        profileId: string;
        username: string;
        avatar: string;
        avatarUrl: string | null;
        totalReceived: number;
        giftCount: number;
    }>;
}>;
//# sourceMappingURL=coinService.d.ts.map