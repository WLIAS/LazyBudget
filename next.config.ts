import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    // Bake the short commit SHA into the client bundle at build time.
    // On Vercel, VERCEL_GIT_COMMIT_SHA is set automatically every deploy.
    // Locally it falls back to 'dev'.
    NEXT_PUBLIC_COMMIT_SHA: (
      process.env.VERCEL_GIT_COMMIT_SHA || 'dev'
    ).slice(0, 7),
  },
};

export default nextConfig;
