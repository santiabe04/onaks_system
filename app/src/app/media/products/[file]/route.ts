import { readProductImage } from "@/lib/product-image";

// Outside `[lang]`: it has an extension, so the proxy does not touch it. The images
// are public (they are the catalog's) and never change: each change generates a
// file with another name, which is why they are cached forever.
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
