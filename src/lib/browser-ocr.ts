/** Browser-only OCR: lighter Tesseract worker on mobile, existing PaddleOCR on desktop.
 * No external inference service, and neither path sends images to an AI API.
 */
import { parseContact, type OCRLine } from './contact-parser';
import type { BusinessCard } from '@/types/card';

type PaddleEngine = { predict: (image: Blob) => Promise<Array<{ items: Array<{ text: string; score: number; poly?: unknown }> }>> };
let paddlePromise: Promise<PaddleEngine> | null = null;

async function getPaddleEngine(): Promise<PaddleEngine> {
  if (!paddlePromise) {
    paddlePromise = import('@paddleocr/paddleocr-js')
      .then(({ PaddleOCR }) => PaddleOCR.create({ lang: 'en', ocrVersion: 'PP-OCRv5', ortOptions: { backend: 'auto' } }))
      .then(engine => engine as unknown as PaddleEngine)
      .catch(error => {
        paddlePromise = null;
        throw new Error(`OCR model could not load. Check browser support and network connectivity. ${error instanceof Error ? error.message : ''}`.trim());
      });
  }
  return paddlePromise;
}

function mobileBrowser(): boolean {
  // A conservative detection: avoid loading PaddleOCR/OpenCV on phones/tablets.
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && Math.min(window.innerWidth, window.innerHeight) < 900);
}

function asLine(item: { text: string; score: number; poly?: unknown }): OCRLine {
  const points = Array.isArray(item.poly) ? item.poly : [];
  const first = points[0];
  const top = Array.isArray(first) && typeof first[1] === 'number' ? first[1] : undefined;
  const left = Array.isArray(first) && typeof first[0] === 'number' ? first[0] : undefined;
  return { text: item.text, score: item.score, top, left };
}

async function paddleLines(front: File, back?: File): Promise<OCRLine[]> {
  const engine = await getPaddleEngine();
  const first = await engine.predict(front);
  const second = back ? await engine.predict(back) : [];
  return [...(first[0]?.items ?? []), ...(second[0]?.items ?? [])].map(asLine);
}

async function mobileLines(front: File, back?: File): Promise<OCRLine[]> {
  // Tesseract.js performs recognition inside its own Web Worker.
  // Unlike PaddleOCR + OpenCV, this avoids loading OpenCV into the mobile page.
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('eng');
  try {
    const output: OCRLine[] = [];
    for (const file of [front, back].filter((f): f is File => !!f)) {
      const { data } = await worker.recognize(file);
      const score = Math.min(1, Math.max(0, data.confidence / 100));
      for (const text of data.text.split(/\r?\n/).map(line => line.trim()).filter(Boolean)) {
        output.push({ text, score });
      }
    }
    return output;
  } finally {
    // Release OCR worker memory between captures. Phones have tighter budgets.
    await worker.terminate();
  }
}

export async function extractBrowserCard(front: File, back?: File): Promise<BusinessCard> {
  if (typeof window === 'undefined') throw new Error('Free OCR is available only in a browser.');
  const lines = mobileBrowser() ? await mobileLines(front, back) : await paddleLines(front, back);
  if (!lines.length) throw new Error('No readable text found. Try a sharper, brighter image.');
  const parsed = parseContact(lines);
  if (!parsed.fullName && !parsed.companyName && !parsed.email && !parsed.phone) {
    throw new Error('No recognizable contact fields found. Try a clearer photo or enter details manually.');
  }
  return { id: crypto.randomUUID(), ...parsed };
}
