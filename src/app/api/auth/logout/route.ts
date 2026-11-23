import { NextRequest, NextResponse } from 'next/server';
import { revokeSession, validOrigin } from '@/lib/server/auth';
import { apiError, serverError } from '@/lib/server/http';
export const runtime = 'nodejs';
export async function POST(request: NextRequest) {
  if (!validOrigin(request)) return apiError('Invalid request origin.', 403);
  try { const response = NextResponse.json({ ok: true }); await revokeSession(response); return response; }
  catch (error) { return serverError(error); }
}
