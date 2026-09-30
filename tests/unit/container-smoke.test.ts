import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  docker: vi.fn(),
  write: vi.fn(),
  unlink: vi.fn(),
  mkdir: vi.fn(),
}));
vi.mock('node:child_process', () => ({ execFileSync: mocks.docker }));
vi.mock('node:fs', () => ({
  writeFileSync: mocks.write,
  unlinkSync: mocks.unlink,
  mkdirSync: mocks.mkdir,
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.spyOn(process, 'loadEnvFile').mockImplementation(() => undefined);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.stubEnv('SUPABASE_URL', 'http://127.0.0.1:56321');
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async (url: string) =>
        new Response(url.endsWith('/api/health') ? '{"status":"ok"}' : 'Академия', {
          status: 200,
        }),
    ),
  );
  mocks.docker.mockImplementation((_command: string, args: string[]) => {
    if (args[0] === 'exec') return args.includes('id') ? '1001' : 'false';
    if (args[0] === 'image') return 'sha256:test-image';
    return 'test-container';
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('container smoke failure handling (simulated Docker)', () => {
  it('removes the credential file and never records PASS when stop fails', async () => {
    const normal = mocks.docker.getMockImplementation()!;
    mocks.docker.mockImplementation((command: string, args: string[]) => {
      if (args[0] === 'stop') throw new Error('Docker stop unavailable');
      return normal(command, args);
    });
    await expect(import('../../scripts/test-container.mjs')).rejects.toThrow(
      'Docker stop unavailable',
    );
    expect(mocks.unlink).toHaveBeenCalledWith('.local/docker-runtime.env');
    expect(
      mocks.write.mock.calls.some(([file]) => String(file).endsWith('/evidence/container.json')),
    ).toBe(false);
  });

  it('attempts scoped cleanup if a timed-out run may already have created the container', async () => {
    const normal = mocks.docker.getMockImplementation()!;
    mocks.docker.mockImplementation((command: string, args: string[]) => {
      if (args[0] === 'run') throw new Error('Docker run timed out');
      return normal(command, args);
    });
    await expect(import('../../scripts/test-container.mjs')).rejects.toThrow(
      'Docker run timed out',
    );
    expect(mocks.docker.mock.calls.some(([, args]) => args[0] === 'stop')).toBe(true);
    expect(mocks.unlink).toHaveBeenCalledWith('.local/docker-runtime.env');
  });

  it('records success only after cleanup and bounds Docker and HTTP requests', async () => {
    await import('../../scripts/test-container.mjs');
    const stopIndex = mocks.docker.mock.calls.findIndex(([, args]) => args[0] === 'stop');
    const resultIndex = mocks.write.mock.calls.findIndex(
      ([file]) => String(file).endsWith('/evidence/container.json'),
    );
    expect(mocks.write.mock.invocationCallOrder[resultIndex]).toBeGreaterThan(
      mocks.docker.mock.invocationCallOrder[stopIndex],
    );
    expect(mocks.write.mock.invocationCallOrder[resultIndex]).toBeGreaterThan(
      mocks.unlink.mock.invocationCallOrder[0],
    );
    for (const [, , options] of mocks.docker.mock.calls) {
      expect(options.timeout).toBeGreaterThan(0);
      expect(options.timeout).toBeLessThanOrEqual(30_000);
    }
    for (const [, options] of vi.mocked(fetch).mock.calls) {
      expect(options?.signal).toBeInstanceOf(AbortSignal);
    }
  });
});
