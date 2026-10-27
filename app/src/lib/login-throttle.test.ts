import { describe, expect, it } from "vitest";
import {
  LOCK_WINDOW_MS,
  lockedUntil,
  minutesUntil,
  pickLock,
} from "./login-throttle";

const now = new Date("2026-10-27T15:00:00Z");
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);

describe("lockedUntil", () => {
  it("no bloquea con menos fallos que el máximo", () => {
    expect(lockedUntil([minutesAgo(1), minutesAgo(2)], 5, now)).toBeNull();
  });

  it("bloquea hasta que el fallo que completó el máximo sale de la ventana", () => {
    const failures = [1, 2, 3, 4, 5].map(minutesAgo);
    expect(lockedUntil(failures, 5, now)).toEqual(
      new Date(minutesAgo(5).getTime() + LOCK_WINDOW_MS),
    );
  });

  it("se libera solo a los 15 minutos", () => {
    const failures = [15, 16, 17, 18, 19].map(minutesAgo);
    expect(lockedUntil(failures, 5, now)).toBeNull();
  });

  it("con más fallos de los necesarios cuenta los más recientes", () => {
    const failures = [1, 2, 3, 4, 5, 6].map(minutesAgo);
    expect(lockedUntil(failures, 5, now)).toEqual(
      new Date(minutesAgo(5).getTime() + LOCK_WINDOW_MS),
    );
  });
});

describe("pickLock", () => {
  const soon = new Date(now.getTime() + 60_000);
  const later = new Date(now.getTime() + 600_000);

  it("sin bloqueos devuelve null", () => {
    expect(pickLock(null, null)).toBeNull();
  });

  it("usa el que dura más", () => {
    expect(pickLock(soon, later)).toEqual({ scope: "mail", until: later });
    expect(pickLock(later, soon)).toEqual({ scope: "mail_ip", until: later });
  });

  it("acepta uno solo", () => {
    expect(pickLock(soon, null)).toEqual({ scope: "mail_ip", until: soon });
    expect(pickLock(null, soon)).toEqual({ scope: "mail", until: soon });
  });
});

describe("minutesUntil", () => {
  it("redondea para arriba y nunca da cero", () => {
    expect(minutesUntil(new Date(now.getTime() + 61_000), now)).toBe(2);
    expect(minutesUntil(new Date(now.getTime() + 1_000), now)).toBe(1);
    expect(minutesUntil(now, now)).toBe(1);
  });
});
