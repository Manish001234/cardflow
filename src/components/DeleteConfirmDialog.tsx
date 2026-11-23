'use client';

import { AlertTriangle, LoaderCircle, Trash2, X } from 'lucide-react';

interface Props {
  title: string;
  description: string;
  busy: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}

export function DeleteConfirmDialog({ title, description, busy, error, onCancel, onConfirm }: Props) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-4" role="presentation">
      <div role="alertdialog" aria-modal="true" aria-labelledby="delete-dialog-title" aria-describedby="delete-dialog-description"
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <span className="rounded-xl bg-rose-50 p-3 text-rose-600"><AlertTriangle className="size-6" /></span>
          <button type="button" aria-label="Cancel deletion" disabled={busy} onClick={onCancel}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-40"><X className="size-5" /></button>
        </div>
        <h2 id="delete-dialog-title" className="mt-4 text-lg font-bold text-slate-900">{title}</h2>
        <p id="delete-dialog-description" className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
        {error && <p role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" disabled={busy} onClick={onCancel} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-40">Cancel</button>
          <button type="button" disabled={busy} onClick={() => void onConfirm()}
            className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60">
            {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
            {busy ? 'Deleting…' : 'Delete permanently'}
          </button>
        </div>
      </div>
    </div>
  );
}
