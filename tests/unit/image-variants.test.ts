import { expect, it } from 'vitest';
import sharp from 'sharp';
import { prepareImageVariants, imageVariantKey, imageSize } from '../../src/lib/image-variants';
it('precomputes three bounded variants, strips metadata and never upscales', async () => {
  const bytes = await sharp({ create: { width: 2000, height: 1000, channels: 3, background: '#234456' } }).png().toBuffer();
  const variants = await prepareImageVariants(bytes);
  expect(variants.map(v => v.width)).toEqual([480, 960, 1800]);
  for (const variant of variants) {
    const info = await sharp(variant.bytes).metadata(); expect(info.format).toBe('webp'); expect(info.exif).toBeUndefined();
  }
  const small = await sharp({ create: { width: 30, height: 20, channels: 3, background: '#123456' } }).png().toBuffer();
  expect((await prepareImageVariants(small)).map(v => v.width)).toEqual([30, 30, 30]);
});
it('rejects malformed images and excessive declared dimensions before serving anything', async () => {
  await expect(prepareImageVariants(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))).rejects.toThrow();
  const png = await sharp({ create: { width: 1, height: 1, channels: 3, background: '#123456' } }).png().toBuffer();
  png.writeUInt32BE(100000, 16); png.writeUInt32BE(100000, 20);
  await expect(prepareImageVariants(png)).rejects.toThrow();
});
it('accepts only named sizes, with backwards-compatible original derivative keys', () => {
  expect(imageSize(null)).toBe('large');
  expect(imageVariantKey('owner/id', 'small', 1)).toBe('owner/id.small.webp');
  expect(imageVariantKey('owner/id', 'medium', 1)).toBe('owner/id.medium.webp');
  expect(imageVariantKey('owner/id', 'large', 1)).toBe('owner/id.webp');
  expect(imageVariantKey('owner/id', 'small', 0)).toBe('owner/id.webp');
  for (const value of ['999999', '../original', 'SMALL', '']) expect(() => imageSize(value)).toThrow();
});
