import React from 'react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { buildAppViews } from '../../frontend/src/app/AppViews';

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

const baseCtx = {
  lang: 'EN',
  isConnected: true,
  isAuthenticated: false,
  authChecked: true,
  isAdmin: null,
  address: '0xabc',
  activeEscrows: [],
  setCurrentView: vi.fn(),
  handleAuthAction: vi.fn(),
  toggleSidebar: vi.fn(),
  formatAddress: (a) => a,
};

const renderHint = (over = {}) => {
  const views = buildAppViews({ ...baseCtx, ...over });
  return render(<div>{views.renderAdminHint()}</div>);
};

describe('admin hint (visible text, UX only)', () => {
  it('connected but not signed in: no admin hint in production (does not reveal admin panel)', () => {
    vi.stubEnv('DEV', false);
    renderHint();
    expect(screen.queryByTestId('admin-hint')).toBeNull();
    expect(document.body.textContent).not.toMatch(/admin panel|yönetim paneli|not signed in|oturum açıl/i);
  });

  it('connected but not signed in: no admin hint in development either', () => {
    vi.stubEnv('DEV', true);
    renderHint();
    expect(screen.queryByTestId('admin-hint')).toBeNull();
  });

  it('signed in as non-admin: setting name is NOT shown in production', () => {
    vi.stubEnv('DEV', false);
    renderHint({ isAuthenticated: true, isAdmin: false });
    expect(screen.queryByTestId('admin-hint')).toBeNull();
    expect(document.body.textContent).not.toMatch(/ADMIN_WALLETS/);
  });

  it('signed in as non-admin: dev hint only in development', () => {
    vi.stubEnv('DEV', true);
    renderHint({ isAuthenticated: true, isAdmin: false });
    expect(screen.getByTestId('admin-hint')).toHaveTextContent(/ADMIN_WALLETS/);
  });

  it('no hint for admins, while auth is unchecked, or when disconnected', () => {
    vi.stubEnv('DEV', true);
    renderHint({ isAuthenticated: true, isAdmin: true });
    expect(screen.queryByTestId('admin-hint')).toBeNull();
    cleanup();
    renderHint({ authChecked: false });
    expect(screen.queryByTestId('admin-hint')).toBeNull();
    cleanup();
    renderHint({ isConnected: false });
    expect(screen.queryByTestId('admin-hint')).toBeNull();
  });
});
