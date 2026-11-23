'use client';
import { upload } from '@vercel/blob/client';
import { blobPath, type CardSide } from '@/lib/blob-policy';
import type { StoredCard } from '@/types/card';
export async function uploadOriginals(userId: string, cardId: string, front: File, back?: File): Promise<NonNullable<StoredCard['images']>> {
  const items: Array<[CardSide, File]> = [['front', front]];
  if (back) items.push(['back', back]);
  const images: NonNullable<StoredCard['images']> = {};
  for (const [side, file] of items) {
    const pathname = blobPath(userId, cardId, side, file);
    const blob = await upload(pathname, file, { access: 'private', handleUploadUrl: '/api/blob/upload', contentType: file.type });
    if (blob.pathname !== pathname) throw new Error('Unexpected Blob pathname.');
    images[side] = { pathname, size: file.size, contentType: file.type };
  }
  return images;
}
