import React from 'react';
import { afterEach, describe, it, expect } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PaymentRiskBadge from '../../frontend/src/components/PaymentRiskBadge';

afterEach(() => {
  cleanup();
});

const technicalRiskEntry = {
  riskLevel: 'RESTRICTED',
  minBondSurchargeBps: 50,
  feeSurchargeBps: 15,
  warningKey: 'RESTRICTED',
  enabled: false,
  source: 'onchain_snapshot',
  configVersion: 'risk-config-v3',
  snapshotBlock: 12345,
  description: { EN: 'High-friction rail.', TR: 'Zor rail.' },
};

import { paymentRailCatalogFixture } from './fixtures/paymentRailCatalog.fixture';

const highEntries = Object.fromEntries(['GB_FPS', 'BR_PIX'].map((code) => {
  const r = paymentRailCatalogFixture.find((x) => x.code === code);
  return [r.risk.warningKey, { riskLevel: r.risk.riskLevel, warningKey: r.risk.warningKey, description: r.risk.description }];
}));

describe('PaymentRiskBadge technical disclosure', () => {
  it('hides technical values until the disclosure is opened outside admin contexts', async () => {
    const user = userEvent.setup();
    render(<PaymentRiskBadge lang="EN" riskEntry={technicalRiskEntry} />);

    expect(screen.getByText('Restricted')).toBeInTheDocument();
    expect(screen.getByText(/High-friction rail/i)).toBeInTheDocument();
    expect(screen.getByText(/not a user trust score.*counterparty trust score/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Show technical disclosure/i })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(/minBondSurchargeBps/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/feeSurchargeBps/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/warningKey/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/onchain_snapshot/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/risk-config-v3/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/12345/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Show technical disclosure/i }));

    expect(screen.getByRole('button', { name: /Hide technical disclosure/i })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/minBondSurchargeBps/i)).toBeInTheDocument();
    expect(screen.getByText('50')).toBeInTheDocument();
    expect(screen.getByText(/feeSurchargeBps/i)).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();
    expect(screen.getByText(/Warning:/)).toBeInTheDocument();
    // Ham anahtar ('RESTRICTED') yerine risk açıklaması (description) gösterilir.
    expect(screen.queryByText('RESTRICTED')).not.toBeInTheDocument();
    expect(screen.getAllByText('High-friction rail.').length).toBeGreaterThan(1);
    expect(screen.getAllByText(/source/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/onchain_snapshot/i)).toBeInTheDocument();
    expect(screen.getAllByText(/config/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/risk-config-v3/i)).toBeInTheDocument();
    expect(screen.getAllByText(/snapshot/i).length).toBeGreaterThan(0);
    expect(screen.getByText('12345')).toBeInTheDocument();
    expect(screen.getByText(/Preview\/config only/i)).toBeInTheDocument();
    expect(screen.getAllByText(/availability config signal/i).length).toBeGreaterThan(0);
  });

  it('opens technical fields by default only when explicitly requested', () => {
    render(<PaymentRiskBadge lang="EN" riskEntry={technicalRiskEntry} defaultTechnicalOpen />);

    expect(screen.getByRole('button', { name: /Hide technical disclosure/i })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/minBondSurchargeBps/i)).toBeInTheDocument();
    expect(screen.getByText(/feeSurchargeBps/i)).toBeInTheDocument();
    expect(screen.getByText(/Warning:/)).toBeInTheDocument();
    expect(screen.getByText(/onchain_snapshot/i)).toBeInTheDocument();
  });

  it('new HIGH rail keys (GB_FPS, BR_PIX) never show the raw warningKey; description is used, raw key only without a description', async () => {
    const user = userEvent.setup();
    for (const [key, entry] of Object.entries(highEntries)) {
      const { unmount } = render(<PaymentRiskBadge lang="TR" riskEntry={entry} defaultTechnicalOpen />);
      expect(screen.queryByText(key)).not.toBeInTheDocument();
      expect(screen.getAllByText(entry.description.TR).length).toBeGreaterThan(1);
      unmount();
    }
    render(<PaymentRiskBadge lang="EN" riskEntry={{ riskLevel: 'HIGH', warningKey: 'SOME_NEW_KEY' }} defaultTechnicalOpen />);
    expect(screen.getByText('SOME_NEW_KEY')).toBeInTheDocument();
    expect(user).toBeTruthy();
  });
});
