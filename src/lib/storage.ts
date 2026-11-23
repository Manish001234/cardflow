import { z } from 'zod';
import { cardSchema, type StoredCard } from '@/types/card';

const KEY = 'visiting-card-ocr:v1';
const storedSchema = cardSchema.extend({
  preview: z.string(), createdAt: z.string(), sourceName: z.string(),
  backPreview: z.string().optional(), reviewedAt: z.string().optional(),
  favorite: z.boolean().optional(), tags: z.array(z.string()).optional(),
});

export function loadCards(): StoredCard[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = z.array(storedSchema).safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : [];
  } catch { return []; }
}

/** Images are optional on quota pressure; text records are always retried without them. */
export function saveCards(cards: StoredCard[]): 'complete' | 'without-images' | 'failed' {
  try { localStorage.setItem(KEY, JSON.stringify(cards)); return 'complete'; }
  catch {
    try {
      localStorage.setItem(KEY, JSON.stringify(cards.map(card => ({ ...card, preview: '', backPreview: '' }))));
      return 'without-images';
    } catch { return 'failed'; }
  }
}
