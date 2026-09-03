import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The interview-prep core and UI are compiled from D:\diary\shared so this
  // app and the diary renderer can never disagree about coverage or progress.
  experimental: {
    externalDir: true,
    // Dev keeps every module graph it has ever built, so a long-running server
    // grows a few MB per hot reload and never gives any of it back — eight days
    // of editing took one process to 5 GB. This lets webpack drop what it no
    // longer needs between rebuilds. The heap cap in the `dev` script is the
    // other half: V8 defers major GC on a large heap, so bounding it is what
    // actually forces the collection to happen.
    webpackMemoryOptimizations: true,
  },
};

export default nextConfig;
