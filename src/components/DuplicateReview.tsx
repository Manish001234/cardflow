'use client';
import { AlertTriangle, Check, GitMerge, Plus, Replace, X } from 'lucide-react';
import type { StoredCard } from '@/types/card';
import type { DuplicateMatch } from '@/lib/duplicates';
import { getReviewHints } from '@/lib/scan-quality';

export interface ReviewItem { candidate: StoredCard; match: DuplicateMatch; }
interface Props { pending: ReviewItem[]; cards: StoredCard[]; onDecide: (candidateId: string, action: 'keep'|'replace'|'merge'|'skip') => void; }
export function DuplicateReview({ pending, cards, onDecide }: Props) {
  if (!pending.length) return null;
  const item = pending[0];
  const existing = cards.find(card => card.id === item.match.existingId);
  const actions = [
    {id:'keep',label:'Keep both',icon:Plus,cls:'border-slate-200 text-slate-700'},
    {id:'merge',label:'Merge into existing',icon:GitMerge,cls:'border-blue-200 text-blue-700'},
    {id:'replace',label:'Replace existing',icon:Replace,cls:'border-amber-200 text-amber-700'},
    {id:'skip',label:'Discard new scan',icon:X,cls:'border-slate-200 text-slate-500'},
  ] as const;
  return <section role="region" aria-label="Duplicate contact review" className="rounded-2xl border-2 border-amber-200 bg-white p-5 shadow-sm sm:p-6">
    <div className="flex items-center justify-between gap-3"><div><h3 className="flex items-center gap-2 font-bold text-slate-900"><AlertTriangle className="size-5 text-amber-600"/> Possible duplicate — review required</h3><p className="mt-1 text-xs text-slate-500">{item.match.reason} · {item.match.strength === 'exact' ? 'Strong match' : 'Possible match'} · {pending.length} pending</p></div></div>
    <p className="mt-3 text-xs text-amber-800">Nothing has been replaced or discarded. Compare the cards, then choose an action. Merge fills empty fields and combines unique email/phone values; existing non-empty details stay unchanged.</p>
    <div className="mt-4 grid gap-4 md:grid-cols-2">{[{label:'New scan',card:item.candidate},{label:'Saved contact',card:existing}].map(({label,card}) => <div key={label} className="min-w-0 rounded-xl border border-slate-200 p-4"><h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">{label}</h4>{card ? <><div className="mb-3 flex min-h-24 justify-center rounded-lg bg-slate-50 p-2">{card.preview ? <img className="max-h-36 object-contain" src={card.preview} alt={`${label} preview`}/> : <span className="text-xs text-slate-400">No preview</span>}</div>{(['fullName','companyName','jobTitle','email','phone','website'] as const).map(key=><p key={key} className="break-words py-1 text-sm"><span className="text-xs text-slate-400">{key}: </span><span className="font-medium text-slate-700">{card[key] || '—'}</span></p>)}{label==='New scan' && getReviewHints(card).map(hint=><p key={hint.field} className="mt-2 text-xs text-amber-700">• {hint.message}</p>)}</>:<p className="text-xs text-slate-500">Saved match was deleted during review. You may keep the new scan.</p>}</div>)}</div>
    <div className="mt-4 flex flex-wrap gap-2">{actions.map(action=><button key={action.id} type="button" disabled={!existing && (action.id==='replace'||action.id==='merge')} onClick={()=>onDecide(item.candidate.id, action.id)} className={`inline-flex items-center gap-2 rounded-xl border bg-white px-4 py-2.5 text-xs font-semibold transition hover:bg-slate-50 disabled:opacity-40 ${action.cls}`}><action.icon className="size-4"/>{action.label}</button>)}</div>
    <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500"><Check className="size-4 text-emerald-600"/> Your existing contacts are unchanged until you choose an action.</p>
  </section>;
}
