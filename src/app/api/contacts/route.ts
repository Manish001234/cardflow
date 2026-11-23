import { NextRequest, NextResponse } from 'next/server';
import { del, head } from '@vercel/blob';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { getViewer, validOrigin } from '@/lib/server/auth';
import { ensureIndexes, getDb } from '@/lib/server/db';
import { apiError, serverError } from '@/lib/server/http';
import { cardSchema, type StoredCard } from '@/types/card';
import { IMAGE_MIMES, MAX_IMAGE_BYTES, validImagePath } from '@/lib/blob-policy';
type ContactDocument = Omit<StoredCard, 'revision'> & { userId: ObjectId; revision?: number | null };
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const image = z.object({ pathname: z.string().max(300), size: z.number().int().min(1).max(MAX_IMAGE_BYTES), contentType: z.enum(IMAGE_MIMES) }).strict();
const stored = cardSchema.extend({
  preview: z.string().max(450000), backPreview: z.string().max(450000).optional(),
  sourceName: z.string().max(255), createdAt: z.iso.datetime(),
  reviewedAt: z.iso.datetime().optional(), favorite: z.boolean().optional(),
  tags: z.array(z.string().max(60)).max(30).optional(),
  revision: z.number().int().min(0).optional(),
  images: z.object({ front: image.optional(), back: image.optional() }).strict().optional(),
}).strict();
const operations = z.object({ operations: z.array(z.discriminatedUnion('type', [
  z.object({ type: z.literal('upsert'), card: stored }).strict(),
  z.object({ type: z.literal('delete'), id: z.uuid(), expectedRevision: z.number().int().min(0) }).strict(),
])).length(1) }).strict();
const projection = { _id: 0, userId: 0 };
const toClient = (record: Record<string, unknown>): StoredCard => {
  const card = stored.parse(record);
  return {
    ...card,
    revision: card.revision ?? 0,
    preview: card.images?.front ? `/api/cards/${card.id}/image/front` : card.preview,
    backPreview: card.images?.back ? `/api/cards/${card.id}/image/back` : card.backPreview,
  };
};
const revisionMatch = (expected: number) => expected === 0 ? { $in: [null, 0] } : expected;
async function verifyImages(userId: string, card: z.infer<typeof stored>) {
  for (const side of ['front', 'back'] as const) {
    const item = card.images?.[side];
    if (!item) continue;
    if (!validImagePath(item.pathname, userId, card.id, side)) throw new Error('Image path does not belong to this contact.');
    const remote = await head(item.pathname);
    if (remote.size !== item.size || remote.contentType !== item.contentType || !remote.url.includes('.private.blob.vercel-storage.com/')) {
      throw new Error('Image metadata or private storage verification failed.');
    }
  }
}
async function cleanupImages(before: Pick<StoredCard, 'images'> | null, after?: Pick<StoredCard, 'images'>) {
  if (!before?.images) return;
  const oldPaths = [before.images.front?.pathname, before.images.back?.pathname].filter((p): p is string => !!p);
  const current = new Set([after?.images?.front?.pathname, after?.images?.back?.pathname]);
  for (const path of oldPaths) if (!current.has(path)) {
    try { await del(path); }
    catch { // Cleanup failure must not report a successfully committed contact write as failed.
      try { await (await getDb()).collection('blob_cleanup').updateOne({ pathname: path }, { $setOnInsert: { pathname: path, createdAt: new Date() } }, { upsert: true }); } catch { /* Log infrastructure failures separately in monitoring. */ }
    }
  }
}
export async function GET() {
  try {
    const viewer = await getViewer(); if (!viewer) return apiError('Sign in required.', 401);
    const results = await (await getDb()).collection('contacts').find({ userId: new ObjectId(viewer.id) }, { projection }).sort({ createdAt: -1 }).limit(10000).toArray();
    const cards = results.map(record => stored.safeParse(record)).filter(result => result.success).map(result => toClient(result.data));
    return NextResponse.json({ cards }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return serverError(error); }
}
export async function POST(request: NextRequest) {
  if (!validOrigin(request)) return apiError('Invalid request origin.', 403);
  try {
    const viewer = await getViewer(); if (!viewer) return apiError('Sign in required.', 401);
    if (Number(request.headers.get('content-length') || 0) > 2_000_000) return apiError('Request too large.', 413);
    const raw = await request.text(); if (raw.length > 2_000_000) return apiError('Request too large.', 413);
    const parsed = operations.safeParse(JSON.parse(raw));
    if (!parsed.success) return apiError('Invalid contact update payload.', 400);
    await ensureIndexes();
    const collection = (await getDb()).collection<ContactDocument>('contacts');
    const userId = new ObjectId(viewer.id);
    const op = parsed.data.operations[0];
    if (op.type === 'delete') {
      const oldRecord = await collection.findOneAndDelete({ userId, id: op.id, revision: revisionMatch(op.expectedRevision) });
      if (!oldRecord) return apiError('Conflict: contact changed on another device. Reload before deleting.', 409);
      await cleanupImages(oldRecord);
      return NextResponse.json({ ok: true });
    }
    const { card } = op;
    const current = await collection.findOne({ userId, id: card.id });
    const expected = card.revision ?? 0;
    const currentRevision = typeof current?.revision === 'number' ? current.revision : 0;
    if ((current && currentRevision !== expected) || (!current && expected !== 0)) return apiError('Conflict: this contact changed on another device. Reload and review before saving.', 409);
    // A card that already owns an image may keep it without reuploading.
    await verifyImages(viewer.id, card);
    const newRevision = expected + 1;
    const data = { ...card, revision: newRevision, userId,
      preview: card.images?.front ? '' : card.preview,
      backPreview: card.images?.back ? '' : card.backPreview };
    try {
      if (!current) await collection.insertOne(data);
      else {
        const result = await collection.replaceOne({ userId, id: card.id, revision: revisionMatch(expected) }, data);
        if (!result.matchedCount) return apiError('Conflict: this contact was edited elsewhere. Reload to resolve.', 409);
      }
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 11000) return apiError('Conflict: contact was created elsewhere.', 409);
      throw error;
    }
    // Deleting a blob is best-effort; durable cleanup records handle failures.
    await cleanupImages(current, card);
    return NextResponse.json({ ok: true, revision: newRevision });
  } catch (error) {
    if (error instanceof SyntaxError) return apiError('Invalid JSON.', 400);
    if (error instanceof Error && (error.message.startsWith('Image path') || error.message.startsWith('Image metadata'))) return apiError(error.message, 400);
    return serverError(error);
  }
}
