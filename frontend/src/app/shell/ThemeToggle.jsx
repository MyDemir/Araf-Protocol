import React from 'react';
import { useThemeMode } from '../providers/ThemeProvider';

// [TR] Dar kenar çubuğunda metin "Sy" diye kesiliyordu; ikon seçenekleri tam sığar. Erişilebilir ad aria-label'da.
// [EN] Text got clipped to "Sy" in the slim rail; icon options fit. The accessible name lives in aria-label.
const OPTIONS = [
  { value: 'system', icon: '🖥️', title: 'System' },
  { value: 'day', icon: '☀️', title: 'Day' },
  { value: 'night', icon: '🌙', title: 'Night' },
];

export const ThemeToggle = () => {
  const { themeMode, setThemeMode } = useThemeMode();
  const current = OPTIONS.find((o) => o.value === themeMode) || OPTIONS[0];
  return (
    <select
      aria-label="Theme mode"
      title={`Theme: ${current.title}`}
      value={themeMode}
      onChange={(e) => setThemeMode(e.target.value)}
      className="w-10 h-10 appearance-none text-center text-base bg-surface border border-borderSubtle rounded-xl cursor-pointer hover:bg-elevated focus:outline-none focus:ring-1 focus:ring-brand"
    >
      {OPTIONS.map((o) => (
        <option key={o.value} value={o.value} title={o.title}>{o.icon}</option>
      ))}
    </select>
  );
};

export default ThemeToggle;
