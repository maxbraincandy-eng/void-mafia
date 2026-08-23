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
 * The current, shipped configuration.
 *
 * `grant` and `spend` are true because the table needs to hand a seat its chips
 * and take them back as bets — those are gameplay operations that never leave
 * the table. Everything that could tie a chip to value is false, and
 * changing any of them to true is a decision that requires the compliance
 * checklist to have been completed first.
 */
export const CURRENT_CAPABILITIES = {
    grant: true,
    spend: true,
    transfer: false,
    redeem: false,
    deposit: false,
    withdrawal: false,
};
export class EconomyDisabledError extends Error {
    constructor(capability) {
        super(`Economy capability "${capability}" is disabled in this product. ` +
            'Table chips are a gameplay counter with no monetary or redeemable value. ' +
            'See server/src/future-economy/README.md and the compliance checklist ' +
            'before enabling anything here.');
        this.name = 'EconomyDisabledError';
    }
}
/**
 * The provider the product ships with: chips exist only while a player is sat
 * at a table, and the two operations that would give them value throw.
 *
 * Note there is no persistence here on purpose. A stored, growing balance is
 * the first step towards something a player can feel they own, and that is a
 * step to take deliberately, with advice, not by accident.
 */
export class DisabledEconomyProvider {
    constructor(capabilities = CURRENT_CAPABILITIES) {
        this.capabilities = capabilities;
    }
    async getBalance() { return 0; }
    async addGameplayCurrency(_playerId, amount) {
        if (!this.capabilities.grant)
            throw new EconomyDisabledError('grant');
        return amount;
    }
    async spendGameplayCurrency(_playerId, amount) {
        if (!this.capabilities.spend)
            throw new EconomyDisabledError('spend');
        return amount;
    }
    async transferCurrency() { throw new EconomyDisabledError('transfer'); }
    async redeemCurrency() { throw new EconomyDisabledError('redeem'); }
    cashValue() { return null; }
}
//# sourceMappingURL=EconomyProvider.js.map