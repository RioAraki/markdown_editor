import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The interview-prep core and UI are compiled from D:\diary\shared so this
  // app and the diary renderer can never disagree about coverage or progress.
  experimental: { externalDir: true },
};

export default nextConfig;
