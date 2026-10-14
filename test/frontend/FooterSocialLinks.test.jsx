import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import FooterSocialLinks from '../../frontend/src/app/shell/FooterSocialLinks';
import { sanitizeSocialLinks, validateSocialUrl, validateSocialLabel, validateSocialDraft } from '../../frontend/src/app/socialLinks';

const ENV = [{ label: 'GitHub', url: 'https://github.com/env/repo' }];
const okJson = (links) => ({ ok: true, status: 200, json: async () => ({ links }) });

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('FooterSocialLinks', () => {
  it('shows links from the public endpoint with target/rel/title(hostname)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okJson([{ label: 'X', url: 'https://x.com/araf' }, { label: 'TG', url: 'https://t.me/araf' }])));
    render(<FooterSocialLinks envLinks={ENV} />);
    await waitFor(() => expect(screen.getByRole('link', { name: 'X' })).toBeInTheDocument());
    const x = screen.getByRole('link', { name: 'X' });
    expect(x).toHaveAttribute('href', 'https://x.com/araf');
    expect(x).toHaveAttribute('target', '_blank');
    expect(x.getAttribute('rel')).toContain('noopener');
    expect(x.getAttribute('rel')).toContain('noreferrer');
    expect(x).toHaveAttribute('title', 'x.com');
    expect(screen.queryByRole('link', { name: 'GitHub' })).toBeNull();
  });

  it('falls back to env links on network error, bad status and empty list', async () => {
    for (const impl of [
      async () => { throw new Error('offline'); },
      async () => ({ ok: false, status: 503, json: async () => ({}) }),
      async () => okJson([]),
      async () => ({ ok: true, status: 200, json: async () => { throw new Error('bad json'); } }),
    ]) {
      vi.stubGlobal('fetch', vi.fn(impl));
      const { unmount } = render(<FooterSocialLinks envLinks={ENV} />);
      await waitFor(() => expect(screen.getByRole('link', { name: 'GitHub' })).toBeInTheDocument());
      await new Promise((r) => setTimeout(r, 0));
      expect(screen.getAllByRole('link')).toHaveLength(1);
      unmount();
    }
  });

  it('falls back to env on timeout without blocking', async () => {
    vi.stubGlobal('fetch', vi.fn((_url, opts) => new Promise((_res, rej) => {
      opts.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    })));
    render(<FooterSocialLinks envLinks={ENV} timeoutMs={20} />);
    expect(screen.getByRole('link', { name: 'GitHub' })).toBeInTheDocument(); // env hemen görünür
    await new Promise((r) => setTimeout(r, 60));
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('does not render invalid links from the endpoint (javascript:, http:, off-allowlist, lookalike, userinfo)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okJson([
      { label: 'JS', url: 'javascript:alert(1)' },
      { label: 'HTTP', url: 'http://x.com/a' },
      { label: 'Evil', url: 'https://evil.com/a' },
      { label: 'Look', url: 'https://evilx.com/a' },
      { label: 'Sub', url: 'https://x.com.evil.com/a' },
      { label: 'Info', url: 'https://u:p@x.com/a' },
      { label: 'Puny', url: 'https://xn--gthub-bua.com/' },
      { label: 'Good', url: 'https://github.com/ok' },
    ])));
    render(<FooterSocialLinks envLinks={ENV} />);
    await waitFor(() => expect(screen.getByRole('link', { name: 'Good' })).toBeInTheDocument());
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('never renders an unsafe env link either', () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    render(<FooterSocialLinks envLinks={[{ label: 'JS', url: 'javascript:alert(1)' }, { label: 'OK', url: 'https://github.com/a' }]} />);
    expect(screen.queryByRole('link', { name: 'JS' })).toBeNull();
    expect(screen.getByRole('link', { name: 'OK' })).toBeInTheDocument();
  });
});

describe('frontend social link validator parity', () => {
  it('rejects the same classes as the server and accepts valid hosts/subdomains', () => {
    for (const u of ['http://x.com', 'javascript:1', 'data:text/html,1', 'https://u:p@x.com', 'https://evilx.com', 'https://x.com.evil.com', 'https://xn--a.com', 'https://x.com:444', `https://x.com/${'a'.repeat(300)}`, 'https://gıthub.com']) {
      expect(validateSocialUrl(u).ok).toBe(false);
    }
    for (const u of ['https://x.com/a', 'https://www.github.com/a', 'https://t.me/a']) expect(validateSocialUrl(u).ok).toBe(true);
    expect(validateSocialLabel('a'.repeat(25)).ok).toBe(false);
    expect(validateSocialLabel('<b>').ok).toBe(false);
    expect(sanitizeSocialLinks('x')).toEqual([]);
    expect(sanitizeSocialLinks([{ label: 'A', url: 'https://x.com/a' }, { label: 'B', url: 'https://x.com/a' }])).toHaveLength(1);
    const nine = Array.from({ length: 9 }, (_, i) => ({ label: 'L', url: `https://github.com/u${i}` }));
    expect(validateSocialDraft(nine).ok).toBe(false);
    expect(sanitizeSocialLinks(nine)).toHaveLength(8);
  });
});
