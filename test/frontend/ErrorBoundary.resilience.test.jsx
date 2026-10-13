import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ErrorBoundary from '../../frontend/src/components/ErrorBoundary';
import * as apiConfig from '../../frontend/src/app/apiConfig';

const Boom = ({ message = 'kaboom' }) => { throw new Error(message); };

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('ErrorBoundary resilience', () => {
  it('section scope: only the failing section shows fallback, siblings stay rendered', () => {
    render(
      <div>
        <nav>rail</nav>
        <ErrorBoundary scope="section"><Boom /></ErrorBoundary>
        <footer>status-bar</footer>
      </div>,
    );
    expect(screen.getByTestId('section-error-fallback')).toBeInTheDocument();
    expect(screen.getByText('rail')).toBeInTheDocument();
    expect(screen.getByText('status-bar')).toBeInTheDocument();
  });

  it('section scope with fallback={null} disappears silently', () => {
    const { container } = render(<ErrorBoundary scope="section" fallback={null}><Boom /></ErrorBoundary>);
    expect(container).toBeEmptyDOMElement();
  });

  it('resetKeys change recovers the section', () => {
    let fail = true;
    const Maybe = () => (fail ? <Boom /> : <p>ok-view</p>);
    const { rerender } = render(<ErrorBoundary scope="section" resetKeys={['market']}><Maybe /></ErrorBoundary>);
    expect(screen.getByTestId('section-error-fallback')).toBeInTheDocument();
    fail = false;
    rerender(<ErrorBoundary scope="section" resetKeys={['home']}><Maybe /></ErrorBoundary>);
    expect(screen.getByText('ok-view')).toBeInTheDocument();
  });

  it('Retry button re-renders children', async () => {
    let fail = true;
    const Maybe = () => (fail ? <Boom /> : <p>back</p>);
    render(<ErrorBoundary scope="section"><Maybe /></ErrorBoundary>);
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: /Retry/ }));
    expect(screen.getByText('back')).toBeInTheDocument();
  });

  it('chunk load failure offers only reload', () => {
    const Chunk = () => { throw new TypeError('Failed to fetch dynamically imported module: /assets/x.js'); };
    render(<ErrorBoundary scope="section"><Chunk /></ErrorBoundary>);
    expect(screen.queryByRole('button', { name: /Retry/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Reload/ })).toBeInTheDocument();
  });

  it('root boundary survives an API policy violation thrown while logging (no white screen)', () => {
    vi.spyOn(apiConfig, 'resolveClientErrorLogUrl').mockImplementation(() => {
      throw new Error('Production API policy violation');
    });
    render(<ErrorBoundary><Boom /></ErrorBoundary>);
    expect(screen.getByText('Sistemde Kesinti Oluştu')).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
});
