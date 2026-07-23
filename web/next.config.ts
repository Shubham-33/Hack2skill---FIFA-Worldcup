import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /**
   * `standalone` bundles the server and only its used dependencies into
   * `.next/standalone`, so the container image ships without the full `node_modules`.
   * This is the recommended output for Cloud Run and keeps the image small.
   */
  output: 'standalone',
};

export default nextConfig;
