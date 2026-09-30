import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: [
        'src/lib/domain.ts',
        'src/lib/schemas.ts',
        'src/lib/video.ts',
        'src/lib/files.ts',
        'src/lib/download-token.ts',
        'src/lib/config.ts',
        'src/lib/request-security.ts',
        'src/lib/observability.ts',
        'src/lib/protected-video.ts',
        'src/lib/player-bridge.ts',
        'src/lib/watermark.ts',
        'src/lib/upload-inspection.ts',
        'src/lib/malware-scanner.ts',
        'src/lib/image-variants.ts',
        'src/lib/media-images.ts',
        'src/lib/staff-session.ts',
      ],
      thresholds: { lines: 80, functions: 80, statements: 80, branches: 80 },
    },
  },
});
