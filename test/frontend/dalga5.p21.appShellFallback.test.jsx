import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

vi.mock('../../frontend/src/app/shell/SystemStatusBar', () => ({
  SystemStatusBar: () => { throw new Error('boom: secret detail'); },
}));

import AppShell from '../../frontend/src/app/shell/AppShell';

afterEach(() => cleanup());

// [TR] F4-10: durum bandı çökerse kritik uyarılar sessizce kaybolmamalı; sade, ayrıntısız bir satır görünür.
describe('F4-10: AppShell durum bandı fallback', () => {
  it('band çökünce hata ayrıntısız bir uyarı satırı gösterir, içerik açık kalır', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<AppShell status={{ lang: 'TR' }} outlet={<main data-testid="out">x</main>} />);
    const alert = screen.getByTestId('system-status-fallback');
    expect(alert).toHaveAttribute('role', 'alert');
    expect(alert.textContent).toMatch(/Sistem durumu görüntülenemiyor/);
    expect(alert.textContent).not.toMatch(/boom|secret/);
    expect(screen.getByTestId('out')).toBeInTheDocument();
    spy.mockRestore();
  });

  it('EN dilinde İngilizce metin', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<AppShell status={{ lang: 'EN' }} />);
    expect(screen.getByTestId('system-status-fallback').textContent).toMatch(/System status unavailable/);
    spy.mockRestore();
  });
});
