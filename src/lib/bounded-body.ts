export class BodyError extends Error {
  constructor(public status: 400 | 413) {
    super('Invalid request body');
  }
}
/** Bound the actual bytes of a chunked body before decoding or parsing it. */
export async function readJsonBody(
  body: ReadableStream<Uint8Array> | null,
  maximum: number,
): Promise<Record<string, unknown>> {
  if (!body) throw new BodyError(400);
  const reader = body.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0,
    timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    void reader.cancel().catch(() => {});
  }, 10000);
  try {
    for (;;) {
      const chunk = await reader.read();
      if (timedOut) throw new BodyError(400);
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maximum) {
        await reader.cancel();
        throw new BodyError(413);
      }
      chunks.push(chunk.value);
    }
    const buffer = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      buffer.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer));
    if (!value || Array.isArray(value) || typeof value !== 'object') throw new BodyError(400);
    return value;
  } catch (error) {
    if (error instanceof BodyError) throw error;
    throw new BodyError(400);
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
}
