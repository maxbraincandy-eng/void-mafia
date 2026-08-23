/**
 * The economy that does not exist.
 *
 * READ `README.md` IN THIS DIRECTORY BEFORE CHANGING ANYTHING HERE.
 *
 * This file is an interface and a wall. It is not imported by the poker engine,
 * the socket layer, or anything else that runs; it is here so that a future
 * economy has one obvious place to attach, and so that the absence of one today
 * is a visible, checkable fact rather than an assumption.
 *
 * Every capability that could give a table chip value outside the table is
 * declared here and disabled here. The default provider throws on all of them,
 * loudly, with the reason — because the failure mode to design against is not
 * "someone writes a payment integration", it is "someone quietly wires a chip
 * to something that has value and nobody notices for six months".
 */
/**
 * What a chip is worth outside the game.
 *
 * `null` is the only value this may hold in the current product, and the type
 * says so: there is no currency code, no rate, no redemption path.
 */
export type CashValue = null;
export interface EconomyCapabilities {
    /** Adding gameplay chips (a table buy-in, a daily top-up). */
    readonly grant: boolean;
    /** Spending gameplay chips inside the game (posting a blind, a bet). */
    readonly spend: boolean;
    /** Moving chips between players. Enabling this makes chips a currency. */
    readonly transfer: boolean;
    /** Exchanging chips for anything outside the game. */
    readonly redeem: boolean;
    /** Taking money in. */
    readonly deposit: boolean;
    /** Paying money out. */
    readonly withdrawal: boolean;
}
/**
 * The current, shipped configuration.
 *
 * `grant` and `spend` are true because the table needs to hand a seat its chips
 * and take them back as bets — those are gameplay operations that never leave
 * the table. Everything that could tie a chip to value is false, and
 * changing any of them to true is a decision that requires the compliance
 * checklist to have been completed first.
 */
export declare const CURRENT_CAPABILITIES: EconomyCapabilities;
export interface EconomyProvider {
    /** Gameplay chips a player currently has available for seating. */
    getBalance(playerId: string): Promise<number>;
    /** Give gameplay chips — a buy-in, a rebuy, a daily allowance. */
    addGameplayCurrency(playerId: string, amount: number, reason: string): Promise<number>;
    /** Take gameplay chips for a gameplay purpose. */
    spendGameplayCurrency(playerId: string, amount: number, reason: string): Promise<number>;
    /** DISABLED. Moving chips between players would make them a currency. */
    transferCurrency(fromPlayerId: string, toPlayerId: string, amount: number): Promise<never>;
    /** DISABLED. Redeeming chips for anything outside the game. */
    redeemCurrency(playerId: string, amount: number): Promise<never>;
    /** Always null in this product. */
    cashValue(): CashValue;
}
export declare class EconomyDisabledError extends Error {
    constructor(capability: keyof EconomyCapabilities);
}
/**
 * The provider the product ships with: chips exist only while a player is sat
 * at a table, and the two operations that would give them value throw.
 *
 * Note there is no persistence here on purpose. A stored, growing balance is
 * the first step towards something a player can feel they own, and that is a
 * step to take deliberately, with advice, not by accident.
 */
export declare class DisabledEconomyProvider implements EconomyProvider {
    private readonly capabilities;
    constructor(capabilities?: EconomyCapabilities);
    getBalance(): Promise<number>;
    addGameplayCurrency(_playerId: string, amount: number): Promise<number>;
    spendGameplayCurrency(_playerId: string, amount: number): Promise<number>;
    transferCurrency(): Promise<never>;
    redeemCurrency(): Promise<never>;
    cashValue(): CashValue;
}
//# sourceMappingURL=EconomyProvider.d.ts.map