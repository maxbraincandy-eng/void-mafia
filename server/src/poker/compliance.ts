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

import { CURRENT_CAPABILITIES, type EconomyCapabilities } from '../future-economy/EconomyProvider.js';

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

export const DEFAULT_COMPLIANCE: ComplianceConfig = {
  productDescriptor: 'social poker',
  noticeShort:
    'უფასო სოციალური პოკერი — ჩიპებს არ აქვს ფულადი ღირებულება.',
  noticeLong:
    'ეს არის უფასო, სოციალური პოკერი. მაგიდაზე გამოყენებული ჩიპები არის მხოლოდ '
    + 'თამაშის ელემენტი: მათ არ აქვთ ფულადი ღირებულება, არ იყიდება, არ იყიდება უკან, '
    + 'არ გადაიცემა მოთამაშეებს შორის და არ იცვლება ფულზე ან სხვა ღირებულების მქონე '
    + 'აქტივზე. თამაშში მოგება არ ნიშნავს ფულად ან სხვა მატერიალურ ჯილდოს. '
    + 'რეიტინგები ეყრდნობა მხოლოდ სათამაშო სტატისტიკას.',
  termsUrl: null,
  minimumAge: null,
};

let active: ComplianceConfig = { ...DEFAULT_COMPLIANCE };

export function getCompliance(): ComplianceConfig { return active; }

/** Admin/config surface: the text is editable, the guarantees below are not. */
export function setCompliance(patch: Partial<ComplianceConfig>): ComplianceConfig {
  active = { ...active, ...patch };
  return active;
}

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

export function complianceFacts(capabilities: EconomyCapabilities = CURRENT_CAPABILITIES): ComplianceFacts {
  return {
    chipsHaveCashValue: false,
    depositEnabled: capabilities.deposit,
    withdrawalEnabled: capabilities.withdrawal,
    playerToPlayerTransferEnabled: capabilities.transfer,
    redemptionEnabled: capabilities.redeem,
    realMoneyWagering: false,
  };
}

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
export function assertSocialOnly(capabilities: EconomyCapabilities = CURRENT_CAPABILITIES): void {
  const forbidden = (['transfer', 'redeem', 'deposit', 'withdrawal'] as const)
    .filter(key => capabilities[key]);
  if (forbidden.length > 0) {
    throw new Error(
      `Poker refuses to start: the product ships as ${active.productDescriptor} with a `
      + `"no monetary value" notice, but these economy capabilities are enabled: ${forbidden.join(', ')}. `
      + 'Complete docs/poker/11-legal-compliance-checklist.md before changing this.',
    );
  }
}
