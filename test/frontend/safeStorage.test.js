import { afterEach, describe, expect, it, vi } from 'vitest';
import { safeStorage, safeSessionStorage } from '../../frontend/src/app/safeStorage';
import { getInitialLang, getInitialThemeMode } from '../../frontend/src/app/bootstrapState';

afterEach(() => { vi.restoreAllMocks(); window.localStorage.clear(); });

const boom = () => { throw new DOMException('blocked', 'SecurityError'); };

describe('P10 safeStorage (F1-09, F4-09)', () => {
  it('normal depolamada get/set/remove çalışır, yoksa varsayılan döner', () => {
    expect(safeStorage.get('k', 'dflt')).toBe('dflt');
    expect(safeStorage.set('k', 'v')).toBe(true);
    expect(safeStorage.get('k')).toBe('v');
    expect(safeStorage.remove('k')).toBe(true);
    expect(safeStorage.get('k')).toBeNull();
    expect(safeSessionStorage.set('s', '1')).toBe(true);
  });

  it('depolama her işlemde fırlatsa da safeStorage fırlatmaz', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(boom);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(boom);
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(boom);
    expect(safeStorage.get('k', 'dflt')).toBe('dflt');
    expect(safeStorage.set('k', 'v')).toBe(false);
    expect(safeStorage.remove('k')).toBe(false);
  });

  it('depolama engelliyken başlangıç dili ve teması varsayılana döner (uygulama açılır)', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(boom);
    expect(getInitialLang()).toBe('EN');
    expect(getInitialThemeMode()).toBe('system');
  });
});
