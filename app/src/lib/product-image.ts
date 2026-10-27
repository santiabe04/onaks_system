import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

// Imágenes de productos en disco: UPLOADS_DIR/products/<uuid>.webp. En Docker,
// UPLOADS_DIR es un volumen (ver docker-compose): entra en los backups junto con la DB.

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
// Lado mayor: suficiente para el detalle del catálogo, liviano para listas.
const MAX_SIDE = 1200;
const ACCEPTED_FORMATS = new Set(["jpeg", "png", "webp"]);
// Corta imágenes enormes (p. ej. una "bomba de descompresión") antes de procesarlas.
const MAX_INPUT_PIXELS = 50_000_000;

const FILE_PATTERN = /^[0-9a-f-]{36}\.webp$/;

function productsDir(): string {
  return path.resolve(process.env.UPLOADS_DIR || "uploads", "products");
}

/** Ruta del archivo en disco, o null si el nombre no es uno generado por nosotros. */
function filePath(fileName: string): string | null {
  return FILE_PATTERN.test(fileName)
    ? path.join(productsDir(), fileName)
    : null;
}

/** El input de archivo vacío llega como un File de 0 bytes. */
export function hasUpload(value: FormDataEntryValue | null): value is File {
  return value instanceof File && value.size > 0;
}

export type ImageResult =
  | { ok: true; data: Buffer }
  | { ok: false; error: "imageTooLarge" | "imageInvalid" };

/**
 * Valida y optimiza: el formato se lee del contenido (no del nombre ni del
 * tipo que manda el navegador), se endereza según EXIF, se achica a 1200 px y
 * se guarda como WebP sin metadatos (sin GPS de la foto del celular).
 */
export async function processProductImage(file: File): Promise<ImageResult> {
  if (file.size > MAX_IMAGE_BYTES) return { ok: false, error: "imageTooLarge" };
  const input = Buffer.from(await file.arrayBuffer());
  try {
    const image = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS });
    const { format } = await image.metadata();
    if (!format || !ACCEPTED_FORMATS.has(format)) {
      return { ok: false, error: "imageInvalid" };
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
    return { ok: true, data };
  } catch {
    return { ok: false, error: "imageInvalid" };
  }
}

/** Guarda con un nombre nuevo: cambiar la imagen cambia la URL (y la caché). */
export async function saveProductImage(data: Buffer): Promise<string> {
  const fileName = `${randomUUID()}.webp`;
  await mkdir(productsDir(), { recursive: true });
  await writeFile(path.join(productsDir(), fileName), data);
  return fileName;
}

/** Borra sin fallar: si el archivo ya no está, no hay nada que hacer. */
export async function deleteProductImage(
  fileName: string | null | undefined,
): Promise<void> {
  const target = fileName ? filePath(fileName) : null;
  if (target) await rm(target, { force: true }).catch(() => {});
}

export async function readProductImage(
  fileName: string,
): Promise<Buffer | null> {
  const target = filePath(fileName);
  if (!target) return null;
  return readFile(target).catch(() => null);
}
