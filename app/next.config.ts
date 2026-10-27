import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Genera .next/standalone: un server.js mínimo para la imagen de Docker.
  output: "standalone",
  cacheComponents: true,
  experimental: {
    serverActions: {
      // Imágenes de producto de hasta 5 MB + el overhead del multipart.
      bodySizeLimit: "6mb",
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
