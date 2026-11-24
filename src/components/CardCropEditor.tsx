'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Crop, RotateCw, RotateCcw, X, WandSparkles, ScanLine } from 'lucide-react';
import { defaultQuad, suggestCardQuad, updateCorner, validQuad, warpPixels, enhancePixels, distance, type Quad } from '@/lib/card-perspective';

type Rect = { x: number; y: number; width: number; height: number };
type Handle = 'nw' | 'ne' | 'sw' | 'se';
const initialCrop: Rect = { x: 0.05, y: 0.05, width: 0.9, height: 0.9 };
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const minSide = 0.08;

export function moveCropCorner(rect: Rect, handle: Handle, x: number, y: number): Rect {
  const left = rect.x, top = rect.y, right = rect.x + rect.width, bottom = rect.y + rect.height;
  const nLeft = handle.includes('w') ? clamp(x, 0, right - minSide) : left;
  const nRight = handle.includes('e') ? clamp(x, left + minSide, 1) : right;
  const nTop = handle.includes('n') ? clamp(y, 0, bottom - minSide) : top;
  const nBottom = handle.includes('s') ? clamp(y, top + minSide, 1) : bottom;
  return { x: nLeft, y: nTop, width: nRight - nLeft, height: nBottom - nTop };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not read the captured photo. Please retake it.'));
    image.src = src;
  });
}

function encode(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not create the cropped photo.')), 'image/jpeg', quality));
}

export async function cropCardPhoto(sourceUrl: string, rect: Rect, rotation: number, filename: string): Promise<File> {
  const image = await loadImage(sourceUrl);
  const rotate = ((rotation % 360) + 360) % 360;
  const sideways = rotate === 90 || rotate === 270;
  const rotated = document.createElement('canvas');
  rotated.width = sideways ? image.naturalHeight : image.naturalWidth;
  rotated.height = sideways ? image.naturalWidth : image.naturalHeight;
  const context = rotated.getContext('2d');
  if (!context) throw new Error('Image editor is not available on this device.');
  context.translate(rotated.width / 2, rotated.height / 2);
  context.rotate(rotate * Math.PI / 180);
  context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
  const sx = Math.floor(rect.x * rotated.width), sy = Math.floor(rect.y * rotated.height);
  const sw = Math.max(1, Math.min(rotated.width - sx, Math.round(rect.width * rotated.width)));
  const sh = Math.max(1, Math.min(rotated.height - sy, Math.round(rect.height * rotated.height)));
  // Only the card crop is resized; the original photo retains its native resolution up to this point.
  const scale = Math.min(1, 2400 / Math.max(sw, sh));
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(sw * scale));
  out.height = Math.max(1, Math.round(sh * scale));
  const outContext = out.getContext('2d');
  if (!outContext) throw new Error('Could not prepare the cropped image.');
  outContext.imageSmoothingEnabled = true;
  outContext.imageSmoothingQuality = 'high';
  outContext.drawImage(rotated, sx, sy, sw, sh, 0, 0, out.width, out.height);
  let blob = await encode(out, 0.9);
  if (blob.size > 10 * 1024 * 1024) blob = await encode(out, 0.76);
  rotated.width = rotated.height = out.width = out.height = 0;
  if (blob.size > 10 * 1024 * 1024) throw new Error('Cropped image is too large. Select a smaller area.');
  return new File([blob], filename.replace(/\.[^.]+$/, '') + '-cropped.jpg', { type: 'image/jpeg', lastModified: Date.now() });
}


