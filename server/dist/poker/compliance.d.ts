/**
 * The compliance notice, and the switches it describes.
 *
 * WHY THIS IS CODE AND NOT A STRING IN A COMPONENT
 * ────────────────────────────────────────────────
 * Two reasons. The first is that the wording will change — it is the kind of
 * text a lawyer edits — so it has to be configurable without a rebuild. The
 * second is more important: the notice and the switches it makes claims about
 * live in the same object, so a claim cannot drift away from the thing it
 * describes. If somebody ever turns a payment feature on, the assertion below
 * fails loudly at boot rather than leaving a notice on screen that has quietly
 * become untrue.
 *
 * Nothing here asserts that the product IS legally compliant anywhere. It
 * records what the product does and does not do, so that the question can be
 * put to somebody qualified to answer it.
 */
import { type EconomyCapabilities } from '../future-economy/EconomyProvider.js';
export interface ComplianceConfig {
    /** Shown in the poker lobby and on the table's info panel. */
    noticeShort: string;
    /** Shown in full on the rules/legal screen. */
    noticeLong: string;
    /** Where the operator wants players to read the full terms. */
    termsUrl: string | null;
    /** Minimum age the operator states for the social product, if any. */
    minimumAge: number | null;
    /** What the product calls itself. Never "casino", never "real money". */
    productDescriptor: string;
}
export declare const DEFAULT_COMPLIANCE: ComplianceConfig;
export declare function getCompliance(): ComplianceConfig;
/** Admin/config surface: the text is editable, the guarantees below are not. */
export declare function setCompliance(patch: Partial<ComplianceConfig>): ComplianceConfig;
/**
 * What the notice claims, stated as data so it can be checked rather than
 * believed. Published to clients alongside the notice.
 */
export interface ComplianceFacts {
    chipsHaveCashValue: false;
    depositEnabled: boolean;
    withdrawalEnabled: boolean;
    playerToPlayerTransferEnabled: boolean;
    redemptionEnabled: boolean;
    realMoneyWagering: false;
}
export declare function complianceFacts(capabilities?: EconomyCapabilities): ComplianceFacts;
/**
 * Called once at boot.
 *
 * If any of the money-shaped capabilities has been switched on, this stops the
 * process. That is deliberate and it is the whole point of the file: the
 * product must not be able to serve a "no monetary value" notice while running
 * code that contradicts it. Turning any of them on is a decision that comes
 * with a checklist (docs/poker/11-legal-compliance-checklist.md), and part of
 * that checklist is rewriting this function on purpose.
 */
export declare function assertSocialOnly(capabilities?: EconomyCapabilities): void;
//# sourceMappingURL=compliance.d.ts.map