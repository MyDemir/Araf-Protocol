import { Briefcase, Compass, House, Radar, Store, UserRound } from 'lucide-react';

// [TR] Uygulama görünümlerinin tek kaynağı: anahtar, ikon, uzun/kısa etiket, oturum şartı ve aktif renk.
//      Masaüstü ray, mobil alt menü ve App'in oturum yönlendirmesi buradan okur (önceden 3 ayrı kopyaydı).
// [EN] Single source for app views: key, icon, long/short label, session requirement and active tone.
//      The desktop rail, mobile nav and App's session redirect all read from here.
export const VIEW_REGISTRY = {
  home: { icon: House, label: { TR: 'Ana Sayfa', EN: 'Home' }, shortLabel: { TR: 'Ana', EN: 'Home' }, requiresAuth: false, tone: 'text-textPrimary' },
  market: { icon: Store, label: { TR: 'Pazar Yeri', EN: 'Marketplace' }, shortLabel: { TR: 'Pazar', EN: 'Market' }, requiresAuth: false, tone: 'text-textPrimary' },
  operations: { icon: Radar, label: { TR: 'İşlem Takip Merkezi', EN: 'Operations Center' }, shortLabel: { TR: 'Takip', EN: 'Track' }, requiresAuth: true, tone: 'text-info' },
  admin: { icon: Compass, label: { TR: 'Admin', EN: 'Admin' }, shortLabel: { TR: 'Admin', EN: 'Admin' }, requiresAuth: true, tone: 'text-success', adminOnly: true },
  tradeRoom: { icon: Briefcase, label: { TR: 'İşlem Odası', EN: 'Trade Room' }, shortLabel: { TR: 'İşlem', EN: 'Trade' }, requiresAuth: true, tone: 'text-warning' },
  profile: { icon: UserRound, label: { TR: 'Profil Merkezi', EN: 'Profile Center' }, shortLabel: { TR: 'Profil', EN: 'Profile' }, requiresAuth: true, tone: 'text-success' },
};

// [TR] Yüzey başına sıra (mobilde başparmak erişimi için İşlem/Takip öne alınır). [EN] Per-surface order.
export const NAV_ORDER = {
  rail: ['home', 'market', 'operations', 'admin', 'tradeRoom', 'profile'],
  mobile: ['home', 'market', 'tradeRoom', 'operations', 'admin', 'profile'],
};

export const SESSION_ONLY_VIEWS = new Set(Object.keys(VIEW_REGISTRY).filter((key) => VIEW_REGISTRY[key].requiresAuth));

// [TR] Admin girişi ayrı kapıyla (canSeeAdminEntry), diğer oturum görünümleri navUnlocked ile açılır.
export const isViewInNav = (key, { navUnlocked, canSeeAdminEntry }) => {
  const view = VIEW_REGISTRY[key];
  if (!view) return false;
  if (view.adminOnly) return Boolean(canSeeAdminEntry);
  return !view.requiresAuth || Boolean(navUnlocked);
};