/** Perspective-correct the photographed card using manually verified four corners. */
export async function straightenCardPhoto(sourceUrl: string, quad: Quad, rotation: number, filename: string, enhanced: boolean): Promise<File> {
  if (!validQuad(quad)) throw new Error('Please move the four crop corners to form a valid card.');
  const image = await loadImage(sourceUrl);
  const rotate = ((rotation % 360) + 360) % 360;
  const sideways = rotate === 90 || rotate === 270;
  const rotated = document.createElement('canvas');
  const sourceScale = Math.min(1, 2300 / Math.max(image.naturalWidth, image.naturalHeight));
  rotated.width = Math.max(1, Math.round((sideways ? image.naturalHeight : image.naturalWidth) * sourceScale));
  rotated.height = Math.max(1, Math.round((sideways ? image.naturalWidth : image.naturalHeight) * sourceScale));
  const context = rotated.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Image editor is unavailable.');
  try {
    context.translate(rotated.width / 2, rotated.height / 2);
    context.rotate(rotate * Math.PI / 180);
    context.drawImage(image, -image.naturalWidth * sourceScale / 2, -image.naturalHeight * sourceScale / 2,
      image.naturalWidth * sourceScale, image.naturalHeight * sourceScale);
    context.setTransform(1, 0, 0, 1, 0, 0);
    const imageData = context.getImageData(0, 0, rotated.width, rotated.height);
    const widthEstimate = (distance(quad[0], quad[1]) + distance(quad[3], quad[2])) / 2 * rotated.width;
    const heightEstimate = (distance(quad[0], quad[3]) + distance(quad[1], quad[2])) / 2 * rotated.height;
    // Limit the expensive output warp on mid-range phones without throwing away text detail before cropping.
    const scale = Math.min(1, 1800 / Math.max(widthEstimate, heightEstimate));
    const width = Math.max(32, Math.round(widthEstimate * scale));
    const height = Math.max(32, Math.round(heightEstimate * scale));
    const out = document.createElement('canvas');
    out.width = width; out.height = height;
    try {
      const outContext = out.getContext('2d');
      if (!outContext) throw new Error('Could not prepare the cropped card.');
      const warped = warpPixels(imageData, quad, width, height);
      outContext.putImageData(enhanced ? enhancePixels(warped) : warped, 0, 0);
      let blob = await encode(out, .90);
      if (blob.size > 10 * 1024 * 1024) blob = await encode(out, .76);
      if (blob.size > 10 * 1024 * 1024) throw new Error('Cropped photo exceeds 10 MB.');
      return new File([blob], filename.replace(/\.[^.]+$/, '') + '-straightened.jpg', { type: 'image/jpeg', lastModified: Date.now() });
    } finally { out.width = out.height = 0; }
  } finally { rotated.width = rotated.height = 0; }
}

type Props = {
  file: File;
  side: 'front' | 'back';
  onApply: (file: File) => void;
  onCancel: () => void;
  onError: (message: string) => void;
};

