'use client';
import { useEffect, useState } from 'react';
import { AlertTriangle, Check, LoaderCircle, Trash2 } from 'lucide-react';
import type { StoredCard, EditableField } from '@/types/card';
import { editableFields } from '@/types/card';
import { getReviewHints } from '@/lib/scan-quality';
import { getOCRDiagnostics, forgetOCRDiagnostics } from '@/lib/ocr-diagnostics';

export interface ScanDraft {
  jobId: number;
  candidate: StoredCard;
  front: File;
  back?: File;
}

const labels: Record<EditableField, string> = {
  fullName: 'Full name', jobTitle: 'Job title', companyName: 'Company', email: 'Email',
  phone: 'Phone', website: 'Website', address: 'Address', notes: 'Notes',
};

function validateContact(card: StoredCard): string | null {
  if (!card.fullName.trim() && !card.companyName.trim() && !card.email.trim() && !card.phone.trim())
    return 'Enter at least one name, company, email or phone number before saving.';
  const emails = card.email.split(',').map(x => x.trim()).filter(Boolean);
  if (emails.some(email => !/^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(email)))
    return 'Check the email address, or clear it if the OCR result is incorrect.';
  return null;
}

export function ScanVerification({ draft, busy, onSave, onDiscard }: {
  draft: ScanDraft; busy: boolean;
  onSave: (candidate: StoredCard) => Promise<void>;
  onDiscard: () => void;
}) {
  const [candidate, setCandidate] = useState(draft.candidate);
  const [error, setError] = useState('');
  useEffect(() => { setCandidate(draft.candidate); setError(''); }, [draft.candidate]);
  const warnings = getReviewHints(candidate);
  const diagnostics = getOCRDiagnostics(draft.candidate.id);
  const update = (field: EditableField, value: string) => setCandidate(prev => ({ ...prev, [field]: value }));
  const submit = async () => {
    const next = { ...candidate };
    for (const field of editableFields) next[field] = next[field].trim();
    const message = validateContact(next);
    if (message) { setError(message); return; }
    setError('');
    try { await onSave(next); forgetOCRDiagnostics(draft.candidate.id); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not save the contact. Try again.'); }
  };
  return <section aria-label="Verify scanned contact" className="rounded-2xl border-2 border-amber-300 bg-white p-4 shadow-sm sm:p-5">
    <div className="mb-4 flex items-start gap-2"><AlertTriangle className="mt-1 size-5 shrink-0 text-amber-600"/><div>
      <h3 className="font-bold text-slate-900">Verify extraction before saving</h3>
      <p className="text-sm text-slate-600">Free OCR can misread names and numbers. Compare every field with your photograph. Nothing is saved to MongoDB until you confirm.</p>
    </div></div>
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="min-w-0 rounded-xl bg-slate-50 p-3"><p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Captured image</p>
        {/* Existing preview is a client-created data URL; never fetch from a public Blob URL. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={candidate.preview} alt="Original visiting card for verification" className="max-h-[370px] w-full rounded-lg object-contain" />
        {candidate.backPreview && <><p className="mt-3 text-xs text-slate-500">Back of card</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={candidate.backPreview} alt="Back of visiting card" className="mt-1 max-h-52 w-full object-contain" /></>}
        <p className="mt-3 text-xs text-slate-500">OCR confidence: {candidate.confidenceScore}. This estimates recognition confidence and field completeness, not camera sharpness or guaranteed accuracy.</p>
      </div>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        {editableFields.map(field => <label key={field} className={`block min-w-0 ${field === 'address' || field === 'notes' ? 'sm:col-span-2' : ''}`}>
          <span className="mb-1 block text-xs font-semibold text-slate-600">{labels[field]}</span>
          {field === 'address' || field === 'notes' ?
            <textarea rows={2} value={candidate[field]} onChange={e => update(field, e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none" /> :
            <input value={candidate[field]} onChange={e => update(field, e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none" />}
        </label>)}
      </div>
    </div>
    {warnings.length > 0 && <div className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900"><strong>Verify these fields:</strong><ul className="mt-1 list-inside list-disc">{warnings.map((item,i) => <li key={i}>{item.message}</li>)}</ul></div>}
    {diagnostics && <details className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
      <summary className="cursor-pointer font-semibold text-slate-700">OCR diagnostics (on this device only)</summary>
      <p className="mt-2 text-xs text-slate-600">OCR text and field candidates remain in temporary browser memory. They are not saved to MongoDB. Compare suggestions with the original image.</p>
      <div className="mt-3 grid gap-2">
        {diagnostics.nameCandidates.filter(entry => entry.decision !== 'rejected').slice(0, 6).map((entry, index) =>
          <div key={index} className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 bg-white p-2">
            <span className="min-w-0 break-words">{entry.normalized}</span>
            <span className="text-xs text-slate-500">{entry.decision} · OCR {Math.round(entry.ocrConfidence * 100)}%</span>
            {entry.decision !== 'selected' && <button type="button" onClick={() => update('fullName', entry.normalized)} className="rounded border border-blue-200 px-2 py-1 text-xs font-semibold text-blue-700">Use as name</button>}
          </div>)}
      </div>
      <details className="mt-3"><summary className="cursor-pointer text-xs font-medium text-slate-600">Raw recognized lines (sensitive contact data)</summary>
        <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-white p-2 text-xs">{diagnostics.rawLines.map(line => `${Math.round(line.confidence * 100)}%  ${line.text}`).join('\n')}</pre>
      </details>
    </details>}
    {error && <p role="alert" className="mt-3 text-sm font-medium text-rose-700">{error}</p>}
    <div className="mt-4 flex flex-wrap justify-end gap-2">
      <button type="button" onClick={() => { forgetOCRDiagnostics(draft.candidate.id); onDiscard(); }} disabled={busy} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 disabled:opacity-50"><Trash2 className="size-4" /> Discard scan</button>
      <button type="button" onClick={() => void submit()} disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{busy ? <LoaderCircle className="size-4 animate-spin"/> : <Check className="size-4"/>}{busy ? 'Saving…' : 'Confirm & save'}</button>
    </div>
  </section>;
}
