import { readProductImage } from "@/lib/product-image";

// Fuera de `[lang]`: tiene extensión, así que el proxy no la toca. Las imágenes
// son públicas (son las del catálogo) y nunca cambian: cada cambio genera un
// archivo con otro nombre, por eso se cachean para siempre.
export async function GET(
  _request: Request,
  { params }: RouteContext<"/media/products/[file]">,
) {
  const data = await readProductImage((await params).file);
  if (!data) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
