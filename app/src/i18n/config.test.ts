import { afterEach, describe, expect, it, vi } from "vitest";
import {
  appLocale,
  hasLocale,
  interpolate,
  localizePath,
  stripLocalePrefix,
} from "./config";

describe("appLocale", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("usa español si APP_LOCALE no está definido", () => {
    vi.stubEnv("APP_LOCALE", "");
    expect(appLocale()).toBe("es");
  });

  it("lee el idioma de APP_LOCALE", () => {
    vi.stubEnv("APP_LOCALE", " en ");
    expect(appLocale()).toBe("en");
  });

  it("rompe con un idioma no soportado", () => {
    vi.stubEnv("APP_LOCALE", "fr");
    expect(() => appLocale()).toThrow(/APP_LOCALE/);
  });
});

describe("hasLocale", () => {
  it("acepta solo los idiomas soportados", () => {
    expect(hasLocale("es")).toBe(true);
    expect(hasLocale("en")).toBe(true);
    expect(hasLocale("es-AR")).toBe(false);
    expect(hasLocale("")).toBe(false);
  });
});

describe("localizePath", () => {
  it("antepone el idioma", () => {
    expect(localizePath("/login", "es")).toBe("/es/login");
    expect(localizePath("/admin/measurement-units", "en")).toBe(
      "/en/admin/measurement-units",
    );
  });

  it("la raíz queda sin barra final", () => {
    expect(localizePath("/", "es")).toBe("/es");
  });
});

describe("stripLocalePrefix", () => {
  it("saca el idioma de la ruta interna", () => {
    expect(stripLocalePrefix("/es/admin/audit")).toBe("/admin/audit");
    expect(stripLocalePrefix("/en")).toBe("/");
  });

  it("deja igual las rutas públicas", () => {
    expect(stripLocalePrefix("/admin")).toBe("/admin");
    expect(stripLocalePrefix("/")).toBe("/");
    expect(stripLocalePrefix("/estado")).toBe("/estado");
  });
});

describe("interpolate", () => {
  it("reemplaza las claves", () => {
    expect(interpolate("Mínimo {min} de {max}", { min: 8, max: 72 })).toBe(
      "Mínimo 8 de 72",
    );
  });

  it("deja las claves que no recibe", () => {
    expect(interpolate("Hola {name}", {})).toBe("Hola {name}");
  });
});
