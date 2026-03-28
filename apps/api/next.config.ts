import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@layrix/db', '@layrix/agents'],
};

export default nextConfig;
