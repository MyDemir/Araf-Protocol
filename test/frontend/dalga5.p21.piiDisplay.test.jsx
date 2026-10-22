import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PIIDisplay, { maskContact } from '../../frontend/src/components/PIIDisplay';

// F2-20: usePII artik authenticatedFetch ister; sahte sarmalayici global.fetch mock'una devreder (cagri sayisi/URL iddialari ayni).
const authFetch = (...args) => global.fetch(...args);

const mockFetch = (profile) => {
  global.fetch = vi.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ piiToken: 'tok' }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ payoutProfile: profile }) });
};
const reveal = async (user) => user.click(screen.getByRole('button', { name: /Reveal/i }));

beforeEach(() => { vi.restoreAllMocks(); });
afterEach(() => { cleanup(); delete document.execCommand; });

describe('F4-16: PII ekranı', () => {
  it('maskContact hedefi kısmen gizler', () => {
    expect(maskContact('email', 'alice@example.com')).toBe('al***@example.com');
    expect(maskContact('phone', '+90 532 111 22 33')).toBe('***233');
    expect(maskContact('telegram', '@alice_trader')).toBe('@al***');
    expect(maskContact('email', '')).toBeNull();
  });

  it('güvenli bağlam dışında belgelenen execCommand yedeği kullanılır', async () => {
    Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true });
    document.execCommand = vi.fn(() => true);
    mockFetch({ rail: 'TR_IBAN', fields: { account_holder_name: 'Ada', iban: 'TR00 1111' } });
    const user = userEvent.setup();
    render(<PIIDisplay tradeId="t1" lang="EN" authenticatedFetch={authFetch} />);
    await reveal(user);
    await waitFor(() => expect(screen.getByText('Ada')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /Copy IBAN/i }));
    expect(document.execCommand).toHaveBeenCalledWith('copy');
    expect(screen.getByRole('button', { name: /Copied/i })).toBeInTheDocument();
  });

  it('iletişim hedefi maskeli gösterilir (ham değer ekrana yazılmaz)', async () => {
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
    mockFetch({ rail: 'TR_IBAN', fields: { account_holder_name: 'Ada', iban: 'TR00 1111' }, contact: { channel: 'email', value: 'alice@example.com' } });
    const user = userEvent.setup();
    render(<PIIDisplay tradeId="t1" lang="EN" authenticatedFetch={authFetch} />);
    await reveal(user);
    await waitFor(() => expect(screen.getByText('Ada')).toBeInTheDocument());
    expect(screen.getByTestId('pii-contact-masked')).toHaveTextContent('al***@example.com');
    expect(document.body.textContent).not.toContain('alice@example.com');
  });
});
