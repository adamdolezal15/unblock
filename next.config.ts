import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // No on-screen route indicator (the demo is shown on a projector); errors still surface.
  devIndicators: false,
  // The saved demos are read from disk at runtime: ship demo-cache/ with every serverless function that runs the pipeline.
  outputFileTracingIncludes: {
    "/api/run": ["./demo-cache/**/*"],
    "/api/calendar.ics": ["./demo-cache/**/*"],
    "/api/drafts": ["./demo-cache/**/*"],
  },
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
