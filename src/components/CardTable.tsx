'use client';
import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Star, Tag, Copy, ExternalLink, FileImage, Mail, Eye, Phone, SearchX, Trash2, X } from 'lucide-react';
import { filterContacts, addTags, type ContactFilter } from '@/lib/contact-management';
import { getReviewHints } from '@/lib/scan-quality';
import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog';
import { editableFields, type EditableField, type StoredCard } from '@/types/card';

interface Props {
  cards: StoredCard[];
  search: string;
  filter: ContactFilter;
  onBulkDelete: (ids: string[]) => Promise<boolean>;
  onBulkFavorite: (ids: string[], favorite: boolean) => void;
  onBulkTags: (ids: string[], tags: string[]) => void;
  onFavorite: (id: string) => void;
  onTags: (id: string, tags: string[]) => void;
  onEdit: (id: string, field: EditableField, value: string) => void;
  onDelete: (id: string) => Promise<boolean>;
  onReviewed: (id: string) => void;
  deleting: boolean;
  processingCount: number;
  onScan?: () => void;
}
const labels: Record<EditableField, string> = {
  fullName: 'Full name', jobTitle: 'Job title', companyName: 'Company', email: 'Email',
  phone: 'Phone', website: 'Website', address: 'Address', notes: 'Notes',
};
type SortKey = EditableField | 'createdAt' | 'confidenceScore';
const priorities: EditableField[] = ['fullName', 'companyName', 'email', 'phone'];

