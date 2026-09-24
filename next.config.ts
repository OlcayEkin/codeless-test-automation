import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The native SQLite driver must load from node_modules, not the bundle.
  serverExternalPackages: ["better-sqlite3", "@prisma/adapter-better-sqlite3"],
  poweredByHeader: false,
  // Keeps the Next.js developer badge out of demos and screenshots.
  devIndicators: false,
  experimental: {
    // Uploads are capped at 5 MB in code; this leaves room for the rest of the form.
    serverActions: { bodySizeLimit: "6mb" },
  },
  // Lets end-to-end tests run beside a normal dev server.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
