import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

// Signatures and receipt photos on disk: UPLOADS_DIR/deliveries/<uuid>.webp.
// Unlike the catalog images they are NOT public: they are served only
// with a session (see app/media/deliveries). They are included in the volume backups.

export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
// Longer side of the photo: a receipt reads well without taking up too much room.
const MAX_SIDE = 1600;
const ACCEPTED_FORMATS = new Set(["jpeg", "png", "webp", "heif"]);
const MAX_INPUT_PIXELS = 50_000_000;
// The signature arrives as a base64 PNG from the canvas (a few KB).
const MAX_SIGNATURE_BYTES = 512 * 1024;
const SIGNATURE_PREFIX = "data:image/png;base64,";

const FILE_PATTERN = /^[0-9a-f-]{36}\.webp$/;

function deliveriesDir(): string {
  return path.resolve(process.env.UPLOADS_DIR || "uploads", "deliveries");
}

export type DeliveryImageResult =
  { ok: true; data: Buffer } | { ok: false; error: "tooLarge" | "invalid" };

/**
 * Receipt photo: the format is read from the content, rotated according to EXIF,
 * shrunk and saved as WebP without metadata.
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

/** Signature drawn on screen ("data:image/png;base64,…"), on a white background. */
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

/** Saves under a random (non-guessable) name and returns it. */
export async function saveDeliveryFile(data: Buffer): Promise<string> {
  const dir = deliveriesDir();
  await mkdir(dir, { recursive: true });
  const fileName = `${randomUUID()}.webp`;
  await writeFile(path.join(dir, fileName), data);
  return fileName;
}

/** The file, or null if the name is not ours or it does not exist. */
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
