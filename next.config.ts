import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: '/admin',
  skipTrailingSlashRedirect: true,
  /* experimental: {
    // This can help with some multi-zone issues if needed
    // externalDir: true,
  }, */
};

export default nextConfig;
