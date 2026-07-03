/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const ThemeContext = createContext(null);
const storageKey = 'vync_theme';

function getInitialTheme() {
  const storedTheme = localStorage.getItem(storageKey);

  if (storedTheme === 'dark' || storedTheme === 'light') {
    return storedTheme;
  }

  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem(storageKey, theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((currentTheme) => (currentTheme === 'dark' ? 'light' : 'dark'));
  }, []);

  const value = useMemo(
    () => ({
      isDark: theme === 'dark',
      setTheme,
      theme,
      toggleTheme,
    }),
    [theme, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error('useTheme must be used inside a ThemeProvider');
  }

  return context;
}