export function CardTable({ cards, search, filter, onBulkDelete, onBulkFavorite, onBulkTags, onFavorite, onTags, onEdit, onDelete, onReviewed, processingCount, deleting, onScan }: Props) {
  const [sort, setSort] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'createdAt', direction: 'desc' });
  const [selected, setSelected] = useState<string | null>(null);
  const [checked, setChecked] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ ids: string[]; label: string } | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const current = cards.find(card => card.id === selected);
  const visible = useMemo(() => {
    return filterContacts(cards, search, filter)
      .sort((a, b) => (sort.direction === 'asc' ? 1 : -1) * a[sort.key].localeCompare(b[sort.key], undefined, { numeric: true, sensitivity: 'base' }));
  }, [cards, search, filter, sort]);
  const visibleIds = visible.map(card => card.id);
  const selectedIds = checked.filter(id => cards.some(card => card.id === id));
  const visibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.includes(id));
  const toggleAll = () => setChecked(old => visibleSelected ? old.filter(id => !visibleIds.includes(id)) : [...new Set([...old, ...visibleIds])]);
  const toggleOne = (id: string) => setChecked(old => old.includes(id) ? old.filter(item => item !== id) : [...old, id]);
  const bulkDelete = () => {
    if (selectedIds.length && !deleting) {
      setDeleteError('');
      setDeleteTarget({ ids: [...selectedIds], label: `${selectedIds.length} selected contacts` });
    }
  };
  const confirmDeletion = async () => {
    if (!deleteTarget || deleting) return;
    const ids = deleteTarget.ids;
    try {
      const ok = ids.length === 1 ? await onDelete(ids[0]) : await onBulkDelete(ids);
      if (ok) {
        setChecked(previous => previous.filter(id => !ids.includes(id)));
        setDeleteTarget(null);
        setDeleteError('');
        if (ids.includes(selected || '')) setSelected(null);
      } else setDeleteError('Deletion was not confirmed. Your contact directory has been preserved or refreshed. Check the message above and try again.');
    } catch {
      setDeleteError('Deletion failed. Please check your connection and try again.');
    }
  };
  const bulkTags = () => { const tags = tagInput.split(/[;,]/).map(v => v.trim()).filter(Boolean); if (!tags.length) return; onBulkTags(selectedIds, tags); setTagInput(''); };
  const toggleSort = (key: SortKey) => setSort(old => ({ key, direction: old.key === key && old.direction === 'asc' ? 'desc' : 'asc' }));
  useEffect(() => {
    if (!current) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setSelected(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current]);
  const copy = async (value: string, key: string) => {
    try { await navigator.clipboard.writeText(value); setCopied(key); window.setTimeout(() => setCopied(null), 1500); } catch { /* Clipboard may not be available in insecure contexts. */ }
  };
  const sortHeading = (key: SortKey, name: string) => <button type="button" onClick={() => toggleSort(key)} className="inline-flex items-center gap-1.5 font-semibold text-slate-500 hover:text-blue-600" aria-label={`Sort by ${name}`}>
    {name}{sort.key === key ? sort.direction === 'asc' ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" /> : <ArrowUpDown className="size-3.5 opacity-40" />}
  </button>;
  return <>
    {deleteTarget && <DeleteConfirmDialog
      title={`Delete ${deleteTarget.label}?`}
      description="The selected contact records will be permanently removed from MongoDB. This cannot be undone. The page will verify the change before removing them from the table."
      busy={deleting}
      error={deleteError}
      onCancel={() => { if (!deleting) { setDeleteTarget(null); setDeleteError(''); } }}
      onConfirm={confirmDeletion}
    />}
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-5 sm:px-6">
        <div><h2 className="text-base font-bold text-slate-900">Contact directory</h2><p className="mt-1 text-xs text-slate-500">Edit the key fields directly, or open a record to verify the full card.</p></div>
        <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">{visible.length} of {cards.length} contacts</span>
      </div>
      {selectedIds.length > 0 && <div className="flex flex-wrap items-center gap-2 border-b border-blue-100 bg-blue-50/70 px-5 py-3 text-xs sm:px-6">
        <span className="mr-2 font-bold text-blue-800">{selectedIds.length} selected</span>
        <button type="button" onClick={() => onBulkFavorite(selectedIds, true)} className="rounded-lg border border-blue-200 bg-white px-3 py-2 font-semibold">★ Favourite</button>
        <button type="button" onClick={() => onBulkFavorite(selectedIds, false)} className="rounded-lg border border-blue-200 bg-white px-3 py-2 font-semibold">Remove favourite</button>
        <input type="text" value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') bulkTags(); }} placeholder="Tag selected contacts" aria-label="Tags for selected contacts" className="min-w-36 rounded-lg border border-blue-200 px-3 py-2 outline-none" />
        <button type="button" onClick={bulkTags} className="rounded-lg bg-blue-600 px-3 py-2 font-semibold text-white">Add tags</button>
        <button type="button" onClick={bulkDelete} disabled={deleting} className="rounded-lg border border-rose-200 bg-white px-3 py-2 font-semibold text-rose-600">Delete selected</button>
        <button type="button" onClick={() => setChecked([])} className="ml-auto text-slate-500 hover:text-slate-900">Clear selection</button>
      </div>}
      {cards.length === 0 && processingCount === 0 ? <div className="flex min-h-72 flex-col items-center justify-center p-8 text-center">
        <span className="mb-4 rounded-2xl bg-blue-50 p-4"><FileImage className="size-7 text-blue-600" /></span>
        <p className="font-semibold">No contacts yet</p><p className="mt-1 max-w-sm text-sm text-slate-500">Scan a business card to start your contact directory.</p>
        {onScan && <button onClick={onScan} className="mt-5 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">Scan cards</button>}
      </div> : <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse text-left text-sm">
          <thead className="bg-slate-50/90 text-xs"><tr>
            <th className="w-9 px-3 py-4"><input type="checkbox" aria-label="Select all displayed contacts" checked={visibleSelected} onChange={toggleAll} className="size-4 accent-blue-600" /></th><th className="w-16 px-3 py-4 font-semibold text-slate-500">Card</th>
            {priorities.map(key => <th scope="col" key={key} className="px-3 py-4">{sortHeading(key, labels[key])}</th>)}
            <th className="px-3 py-4">{sortHeading('confidenceScore', 'Confidence')}</th>
            <th className="px-4 py-4 text-right font-semibold text-slate-500">Actions</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {visible.map(card => <tr key={card.id} className="group transition-colors hover:bg-slate-50/80">
              <td className="px-3 py-3"><input type="checkbox" aria-label={`Select ${card.fullName || card.sourceName}`} checked={selectedIds.includes(card.id)} onChange={() => toggleOne(card.id)} className="size-4 accent-blue-600" /></td><td className="px-3 py-3"><button type="button" onClick={() => setSelected(card.id)} aria-label={`View ${card.fullName || card.sourceName}`} className="flex size-12 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 hover:border-blue-400">
                {card.preview ? <img src={card.preview} alt={`Card: ${card.sourceName}`} className="size-full object-contain" /> : <FileImage className="size-5 text-slate-400" />}
              </button></td>
              {priorities.map(key => <td key={key} className="max-w-[215px] px-2 py-3"><input type="text" value={card[key]} onChange={event => onEdit(card.id, key, event.target.value)} aria-label={`${labels[key]} for ${card.fullName || card.sourceName}`} title={card[key]} placeholder="—" className={`w-full min-w-0 rounded-lg border border-transparent bg-transparent px-2 py-2 text-sm outline-none hover:border-slate-200 focus:border-blue-400 focus:bg-white ${key === 'fullName' ? 'font-semibold text-slate-900' : 'text-slate-600'}`} /></td>)}
              <td className="px-3 py-3"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${card.confidenceScore === 'High' ? 'bg-emerald-50 text-emerald-700' : card.confidenceScore === 'Medium' ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'}`}>{card.confidenceScore}</span></td>
              <td className="px-4 py-3"><div className="flex items-center justify-end gap-1"><button type="button" onClick={() => onFavorite(card.id)} aria-label={`${card.favorite ? 'Remove from' : 'Add to'} favourites: ${card.fullName}`} title="Toggle favourite" className="rounded-lg p-2 hover:bg-amber-50"><Star className={`size-4 ${card.favorite ? 'fill-amber-400 text-amber-500' : 'text-slate-400'}`} /></button><button type="button" onClick={() => setSelected(card.id)} aria-label={`View ${card.fullName || card.sourceName}`} title="View contact" className="rounded-lg p-2 text-slate-500 hover:bg-blue-50 hover:text-blue-700"><Eye className="size-4" /></button><button type="button" onClick={() => { setDeleteError(''); setDeleteTarget({ ids: [card.id], label: card.fullName || card.sourceName }); }} disabled={deleting} aria-label={`Delete ${card.fullName}`} className="rounded-lg p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="size-4" /></button></div></td>
            </tr>)}
            {Array.from({ length: processingCount }).map((_, i) => <tr key={`pending-${i}`}><td colSpan={8} className="px-5 py-3"><div className="h-10 animate-pulse rounded-lg bg-slate-100" /></td></tr>)}
          </tbody>
        </table>
        {visible.length === 0 && cards.length > 0 && processingCount === 0 && <div className="flex items-center justify-center gap-2 p-10 text-sm text-slate-500"><SearchX className="size-5" /> No contacts match your search.</div>}
      </div>}
      <div className="border-t border-slate-100 px-5 py-4 text-xs text-slate-400 sm:px-6">Directory exports include all {cards.length} contacts, regardless of active filters. Selections apply only to visible bulk actions.</div>
    </section>
    {current && <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/55" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setSelected(null); }}>
      <aside role="dialog" aria-modal="true" aria-labelledby="verify-title" className="flex h-full w-full max-w-3xl flex-col bg-white shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-7"><div><h3 id="verify-title" className="text-lg font-bold text-slate-900">Review contact</h3><p className="mt-0.5 text-xs text-slate-500">{current.sourceName} · Auto-saved</p></div><button onClick={() => setSelected(null)} aria-label="Close contact details" className="rounded-xl border border-slate-200 p-2 hover:bg-slate-50"><X className="size-5" /></button></div>
        <div className="grid min-h-0 flex-1 overflow-y-auto md:grid-cols-2">
          <div className="flex flex-col gap-4 border-b border-slate-100 bg-slate-50 p-5 md:sticky md:top-0 md:h-fit md:border-b-0 md:border-r md:p-6">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Original scan</p>
            <div className="flex min-h-52 items-center justify-center rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">{current.preview ? <img src={current.preview} alt="Uploaded card preview" className="max-h-[55vh] w-full object-contain" /> : <span className="text-center text-xs text-slate-500">Preview unavailable; contact details are still saved.</span>}</div>
            {current.backPreview && <><p className="text-xs font-bold uppercase tracking-widest text-slate-400">Back of card</p><div className="flex min-h-40 items-center justify-center rounded-2xl border border-slate-200 bg-white p-4"><img src={current.backPreview} alt="Back side of uploaded card" className="max-h-64 w-full object-contain"/></div></>}
            <span className={`w-fit rounded-full px-3 py-1.5 text-xs font-bold ${current.confidenceScore === 'High' ? 'bg-emerald-100 text-emerald-700' : current.confidenceScore === 'Medium' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>{current.confidenceScore} image clarity</span>
          </div>
          <div className="space-y-4 p-5 pb-10 md:p-6"><p className="text-xs font-bold uppercase tracking-widest text-slate-400">Extracted information</p>
            {editableFields.map(field => <label key={field} className="block text-xs font-semibold text-slate-500">{labels[field]}
              <div className="relative mt-1.5"><input value={current[field]} onChange={event => onEdit(current.id, field, event.target.value)} placeholder="Not provided" className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 pr-10 text-sm font-normal text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
                {current[field] && (field === 'email' || field === 'phone' || field === 'website') && <button type="button" onClick={() => void copy(current[field], field)} aria-label={`Copy ${labels[field]}`} title={copied === field ? 'Copied!' : 'Copy'} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-blue-600"><Copy className="size-4" /></button>}
              </div>
            </label>)}
            <div className="rounded-xl border border-slate-200 p-3"><div className="flex items-center justify-between"><p className="flex items-center gap-2 text-xs font-bold text-slate-700"><Tag className="size-4"/> Tags</p><button type="button" onClick={() => onFavorite(current.id)} className={`rounded-lg px-3 py-2 text-xs font-semibold ${current.favorite ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>{current.favorite ? '★ Favourite' : '☆ Add favourite'}</button></div><div className="mt-3 flex flex-wrap gap-2">{(current.tags ?? []).map(tag => <button type="button" key={tag} onClick={() => onTags(current.id, (current.tags ?? []).filter(item => item !== tag))} title="Remove tag" className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">{tag} ×</button>)}</div><form onSubmit={event => { event.preventDefault(); const input = event.currentTarget.elements.namedItem('contact-tag') as HTMLInputElement; if (input.value.trim()) onTags(current.id, addTags(current, input.value.split(/[;,]/)).tags ?? []); input.value = ''; }} className="mt-3 flex gap-2"><input name="contact-tag" aria-label="New contact tag" placeholder="Add tag" className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-blue-400"/><button className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white" type="submit">Add</button></form></div>
            <div className="space-y-2 rounded-xl border border-amber-100 bg-amber-50/50 p-3"><p className="text-xs font-bold text-amber-800">Verification hints (heuristic, not a guaranteed accuracy score)</p>{getReviewHints(current).length ? getReviewHints(current).map(hint => <p key={hint.field} className="text-xs text-amber-800">• {hint.message}</p>) : <p className="text-xs text-slate-500">No obvious issues found; still verify against the image.</p>}<button type="button" onClick={() => onReviewed(current.id)} className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs font-bold text-amber-900">{current.reviewedAt ? 'Verified · Mark again' : 'Mark as reviewed'}</button></div>
            <div className="flex flex-wrap gap-2 pt-1">{current.email && <a href={`mailto:${current.email.split(',')[0].trim()}`} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"><Mail className="size-3.5" /> Email</a>}{current.phone && <a href={`tel:${current.phone.split(',')[0].trim()}`} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"><Phone className="size-3.5" /> Call</a>}{current.website && /^https?:\/\//i.test(current.website.trim()) && <a href={current.website.trim()} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"><ExternalLink className="size-3.5" /> Website</a>}</div>
          </div>
        </div>
      </aside>
    </div>}
  </>;
}
