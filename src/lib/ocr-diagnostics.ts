import type { ContactParseDiagnostics } from './contact-parser';

// Ephemeral, browser-only debugging information. No localStorage, server calls,
// analytics or database writes. Limit retained scans to avoid exposing old cards.
const recent = new Map<string, ContactParseDiagnostics>();
const MAX_SCANS = 8;

export function rememberOCRDiagnostics(id: string, info: ContactParseDiagnostics): void {
  if (typeof window === 'undefined') return;
  recent.delete(id);
  recent.set(id, info);
  while (recent.size > MAX_SCANS) {
    const oldest = recent.keys().next().value;
    if (oldest === undefined) break;
    recent.delete(oldest);
  }
}

export function getOCRDiagnostics(id: string): ContactParseDiagnostics | undefined {
  return recent.get(id);
}

export function forgetOCRDiagnostics(id: string): void {
  recent.delete(id);
}
