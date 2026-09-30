// This file is copied beside the generated standalone server during build.
import { parseEnvironment } from './runtime-config.mjs';
process.env.NODE_ENV = 'production';
try {
  parseEnvironment(process.env);
} catch (error) {
  console.error(JSON.stringify({ level: 'error', event: 'startup.failed',
    message: error instanceof Error && /^(Invalid server configuration|Unsafe public environment)/.test(error.message)
      ? error.message : 'Invalid startup configuration',
  }));
  process.exit(1);
}
await import('./server.js');
