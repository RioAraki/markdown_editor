import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The interview-prep core and UI are compiled from D:\diary\shared so this
  // app and the diary renderer can never disagree about coverage or progress.
  experimental: {
    externalDir: true,
    // Reduces peak webpack production-build memory in Next 15.5.9.
    // Long-running service reliability comes from isolated production releases
    // and process supervision, not from assuming dev retains all module history.
    webpackMemoryOptimizations: true,
  },
};

export default nextConfig;
