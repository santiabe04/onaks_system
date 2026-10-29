import type { NextConfig } from "next";

// Cabeceras de seguridad para todas las respuestas. Sin CSP por ahora: el
// script inline del tema necesitaría un nonce por request.
const SECURITY_HEADERS = [
  // Nadie puede meter la app en un iframe (clickjacking).
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // La cámara (foto del remito) y el GPS (parada) solo para la propia app.
  {
    key: "Permissions-Policy",
    value: "camera=(self), geolocation=(self), microphone=(), payment=()",
  },
  // HTTPS siempre (en producción va detrás de Caddy). Por http el navegador la ignora.
  ...(process.env.NODE_ENV === "production"
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=31536000; includeSubDomains",
        },
      ]
    : []),
];

const nextConfig: NextConfig = {
  // Genera .next/standalone: un server.js mínimo para la imagen de Docker.
  output: "standalone",
  cacheComponents: true,
  // No anunciar el framework en cada respuesta.
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  experimental: {
    serverActions: {
      // Fotos de remito de hasta 8 MB (las de celular no se achican antes) +
      // la firma y el overhead del multipart. Las de producto son de hasta 5 MB.
      bodySizeLimit: "10mb",
    },
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
