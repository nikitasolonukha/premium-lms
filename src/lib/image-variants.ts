import sharp from 'sharp';
import { imageWidths, type ImageSize } from './media-images';
export { imageSize, imageVariantKey, imageObjectKeys } from './media-images';
export async function prepareImageVariants(bytes: Uint8Array) {
  const input = sharp(bytes, { limitInputPixels: 40000000, failOn: 'warning' });
  const metadata = await input.metadata();
  if ((metadata.pages ?? 1) > 1 || !['jpeg', 'png', 'webp'].includes(metadata.format ?? ''))
    throw new Error('Используйте статичное изображение JPG, PNG или WebP');
  const variants = [];
  // Sequential work bounds concurrent Sharp allocations; never transform on GET.
  for (const size of Object.keys(imageWidths) as ImageSize[]) {
    const result = await input
      .clone()
      .rotate()
      .resize({
        width: imageWidths[size],
        height: imageWidths[size],
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 86 })
      .toBuffer({ resolveWithObject: true });
    variants.push({
      size,
      bytes: result.data,
      width: result.info.width,
      height: result.info.height,
    });
  }
  return variants;
}
