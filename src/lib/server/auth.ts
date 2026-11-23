import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import type { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getDb } from './db';

const COOKIE = 'cardflow_session';
const DAYS = 30;
export interface Viewer { id: string; name: string; email: string; }
const hash = (token: string) => createHash('sha256').update(token).digest('hex');

export async function createSession(response: NextResponse, user: Viewer): Promise<void> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + DAYS * 86400000);
  const db = await getDb();
  await db.collection('sessions').insertOne({ tokenHash: hash(token), userId: new ObjectId(user.id), expiresAt });
  response.cookies.set(COOKIE, token, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax',
    path: '/', expires: expiresAt,
  });
}

export async function getViewer(): Promise<Viewer | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const db = await getDb();
  const session = await db.collection('sessions').findOne({ tokenHash: hash(token), expiresAt: { $gt: new Date() } });
  if (!session || !(session.userId instanceof ObjectId)) return null;
  const user = await db.collection('users').findOne({ _id: session.userId }, { projection: { name: 1, email: 1 } });
  if (!user) return null;
  return { id: user._id.toHexString(), name: String(user.name), email: String(user.email) };
}

export async function revokeSession(response: NextResponse): Promise<void> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (token) await (await getDb()).collection('sessions').deleteOne({ tokenHash: hash(token) });
  response.cookies.set(COOKIE, '', { path: '/', maxAge: 0, httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' });
}

export function validOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  // Browser fetch() sends Origin for cross-origin POST/PUT/DELETE and normally same-origin mutations.
  // If absent (non-browser clients), demand a non-simple JSON request Content-Type.
  if (!origin) return request.headers.get('content-type')?.startsWith('application/json') === true;
  try { return new URL(origin).host === request.nextUrl.host && new URL(origin).protocol === request.nextUrl.protocol; }
  catch { return false; }
}
