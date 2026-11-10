// Browser theme preference (localStorage). "system" stores nothing in
// <html>: the styles follow `prefers-color-scheme`.

export const THEMES = ["light", "dark", "system"] as const;
export type Theme = (typeof THEMES)[number];
export const DEFAULT_THEME: Theme = "system";

export const THEME_STORAGE_KEY = "onaks-theme";

export function parseTheme(value: unknown): Theme {
  return THEMES.includes(value as Theme) ? (value as Theme) : DEFAULT_THEME;
}

/**
 * Runs in <head> before the first paint, so a page with a forced theme does not
 * flicker with the system's. try/catch: localStorage may be blocked.
 */
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;
