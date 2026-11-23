/** Browser-only PaddleOCR SDK integration: no server OCR requests or API tokens. */
import { parseContact, type OCRLine } from './contact-parser';
import type { BusinessCard } from '@/types/card';

type BrowserEngine = { predict: (image: Blob) => Promise<Array<{ items: Array<{ text: string; score: number; poly?: unknown }> }>> };
let enginePromise: Promise<BrowserEngine> | null = null;

async function getEngine(): Promise<BrowserEngine> {
  if (typeof window === 'undefined') throw new Error('Free OCR is available only in a browser.');
  if (!enginePromise) {
    enginePromise = import('@paddleocr/paddleocr-js')
      .then(({ PaddleOCR }) => PaddleOCR.create({ lang: 'en', ocrVersion: 'PP-OCRv5', ortOptions: { backend: 'auto' } }))
      .then(engine => engine as unknown as BrowserEngine)
      .catch(error => { enginePromise = null; throw new Error(`OCR model could not load. Check internet access and browser compatibility. ${error instanceof Error ? error.message : ''}`.trim()); });
  }
  return enginePromise;
}

function asLine(item: { text: string; score: number; poly?: unknown }): OCRLine {
  const points = Array.isArray(item.poly) ? item.poly : [];
  const first = points[0];
  const top = Array.isArray(first) && typeof first[1] === 'number' ? first[1] : undefined;
  const left = Array.isArray(first) && typeof first[0] === 'number' ? first[0] : undefined;
  return { text: item.text, score: item.score, top, left };
}

export async function extractBrowserCard(front: File, back?: File): Promise<BusinessCard> {
  const engine = await getEngine();
  const frontResult = await engine.predict(front);
  const backResult = back ? await engine.predict(back) : [];
  const lines = [...(frontResult[0]?.items ?? []), ...(backResult[0]?.items ?? [])].map(asLine);
  if (!lines.length) throw new Error('No readable text found. Try a sharper, brighter image.');
  const parsed = parseContact(lines);
  if (!parsed.fullName && !parsed.companyName && !parsed.email && !parsed.phone) {
    throw new Error('No recognizable contact fields found. Try a clearer photo or enter details manually.');
  }
  return { id: crypto.randomUUID(), ...parsed };
}
