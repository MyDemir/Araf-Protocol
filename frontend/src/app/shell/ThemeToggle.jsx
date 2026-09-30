import { Monitor, Moon, Sun } from 'lucide-react';
import { useThemeMode } from '../providers/ThemeProvider';

// [TR] Görünen ikon, aynı boyutta şeffaf bir <select> ile örtülür: erişilebilirlik ve klavye davranışı
//      yerel select'ten gelir, görünüm ise tek tip çizgi ikondur.
// [EN] The visible icon is covered by a same-size transparent <select>: accessibility and keyboard
//      behaviour come from the native select, the look is a consistent line icon.
const OPTIONS = [
  { value: 'system', Icon: Monitor, label: 'System' },
  { value: 'day', Icon: Sun, label: 'Day' },
  { value: 'night', Icon: Moon, label: 'Night' },
];

export const ThemeToggle = () => {
  const { themeMode, setThemeMode } = useThemeMode();
  const current = OPTIONS.find((o) => o.value === themeMode) || OPTIONS[0];
  const { Icon } = current;
  return (
    <div className="relative w-10 h-10 rounded-xl border border-borderSubtle bg-surface text-textMuted hover:text-textPrimary hover:bg-elevated flex items-center justify-center" title={`Theme: ${current.label}`}>
      <Icon className="w-5 h-5" strokeWidth={1.8} aria-hidden="true" />
      <select
        aria-label="Theme mode"
        value={themeMode}
        onChange={(e) => setThemeMode(e.target.value)}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
};

export default ThemeToggle;
