import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';

const root = process.cwd();
const standalone = resolve(root, '.next/standalone');
if (!existsSync(resolve(standalone, 'server.js'))) {
  throw new Error('Production build missing. Run npm run build first.');
}
// Next standalone intentionally omits public/static assets from its trace.
function copyDirectory(source, target) {
  mkdirSync(target, { recursive: true });
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const from = resolve(source, entry.name),
      to = resolve(target, entry.name);
    if (entry.isDirectory()) copyDirectory(from, to);
    else if (entry.isFile()) copyFileSync(from, to);
  }
}
copyDirectory(resolve(root, '.next/static'), resolve(standalone, '.next/static'));
copyDirectory(resolve(root, 'public'), resolve(standalone, 'public'));
const child = spawn(process.execPath, [resolve(standalone, 'runtime-entrypoint.mjs')], {
  cwd: standalone,
  stdio: 'inherit',
  env: {
    ...process.env,
    HOSTNAME: process.env.LMS_HOST ?? '127.0.0.1',
    PORT: process.env.PORT ?? '3000',
  },
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', (code) => process.exit(code ?? 1));
