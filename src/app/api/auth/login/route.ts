import { NextRequest, NextResponse } from 'next/server';
import { compare } from 'bcryptjs';
import { z } from 'zod';
import { createSession, validOrigin } from '@/lib/server/auth';
import { ensureIndexes, getDb } from '@/lib/server/db';
import { apiError, serverError } from '@/lib/server/http';
export const runtime = 'nodejs';
const input = z.object({ email: z.email().max(254).transform(v => v.toLowerCase().trim()), password: z.string().min(1).max(128) }).strict();
export async function POST(request: NextRequest) {
  if (!validOrigin(request)) return apiError('Invalid request origin.', 403);
  try {
    const raw = await request.text(); if (raw.length > 2000) return apiError('Request too large.', 413);
    const parsed = input.safeParse(JSON.parse(raw)); if (!parsed.success) return apiError('Incorrect email or password.', 401);
    await ensureIndexes();
    const db = await getDb();
    const attemptKey = `login:${parsed.data.email}`;
    const threshold = new Date(Date.now() - 15 * 60_000);
    const previous = await db.collection('auth_attempts').findOne({ key: attemptKey });
    if (previous && previous.count >= 8 && previous.lastAttempt > threshold) return apiError('Too many sign-in attempts. Try again in 15 minutes.', 429);
    const userRecord = await db.collection('users').findOne({ email: parsed.data.email });
    // Use a real bcrypt hash even for unknown accounts to reduce timing differences.
    const fallback = '$2b$12$C6UzMDM.H6dfI/f/IKcEeOthczZS1xAzyVmr4HljDZifzgL6kXGIe';
    const matches = await compare(parsed.data.password, typeof userRecord?.passwordHash === 'string' ? userRecord.passwordHash : fallback);
    if (!userRecord || !matches) {
      const count = previous && previous.lastAttempt > threshold ? Number(previous.count || 0) + 1 : 1;
      await db.collection('auth_attempts').updateOne({ key: attemptKey }, { $set: { count, lastAttempt: new Date(), expiresAt: new Date(Date.now() + 15 * 60_000) } }, { upsert: true });
      return apiError('Incorrect email or password.', 401);
    }
    await db.collection('auth_attempts').deleteOne({ key: attemptKey });
    const user = { id: userRecord._id.toHexString(), name: String(userRecord.name), email: String(userRecord.email) };
    const response = NextResponse.json({ user });
    await createSession(response, user);
    return response;
  } catch (error) {
    if (error instanceof SyntaxError) return apiError('Invalid JSON.', 400);
    return serverError(error);
  }
}
