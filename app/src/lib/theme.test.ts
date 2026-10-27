import { describe, expect, it } from "vitest";
import { parseTheme, THEME_INIT_SCRIPT, THEME_STORAGE_KEY } from "./theme";

describe("parseTheme", () => {
  it("acepta los temas conocidos", () => {
    expect(parseTheme("light")).toBe("light");
    expect(parseTheme("dark")).toBe("dark");
    expect(parseTheme("system")).toBe("system");
  });

  it("usa el del sistema para cualquier otra cosa", () => {
    expect(parseTheme(null)).toBe("system");
    expect(parseTheme("blue")).toBe("system");
  });
});

describe("THEME_INIT_SCRIPT", () => {
  it("lee la misma clave que guarda el selector", () => {
    expect(THEME_INIT_SCRIPT).toContain(`"${THEME_STORAGE_KEY}"`);
  });
});
