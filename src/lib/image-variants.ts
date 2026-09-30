import sharp from 'sharp';
export const imageWidths = { small: 480, medium: 960, large: 1800 } as const;
export type ImageSize = keyof typeof imageWidths;
export function imageSize(value: string | null): ImageSize {
  if (value === null) return 'large';
  if (value !== 'small' && value !== 'medium' && value !== 'large') throw new Error('INVALID_IMAGE_SIZE');
  return value;
}
export function imageVariantKey(key: string, size: ImageSize, version: number) {
  return `${key}${version === 1 && size !== 'large' ? `.${size}` : ''}.webp`;
}
export function imageObjectKeys(key: string) {
  return [key, ...Object.keys(imageWidths).map(size => imageVariantKey(key, size as ImageSize, 1))];
}
export async function prepareImageVariants(bytes: Uint8Array) {
  const input = sharp(bytes, { limitInputPixels: 40000000, failOn: 'warning' });
  const metadata = await input.metadata();
  if ((metadata.pages ?? 1) > 1 || !['jpeg', 'png', 'webp'].includes(metadata.format ?? '')) throw new Error('Используйте статичное изображение JPG, PNG или WebP');
  const variants = [];
  // Sequential work bounds concurrent Sharp allocations; never transform on GET.
  for (const size of Object.keys(imageWidths) as ImageSize[]) {
    const result = await input.clone().rotate().resize({ width: imageWidths[size], height: imageWidths[size], fit: 'inside', withoutEnlargement: true }).webp({ quality: 86 }).toBuffer({ resolveWithObject: true });
    variants.push({ size, bytes: result.data, width: result.info.width, height: result.info.height });
  }
  return variants;
}
