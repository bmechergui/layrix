import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  transpilePackages: ['@layrix/db', '@layrix/agents'],
  outputFileTracingRoot: path.join(__dirname, '../../'),
};

export default nextConfig;
