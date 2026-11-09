import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

// Comprobantes de transferencia en disco: UPLOADS_DIR/transfers/<uuid>.webp o
// .pdf. Como las firmas de los remitos NO son públicos: se sirven solo con
// sesión (ver app/media/transfers) y entran en los backups del volumen.

export const MAX_PROOF_BYTES = 5 * 1024 * 1024;
// Lado mayor de la imagen: una captura de homebanking se lee bien con esto.
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
 * El tipo se lee del contenido, no del nombre ni del tipo que declara el
 * navegador. Un PDF se guarda tal cual; una imagen se endereza según EXIF,
 * se achica y se guarda como WebP sin metadatos.
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

/** Guarda con un nombre al azar (no adivinable) y lo devuelve. */
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

/** El archivo, o null si el nombre no es uno nuestro o no existe. */
export async function readProofFile(fileName: string): Promise<Buffer | null> {
  if (!FILE_PATTERN.test(fileName)) return null;
  try {
    return await readFile(path.join(transfersDir(), fileName));
  } catch {
    return null;
  }
}

/** Borra un archivo que quedó sin registro (falló la transacción); sin error si no está. */
export async function removeProofFile(fileName: string): Promise<void> {
  if (!FILE_PATTERN.test(fileName)) return;
  try {
    await unlink(path.join(transfersDir(), fileName));
  } catch {
    // Ya no estaba: nada que limpiar.
  }
}

export function proofContentType(fileName: string): string {
  return fileName.endsWith(".pdf") ? "application/pdf" : "image/webp";
}
