import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The e2e suite builds into its own folder so it never clobbers a running dev server or a real build.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  /* config options here */
  cacheComponents: true,
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
