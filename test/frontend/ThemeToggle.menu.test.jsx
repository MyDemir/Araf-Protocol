import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ThemeToggle, { computeMenuPosition } from '../../frontend/src/app/shell/ThemeToggle';
import { ThemeProvider } from '../../frontend/src/app/providers/ThemeProvider';
import { APP_THEME_STORAGE_KEY } from '../../frontend/src/app/bootstrapState';

// [TR] setThemeMode çağrılarını gözlemek için bağlam sarmalanır; son blok gerçek ThemeProvider'ı kullanır.
// [EN] The context is wrapped to observe setThemeMode calls; the last block uses the real ThemeProvider.
vi.mock('../../frontend/src/app/providers/ThemeProvider', async (importOriginal) => {
  const actual = await importOriginal();
  const React_ = (await import('react')).default;
  const spy = vi.fn();
  const Ctx = React_.createContext(null);
  const SpyProvider = ({ children, initial = 'system' }) => {
    const [themeMode, setMode] = React_.useState(initial);
    const value = React_.useMemo(() => ({
      themeMode,
      setThemeMode: (v) => { spy(v); setMode(v); },
    }), [themeMode]);
    return React_.createElement(Ctx.Provider, { value }, children);
  };
  return {
    ...actual,
    __spy: spy,
    SpyProvider,
    useThemeMode: () => React_.useContext(Ctx) || actual.useThemeMode(),
  };
});

const providerModule = await import('../../frontend/src/app/providers/ThemeProvider');
const { SpyProvider, __spy: setThemeModeSpy } = providerModule;

const renderToggle = (props = {}, initial = 'system') => render(
  <SpyProvider initial={initial}>
    <button type="button">before</button>
    <ThemeToggle {...props} />
    <button type="button">after</button>
  </SpyProvider>,
);

beforeEach(() => {
  setThemeModeSpy.mockClear();
});
afterEach(() => cleanup());

