import type { StoredCard } from '@/types/card';
export interface ReviewHint { field: string; message: string; }
/** Heuristic, non-authoritative suggestions; not a calibrated model confidence score. */
export function getReviewHints(card: StoredCard): ReviewHint[] {
  const hints: ReviewHint[] = [];
  if (card.confidenceScore !== 'High') hints.push({ field: 'image', message: `${card.confidenceScore} image clarity: verify details against the photo.` });
  if (!card.fullName.trim()) hints.push({ field: 'fullName', message: 'Name was not detected.' });
  if (!card.email.trim() && !card.phone.trim()) hints.push({ field: 'contact', message: 'Neither an email nor a phone number was detected.' });
  if (card.email && card.email.split(',').some(email => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))) hints.push({ field: 'email', message: 'Email format needs verification.' });
  if (card.phone && card.phone.split(',').some(phone => phone.replace(/\D/g, '').length < 7)) hints.push({ field: 'phone', message: 'Phone number looks unusually short.' });
  if (!card.companyName.trim()) hints.push({ field: 'companyName', message: 'Company was not detected.' });
  return hints;
}
