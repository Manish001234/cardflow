import { NextResponse } from 'next/server';
export function apiError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
}
export function serverError(error: unknown) {
  console.error('CardFlow API error', error);
  return apiError('The server could not complete this request. Try again.', 500);
}
