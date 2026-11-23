import { NextRequest, NextResponse } from 'next/server';
import { hash } from 'bcryptjs';
import { z } from 'zod';
import { createSession, validOrigin } from '@/lib/server/auth';
import { ensureIndexes, getDb } from '@/lib/server/db';
import { apiError, serverError } from '@/lib/server/http';
export const runtime = 'nodejs';
const input = z.object({ name: z.string().trim().min(2).max(80), email: z.email().max(254).transform(v => v.toLowerCase().trim()), password: z.string().min(12).max(128) }).strict();
export async function POST(request: NextRequest) {
  if (!validOrigin(request)) return apiError('Invalid request origin.', 403);
  try {
    const raw = await request.text();
    if (raw.length > 2000) return apiError('Request too large.', 413);
    const parsed = input.safeParse(JSON.parse(raw));
    if (!parsed.success) return apiError('Enter a name, valid email, and password of at least 12 characters.', 400);
    await ensureIndexes();
    const db = await getDb();
    const passwordHash = await hash(parsed.data.password, 12);
    const result = await db.collection('users').insertOne({ name: parsed.data.name, email: parsed.data.email, passwordHash, createdAt: new Date() });
    const user = { id: result.insertedId.toHexString(), name: parsed.data.name, email: parsed.data.email };
    const response = NextResponse.json({ user }, { status: 201 });
    await createSession(response, user);
    return response;
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 11000) return apiError('An account with this email already exists.', 409);
    if (error instanceof SyntaxError) return apiError('Invalid JSON.', 400);
    return serverError(error);
  }
}
