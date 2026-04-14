import type { NextConfig } from "next";

const gatewayUrl = process.env.GATEWAY_URL || 'http://gateway:3001';

const nextConfig: NextConfig = {
  output: 'standalone',
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${gatewayUrl}/api/:path*`,
      },
    ];
  },
  // Extend the proxy timeout.
  experimental: {
    proxyTimeout: 120000, // 120 seconds
  },
};

export default nextConfig;
