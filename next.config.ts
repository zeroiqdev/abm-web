import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: '/admin',
  async redirects() {
    return [
      {
        source: '/',
        destination: '/admin',
        basePath: false,
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