export function CardCropEditor({ file, side, onApply, onCancel, onError }: Props) {
  const [sourceUrl, setSourceUrl] = useState('');
  const [dimensions, setDimensions] = useState({ width: 4, height: 3 });
  const [previewUrl, setPreviewUrl] = useState('');
  const [crop, setCrop] = useState<Rect>(initialCrop);
  const [quad, setQuad] = useState<Quad>(defaultQuad);
  const [enhanced, setEnhanced] = useState(true);
  const [detecting, setDetecting] = useState(false);
  const [outputPreview, setOutputPreview] = useState('');
  const [previewBusy, setPreviewBusy] = useState(false);
  const [detectionNote, setDetectionNote] = useState('');
  const [rotation, setRotation] = useState(0);
  const [saving, setSaving] = useState(false);
  const activeCorner = useRef<number | null>(null);
  const imageBox = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSourceUrl(url);
    setCrop(initialCrop);
    setQuad(defaultQuad());
    setDetectionNote('');
    setRotation(0);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (!sourceUrl) return;
    let cancelled = false;
    loadImage(sourceUrl).then(image => {
      if (!cancelled) {
        setDimensions({ width: image.naturalWidth, height: image.naturalHeight });
        // One lightweight automatic suggestion when a new photo is opened. It never commits or crops without confirmation.
        try {
          const sample = document.createElement('canvas');
          const factor = Math.min(1, 320 / Math.max(image.naturalWidth, image.naturalHeight));
          sample.width = Math.round(image.naturalWidth * factor);
          sample.height = Math.round(image.naturalHeight * factor);
          const sampleCtx = sample.getContext('2d', { willReadFrequently: true });
          if (sampleCtx) {
            sampleCtx.drawImage(image, 0, 0, sample.width, sample.height);
            const suggestion = suggestCardQuad(sampleCtx.getImageData(0, 0, sample.width, sample.height).data, sample.width, sample.height);
            if (suggestion) { setQuad(suggestion.corners); setDetectionNote('Auto-detected edges: inspect and adjust all four corners.'); }
          }
          sample.width = sample.height = 0;
        } catch { /* Keep manual corners available if detection fails. */ }
      }
    }).catch(error => onError(error instanceof Error ? error.message : 'Image could not be opened.'));
    return () => { cancelled = true; };
  }, [sourceUrl, onError]);

  useEffect(() => {
    if (!sourceUrl) return;
    if (rotation === 0) { setPreviewUrl(sourceUrl); return; }
    let cancelled = false;
    let url = '';
    loadImage(sourceUrl).then(async image => {
      const canvas = document.createElement('canvas');
      const sideways = rotation === 90 || rotation === 270;
      canvas.width = sideways ? image.naturalHeight : image.naturalWidth;
      canvas.height = sideways ? image.naturalWidth : image.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not rotate image.');
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(rotation * Math.PI / 180);
      ctx.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
      url = URL.createObjectURL(await encode(canvas, 0.88));
      canvas.width = canvas.height = 0;
      if (!cancelled) setPreviewUrl(url);
      else URL.revokeObjectURL(url);
    }).catch(error => { if (!cancelled) onError(error instanceof Error ? error.message : 'Image rotation failed.'); });
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [sourceUrl, rotation, onError]);

  const detect = async () => {
    if (!previewUrl || detecting) return;
    setDetecting(true);
    try {
      const image = await loadImage(previewUrl);
      const canvas = document.createElement('canvas');
      const factor = Math.min(1, 320 / Math.max(image.naturalWidth, image.naturalHeight));
      canvas.width = Math.round(image.naturalWidth * factor);
      canvas.height = Math.round(image.naturalHeight * factor);
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('Card detection is not supported in this browser.');
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const suggestion = suggestCardQuad(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
      canvas.width = canvas.height = 0;
      if (suggestion) {
        setQuad(suggestion.corners);
        setDetectionNote('Suggested card edges. Adjust the four handles before scanning.');
      } else setDetectionNote('Card edges are unclear. Position the four handles manually.');
    } catch (error) {
      setDetectionNote('Automatic detection unavailable. Manual crop is ready.');
      onError(error instanceof Error ? error.message : 'Card boundary detection failed.');
    } finally { setDetecting(false); }
  };

  const rotate = (direction: -1 | 1) => {
    setRotation(value => (value + direction * 90 + 360) % 360);
    setCrop(initialCrop);
    setQuad(defaultQuad());
    setDetectionNote('Adjust corners or select Detect edges again after rotating.');
  };
  useEffect(() => {
    setOutputPreview('');
  }, [quad, rotation, enhanced, sourceUrl]);

  useEffect(() => () => {
    if (outputPreview) URL.revokeObjectURL(outputPreview);
  }, [outputPreview]);

  const previewResult = async () => {
    if (!sourceUrl || previewBusy) return;
    setPreviewBusy(true);
    try {
      const fileResult = await straightenCardPhoto(sourceUrl, quad, rotation, file.name, enhanced);
      setOutputPreview(URL.createObjectURL(fileResult));
    } catch (error) { onError(error instanceof Error ? error.message : 'Could not preview processed image.'); }
    finally { setPreviewBusy(false); }
  };

  const apply = async () => {
    if (!sourceUrl || saving) return;
    setSaving(true);
    try {
      const result = await straightenCardPhoto(sourceUrl, quad, rotation, file.name, enhanced);
      onApply(result);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Failed to crop image.');
    } finally { setSaving(false); }
  };
  const sideways = rotation === 90 || rotation === 270;
  const aspect = sideways ? dimensions.height / dimensions.width : dimensions.width / dimensions.height;

  return <section aria-label={`Crop ${side} card`} className="space-y-3 rounded-xl border border-blue-200 bg-blue-50/50 p-3 sm:p-4">
    <div className="flex items-center justify-between gap-3"><div><h3 className="font-bold text-slate-900">Crop {side} card</h3><p className="text-xs text-slate-600">Detect card edges, adjust all four corners, then straighten and enhance.</p></div><Crop className="size-5 text-blue-600" /></div>
    <div className="flex justify-center overflow-auto rounded-lg bg-slate-950 p-2">
      <div ref={imageBox} className="relative max-w-full touch-none select-none" style={{ width: `min(100%, ${Math.round(aspect * 48)}dvh, 560px)`, aspectRatio: String(aspect) }}>
        {previewUrl && <img src={previewUrl} alt="Photo to crop" draggable={false} className="absolute inset-0 h-full w-full" />}
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <polygon points={quad.map(p=>`${p.x*100},${p.y*100}`).join(' ')} fill="rgba(37,99,235,.13)" stroke="#60a5fa" strokeWidth=".7" vectorEffect="non-scaling-stroke" />
        </svg>
        {quad.map((point,index) => <button key={index} type="button" aria-label={`Move crop corner ${index+1}`} onPointerDown={event => { event.preventDefault(); activeCorner.current=index; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={event => {
          if (activeCorner.current!==index || !imageBox.current) return;
          const bounds=imageBox.current.getBoundingClientRect();
          setQuad(old=>updateCorner(old,index,(event.clientX-bounds.left)/bounds.width,(event.clientY-bounds.top)/bounds.height));
        }} onPointerUp={()=>{activeCorner.current=null;}} onPointerCancel={()=>{activeCorner.current=null;}} className="absolute z-10 size-8 -translate-x-1/2 -translate-y-1/2 touch-none rounded-full border-[3px] border-white bg-blue-600 shadow-lg" style={{left:`${point.x*100}%`,top:`${point.y*100}%`}} />)}
      </div>
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={()=>void detect()} disabled={detecting || !previewUrl} className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-blue-700 disabled:opacity-50"><ScanLine className="size-4" />{detecting?'Finding edges…':'Detect card edges'}</button>
      <button type="button" onClick={()=>{setQuad(defaultQuad());setDetectionNote('Manual crop: drag all four corners to the card edges.');}} className="rounded-lg border bg-white px-3 py-2 text-sm font-semibold">Reset corners</button>
      <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm font-semibold"><input type="checkbox" checked={enhanced} onChange={event=>setEnhanced(event.target.checked)} /><WandSparkles className="size-4 text-blue-600"/> Enhance contrast</label>
    </div>
    {detectionNote && <p role="status" className="text-xs text-slate-600">{detectionNote}</p>}
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" disabled={!validQuad(quad) || previewBusy || saving} onClick={()=>void previewResult()} className="rounded-lg border bg-white px-3 py-2 text-sm font-semibold disabled:opacity-50">
        {previewBusy ? 'Preparing preview…' : 'Preview straightened photo'}
      </button>
      <span className="text-xs text-slate-500">{enhanced ? 'Enhanced contrast enabled' : 'Original colors (no enhancement)'}</span>
    </div>
    {outputPreview && <div className="rounded-lg border bg-white p-2"><p className="mb-2 text-xs font-semibold text-slate-700">Processed preview — check text is legible before confirming</p><img src={outputPreview} alt="Straightened cropped card preview" className="mx-auto max-h-56 max-w-full object-contain" /></div>}
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex gap-2"><button type="button" onClick={()=>rotate(-1)} className="inline-flex items-center gap-1 rounded-lg border bg-white px-3 py-2 text-sm font-semibold"><RotateCcw className="size-4" /> Rotate left</button><button type="button" onClick={()=>rotate(1)} className="inline-flex items-center gap-1 rounded-lg border bg-white px-3 py-2 text-sm font-semibold"><RotateCw className="size-4" /> Rotate right</button></div>
      <div className="flex gap-2"><button type="button" onClick={onCancel} disabled={saving} className="inline-flex items-center gap-1 rounded-lg border bg-white px-3 py-2 text-sm font-semibold"><X className="size-4" /> Retake</button><button type="button" onClick={()=>void apply()} disabled={saving || !sourceUrl || !validQuad(quad)} className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><Check className="size-4" /> {saving?'Straightening…':'Use cropped photo'}</button></div>
    </div>
  </section>;
}
