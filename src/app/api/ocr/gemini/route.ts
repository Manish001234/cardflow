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

// The former route mapped Google 401/403/404 and other errors to one generic 502.
// Keep diagnostics limited to status/category: never print the API key, OCR text,
// upstream error bodies, request headers, or image data.
type ProviderFailure = { status: number; message: string; category: string };
function classifyGeminiFailure(httpStatus: number, providerCode: string): ProviderFailure {
  const code = providerCode.toUpperCase();
  if (httpStatus === 401 || code === 'UNAUTHENTICATED') return {
    status: 502, category: 'authentication',
    message: 'Google rejected the Gemini API credentials. Create a new API key in Google AI Studio and update GEMINI_API_KEY.',
  };
  if (httpStatus === 403 || code === 'PERMISSION_DENIED') return {
    status: 502, category: 'permission_or_billing',
    message: 'Google denied Gemini access. Check the API key restrictions, project access, and billing status in Google AI Studio.',
  };
  if (httpStatus === 404 || code === 'NOT_FOUND') return {
    status: 502, category: 'model_unavailable',
    message: 'The configured Gemini model was not found or is unavailable to this project. Check GEMINI_MODEL and model access in Google AI Studio.',
  };
  if (httpStatus === 429 || code === 'RESOURCE_EXHAUSTED') return {
    status: 429, category: 'quota',
    message: 'Google Gemini quota or rate limit was reached. Check usage and billing in Google AI Studio, or use Free OCR.',
  };
  if (httpStatus === 400 || code === 'INVALID_ARGUMENT') return {
    status: 502, category: 'invalid_request',
    message: 'Google rejected the Gemini request or its structured-output configuration. Check the model and image format.',
  };
  if (httpStatus === 503 || httpStatus === 500 || httpStatus === 502 || httpStatus === 504) return {
    status: 502, category: 'upstream_unavailable',
    message: 'Google Gemini is temporarily unavailable. Retry later or use Free OCR.',
  };
  return { status: 502, category: 'upstream_error', message: 'Google Gemini could not process this request. Check the server error category or use Free OCR.' };
}

async function upstreamErrorCode(response: Response): Promise<string> {
  try {
    // Google uses {error:{code,status,message}}. Only read the fixed status code,
    // not the potentially sensitive error message.
    const payload: unknown = await response.json();
    if (payload && typeof payload === 'object' && 'error' in payload) {
      const error = payload.error;
      if (error && typeof error === 'object' && 'status' in error && typeof error.status === 'string') {
        return /^[A-Z_]{3,48}$/.test(error.status) ? error.status : 'UNKNOWN';
      }
    }
  } catch { /* Empty/malformed upstream error response. */ }
  return 'UNKNOWN';
}

function logGeminiDiagnostic(category: string, status?: number, code?: string): void {
  // Operational metadata only. Never include image content or secrets.
  console.error('[CardFlow Gemini]', { category, ...(status ? { upstreamStatus: status } : {}), ...(code ? { providerCode: code } : {}) });
}

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
    // Retry only transient upstream failures; never retry invalid key, unsupported
    // model, quota failures, or malformed requests. Budget all attempts together.
    const fallback = process.env.GEMINI_FALLBACK_MODEL?.trim();
    const models = [model];
    if (fallback && fallback !== model) {
      if (!/^[a-zA-Z0-9._-]+$/.test(fallback)) throw new Error('Invalid fallback model configuration.');
      models.push(fallback);
    }
    const requestBody = JSON.stringify({
      contents: [{ role: 'user', parts: [
        { text: 'Read this business card. Transcribe each contact field faithfully. Never guess missing text. Prefer the person name near the role/title. Include ALL office/address lines in address separated by newlines. Keep original spelling and phone country code. Return empty strings for missing values. Ignore decorative logo text and OCR artifacts. Do not include any explanations.' },
        ...images.map(image => ({ inlineData: image })),
      ] }],
      generationConfig: {
        temperature: 0, maxOutputTokens: 1024, responseMimeType: 'application/json',
        responseSchema: { type: 'OBJECT', properties: fields, required: [...KEYS] },
      },
    });
    let response: Response | undefined;
    let activeModel = model;
    for (const candidateModel of models) {
      activeModel = candidateModel;
      // One extra attempt per model on 500/502/503/504, with shared timeout.
      for (let attempt = 1; attempt <= 2; attempt++) {
        if (controller.signal.aborted) throw new Error('Gemini request timed out.');
        response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${candidateModel}:generateContent`, {
          method: 'POST', signal: controller.signal, cache: 'no-store',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          body: requestBody,
        });
        if (response.ok) break;
        const transient = [500, 502, 503, 504].includes(response.status);
        logGeminiDiagnostic(transient ? 'transient_upstream_failure' : 'non_retryable_upstream_failure', response.status, `model=${candidateModel};attempt=${attempt}`);
        if (!transient) break;
        if (attempt === 1) {
          // Consume the error response before retrying to release its connection.
          await response.body?.cancel().catch(() => undefined);
          await new Promise<void>((resolve, reject) => {
            const wait = setTimeout(resolve, 850);
            controller.signal.addEventListener('abort', () => { clearTimeout(wait); reject(new Error('Gemini request timed out.')); }, { once: true });
          });
        }
      }
      if (response?.ok || !response || ![500, 502, 503, 504].includes(response.status)) break;
    }
    if (!response) throw new Error('No Gemini response.');
    if (!response.ok) {
      const providerCode = await upstreamErrorCode(response);
      const failure = classifyGeminiFailure(response.status, providerCode);
      logGeminiDiagnostic(failure.category, response.status, `model=${activeModel};provider=${providerCode}`);
      return respond(failure.message, failure.status);
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
  } catch (error) {
    const timedOut = controller.signal.aborted;
    const category = timedOut ? 'timeout' : error instanceof SyntaxError ? 'invalid_provider_json' : 'network_or_processing';
    logGeminiDiagnostic(category);
    return respond(timedOut
      ? 'Gemini request timed out. Retry or use Free OCR.'
      : 'Could not complete Gemini extraction. Check the CardFlow server log for the error category or use Free OCR.', 502);
  } finally {
    clearTimeout(timer);
    if (!upstreamSucceeded) await releaseScan(reservation);
  }
}
