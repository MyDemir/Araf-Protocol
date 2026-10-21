// [TR] Tarayıcı depolamasına güvenli erişim: engelli/kota dolu/SSR durumlarında istisna fırlatmaz, varsayılan döner.
// [EN] Safe browser-storage access: never throws when storage is blocked, full or absent (SSR); returns a default.
const resolve = (kind) => {
  try {
    if (typeof window === 'undefined') return null;
    return kind === 'session' ? window.sessionStorage : window.localStorage;
  } catch {
    return null;
  }
};

export const createSafeStorage = (kind = 'local') => ({
  get(key, fallback = null) {
    try {
      const store = resolve(kind);
      if (!store) return fallback;
      const value = store.getItem(key);
      return value === null || value === undefined ? fallback : value;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      const store = resolve(kind);
      if (!store) return false;
      store.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  },
  remove(key) {
    try {
      const store = resolve(kind);
      if (!store) return false;
      store.removeItem(key);
      return true;
    } catch {
      return false;
    }
  },
});

export const safeStorage = createSafeStorage('local');
export const safeSessionStorage = createSafeStorage('session');
