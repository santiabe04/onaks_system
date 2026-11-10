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

// The `storage` event is also listened to: a change in another tab is reflected here.
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
    // Without localStorage the change lasts only until reload.
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
  // On the server there is no preference: "system" is rendered and corrected on hydration.
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
