import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained .next/standalone build (server.js + traced deps only)
  // for a minimal production Docker image. See Dockerfile and docs/DEPLOY.md.
  output: "standalone",
};

export default nextConfig;