describe('ThemeToggle popover menu', () => {
  it('is a 40px menu button, not a native select', () => {
    renderToggle({ lang: 'EN' });
    expect(screen.queryByRole('combobox')).toBeNull();
    const trigger = screen.getByRole('button', { name: 'Theme: System' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger.className).toMatch(/\bw-10\b/);
    expect(trigger.className).toMatch(/\bh-10\b/);
  });

  it('opens on click with three radio items, the current one checked, and labels in Turkish', async () => {
    const user = userEvent.setup();
    renderToggle({ lang: 'TR' }, 'night');
    const trigger = screen.getByRole('button', { name: 'Tema: Gece' });
    await user.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const menu = screen.getByRole('menu', { name: 'Tema' });
    expect(trigger).toHaveAttribute('aria-controls', menu.id);
    const items = screen.getAllByRole('menuitemradio');
    expect(items.map((el) => el.textContent)).toEqual(['Sistem', 'Gündüz', 'Gece']);
    expect(screen.getByRole('menuitemradio', { name: 'Gece' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('menuitemradio', { name: 'Gündüz' })).toHaveAttribute('aria-checked', 'false');
    // [TR] Odak seçili öğeye taşınır. [EN] Focus moves to the checked item.
    expect(document.activeElement).toBe(screen.getByRole('menuitemradio', { name: 'Gece' }));
    items.forEach((el) => expect(el.className).toMatch(/\bh-10\b/));
  });

  it('selecting an item calls setThemeMode, closes the menu and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    renderToggle({ lang: 'EN' });
    await user.click(screen.getByRole('button', { name: 'Theme: System' }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Night' }));

    expect(setThemeModeSpy).toHaveBeenCalledWith('night');
    expect(screen.queryByRole('menu')).toBeNull();
    const trigger = screen.getByRole('button', { name: 'Theme: Night' });
    expect(document.activeElement).toBe(trigger);
  });

  it('supports the keyboard: Enter opens, arrows move with wrap, Space selects', async () => {
    const user = userEvent.setup();
    renderToggle({ lang: 'EN' });
    const trigger = screen.getByRole('button', { name: 'Theme: System' });
    trigger.focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(document.activeElement).toHaveAccessibleName('System');

    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toHaveAccessibleName('Day');
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(document.activeElement).toHaveAccessibleName('System');
    await user.keyboard('{ArrowUp}');
    expect(document.activeElement).toHaveAccessibleName('Night');
    await user.keyboard('{Home}');
    expect(document.activeElement).toHaveAccessibleName('System');
    await user.keyboard('{End}');
    expect(document.activeElement).toHaveAccessibleName('Night');

    await user.keyboard(' ');
    expect(setThemeModeSpy).toHaveBeenCalledWith('night');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Theme: Night' }));
  });

  it('Space on the trigger opens; ArrowUp on the trigger opens on the last item', async () => {
    const user = userEvent.setup();
    renderToggle({ lang: 'EN' });
    const trigger = screen.getByRole('button', { name: 'Theme: System' });
    trigger.focus();
    await user.keyboard(' ');
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    trigger.focus();
    await user.keyboard('{ArrowUp}');
    expect(document.activeElement).toHaveAccessibleName('Night');
  });

  it('Escape closes without changing the theme and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    renderToggle({ lang: 'EN' });
    const trigger = screen.getByRole('button', { name: 'Theme: System' });
    await user.click(trigger);
    await user.keyboard('{ArrowDown}{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(setThemeModeSpy).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes on an outside pointer press and when the trigger is clicked again', async () => {
    const user = userEvent.setup();
    renderToggle({ lang: 'EN' });
    const trigger = screen.getByRole('button', { name: 'Theme: System' });
    await user.click(trigger);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'after' }));
    expect(screen.queryByRole('menu')).toBeNull();

    await user.click(trigger);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await user.click(trigger);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(setThemeModeSpy).not.toHaveBeenCalled();
  });

  it('Tab closes the menu and hands focus back to the trigger', async () => {
    renderToggle({ lang: 'EN' });
    const trigger = screen.getByRole('button', { name: 'Theme: System' });
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Tab' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('renders the menu in a body portal so the narrow rail cannot clip it', async () => {
    const { container } = renderToggle({ lang: 'EN' });
    fireEvent.click(screen.getByRole('button', { name: 'Theme: System' }));
    const menu = screen.getByRole('menu');
    expect(container.contains(menu)).toBe(false);
    expect(menu.parentElement).toBe(document.body);
    expect(menu.style.position).toBe('fixed');
    // [TR] Giriş animasyonu reduced-motion'da CSS ile kapatılır. [EN] Entrance animation is CSS-gated by reduced motion.
    expect(menu.className).toContain('animate-menu-pop');
    await act(async () => {});
  });
});

describe('computeMenuPosition', () => {
  const menu = { width: 176, height: 170 };

  it('opens to the right of the desktop rail, bottom-aligned when the trigger sits low', () => {
    const trigger = { left: 12, right: 52, top: 640, bottom: 680 };
    const pos = computeMenuPosition(trigger, menu, { width: 1280, height: 720 });
    expect(pos.left).toBe(60);
    expect(pos.top).toBe(680 - 170);
  });

  it('opens above the trigger on a 390px phone when the right side has no room, staying on screen', () => {
    const trigger = { left: 230, right: 270, top: 760, bottom: 800 };
    const pos = computeMenuPosition(trigger, menu, { width: 390, height: 844 });
    expect(pos.left).toBe(270 - 176);
    expect(pos.top).toBe(760 - 8 - 170);
    expect(pos.left + menu.width).toBeLessThanOrEqual(390 - 8);
  });

  it('clamps inside the viewport when the trigger is near the left/top edge', () => {
    const trigger = { left: 340, right: 380, top: 4, bottom: 44 };
    const pos = computeMenuPosition(trigger, menu, { width: 390, height: 844 });
    expect(pos.left).toBeGreaterThanOrEqual(8);
    expect(pos.left + menu.width).toBeLessThanOrEqual(382);
    expect(pos.top).toBe(52);
  });
});

describe('ThemeToggle with the real ThemeProvider', () => {
  it('persists the chosen mode through the unchanged setThemeMode API', async () => {
    const user = userEvent.setup();
    window.localStorage.removeItem(APP_THEME_STORAGE_KEY);
    render(<ThemeProvider><ThemeToggle lang="EN" /></ThemeProvider>);
    await user.click(screen.getByRole('button', { name: /^Theme:/ }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Day' }));
    expect(window.localStorage.getItem(APP_THEME_STORAGE_KEY)).toBe('day');
    expect(document.documentElement.dataset.theme).toBe('day');
  });
});
