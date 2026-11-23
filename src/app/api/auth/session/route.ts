import { NextResponse } from 'next/server';
import { getViewer } from '@/lib/server/auth';
import { serverError } from '@/lib/server/http';
export const runtime = 'nodejs';
export async function GET() {
  try { return NextResponse.json({ user: await getViewer() }, { headers: { 'Cache-Control': 'no-store' } }); }
  catch (error) { return serverError(error); }
}
