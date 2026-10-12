import type { NextConfig } from 'next';

const lifecycleEvent = process.env.npm_lifecycle_event ?? '';
const isVinextBuild = lifecycleEvent.endsWith(':vinext')
  || process.argv.some((argument) => /(?:vite|vinext-cloudflare)/i.test(argument));

const nextConfig: NextConfig = {
  ...(isVinextBuild
    ? {}
    : {
        turbopack: {
          resolveAlias: {
            'cloudflare:workers': './app/api/_lib/cloudflare-workers-node.ts',
          },
        },
      }),
};

export default nextConfig;
