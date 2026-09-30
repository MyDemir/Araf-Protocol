import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { orderSide as orderSideCopy, pii, states as stateCopy, tradeTerms, getPiiCopy, getStateLabel, getTradeTerm } from '../../frontend/src/app/copy';
import { getOrderSideCopy } from '../../frontend/src/app/orderUiModel';

describe('copy dictionaries', () => {
  afterEach(() => cleanup());
  it('every state key has TR and EN', () => {
    Object.keys(stateCopy).forEach((key) => {
      expect(stateCopy[key].TR).toBeTruthy();
      expect(stateCopy[key].EN).toBeTruthy();
    });
  });

  it('orderSide SELL_CRYPTO and BUY_CRYPTO do not return raw enum as user-facing label', () => {
    expect(getOrderSideCopy('SELL_CRYPTO', 'display', 'EN')).not.toBe('SELL_CRYPTO');
    expect(getOrderSideCopy('BUY_CRYPTO', 'display', 'EN')).not.toBe('BUY_CRYPTO');
  });

  it('state copy helper covers active-trade filter states while preserving raw keys for internal state', () => {
    ['ALL', 'LOCKED', 'PAID', 'CHALLENGED'].forEach((stateKey) => {
      expect(stateCopy).toHaveProperty(stateKey);
      expect(getStateLabel(stateKey, 'EN')).toBeTruthy();
      expect(getStateLabel(stateKey, 'TR')).toBeTruthy();
      expect(getStateLabel(stateKey, 'EN')).not.toBe(stateKey);
      expect(getStateLabel(stateKey, 'TR')).not.toBe(stateKey);
    });

    expect(getStateLabel('ALL', 'EN')).toBe('All');
    expect(getStateLabel('ALL', 'TR')).toBe('Tümü');
    expect(getStateLabel('LOCKED', 'EN')).toBe('Locked');
    expect(getStateLabel('PAID', 'EN')).toBe('Payment Reported');
    expect(getStateLabel('CHALLENGED', 'TR')).toBe('İtiraz Süreci');
    expect(getStateLabel('LOCKED', 'EN', 'descriptive')).toBe('Locked Trade');

    // Unknown/internal state keys intentionally remain available as fallback values.
    expect(getStateLabel('UNKNOWN_STATE', 'EN')).toBe('UNKNOWN_STATE');
  });


  it('keeps Turkish user-facing copy free of selected mixed English technical leftovers', () => {
    const forbidden = /(?:\bORDER\b|\bOrder\b|Grace period|Bleeding escrow|\bRelease\b|\bBurn\b|Settlement|Auto-release)/;
    const dictionaries = [orderSideCopy, tradeTerms];
    dictionaries.forEach((dictionary) => {
      Object.entries(dictionary).forEach(([key, row]) => {
        expect(row.TR, key).not.toMatch(forbidden);
      });
    });

    const tradeDecisionSource = fs.readFileSync(path.resolve(process.cwd(), 'src/app/contexts/trade-room/tradeDecisionModel.js'), 'utf8');
    const trStringMatches = tradeDecisionSource.match(/TR:\s*'[^']*'/g) || [];
    trStringMatches.forEach((match) => expect(match).not.toMatch(forbidden));
  });

  it('missing key fails safely with fallback', () => {
    expect(getTradeTerm('missing_term', 'EN')).toBe('missing_term');
  });

  it('copy index exports PII helper copy in its language-bucket shape', () => {
    expect(pii.en.sectionTitle).toBe('Secure payment details');
    expect(getPiiCopy('EN').revealBtn).toMatch(/Reveal secure payment details/i);
  });

});
