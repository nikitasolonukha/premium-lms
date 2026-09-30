import { mkdirSync, writeFileSync, chmodSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
const version = '8.30.1';
const assets = {
  linux: ['linux_x64.tar.gz', '551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb'],
  win32: ['windows_x64.zip', 'd29144deff3a68aa93ced33dddf84b7fdc26070add4aa0f4513094c8332afc4e'],
};
if (process.arch !== 'x64' || !assets[process.platform])
  throw new Error('Use the official checksum-verified Gitleaks binary for this platform');
const [suffix, expected] = assets[process.platform],
  folder = resolve('.local/tools/gitleaks');
mkdirSync(folder, { recursive: true });
const response = await fetch(
  `https://github.com/gitleaks/gitleaks/releases/download/v${version}/gitleaks_${version}_${suffix}`,
  { signal: AbortSignal.timeout(60000) },
);
if (!response.ok) throw new Error('Gitleaks download failed');
const bytes = Buffer.from(await response.arrayBuffer());
if (createHash('sha256').update(bytes).digest('hex') !== expected)
  throw new Error('Gitleaks checksum mismatch');
const archive = resolve(folder, `release.${process.platform === 'win32' ? 'zip' : 'tar.gz'}`);
writeFileSync(archive, bytes);
execFileSync('tar', ['-xf', archive, '-C', folder]);
if (process.platform !== 'win32') chmodSync(resolve(folder, 'gitleaks'), 0o755);
console.log(`Gitleaks ${version} installed; release SHA256 verified.`);
