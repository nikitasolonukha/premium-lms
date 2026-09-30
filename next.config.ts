import type { NextConfig } from 'next';
const config: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  // Preserve RSC transport headers in Proxy so background prefetch cannot
  // silently renew staff idle time. headers() still hides Next internals.
  skipProxyUrlNormalize: true,
  // Arguments can contain passwords, OTPs and signed upload grants.
  logging: {
    serverFunctions: false,
    browserToTerminal: false,
    incomingRequests: { ignore: [/^\/auth\/callback/, /^\/api\/download\//] },
  },
  experimental: { cpus: 2, authInterrupts: true, serverActions: { bodySizeLimit: '2mb' } },
  images: { unoptimized: true },
  // Startup validation is also imported by an unbundled standalone entrypoint.
  // Externalizing Zod makes Next trace its package into the isolated Docker runtime.
  serverExternalPackages: ['sharp', '@sentry/node', 'zod'],
};
export default config;
