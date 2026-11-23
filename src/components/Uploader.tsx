'use client';
import { useCallback, useRef, useState } from 'react';
import { ArrowUpFromLine, ImagePlus, LoaderCircle, ShieldCheck } from 'lucide-react';
import { validateImage } from '@/lib/images';

interface Props {
  processing: boolean;
  onFiles: (files: File[]) => void;
  onError: (message: string) => void;
}
export function Uploader({ processing, onFiles, onError }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const accept = useCallback((items: File[]) => {
    const files: File[] = [];
    for (const file of items) {
      const error = validateImage(file);
      if (error) onError(`${file.name}: ${error}`);
      else files.push(file);
    }
    if (files.length) onFiles(files);
  }, [onFiles, onError]);

  return <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
    <div className="mb-5 flex items-start justify-between gap-4">
      <div><div className="flex items-center gap-2 text-lg font-bold"><ImagePlus className="size-5 text-blue-600"/> Upload business cards</div>
        <p className="mt-1 text-sm text-slate-500">Drop one card or a whole batch. AI reads every layout for you.</p></div>
      <span className="hidden rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 sm:inline">AI powered</span>
    </div>
    <div role="button" tabIndex={0} aria-label="Choose business card images" onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); input.current?.click(); } }}
      onDragOver={event => { event.preventDefault(); setDragging(true); }}
      onDragLeave={event => { event.preventDefault(); setDragging(false); }}
      onDrop={event => { event.preventDefault(); setDragging(false); accept(Array.from(event.dataTransfer.files)); }}
      onClick={() => input.current?.click()}
      className={`group flex min-h-60 flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 text-center transition ${dragging ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-slate-50/70 hover:border-blue-400 hover:bg-blue-50/40'}`}>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" multiple className="hidden" onChange={event => { accept(Array.from(event.target.files ?? [])); event.target.value = ''; }} />
      <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-white shadow-sm"><ArrowUpFromLine className="size-7 text-blue-600"/></div>
      <p className="text-base font-semibold">Drag & drop your visiting cards here</p>
      <p className="mt-1 text-sm text-slate-500">or <span className="font-semibold text-blue-600">browse files</span> from your computer</p>
      <p className="mt-4 text-xs text-slate-400">JPG, PNG, WebP · 10 MB max per image · Multiple files supported</p>
    </div>
    <div className="mt-4 flex items-center justify-between gap-3 text-xs text-slate-500">
      <span className="flex items-center gap-1.5"><ShieldCheck className="size-4 text-emerald-600"/> Your contacts are saved in this browser</span>
      {processing && <span aria-live="polite" className="flex items-center gap-1.5 font-semibold text-blue-600"><LoaderCircle className="size-4 animate-spin"/> Extracting cards…</span>}
    </div>
  </div>;
}
