import { NextRequest, NextResponse } from 'next/server';
import { getViewer, validOrigin } from '@/lib/server/auth';
import { getDb } from '@/lib/server/db';
import { cardSchema } from '@/types/card';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_MODEL = 'gemini-2.5-flash-lite';
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const KEYS = ['fullName','jobTitle','companyName','email','phone','website','address','notes'] as const;
const LIMIT_BYTES = 11_000_000;
const respond = (error: string, status: number) => NextResponse.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });

type ImageInput = { mimeType: string; data: string };
function validateImages(body: unknown): ImageInput[] | null {
  if (!body || typeof body !== 'object' || !('images' in body) || !Array.isArray(body.images)) return null;
  if (body.images.length < 1 || body.images.length > 2) return null;
  const images: ImageInput[] = [];
  for (const image of body.images) {
    if (!image || typeof image !== 'object' || typeof image.mimeType !== 'string' || !IMAGE_TYPES.has(image.mimeType)
      || typeof image.data !== 'string' || image.data.length > 5_400_000 || image.data.length < 16
      || !/^[A-Za-z0-9+/]+={0,2}$/.test(image.data)) return null;
    images.push({ mimeType: image.mimeType, data: image.data });
  }
  return images;
}

/** Atomic per-account monthly cap, to protect against unexpected usage. */
async function reserveScan(userId: string): Promise<string | null> {
  const period = new Date().toISOString().slice(0, 7);
  const key = `${userId}:${period}`;
  const configured = Number(process.env.GEMINI_MONTHLY_SCAN_LIMIT ?? '100');
  const limit = Number.isSafeInteger(configured) && configured >= 1 ? Math.min(configured, 5000) : 100;
  const collection = (await getDb()).collection('gemini_scan_quota');
  await collection.updateOne({ _id: key as never }, { $setOnInsert: { count: 0, period, userId } }, { upsert: true });
  const result = await collection.findOneAndUpdate(
    { _id: key as never, count: { $lt: limit } },
    { $inc: { count: 1 } },
    { returnDocument: 'after' },
  );
  return result ? key : null;
}

async function releaseScan(key: string): Promise<void> {
  try { await (await getDb()).collection('gemini_scan_quota').updateOne({ _id: key as never, count: { $gt: 0 } }, { $inc: { count: -1 } }); }
  catch { /* A quota release failure must not expose data or break the response. */ }
}

export async function POST(request: NextRequest) {
  if (!validOrigin(request)) return respond('Invalid request origin.', 403);
  const viewer = await getViewer();
  if (!viewer) return respond('Please sign in before using Gemini AI.', 401);
  const key = process.env.GEMINI_API_KEY;
  if (!key) return respond('Gemini AI is not configured. Use Free OCR or ask the administrator to add GEMINI_API_KEY.', 503);
  if (Number(request.headers.get('content-length') || 0) > LIMIT_BYTES) return respond('Images are too large.', 413);
  let images: ImageInput[] | null;
  try {
    const raw = await request.text();
    if (raw.length > LIMIT_BYTES) return respond('Images are too large.', 413);
    images = validateImages(JSON.parse(raw));
  } catch { return respond('Invalid scan request.', 400); }
  if (!images) return respond('Provide one or two JPG, PNG, or WebP card images (maximum 4 MB each).', 400);

  let reservation: string | null;
  try { reservation = await reserveScan(viewer.id); }
  catch { return respond('Gemini usage limit could not be checked. Please try again later.', 503); }
  if (!reservation) return respond('Your monthly Gemini scan limit has been reached. Free OCR remains available.', 429);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  let upstreamSucceeded = false;
  try {
    const fields = Object.fromEntries(KEYS.map(field => [field, { type: 'STRING' }]));
    const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
    // Environment variable is administrator-controlled; restrict URL path format anyway.
    if (!/^[a-zA-Z0-9._-]+$/.test(model)) throw new Error('Invalid model configuration.');
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST', signal: controller.signal, cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [
          { text: 'Read this business card. Transcribe each contact field faithfully. Never guess missing text. Prefer the person name near the role/title. Include ALL office/address lines in address separated by newlines. Keep original spelling and phone country code. Return empty strings for missing values. Ignore decorative logo text and OCR artifacts. Do not include any explanations.' },
          ...images.map(image => ({ inlineData: image })),
        ] }],
        generationConfig: {
          temperature: 0, maxOutputTokens: 1024, responseMimeType: 'application/json',
          responseSchema: { type: 'OBJECT', properties: fields, required: [...KEYS] },
        },
      }),
    });
    if (!response.ok) {
      if (response.status === 429) return respond('Gemini provider rate limit reached. Please retry later or use Free OCR.', 429);
      if (response.status === 400) return respond('Gemini rejected the request. Check the model configuration and image format.', 502);
      return respond('Gemini is unavailable right now. Please retry later or use Free OCR.', 502);
    }
    upstreamSucceeded = true;
    const json: unknown = await response.json();
    const text = (json as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }).candidates?.[0]?.content?.parts?.map(p => p.text ?? '').join('') ?? '';
    if (!text) return respond('Gemini did not return readable contact details. Please retry or use Free OCR.', 502);
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object') return respond('Gemini returned invalid contact details.', 502);
    const values = Object.fromEntries(KEYS.map(k => [k, typeof (parsed as Record<string, unknown>)[k] === 'string'
      ? (parsed as Record<string, string>)[k].trim().slice(0, k === 'address' || k === 'notes' ? 2500 : 350) : '']));
    if (!values.fullName && !values.companyName && !values.email && !values.phone) return respond('No reliable contact fields found. Try Free OCR or a clearer photo.', 422);
    const card = cardSchema.parse({ id: crypto.randomUUID(), ...values, confidenceScore: 'Medium' });
    return NextResponse.json({ card }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return respond(controller.signal.aborted ? 'Gemini request timed out. Retry or use Free OCR.' : 'Could not process Gemini extraction. Try Free OCR.', 502);
  } finally {
    clearTimeout(timer);
    if (!upstreamSucceeded) await releaseScan(reservation);
  }
}
