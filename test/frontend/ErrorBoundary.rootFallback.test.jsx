import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import ErrorBoundary from '../../frontend/src/components/ErrorBoundary';

const Boom = () => { throw new Error('secret-detail 0xabc IBAN TR330006100519786457841326'); };

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('root crash screen', () => {
  it('uses theme tokens only (no hard-coded slate/blue palette) and keeps both actions', () => {
    render(<ErrorBoundary><Boom /></ErrorBoundary>);
    const root = screen.getByTestId('root-error-fallback');
    expect(root.className).toMatch(/bg-app/);
    expect(root.outerHTML).not.toMatch(/slate-|blue-|red-\d|text-white/);
    expect(screen.getByRole('alert')).toHaveTextContent('Sistemde Kesinti Oluştu');
    expect(screen.getByRole('button', { name: 'Sayfayı Yenile' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ana Sayfaya Dön' })).toBeInTheDocument();
  });

  it('never shows error detail or personal data', () => {
    render(<ErrorBoundary><Boom /></ErrorBoundary>);
    const text = screen.getByTestId('root-error-fallback').textContent;
    expect(text).not.toMatch(/secret-detail|0xabc|TR3300/);
  });

  it('reload and home actions behave as before', () => {
    const reload = vi.fn();
    const original = window.location;
    Object.defineProperty(window, 'location', { configurable: true, value: { reload, href: 'http://localhost/x' } });
    try {
      render(<ErrorBoundary><Boom /></ErrorBoundary>);
      screen.getByRole('button', { name: 'Sayfayı Yenile' }).click();
      expect(reload).toHaveBeenCalledTimes(1);
      screen.getByRole('button', { name: 'Ana Sayfaya Dön' }).click();
      expect(window.location.href).toBe('/');
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: original });
    }
  });
});
