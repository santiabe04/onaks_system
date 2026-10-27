"use client";

import { useSyncExternalStore } from "react";
import {
  DEFAULT_THEME,
  parseTheme,
  THEME_STORAGE_KEY,
  THEMES,
  type Theme,
} from "@/lib/theme";

const CHANGE_EVENT = "onaks-theme-change";

function readTheme(): Theme {
  try {
    return parseTheme(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return DEFAULT_THEME;
  }
}

// Se escucha también `storage`: un cambio en otra pestaña se refleja acá.
function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function applyTheme(theme: Theme) {
  try {
    if (theme === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Sin localStorage el cambio vale solo hasta recargar.
  }
  if (theme === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function ThemeSelector({
  labels,
}: {
  labels: Record<Theme, string> & { title: string };
}) {
  // En el server no hay preferencia: se renderiza "system" y se corrige al hidratar.
  const theme = useSyncExternalStore(subscribe, readTheme, () => DEFAULT_THEME);

  return (
    <div
      role="radiogroup"
      aria-label={labels.title}
      className="inline-flex rounded border border-current/20 p-0.5 text-xs"
    >
      {THEMES.map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={theme === option}
          onClick={() => applyTheme(option)}
          className={`rounded px-2 py-1 ${
            theme === option
              ? "bg-foreground text-background"
              : "opacity-70 hover:opacity-100"
          }`}
        >
          {labels[option]}
        </button>
      ))}
    </div>
  );
}
