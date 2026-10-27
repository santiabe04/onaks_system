// Preferencia de tema por navegador (localStorage). "system" no guarda nada en
// <html>: los estilos siguen a `prefers-color-scheme`.

export const THEMES = ["light", "dark", "system"] as const;
export type Theme = (typeof THEMES)[number];
export const DEFAULT_THEME: Theme = "system";

export const THEME_STORAGE_KEY = "onaks-theme";

export function parseTheme(value: unknown): Theme {
  return THEMES.includes(value as Theme) ? (value as Theme) : DEFAULT_THEME;
}

/**
 * Corre en <head> antes del primer paint, así una página con tema forzado no
 * parpadea con el del sistema. try/catch: localStorage puede estar bloqueado.
 */
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;
