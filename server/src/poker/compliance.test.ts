import { test } from 'node:test';
import { strict as assert } from 'assert';
import { assertSocialOnly, complianceFacts, getCompliance, setCompliance, DEFAULT_COMPLIANCE } from './compliance.js';
import { CURRENT_CAPABILITIES, DisabledEconomyProvider, EconomyDisabledError } from '../future-economy/EconomyProvider.js';

test('the shipped configuration is social-only', () => {
  assert.equal(CURRENT_CAPABILITIES.transfer, false);
  assert.equal(CURRENT_CAPABILITIES.redeem, false);
  assert.equal(CURRENT_CAPABILITIES.deposit, false);
  assert.equal(CURRENT_CAPABILITIES.withdrawal, false);
  assert.doesNotThrow(() => assertSocialOnly());
});

test('the boot check refuses to run with any money-shaped capability on', () => {
  for (const key of ['transfer', 'redeem', 'deposit', 'withdrawal'] as const) {
    assert.throws(
      () => assertSocialOnly({ ...CURRENT_CAPABILITIES, [key]: true }),
      new RegExp(key),
      `enabling ${key} must stop the server, not just change a screen`,
    );
  }
});

test('the notice is configurable but the facts are not claims a config can soften', () => {
  const edited = setCompliance({ termsUrl: 'https://example.com/terms', minimumAge: 18 });
  assert.equal(edited.termsUrl, 'https://example.com/terms');
  assert.equal(getCompliance().minimumAge, 18);
  const facts = complianceFacts();
  assert.equal(facts.chipsHaveCashValue, false);
  assert.equal(facts.realMoneyWagering, false);
  setCompliance(DEFAULT_COMPLIANCE);
});

test('the economy provider refuses everything that would give a chip value', async () => {
  const economy = new DisabledEconomyProvider();
  assert.equal(economy.cashValue(), null);
  await assert.rejects(() => economy.transferCurrency(), EconomyDisabledError);
  await assert.rejects(() => economy.redeemCurrency(), EconomyDisabledError);
  // Gameplay grants and spends are allowed — they never leave the table.
  assert.equal(await economy.addGameplayCurrency('p1', 1000, 'buy-in'), 1000);
  assert.equal(await economy.spendGameplayCurrency('p1', 20, 'big blind'), 20);
});
