import { describe, it, expect } from 'vitest';
import { readJsonBody } from '../../src/lib/bounded-body';
describe('bounded unauthenticated request body', () => {
  it('limits actual streamed bytes without trusting Content-Length and cancels the source', async () => {
    let canceled = false;
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(4097));
      },
      cancel() {
        canceled = true;
      },
    });
    await expect(readJsonBody(body, 4096)).rejects.toMatchObject({ status: 413 });
    expect(canceled).toBe(true);
  });
  it('decodes split UTF-8 correctly, rejects malformed encoding, JSON and non-object input', async () => {
    const data = new TextEncoder().encode('{"name":"Никита"}');
    const body = new ReadableStream({
      start(c) {
        c.enqueue(data.slice(0, 10));
        c.enqueue(data.slice(10));
        c.close();
      },
    });
    expect(await readJsonBody(body, 100)).toEqual({ name: 'Никита' });
    for (const text of ['null', '[]', 'true', '{'])
      await expect(readJsonBody(new Response(text).body, 100)).rejects.toMatchObject({
        status: 400,
      });
    await expect(readJsonBody(new Response(new Uint8Array([255])).body, 100)).rejects.toMatchObject(
      { status: 400 },
    );
    await expect(readJsonBody(null, 100)).rejects.toMatchObject({ status: 400 });
  });
});
