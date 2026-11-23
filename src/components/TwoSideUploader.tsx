'use client';
import { useRef, useState } from 'react';
import { ArrowRight, Images, LoaderCircle, X } from 'lucide-react';
import { validateImage } from '@/lib/images';

interface Props { processing: boolean; onScan: (front: File, back?: File) => void; onError: (message: string) => void; }
export function TwoSideUploader({ processing, onScan, onError }: Props) {
  const [front, setFront] = useState<File | null>(null);
  const [back, setBack] = useState<File | null>(null);
  const [previews, setPreviews] = useState<{front?:string;back?:string}>({});
  const urls = useRef<string[]>([]);
  const assign = (side: 'front'|'back', file?: File) => {
    if (!file) return;
    const error = validateImage(file);
    if (error) { onError(`${file.name}: ${error}`); return; }
    const url = URL.createObjectURL(file); urls.current.push(url);
    setPreviews(old => ({...old,[side]:url}));
    if (side === 'front') setFront(file); else setBack(file);
  };
  const reset = () => {setFront(null);setBack(null);setPreviews({}); urls.current.forEach(url=>URL.revokeObjectURL(url));urls.current=[];};
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
    <div className="mb-4 flex items-center gap-2"><Images className="size-5 text-blue-600"/><div><h3 className="font-bold">Front + back scanning</h3><p className="text-xs text-slate-500">Combine both sides into one contact. The front image is required.</p></div></div>
    <div className="grid gap-3 sm:grid-cols-2">{(['front','back'] as const).map(side => <label key={side} className="relative flex min-h-36 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 p-3 hover:border-blue-400">
      {previews[side] ? <img src={previews[side]} alt={`${side} image ready`} className="max-h-32 w-full object-contain" /> : <><Images className="mb-2 size-6 text-blue-500"/><span className="text-sm font-bold capitalize">{side} side {side==='back'?'(optional)':''}</span><span className="mt-1 text-xs text-slate-400">Select an image</span></>}
      <input aria-label={`Choose ${side} of card`} type="file" className="sr-only" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" onChange={event => {assign(side,event.target.files?.[0]);event.target.value='';}} />
    </label>)}</div>
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><span className="max-w-full truncate text-xs text-slate-500">{front?.name || 'No front image selected'}{back ? ` + ${back.name}` : ''}</span><div className="flex gap-2"><button type="button" disabled={!front} onClick={reset} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold disabled:opacity-40"><X className="mr-1 inline size-3.5"/>Reset</button><button type="button" disabled={!front || processing} onClick={() => {if(front){onScan(front,back||undefined);reset();}}} className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-40">{processing?<LoaderCircle className="mr-2 inline size-3.5 animate-spin"/>:null}Scan paired card <ArrowRight className="ml-1 inline size-3.5"/></button></div></div>
  </section>;
}
