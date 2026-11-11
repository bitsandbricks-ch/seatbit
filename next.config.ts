import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server build for the container image (see Dockerfile).
  output: "standalone",
  serverExternalPackages: ["better-sqlite3"],
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
