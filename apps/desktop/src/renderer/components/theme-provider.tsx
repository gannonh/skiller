import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Theme = "dark" | "light";

type ThemeProviderState = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
};

const ThemeProviderContext = createContext<ThemeProviderState | null>(null);

export function ThemeProvider({
  children,
  defaultTheme = "light",
  storageKey = "skiller-theme",
}: {
  children: ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
}) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const storedTheme = localStorage.getItem(storageKey);
    return storedTheme === "dark" || storedTheme === "light" ? storedTheme : defaultTheme;
  });

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(theme);
  }, [theme]);

  function setTheme(nextTheme: Theme) {
    localStorage.setItem(storageKey, nextTheme);
    setThemeState(nextTheme);
  }

  return (
    <ThemeProviderContext.Provider
      value={{
        theme,
        setTheme,
        toggleTheme: () => setTheme(theme === "dark" ? "light" : "dark"),
      }}
    >
      {children}
    </ThemeProviderContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeProviderContext);
  if (!context) throw new Error("useTheme must be used within a ThemeProvider");
  return context;
}
