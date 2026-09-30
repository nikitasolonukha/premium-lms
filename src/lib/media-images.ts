export const imageWidths = { small: 480, medium: 960, large: 1800 } as const;
export type ImageSize = keyof typeof imageWidths;
export function imageSize(value: string | null): ImageSize {
  if (value === null) return 'large';
  if (value !== 'small' && value !== 'medium' && value !== 'large')
    throw new Error('INVALID_IMAGE_SIZE');
  return value;
}
export function imageVariantKey(key: string, size: ImageSize, version: number) {
  return `${key}${version === 1 && size !== 'large' ? `.${size}` : ''}.webp`;
}
export function imageObjectKeys(key: string) {
  return [
    key,
    ...Object.keys(imageWidths).map((size) => imageVariantKey(key, size as ImageSize, 1)),
  ];
}
export function privateImage(id: string, sizes = '(max-width: 768px) calc(100vw - 32px), 850px') {
  const base = `/api/media/${encodeURIComponent(id)}`;
  return {
    src: `${base}?size=medium`,
    srcSet: `${base}?size=small 480w, ${base}?size=medium 960w, ${base}?size=large 1800w`,
    sizes,
  };
}
