import type { NextConfig } from 'next';
const config: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  // Arguments can contain passwords, OTPs and signed upload grants.
  logging: {
    serverFunctions: false,
    browserToTerminal: false,
    incomingRequests: { ignore: [/^\/auth\/callback/, /^\/api\/download\//] },
  },
  experimental: { cpus: 2, authInterrupts: true, serverActions: { bodySizeLimit: '2mb' } },
  images: { unoptimized: true },
  serverExternalPackages: ['sharp'],
};
export default config;
