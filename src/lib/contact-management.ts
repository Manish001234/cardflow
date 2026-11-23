import type { StoredCard } from '@/types/card';

export type ContactFilter = { favorite: boolean; review: 'all' | 'pending' | 'reviewed'; confidence: 'all' | 'High' | 'Medium' | 'Low'; company: string; tag: string };
export const defaultContactFilter: ContactFilter = { favorite: false, review: 'all', confidence: 'all', company: '', tag: '' };
export function normalizeTag(value: string): string { return value.trim().replace(/\s+/g, ' ').slice(0, 40); }
export function addTags(card: StoredCard, values: string[]): StoredCard {
  const tags = [...(card.tags ?? [])];
  for (const item of values) { const tag = normalizeTag(item); if (tag && !tags.some(old => old.toLocaleLowerCase() === tag.toLocaleLowerCase()) && tags.length < 20) tags.push(tag); }
  return { ...card, tags };
}
export function removeTag(card: StoredCard, value: string): StoredCard { return { ...card, tags: (card.tags ?? []).filter(tag => tag !== value) }; }
export function filterContacts(cards: StoredCard[], term: string, filter: ContactFilter): StoredCard[] {
  const query = term.toLocaleLowerCase().trim();
  return cards.filter(card => {
    if (filter.favorite && !card.favorite) return false;
    if (filter.review === 'pending' && card.reviewedAt) return false;
    if (filter.review === 'reviewed' && !card.reviewedAt) return false;
    if (filter.confidence !== 'all' && card.confidenceScore !== filter.confidence) return false;
    if (filter.company && card.companyName.toLocaleLowerCase() !== filter.company.toLocaleLowerCase()) return false;
    if (filter.tag && !(card.tags ?? []).some(tag => tag.toLocaleLowerCase() === filter.tag.toLocaleLowerCase())) return false;
    return !query || [card.fullName, card.companyName, card.jobTitle, card.email, card.phone, card.website, card.address, card.notes, ...(card.tags ?? [])].some(field => field.toLocaleLowerCase().includes(query));
  });
}
