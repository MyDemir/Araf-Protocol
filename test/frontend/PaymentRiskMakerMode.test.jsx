import React from 'react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import PaymentRiskBadge from '../../frontend/src/components/PaymentRiskBadge';

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

const entry = {
  riskLevel: 'MEDIUM',
  minBondSurchargeBps: 50,
  feeSurchargeBps: 15,
  warningKey: 'W',
  description: { EN: 'Bank transfer confirmation is the user responsibility.', TR: 'Banka transferi onayı kullanıcı sorumluluğundadır.' },
};

describe('PaymentRiskBadge DEV gate', () => {
  it('does not render technical panel or button in production', () => {
    vi.stubEnv('DEV', false);
    render(<PaymentRiskBadge lang="EN" riskEntry={entry} defaultTechnicalOpen />);
    expect(screen.queryByRole('button', { name: /technical disclosure/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/minBondSurchargeBps/i)).not.toBeInTheDocument();
  });

  it('renders technical panel in DEV', () => {
    vi.stubEnv('DEV', true);
    render(<PaymentRiskBadge lang="EN" riskEntry={entry} />);
    expect(screen.getByRole('button', { name: /Show technical disclosure/i })).toBeInTheDocument();
  });
});

describe('PaymentRiskBadge maker mode', () => {
  it('shows title once, main explanation, no technical fields', () => {
    vi.stubEnv('DEV', false);
    render(<PaymentRiskBadge lang="TR" riskEntry={entry} compact showMainExplanation />);
    expect(screen.getAllByText(/Ödeme yöntemi karmaşıklığı/)).toHaveLength(1);
    expect(screen.getByText('Banka transferi onayı kullanıcı sorumluluğundadır.')).toBeVisible();
    expect(screen.queryByText(/minBondSurchargeBps/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Preview\/config only/i)).not.toBeInTheDocument();
  });

  it('keeps restricted and generic warnings visible', () => {
    render(<PaymentRiskBadge lang="EN" riskEntry={{ ...entry, riskLevel: 'RESTRICTED', enabled: false, generic: true }} compact showMainExplanation />);
    expect(screen.getAllByText(/availability config signal/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/generic/i)).toBeInTheDocument();
  });

  it('market compact does not show main explanation by default', () => {
    render(<PaymentRiskBadge lang="TR" riskEntry={entry} compact />);
    expect(screen.queryByText('Banka transferi onayı kullanıcı sorumluluğundadır.')).not.toBeInTheDocument();
  });
});
