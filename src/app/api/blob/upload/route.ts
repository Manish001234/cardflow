import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextRequest, NextResponse } from 'next/server';
import { getViewer, validOrigin } from '@/lib/server/auth';
import { MAX_IMAGE_BYTES, validImagePath } from '@/lib/blob-policy';
import { getDb, ensureIndexes } from '@/lib/server/db';
import { ObjectId } from 'mongodb';

export const runtime = 'nodejs';
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as HandleUploadBody;
    // Blob callbacks are authenticated by Vercel's signed payload; never accept a callback as a public user action.
    if (body.type === 'blob.generate-client-token') {
      if (!validOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
      if (!(await getViewer())) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
    }
    const result = await handleUpload({
      body, request,
      onBeforeGenerateToken: async (pathname) => {
        const viewer = await getViewer();
        if (!viewer) throw new Error('Sign in required.');
        await ensureIndexes();
        const minute = Math.floor(Date.now() / 60000);
        const limit = await (await getDb()).collection('blob_upload_limits').findOneAndUpdate(
          { _id: `${viewer.id}:${minute}` },
          { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(Date.now() + 2 * 3600_000) } },
          { upsert: true, returnDocument: 'after' });
        if ((limit?.count ?? 0) > 30) throw new Error('Too many image uploads. Try again in a minute.');
        const pieces = pathname.split('/');
        const cardId = pieces[2], side = pieces[3]?.startsWith('front-') ? 'front' : 'back';
        if (!cardId || !/^[0-9a-f-]{36}$/i.test(cardId) || !validImagePath(pathname, viewer.id, cardId, side)) throw new Error('Invalid card image path.');
        return { allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp'], maximumSizeInBytes: MAX_IMAGE_BYTES, addRandomSuffix: false,
          tokenPayload: JSON.stringify({ userId: viewer.id, cardId, side }) };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const payload = JSON.parse(tokenPayload || '{}') as { userId?: string; cardId?: string; side?: 'front'|'back' };
        if (!payload.userId || !payload.cardId || !payload.side || !validImagePath(blob.pathname, payload.userId, payload.cardId, payload.side)) throw new Error('Upload ownership check failed.');
        // Callback may arrive after the contact save. No public URL or token is stored here.
        await (await getDb()).collection('blob_uploads').updateOne(
          { userId: new ObjectId(payload.userId), pathname: blob.pathname },
          { $setOnInsert: { cardId: payload.cardId, side: payload.side, createdAt: new Date() } }, { upsert: true });
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Blob upload failed.' }, { status: 400 });
  }
}
