import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://gateway:3001/api/:path*',
      },
    ];
  },
  // Extend the proxy timeout.
  experimental: {
    proxyTimeout: 120000, // 120 seconds
  },
};

export default nextConfig;
