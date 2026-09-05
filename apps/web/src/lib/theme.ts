export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "factory-theme";

export function resolveTheme(
  savedTheme: string | null,
  systemPrefersDark: boolean,
): Theme {
  if (savedTheme === "light" || savedTheme === "dark") return savedTheme;
  return systemPrefersDark ? "dark" : "light";
}

export function oppositeTheme(theme: Theme): Theme {
  return theme === "dark" ? "light" : "dark";
}
