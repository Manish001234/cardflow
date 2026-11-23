import { get } from '@vercel/blob';
import { ObjectId } from 'mongodb';
import { NextResponse } from 'next/server';
import { getViewer } from '@/lib/server/auth';
import { getDb } from '@/lib/server/db';
import { validImagePath, type CardSide } from '@/lib/blob-policy';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(_request: Request, context: { params: Promise<{ id: string; side: string }> }) {
  const viewer = await getViewer();
  if (!viewer) return new NextResponse('Unauthorized', { status: 401 });
  const { id, side } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id) || (side !== 'front' && side !== 'back')) return new NextResponse('Not found', { status: 404 });
  const card = await (await getDb()).collection('contacts').findOne({ userId: new ObjectId(viewer.id), id }, { projection: { images: 1 } });
  const pathname = card?.images?.[side as CardSide]?.pathname;
  if (typeof pathname !== 'string' || !validImagePath(pathname, viewer.id, id, side as CardSide)) return new NextResponse('Not found', { status: 404 });
  const blob = await get(pathname, { access: 'private' });
  if (!blob || blob.statusCode !== 200 || !blob.stream) return new NextResponse('Not found', { status: 404 });
  return new NextResponse(blob.stream, { headers: {
    'Content-Type': blob.blob.contentType,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox",
  } });
}
