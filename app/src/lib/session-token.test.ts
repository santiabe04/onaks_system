import { SignJWT } from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  signSession,
  verifySession,
  type SessionPayload,
} from "./session-token";

const SECRET = "test-secret-de-al-menos-32-caracteres!!";
const payload: SessionPayload = {
  userId: "user_1",
  role: "ADMIN",
  mustChangePassword: true,
  sessionVersion: 3,
};

beforeEach(() => vi.stubEnv("SESSION_SECRET", SECRET));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("signSession / verifySession", () => {
  it("devuelve el mismo contenido que se firmó", async () => {
    const token = await signSession(payload);
    expect(await verifySession(token)).toEqual(payload);
  });

  it("toma versión 0 en tokens emitidos antes de session_version", async () => {
    const token = await new SignJWT({
      role: "ADMIN",
      mustChangePassword: false,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("user_1")
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(SECRET));
    expect(await verifySession(token)).toMatchObject({ sessionVersion: 0 });
  });

  it("rechaza un token ausente o basura", async () => {
    expect(await verifySession(undefined)).toBeNull();
    expect(await verifySession("no-es-un-jwt")).toBeNull();
  });

  it("rechaza un token con el contenido alterado", async () => {
    const [header, , signature] = (await signSession(payload)).split(".");
    const forged = Buffer.from(
      JSON.stringify({
        sub: "user_1",
        role: "ADMIN",
        mustChangePassword: false,
      }),
    ).toString("base64url");
    expect(await verifySession(`${header}.${forged}.${signature}`)).toBeNull();
  });

  it("rechaza un token firmado con otra clave", async () => {
    const token = await signSession(payload);
    vi.stubEnv("SESSION_SECRET", "otra-clave-distinta-de-32-caracteres!!");
    expect(await verifySession(token)).toBeNull();
  });

  it("rechaza un token vencido", async () => {
    vi.useFakeTimers();
    const token = await signSession(payload);
    vi.advanceTimersByTime(8 * 24 * 60 * 60 * 1000);
    expect(await verifySession(token)).toBeNull();
  });

  it("rechaza un token válido pero con claims inesperados", async () => {
    const token = await new SignJWT({ role: "SUPERUSER" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("user_1")
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(SECRET));
    expect(await verifySession(token)).toBeNull();
  });

  it("falla fuerte si SESSION_SECRET falta o es corto", async () => {
    vi.stubEnv("SESSION_SECRET", "corto");
    await expect(signSession(payload)).rejects.toThrow(/SESSION_SECRET/);
    await expect(verifySession("x.y.z")).rejects.toThrow(/SESSION_SECRET/);
  });
});
