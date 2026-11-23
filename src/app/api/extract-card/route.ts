import { NextResponse } from 'next/server';

/** Intentionally disabled: card images are processed inside the user's browser. */
export async function POST() {
  return NextResponse.json({ error: 'Server-based AI OCR is disabled. Update CardFlow and use local browser OCR.' },
    { status: 410, headers: { 'Cache-Control': 'no-store' } });
}
