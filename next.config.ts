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
