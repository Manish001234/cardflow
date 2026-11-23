/** Shared pathname policy. Never authorize a blob based solely on a caller-supplied URL. */
export type CardSide = 'front' | 'back';
export const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export function validImagePath(path: string, userId: string, cardId: string, side: CardSide) {
  return new RegExp(`^cardflow/${userId}/${cardId}/${side}-[a-f0-9-]{36}\\.(?:jpg|png|webp)$`).test(path);
}
export function blobPath(userId: string, cardId: string, side: CardSide, file: File) {
  if (!IMAGE_MIMES.some(type => type === file.type) || file.size === 0 || file.size > MAX_IMAGE_BYTES) throw new Error('Unsupported image or file exceeds 10 MB.');
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  return `cardflow/${userId}/${cardId}/${side}-${crypto.randomUUID()}.${ext}`;
}
