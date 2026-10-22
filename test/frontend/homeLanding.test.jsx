import fs from 'fs';
import path from 'path';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../frontend/src/components/PIIDisplay', () => ({ default: () => null }));
vi.mock('../../frontend/src/components/SettlementProposalCard', () => ({ default: () => null }));

import { buildAppViews } from '../../frontend/src/app/AppViews';
import { getHomeContent, HOME_VIDEO_EMBED_URL, HOME_VIDEO_ID, HOME_VIDEO_URL } from '../../frontend/src/app/homeContent';

afterEach(() => cleanup());

const baseCtx = (extra = {}) => ({
  lang: 'EN',
  setLang: vi.fn(),
  currentView: 'home',
  setCurrentView: vi.fn(),
  // [TR] openCreateOrder AppViews içinde türetilir: oturum varsa handleOpenMakerModal, yoksa handleAuthAction.
  //      newTxBlocked = isPaused || txGate.blocked.
  isConnected: true,
  isAuthenticated: true,
  handleOpenMakerModal: vi.fn(),
  handleAuthAction: vi.fn(),
  isPaused: false,
  protocolStats: null,
  statsLoading: false,
  statsError: false,
  fetchStats: vi.fn(),
  protocolFeeConfig: null,
  activeEscrows: [],
  activeEscrowCounts: { LOCKED: 0, PAID: 0, CHALLENGED: 0 },
  SUPPORTED_TOKEN_ADDRESSES: {},
  tokenDecimalsMap: {},
  isSupportedChainId: () => true,
  formatAddress: (a) => String(a),
  chainFallback: { active: false },
  ...extra,
});

const renderHome = (extra) => {
  const ctx = baseCtx(extra);
  render(<div>{buildAppViews(ctx).renderHome()}</div>);
  return ctx;
};

describe('Ana sayfa (tanıtım)', () => {
  it('EN: hero, tüm bölümler ve korunan testid’ler görünür', () => {
    renderHome();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('It makes dishonesty expensive.');
    for (const id of ['home-hero', 'home-stats', 'home-about', 'home-video', 'home-philosophy', 'home-features', 'home-how-it-works', 'home-faq']) {
      expect(screen.getByTestId(id)).toBeInTheDocument();
    }
    expect(screen.getByText('Trust the Time, Not the Oracle.', { selector: 'h2' })).toBeInTheDocument();
    expect(within(screen.getByTestId('home-features')).getAllByRole('listitem')).toHaveLength(getHomeContent('EN').features.items.length);
  });

  it('TR: Türkçe metin ve karakterler doğru', () => {
    renderHome({ lang: 'TR' });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Dürüstsüzlüğü pahalıya mal eder.');
    expect(screen.getByText('Zamana Güven, Hakeme Değil.', { selector: 'h2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Pazara git/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Emir oluştur' })).toBeInTheDocument();
    expect(screen.getByText('Sık sorulanlar')).toBeInTheDocument();
  });

  it('düğme davranışı aynı: pazar, emir oluştur ve newTxBlocked kilidi', async () => {
    const user = userEvent.setup();
    const ctx = renderHome();
    await user.click(screen.getByRole('button', { name: /Open market/ }));
    expect(ctx.setCurrentView).toHaveBeenCalledWith('market');
    await user.click(screen.getByRole('button', { name: '+ Create order' }));
    expect(ctx.handleOpenMakerModal).toHaveBeenCalledTimes(1);
    cleanup();
    const guest = renderHome({ isAuthenticated: false });
    await user.click(screen.getByRole('button', { name: '+ Create order' }));
    expect(guest.handleAuthAction).toHaveBeenCalledTimes(1);
    expect(guest.handleOpenMakerModal).not.toHaveBeenCalled();
    cleanup();
    const blocked = renderHome({ isPaused: true });
    const create = screen.getByRole('button', { name: '+ Create order' });
    expect(create).toBeDisabled();
    await user.click(create);
    expect(blocked.handleOpenMakerModal).not.toHaveBeenCalled();
    cleanup();
    renderHome({ txGate: { blocked: true } });
    expect(screen.getByRole('button', { name: '+ Create order' })).toBeDisabled();
  });

  it('video: yeni sekmede açan poster, iframe yok, URL tek sabitte', () => {
    renderHome();
    const link = screen.getByTestId('home-video');
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href', HOME_VIDEO_URL);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel').split(' ')).toEqual(expect.arrayContaining(['noopener', 'noreferrer']));
    expect(link).toHaveAccessibleName(/Vimeo/);
    expect(document.querySelector('iframe')).toBeNull();
    expect(document.querySelector('img')).toBeNull();
    expect(HOME_VIDEO_URL).toBe(`https://vimeo.com/${HOME_VIDEO_ID}`);
    expect(HOME_VIDEO_EMBED_URL).toBe(`https://player.vimeo.com/video/${HOME_VIDEO_ID}?dnt=1`);
  });

  it('istatistik yokken tire, hata varken tekrar dene fetchStats çağırır', async () => {
    const user = userEvent.setup();
    const ctx = renderHome({ statsError: true });
    expect(within(screen.getByTestId('home-stats')).getAllByText('—').length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(ctx.fetchStats).toHaveBeenCalledTimes(1);
  });

  it('yedek mod paneli yalnız aktifken görünür', () => {
    renderHome();
    expect(screen.queryByTestId('chain-fallback-panel')).not.toBeInTheDocument();
    cleanup();
    renderHome({ chainFallback: { active: true, trades: [], loading: false, loadedAt: 1, submitManualId: vi.fn(), openTrade: vi.fn() } });
    expect(screen.getByTestId('chain-fallback-panel')).toBeInTheDocument();
  });

  it('metinde abartılı ya da yanlış güvence iddiası yok; testnet/denetimsiz notu var', () => {
    for (const lang of ['TR', 'EN']) {
      const json = JSON.stringify(getHomeContent(lang));
      expect(json).not.toMatch(/risksiz|risk[- ]free|denetlendi|denetimden geçti|audited by|is audited|guarantee|garanti/i);
    }
    renderHome();
    expect(screen.getByTestId('home-status-note')).toHaveTextContent(/not externally audited/);
  });
});

