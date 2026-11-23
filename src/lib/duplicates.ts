import type { StoredCard } from '@/types/card';

export type MatchStrength = 'exact' | 'probable';
export interface DuplicateMatch { existingId: string; strength: MatchStrength; reason: string; }
const norm = (value: string) => value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
const emails = (value: string) => value.split(/[;,]/).map(v => v.trim().toLowerCase()).filter(v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v));
const phones = (value: string) => value.split(/[;,]/).map(v => v.replace(/\D/g, '')).filter(v => v.length >= 7);
const phoneMatches = (a: string, b: string) => a === b || (a.length >= 10 && b.length >= 10 && a.slice(-10) === b.slice(-10));
const overlap = (a: string[], b: string[]) => a.some(v => b.includes(v));
function similarity(left: string, right: string): number {
  if (!left || !right) return 0;
  if (left === right) return 1;
  const a = left.split(' '), b = right.split(' ');
  const common = a.filter(word => b.includes(word)).length;
  return common / Math.max(a.length, b.length);
}
/** Suggestions only. No contacts are ever deleted or merged automatically. */
export function findDuplicate(candidate: StoredCard, existing: StoredCard[]): DuplicateMatch | null {
  const candidateEmails = emails(candidate.email), candidatePhones = phones(candidate.phone);
  let probable: DuplicateMatch | null = null;
  for (const card of existing) {
    if (card.id === candidate.id) continue;
    if (candidateEmails.length && overlap(candidateEmails, emails(card.email))) return { existingId: card.id, strength: 'exact', reason: 'Matching email address' };
    if (candidatePhones.some(phone => phones(card.phone).some(other => phoneMatches(phone, other)))) return { existingId: card.id, strength: 'exact', reason: 'Matching phone number' };
    const name = similarity(norm(candidate.fullName), norm(card.fullName));
    const company = similarity(norm(candidate.companyName), norm(card.companyName));
    if (name === 1 && company === 1 && name > 0) return { existingId: card.id, strength: 'exact', reason: 'Same name and company' };
    if (name >= 0.65 && company >= 0.65 && !probable) probable = { existingId: card.id, strength: 'probable', reason: 'Similar name and company' };
  }
  return probable;
}
const uniqueParts = (value: string) => [...new Set(value.split(',').map(v => v.trim()).filter(Boolean))];
/** Existing record is authoritative; fill blanks and add distinct contact channels. */
export function mergeCards(existing: StoredCard, incoming: StoredCard): StoredCard {
  const merged = { ...existing };
  const primary = ['fullName', 'jobTitle', 'companyName', 'website', 'address', 'notes'] as const;
  for (const field of primary) if (!merged[field].trim()) merged[field] = incoming[field];
  for (const field of ['email', 'phone'] as const) {
    const values = uniqueParts(existing[field]);
    for (const value of uniqueParts(incoming[field])) {
      if (!values.some(old => old.toLowerCase() === value.toLowerCase())) values.push(value);
    }
    merged[field] = values.join(', ');
  }
  if (!merged.preview && incoming.preview) merged.preview = incoming.preview;
  if (!merged.backPreview && incoming.backPreview) merged.backPreview = incoming.backPreview;
  if (!merged.images?.front && incoming.images?.front) merged.images = { ...merged.images, front: incoming.images.front };
  if (!merged.images?.back && incoming.images?.back) merged.images = { ...merged.images, back: incoming.images.back };
  if (merged.confidenceScore === 'Low' && incoming.confidenceScore !== 'Low') merged.confidenceScore = incoming.confidenceScore;
  merged.tags = [...new Set([...(existing.tags ?? []), ...(incoming.tags ?? [])])].slice(0, 20);
  merged.favorite = Boolean(existing.favorite || incoming.favorite);
  return merged;
}
