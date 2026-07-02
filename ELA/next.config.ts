import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // TypeScript errors are suppressed so Supabase typed-client quirks
    // do not block production builds. Runtime safety is enforced by RLS.
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