// [TR] Metindeki sayılar kontrat sabitlerinden sapmasın. [EN] Copy numbers must match the contract constants.
describe('ana sayfa metni ↔ ArafEscrow sabitleri', () => {
  const sol = fs.readFileSync(path.resolve(process.cwd(), '../contracts/src/ArafEscrow.sol'), 'utf8');
  const hours = (name) => Number(sol.match(new RegExp(`${name}\\s*=\\s*(\\d+)\\s*hours`))[1]);
  const bps = (name) => Number(sol.match(new RegExp(`${name}\\s*=\\s*([\\d_]+)\\s*;`))[1].replace(/_/g, ''));

  it('süreler ve oranlar', () => {
    const payment = hours('PAYMENT_WINDOW');
    const grace = hours('GRACE_PERIOD');
    const principalStart = grace + hours('USDT_DECAY_START');
    const maxBleed = hours('MAX_BLEEDING');
    const penaltyPct = bps('AUTO_RELEASE_PENALTY_BPS') / 100;
    expect([payment, grace, principalStart, maxBleed, penaltyPct]).toEqual([48, 48, 144, 240, 2]);
    expect(sol).toMatch(/t\.pingedAt \+ 24 hours/);

    const tr = getHomeContent('TR');
    const en = getHomeContent('EN');
    expect(tr.philosophy.bleed.map((s) => [s.from, s.to])).toEqual([[0, grace], [grace, principalStart], [principalStart, maxBleed]]);
    expect(en.philosophy.bleed.map((s) => [s.from, s.to])).toEqual(tr.philosophy.bleed.map((s) => [s.from, s.to]));
    const feat = (c, k) => c.features.items.find((i) => i.key === k).text;
    expect(feat(tr, 'window')).toContain(`${payment} saat`);
    expect(feat(en, 'window')).toContain(`${payment} hours`);
    expect(feat(tr, 'window')).toContain(`%${penaltyPct}`);
    expect(feat(en, 'window')).toContain(`${penaltyPct}%`);
    expect(feat(tr, 'bleed')).toContain(`${principalStart}.`);
    expect(feat(tr, 'bleed')).toContain(`${maxBleed}.`);
    expect(feat(en, 'bleed')).toContain(`hour ${maxBleed}`);
  });

  it('teminat aralığı ve tier sayısı', () => {
    const maker = [0, 1, 2, 3, 4].map((t) => bps(`MAKER_BOND_TIER${t}_BPS`) / 100);
    const taker = [0, 1, 2, 3, 4].map((t) => bps(`TAKER_BOND_TIER${t}_BPS`) / 100);
    expect(sol).toMatch(/if \(_tier > 4\) revert InvalidTier\(\)/);
    const tr = getHomeContent('TR').features.items.find((i) => i.key === 'bond').text;
    expect(tr).toContain(`%${Math.min(...maker)}–${Math.max(...maker)}`);
    expect(tr).toContain(`%${Math.min(...taker)}–${Math.max(...taker)}`);
    expect(bps('GOOD_REP_DISCOUNT_BPS')).toBe(100);
    expect(bps('BAD_REP_PENALTY_BPS')).toBe(300);
  });

  it('duraklatma yalnız emir oluşturma ve eşleşmede; çekme/kurtarma fonksiyonu yok', () => {
    const paused = [...sol.matchAll(/function (\w+)\([^)]*\)[^{;]*whenNotPaused/gs)].map((m) => m[1]).sort();
    expect(paused).toEqual(['createBuyOrder', 'createSellOrder', 'fillBuyOrder', 'fillSellOrder']);
    const fns = [...sol.matchAll(/function (\w+)\s*\(/g)].map((m) => m[1]);
    expect(fns.filter((f) => /withdraw|rescue|sweep|emergency/i.test(f))).toEqual(['withdrawSettlement']);
  });
});
