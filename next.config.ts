import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // Off on purpose: with partial prefetching a click to a home currency whose daily plan was not cached yet
  // stayed on the old screen until the plan was ready (~30 s). Off, the screen switches at once and the plan streams.
  partialPrefetching: false,
};

export default nextConfig;
