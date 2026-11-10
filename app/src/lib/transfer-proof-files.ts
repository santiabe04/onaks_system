import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

// Transfer receipts on disk: UPLOADS_DIR/transfers/<uuid>.webp or
// .pdf. Like the delivery signatures they are NOT public: they are served only
// with a session (see app/media/transfers) and are included in the volume backups.

export const MAX_PROOF_BYTES = 5 * 1024 * 1024;
// Longer side of the image: a home banking screenshot reads well with this.
const MAX_SIDE = 2000;
const ACCEPTED_FORMATS = new Set(["jpeg", "png", "webp", "heif"]);
const MAX_INPUT_PIXELS = 50_000_000;
const PDF_SIGNATURE = "%PDF-";

const FILE_PATTERN = /^[0-9a-f-]{36}\.(webp|pdf)$/;

function transfersDir(): string {
  return path.resolve(process.env.UPLOADS_DIR || "uploads", "transfers");
}

export type ProofResult =
  | { ok: true; data: Buffer; ext: "webp" | "pdf" }
  | { ok: false; error: "tooLarge" | "invalid" };

/**
 * The type is read from the content, not from the name nor the type the
 * browser declares. A PDF is saved as is; an image is rotated according to EXIF,
 * shrunk and saved as WebP without metadata.
 */
export async function processProof(file: File): Promise<ProofResult> {
  if (file.size > MAX_PROOF_BYTES) return { ok: false, error: "tooLarge" };
  const input = Buffer.from(await file.arrayBuffer());
  if (
    input.subarray(0, PDF_SIGNATURE.length).toString("latin1") === PDF_SIGNATURE
  ) {
    return { ok: true, data: input, ext: "pdf" };
  }
  try {
    const image = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS });
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
      .webp({ quality: 80 })
      .toBuffer();
    return { ok: true, data, ext: "webp" };
  } catch {
    return { ok: false, error: "invalid" };
  }
}

/** Saves under a random (non-guessable) name and returns it. */
export async function saveProofFile(
  data: Buffer,
  ext: "webp" | "pdf",
): Promise<string> {
  const dir = transfersDir();
  await mkdir(dir, { recursive: true });
  const fileName = `${randomUUID()}.${ext}`;
  await writeFile(path.join(dir, fileName), data);
  return fileName;
}

/** The file, or null if the name is not ours or it does not exist. */
export async function readProofFile(fileName: string): Promise<Buffer | null> {
  if (!FILE_PATTERN.test(fileName)) return null;
  try {
    return await readFile(path.join(transfersDir(), fileName));
  } catch {
    return null;
  }
}

/** Deletes a file that was left without a record (the transaction failed); no error if it is not there. */
export async function removeProofFile(fileName: string): Promise<void> {
  if (!FILE_PATTERN.test(fileName)) return;
  try {
    await unlink(path.join(transfersDir(), fileName));
  } catch {
    // It was already gone: nothing to clean up.
  }
}

export function proofContentType(fileName: string): string {
  return fileName.endsWith(".pdf") ? "application/pdf" : "image/webp";
}
