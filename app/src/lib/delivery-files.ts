import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

// Firmas y fotos de remitos en disco: UPLOADS_DIR/deliveries/<uuid>.webp.
// A diferencia de las imágenes del catálogo NO son públicas: se sirven solo
// con sesión (ver app/media/deliveries). Entran en los backups del volumen.

export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
// Lado mayor de la foto: se lee bien un remito, sin ocupar de más.
const MAX_SIDE = 1600;
const ACCEPTED_FORMATS = new Set(["jpeg", "png", "webp", "heif"]);
const MAX_INPUT_PIXELS = 50_000_000;
// La firma llega como PNG en base64 desde el canvas (unos pocos KB).
const MAX_SIGNATURE_BYTES = 512 * 1024;
const SIGNATURE_PREFIX = "data:image/png;base64,";

const FILE_PATTERN = /^[0-9a-f-]{36}\.webp$/;

function deliveriesDir(): string {
  return path.resolve(process.env.UPLOADS_DIR || "uploads", "deliveries");
}

export type DeliveryImageResult =
  { ok: true; data: Buffer } | { ok: false; error: "tooLarge" | "invalid" };

/**
 * Foto del remito: el formato se lee del contenido, se endereza según EXIF,
 * se achica y se guarda como WebP sin metadatos.
 */
export async function processDeliveryPhoto(
  file: File,
): Promise<DeliveryImageResult> {
  if (file.size > MAX_PHOTO_BYTES) return { ok: false, error: "tooLarge" };
  try {
    const image = sharp(Buffer.from(await file.arrayBuffer()), {
      limitInputPixels: MAX_INPUT_PIXELS,
    });
    const { format } = await image.metadata();
    if (!format || !ACCEPTED_FORMATS.has(format)) {
      return { ok: false, error: "invalid" };
    }
    const data = await image
      .rotate()
      .resize({
        width: MAX_SIDE,
        height: MAX_SIDE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 75 })
      .toBuffer();
    return { ok: true, data };
  } catch {
    return { ok: false, error: "invalid" };
  }
}

/** Firma dibujada en pantalla ("data:image/png;base64,…"), sobre fondo blanco. */
export async function processSignature(
  dataUrl: string,
): Promise<DeliveryImageResult> {
  if (!dataUrl.startsWith(SIGNATURE_PREFIX)) {
    return { ok: false, error: "invalid" };
  }
  const input = Buffer.from(dataUrl.slice(SIGNATURE_PREFIX.length), "base64");
  if (input.length > MAX_SIGNATURE_BYTES)
    return { ok: false, error: "tooLarge" };
  try {
    const image = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS });
    const { format } = await image.metadata();
    if (format !== "png") return { ok: false, error: "invalid" };
    const data = await image
      .flatten({ background: "#ffffff" })
      .webp({ quality: 80 })
      .toBuffer();
    return { ok: true, data };
  } catch {
    return { ok: false, error: "invalid" };
  }
}

/** Guarda con un nombre al azar (no adivinable) y lo devuelve. */
export async function saveDeliveryFile(data: Buffer): Promise<string> {
  const dir = deliveriesDir();
  await mkdir(dir, { recursive: true });
  const fileName = `${randomUUID()}.webp`;
  await writeFile(path.join(dir, fileName), data);
  return fileName;
}

/** El archivo, o null si el nombre no es uno nuestro o no existe. */
export async function readDeliveryFile(
  fileName: string,
): Promise<Buffer | null> {
  if (!FILE_PATTERN.test(fileName)) return null;
  try {
    return await readFile(path.join(deliveriesDir(), fileName));
  } catch {
    return null;
  }
}
