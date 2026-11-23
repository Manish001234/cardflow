import type { StoredCard } from '@/types/card';
export type ContactOperation = { type: 'upsert'; card: StoredCard } | { type: 'delete'; id: string; expectedRevision: number };
/** Diffs only changed IDs; avoids deleting records added on other devices. */
export function contactDiff(previous: StoredCard[], next: StoredCard[]): ContactOperation[] {
  const before = new Map(previous.map(card => [card.id, card]));
  const after = new Map(next.map(card => [card.id, card]));
  const operations: ContactOperation[] = [];
  for (const card of next) if (JSON.stringify(card) !== JSON.stringify(before.get(card.id))) operations.push({ type: 'upsert', card });
  for (const card of previous) if (!after.has(card.id)) operations.push({ type: 'delete', id: card.id, expectedRevision: card.revision ?? 0 });
  return operations;
}
export function mergeBrowserContacts(cloud: StoredCard[], local: StoredCard[]) {
  const ids = new Set(cloud.map(card => card.id));
  return [...cloud, ...local.filter(card => !ids.has(card.id))];
}
