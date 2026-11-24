/** Browser-only OCR: lighter Tesseract worker on mobile, existing PaddleOCR on desktop.
 * No external inference service, and neither path sends images to an AI API.
 */
import { parseContactWithDiagnostics, type OCRLine } from './contact-parser';
import { rememberOCRDiagnostics } from './ocr-diagnostics';
import { prepareOCRVariant, shouldTryAlternative, preferAlternative } from './ocr-image-processing';
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
      const { data } = await worker.recognize(file, {}, { text: true, blocks: true });
      // Tesseract v6 exposes individual line boxes when blocks output is enabled.
      // Preserve per-line confidence and positions; a page-wide average hides a
      // badly misread name even when email and phone are recognized correctly.
      type TextLine = { text?: string; confidence?: number; bbox?: { x0: number; y0: number } };
      type Block = { paragraphs?: Array<{ lines?: TextLine[] }> };
      const blocks = (data as unknown as { blocks?: Block[] }).blocks ?? [];
      const textLines = blocks.flatMap(b => (b.paragraphs ?? []).flatMap(p => p.lines ?? []));
      if (textLines.length) {
        for (const line of textLines) {
          if (!line.text?.trim()) continue;
          output.push({
            text: line.text.trim(),
            score: Math.min(1, Math.max(0, (line.confidence ?? data.confidence) / 100)),
            left: line.bbox?.x0, top: line.bbox?.y0,
          });
        }
      } else {
        // Older / constrained browsers may omit detailed output. Retain the
        // original safe fallback without introducing a network OCR call.
        const score = Math.min(1, Math.max(0, data.confidence / 100));
        for (const text of data.text.split(/\r?\n/).map(line => line.trim()).filter(Boolean)) {
          output.push({ text, score });
        }
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
  const recognize = mobileBrowser() ? mobileLines : paddleLines;
  let lines = await recognize(front, back);
  let result = parseContactWithDiagnostics(lines);
  // Do not multiply OCR work for every scan. At most one alternate pass, only
  // when the first extraction is incomplete and still has useful evidence.
  // This is a *candidate comparison*, not a guarantee of improved accuracy.
  if (shouldTryAlternative(result.contact)) {
    try {
      const variant = await prepareOCRVariant(front);
      const alternativeLines = await recognize(variant, back);
      if (alternativeLines.length) {
        const alternative = parseContactWithDiagnostics(alternativeLines);
        if (preferAlternative(result.contact, alternative.contact)) {
          lines = alternativeLines;
          result = alternative;
        }
      }
    } catch {
      // A failed optional pass must never discard a usable initial result.
    }
  }
  if (!lines.length) throw new Error('No readable text found. Try a sharper, brighter image.');
  const { contact: parsed, diagnostics } = result;
  if (!parsed.fullName && !parsed.companyName && !parsed.email && !parsed.phone) {
    throw new Error('No recognizable contact fields found. Try a clearer photo or enter details manually.');
  }
  const id = crypto.randomUUID();
  // Diagnostics are transient and never synced as contact fields.
  rememberOCRDiagnostics(id, diagnostics);
  return { id, ...parsed };
}
