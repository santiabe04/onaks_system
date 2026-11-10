import type { NextConfig } from "next";

// Security headers for all responses. No CSP for now: the
// inline theme script would need a nonce per request.
const SECURITY_HEADERS = [
  // Nobody can put the app in an iframe (clickjacking).
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // The camera (receipt photo) and the GPS (stop) only for the app itself.
  {
    key: "Permissions-Policy",
    value: "camera=(self), geolocation=(self), microphone=(), payment=()",
  },
  // HTTPS always (in production it sits behind Caddy). Over http the browser ignores it.
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
  // Generates .next/standalone: a minimal server.js for the Docker image.
  output: "standalone",
  cacheComponents: true,
  // Do not announce the framework in every response.
  poweredByHeader: false,
  // The app reads files from UPLOADS_DIR with dynamic paths, and the tracing of
  // `standalone` used to copy the whole local folder (signatures included) into the image.
  outputFileTracingExcludes: { "**": ["./uploads/**/*"] },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  experimental: {
    serverActions: {
      // Receipt photos up to 8 MB (phone photos are not shrunk beforehand) +
      // the signature and the multipart overhead. Product images are up to 5 MB.
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
