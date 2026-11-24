import type { BusinessCard } from '@/types/card';

/** Provider selection is per queued scan; never silently route free scans to a paid API. */
export type ScanProvider = 'free' | 'gemini';

function encodeBase64(bytes: Uint8Array): string {
  // Chunk to avoid stack overflows on mobile browsers.
  const step = 8192;
  let binary = '';
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(binary);
}

async function encodeImage(file: File): Promise<{ mimeType: string; data: string }> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('Gemini accepts JPG, PNG, or WebP images only.');
  }
  if (file.size > 4_000_000) {
    throw new Error('Image exceeds 4 MB. Crop or compress the image before using Gemini.');
  }
  return { mimeType: file.type, data: encodeBase64(new Uint8Array(await file.arrayBuffer())) };
}

export async function extractGeminiCard(front: File, back?: File): Promise<BusinessCard> {
  const images = await Promise.all([front, ...(back ? [back] : [])].map(encodeImage));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55_000);
  try {
    const response = await fetch('/api/ocr/gemini', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ images }),
      signal: controller.signal,
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const message = payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
        ? payload.error : 'Gemini extraction failed. Please try again or select Free OCR.';
      throw new Error(message);
    }
    if (!payload || typeof payload !== 'object' || !('card' in payload) || !payload.card || typeof payload.card !== 'object') {
      throw new Error('Gemini returned an invalid contact. Please try again.');
    }
    return payload.card as BusinessCard;
  } catch (error) {
    if (controller.signal.aborted) throw new Error('Gemini timed out. Retry or select Free OCR.');
    throw error;
  } finally { clearTimeout(timeout); }
}
