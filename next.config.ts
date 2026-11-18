import { execSync } from "node:child_process";
import type { NextConfig } from "next";

// Commit shown in the footer. CI passes it in (the image build has no .git);
// local builds ask git; anything else just shows no hash.
function commitSha(): string {
  const fromEnv = process.env.GIT_COMMIT?.trim();
  if (fromEnv) return fromEnv;
  try {
    return execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "";
  }
}

const nextConfig: NextConfig = {
  // Self-contained server build for the container image (see Dockerfile).
  output: "standalone",
  env: { SEATBIT_COMMIT: commitSha() },
  // age-encryption and aws4fetch stay plain packages in node_modules, so scripts/restore.mjs in the image can use them too.
  serverExternalPackages: ["better-sqlite3", "highs", "age-encryption", "aws4fetch"],
  // The exact seat search loads HiGHS in a worker thread by path, which the tracing can't see.
  outputFileTracingIncludes: { "/**": ["./node_modules/highs/package.json", "./node_modules/highs/build/highs.js", "./node_modules/highs/build/highs.wasm"] },
  poweredByHeader: false,
  // Old links. Here and not as a page calling redirect(): the root loading.tsx streams pages, so a
  // page redirect would answer 200 and jump on the client, showing the wrong page for a moment.
  async redirects() {
    return [
      { source: "/admin/lans/:id", destination: "/lans/:id/manage", permanent: true },
      { source: "/clans/:slug/stats", destination: "/clans/:slug?tab=stats", permanent: true },
    ];
  },
  // Security headers on every response; the page CSP (with its nonce) comes from src/proxy.ts.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
          // Browsers ignore it over plain http, so local development is unaffected.
          { key: "Strict-Transport-Security", value: "max-age=31536000" },
        ],
      },
    ];
  },
  experimental: {
    // Clan avatar uploads (max 2 MB image + form overhead).
    serverActions: { bodySizeLimit: "3mb" },
  },
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
