'use client';

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { Check, Crop, RotateCw, RotateCcw, X, WandSparkles, ScanLine } from 'lucide-react';
import { defaultQuad, suggestCardQuad, updateCorner, validQuad, warpPixels, enhancePixels, distance, type Quad } from '@/lib/card-perspective';
import { PROCESSING_MODES, processPixels, type ProcessingMode } from '@/lib/ocr-image-processing';
import { moveQuad, quadFromRectangle, rectangleFromQuad, resizeRectangle, type RectangleHandle } from '@/lib/crop-gesture-geometry';

type Rect = { x: number; y: number; width: number; height: number };
type Handle = 'nw' | 'ne' | 'sw' | 'se';
type CropMode = 'rectangle' | 'perspective';
type DragHandle = RectangleHandle | 'move' | `corner-${number}`;
const rectangleHandles: RectangleHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
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
export async function straightenCardPhoto(sourceUrl: string, quad: Quad, rotation: number, filename: string, enhanced: boolean | ProcessingMode): Promise<File> {
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
      const mode: ProcessingMode = typeof enhanced === 'boolean' ? (enhanced ? 'auto' : 'original') : enhanced;
      // Preserve the existing proven auto-enhancement for legacy callers.
      const processed = mode === 'auto' ? enhancePixels(warped) : processPixels(warped, mode);
      outContext.putImageData(processed, 0, 0);
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
  const [mounted, setMounted] = useState(false);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [dimensions, setDimensions] = useState({ width: 4, height: 3 });
  const [previewUrl, setPreviewUrl] = useState('');
  const [quad, setQuad] = useState<Quad>(defaultQuad);
  const [cropMode, setCropMode] = useState<CropMode>('rectangle');
  const [processingMode, setProcessingMode] = useState<ProcessingMode>('auto');
  const enhanced: boolean | ProcessingMode = processingMode === 'auto' ? true : processingMode === 'original' ? false : processingMode;
  const [detecting, setDetecting] = useState(false);
  const [outputPreview, setOutputPreview] = useState('');
  const [previewBusy, setPreviewBusy] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [detectionNote, setDetectionNote] = useState('');
  const [rotation, setRotation] = useState(0);
  const [saving, setSaving] = useState(false);
  const [dragged, setDragged] = useState<number | null>(null);
  const activeDrag = useRef<{ handle: DragHandle; pointerId: number; startX: number; startY: number; quad: Quad } | null>(null);
  const imageBox = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const imageElement = useRef<HTMLImageElement>(null);
  const magnifier = useRef<HTMLCanvasElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLElement>(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!mounted || !stage.current) return;
    const observer = new ResizeObserver(() => {
      const bounds = stage.current?.getBoundingClientRect();
      if (bounds) setStageSize({ width: Math.max(0, bounds.width - 24), height: Math.max(0, bounds.height - 24) });
    });
    observer.observe(stage.current);
    return () => observer.disconnect();
  }, [mounted]);

  // The editor must escape the camera modal's scrolling/stacking context.
  // A portal also lets the picture use the entire mobile viewport.
  useEffect(() => {
    if (!mounted) return;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButton.current?.focus();
    return () => { document.body.style.overflow = oldOverflow; };
  }, [mounted]);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSourceUrl(url);
    setQuad(defaultQuad());
    setCropMode('rectangle');
    setRotation(0);
    setDetectionNote('');
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (!sourceUrl) return;
    let cancelled = false;
    loadImage(sourceUrl).then(image => {
      if (cancelled) return;
      setDimensions({ width: image.naturalWidth, height: image.naturalHeight });
      try {
        const sample = document.createElement('canvas');
        const factor = Math.min(1, 480 / Math.max(image.naturalWidth, image.naturalHeight));
        sample.width = Math.max(1, Math.round(image.naturalWidth * factor));
        sample.height = Math.max(1, Math.round(image.naturalHeight * factor));
        const ctx = sample.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(image, 0, 0, sample.width, sample.height);
          const result = suggestCardQuad(ctx.getImageData(0, 0, sample.width, sample.height).data, sample.width, sample.height);
          // Only suggest a confident rectangle; otherwise preserve a usable manual crop.
          if (result && result.confidence >= .13) {
            setQuad(previous => cropMode === 'rectangle' ? quadFromRectangle(rectangleFromQuad(result.corners)) : result.corners);
            setDetectionNote('Suggested edges. Drag a side or corner to fine-tune.');
          } else setDetectionNote('Drag any edge or corner to match the card.');
        }
        sample.width = sample.height = 0;
      } catch { setDetectionNote('Automatic detection unavailable. Adjust the corners manually.'); }
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
      if (!ctx) throw new Error('Could not rotate the photo.');
      try {
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(rotation * Math.PI / 180);
        ctx.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
        url = URL.createObjectURL(await encode(canvas, 0.9));
        if (!cancelled) setPreviewUrl(url);
        else URL.revokeObjectURL(url);
      } finally { canvas.width = canvas.height = 0; }
    }).catch(error => { if (!cancelled) onError(error instanceof Error ? error.message : 'Image rotation failed.'); });
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [sourceUrl, rotation, onError]);

  useEffect(() => {
    setOutputPreview('');
    setShowResult(false);
  }, [quad, rotation, enhanced, sourceUrl]);
  useEffect(() => () => { if (outputPreview) URL.revokeObjectURL(outputPreview); }, [outputPreview]);

  const magnify = (x: number, y: number) => {
    const img = imageElement.current;
    const canvas = magnifier.current;
    if (!img || !canvas || !img.naturalWidth || !img.naturalHeight) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = img.naturalWidth, h = img.naturalHeight;
    const sample = Math.min(w, h) * .18;
    const sx = clamp(x * w - sample / 2, 0, Math.max(0, w - sample));
    const sy = clamp(y * h - sample / 2, 0, Math.max(0, h - sample));
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, sx, sy, sample, sample, 0, 0, canvas.width, canvas.height);
    const cx = (x * w - sx) / sample * canvas.width;
    const cy = (y * h - sy) / sample * canvas.height;
    ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(cx - 13, cy); ctx.lineTo(cx + 13, cy);
    ctx.moveTo(cx, cy - 13); ctx.lineTo(cx, cy + 13); ctx.stroke();
    ctx.strokeStyle = '#2563EB'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx - 13, cy); ctx.lineTo(cx + 13, cy);
    ctx.moveTo(cx, cy - 13); ctx.lineTo(cx, cy + 13); ctx.stroke();
  };

  // Pointer captures start geometry once, avoiding drift when the selection itself moves.
  // All calculations use normalized image coordinates, so responsive previews behave alike.
  const pointerPosition = (clientX: number, clientY: number) => {
    const bounds = imageBox.current?.getBoundingClientRect();
    if (!bounds || !bounds.width || !bounds.height) return null;
    return { x: (clientX - bounds.left) / bounds.width, y: (clientY - bounds.top) / bounds.height };
  };
  const startCropDrag = (event: ReactPointerEvent<Element>, handle: DragHandle) => {
    const position = pointerPosition(event.clientX, event.clientY);
    if (!position) return;
    event.preventDefault();
    event.stopPropagation();
    activeDrag.current = { handle, pointerId: event.pointerId, startX: position.x, startY: position.y, quad };
    setDragged(handle === 'move' ? null : 1);
    event.currentTarget.setPointerCapture(event.pointerId);
    magnify(clamp(position.x, 0, 1), clamp(position.y, 0, 1));
  };
  const updateCropDrag = (event: ReactPointerEvent<Element>) => {
    const gesture = activeDrag.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const position = pointerPosition(event.clientX, event.clientY);
    if (!position) return;
    const dx = position.x - gesture.startX, dy = position.y - gesture.startY;
    if (gesture.handle === 'move') {
      setQuad(moveQuad(gesture.quad, dx, dy));
    } else if (gesture.handle.startsWith('corner-')) {
      const i = Number(gesture.handle.slice(7));
      setQuad(updateCorner(gesture.quad, i, gesture.quad[i].x + dx, gesture.quad[i].y + dy));
    } else {
      setQuad(quadFromRectangle(resizeRectangle(rectangleFromQuad(gesture.quad), gesture.handle as RectangleHandle, dx, dy)));
    }
    magnify(clamp(position.x, 0, 1), clamp(position.y, 0, 1));
  };
  const endCropDrag = (event: ReactPointerEvent<Element>) => {
    if (activeDrag.current?.pointerId !== event.pointerId) return;
    activeDrag.current = null;
    setDragged(null);
  };
  const chooseCropMode = (next: CropMode) => {
    activeDrag.current = null;
    setDragged(null);
    setCropMode(next);
    // Rectangle editing begins from the bounding box of the current perspective shape.
    if (next === 'rectangle') setQuad(previous => quadFromRectangle(rectangleFromQuad(previous)));
    setDetectionNote(next === 'rectangle'
      ? 'Drag any edge or corner, or drag inside the selection to move it.'
      : 'Drag each corner independently to correct the card perspective.');
  };
  const rect = rectangleFromQuad(quad);
  const handleLocations: Record<RectangleHandle, { x: number; y: number }> = {
    nw: { x: rect.x, y: rect.y }, n: { x: rect.x + rect.width / 2, y: rect.y },
    ne: { x: rect.x + rect.width, y: rect.y }, e: { x: rect.x + rect.width, y: rect.y + rect.height / 2 },
    se: { x: rect.x + rect.width, y: rect.y + rect.height }, s: { x: rect.x + rect.width / 2, y: rect.y + rect.height },
    sw: { x: rect.x, y: rect.y + rect.height }, w: { x: rect.x, y: rect.y + rect.height / 2 },
  };

  const detect = async () => {
    if (!previewUrl || detecting) return;
    setDetecting(true);
    try {
      const image = await loadImage(previewUrl);
      const canvas = document.createElement('canvas');
      const factor = Math.min(1, 480 / Math.max(image.naturalWidth, image.naturalHeight));
      canvas.width = Math.max(1, Math.round(image.naturalWidth * factor));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * factor));
      try {
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) throw new Error('Card detection is unavailable on this device.');
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        const suggestion = suggestCardQuad(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
        if (suggestion && suggestion.confidence >= .13) {
          setQuad(cropMode === 'rectangle' ? quadFromRectangle(rectangleFromQuad(suggestion.corners)) : suggestion.corners);
          setDetectionNote('Suggested card edges. Adjust the selection for precision.');
        } else setDetectionNote('No reliable card edges detected. Manual crop is ready.');
      } finally { canvas.width = canvas.height = 0; }
    } catch (error) {
      setDetectionNote('Automatic detection failed. You can still adjust corners.');
      onError(error instanceof Error ? error.message : 'Card boundary detection failed.');
    } finally { setDetecting(false); }
  };

  const rotate = (direction: -1 | 1) => {
    setRotation(value => (value + direction * 90 + 360) % 360);
    setQuad(defaultQuad());
    setDragged(null);
    setDetectionNote('Rotation applied. Check crop corners or select Detect edges again.');
  };

  const previewResult = async () => {
    if (!sourceUrl || previewBusy || saving) return;
    setPreviewBusy(true);
    try {
      const output = await straightenCardPhoto(sourceUrl, quad, rotation, file.name, enhanced);
      setOutputPreview(URL.createObjectURL(output));
      setShowResult(true);
    } catch (error) { onError(error instanceof Error ? error.message : 'Could not preview the cropped card.'); }
    finally { setPreviewBusy(false); }
  };

  const apply = async () => {
    if (!sourceUrl || saving || !validQuad(quad)) return;
    setSaving(true);
    try {
      const output = await straightenCardPhoto(sourceUrl, quad, rotation, file.name, enhanced);
      onApply(output);
    } catch (error) { onError(error instanceof Error ? error.message : 'Failed to crop image.'); }
    finally { setSaving(false); }
  };

  const sideways = rotation === 90 || rotation === 270;
  const aspect = sideways ? dimensions.height / dimensions.width : dimensions.width / dimensions.height;

  const panel = <section ref={dialog} role="dialog" aria-modal="true" aria-label={`Crop ${side} card`} onKeyDown={event => {
    if (event.key === 'Escape' && !saving) { event.preventDefault(); onCancel(); }
    if (event.key === 'Tab') {
      const elements = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled])') ?? []);
      if (!elements.length) return;
      const first = elements[0], last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  }} className="fixed inset-0 z-[200] flex flex-col bg-slate-950 text-white sm:inset-3 sm:rounded-2xl sm:border sm:border-slate-700 sm:shadow-2xl">
    <header className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 px-3 py-3 sm:px-5">
      <div className="min-w-0"><h2 className="flex items-center gap-2 text-base font-bold sm:text-lg"><Crop className="size-5 text-blue-400"/> Crop {side} of card</h2><p className="text-xs text-slate-300">Rectangle: drag any edge, corner or inside. Perspective: adjust four corners.</p></div>
      <button ref={closeButton} type="button" onClick={onCancel} disabled={saving} aria-label="Retake or close crop editor" className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/20 text-white hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"><X className="size-5"/></button>
    </header>

    <div ref={stage} className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-[#090f1b] p-3 sm:p-5">
      {showResult && outputPreview ? <div className="flex h-full w-full flex-col items-center justify-center gap-3"><img src={outputPreview} alt="Straightened cropped card preview" className="max-h-[85%] max-w-full object-contain"/><p className="text-center text-xs text-slate-300">Check that names and small text remain readable before scanning.</p></div>
        : <div ref={imageBox} className="relative max-h-full max-w-full touch-none select-none" style={{ aspectRatio: String(aspect), width: Math.max(1, Math.min(stageSize.width || 900, (stageSize.height || 500) * aspect)), height: Math.max(1, Math.min(stageSize.height || 500, (stageSize.width || 900) / aspect)) }}>
          {previewUrl && <img ref={imageElement} src={previewUrl} alt="Captured card photo with movable corner handles" draggable={false} className="absolute inset-0 h-full w-full object-fill"/>}
          <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <polygon points={quad.map(point => `${point.x * 100},${point.y * 100}`).join(' ')} fill="rgba(37,99,235,.12)" stroke="#60a5fa" strokeWidth="1.5" vectorEffect="non-scaling-stroke"/>
            <polyline points={`${(quad[0].x+quad[1].x)/2*100},${(quad[0].y+quad[1].y)/2*100} ${(quad[3].x+quad[2].x)/2*100},${(quad[3].y+quad[2].y)/2*100}`} fill="none" stroke="rgba(255,255,255,.4)" strokeDasharray="4 4" strokeWidth="1" vectorEffect="non-scaling-stroke"/>
            <polyline points={`${(quad[0].x+quad[3].x)/2*100},${(quad[0].y+quad[3].y)/2*100} ${(quad[1].x+quad[2].x)/2*100},${(quad[1].y+quad[2].y)/2*100}`} fill="none" stroke="rgba(255,255,255,.4)" strokeDasharray="4 4" strokeWidth="1" vectorEffect="non-scaling-stroke"/>
          </svg>
          {cropMode === 'rectangle' && <>
            <button type="button" aria-label="Move crop selection" title="Drag inside to move crop" className="absolute z-[5] touch-none cursor-move border border-transparent bg-transparent" style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%` }} onPointerDown={event => startCropDrag(event, 'move')} onPointerMove={updateCropDrag} onPointerUp={endCropDrag} onPointerCancel={endCropDrag} onLostPointerCapture={endCropDrag}/>
            {rectangleHandles.map(handle => { const point = handleLocations[handle]; return <button key={handle} type="button" aria-label={`Resize crop ${handle} handle`} title={`Drag ${handle} handle to resize crop`} className="absolute z-20 flex size-11 -translate-x-1/2 -translate-y-1/2 touch-none items-center justify-center focus-visible:outline focus-visible:outline-4 focus-visible:outline-cyan-300" style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }} onPointerDown={event => startCropDrag(event, handle)} onPointerMove={updateCropDrag} onPointerUp={endCropDrag} onPointerCancel={endCropDrag} onLostPointerCapture={endCropDrag} onKeyDown={event => { const d = event.shiftKey ? .02 : .005; const dx = event.key === 'ArrowLeft' ? -d : event.key === 'ArrowRight' ? d : 0; const dy = event.key === 'ArrowUp' ? -d : event.key === 'ArrowDown' ? d : 0; if (!dx && !dy) return; event.preventDefault(); setQuad(previous => quadFromRectangle(resizeRectangle(rectangleFromQuad(previous), handle, dx, dy))); }}><span className={`block border-[3px] border-white bg-blue-600 shadow-lg shadow-black/60 ${handle.length === 1 ? 'h-3 w-7 rounded-full' : 'size-4 rounded-md'}`}/></button>; })}
          </>}
          {cropMode === 'perspective' && <>
            <svg className="absolute inset-0 z-[5] h-full w-full touch-none" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Move perspective crop selection">
              <polygon points={quad.map(p => `${p.x * 100},${p.y * 100}`).join(' ')} fill="rgba(37,99,235,.04)" stroke="none" style={{ cursor: 'move' }} onPointerDown={event => startCropDrag(event, 'move')} onPointerMove={updateCropDrag} onPointerUp={endCropDrag} onPointerCancel={endCropDrag} onLostPointerCapture={endCropDrag}/>
            </svg>
            {quad.map((point, index) => <button key={index} type="button" aria-label={`Move crop corner ${index + 1}`} title={`Corner ${index + 1} — arrow keys move precisely; Shift moves faster`} aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight" onPointerDown={event => startCropDrag(event, `corner-${index}`)} onPointerMove={updateCropDrag} onPointerUp={endCropDrag} onPointerCancel={endCropDrag} onLostPointerCapture={endCropDrag}
              onKeyDown={event => { const d = event.shiftKey ? .02 : .005; const dx = event.key === 'ArrowLeft' ? -d : event.key === 'ArrowRight' ? d : 0; const dy = event.key === 'ArrowUp' ? -d : event.key === 'ArrowDown' ? d : 0; if (!dx && !dy) return; event.preventDefault(); setQuad(previous => updateCorner(previous, index, previous[index].x + dx, previous[index].y + dy)); }} className="absolute z-10 flex size-11 -translate-x-1/2 -translate-y-1/2 touch-none items-center justify-center rounded-full border-[3px] border-white bg-blue-600/90 shadow-lg shadow-black/40 focus-visible:outline focus-visible:outline-4 focus-visible:outline-cyan-300" style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}><span className="size-2 rounded-full bg-white"/></button>)}
          </>}
          <div className={`pointer-events-none absolute right-2 top-2 z-20 rounded-xl border-2 border-white bg-slate-900 p-1 shadow-xl ${dragged === null ? 'hidden' : 'block'}`}><canvas ref={magnifier} width={144} height={144} aria-hidden="true" className="size-32 rounded-lg sm:size-36"/><p className="text-center text-[10px] font-semibold text-white">Precise corner zoom</p></div>
        </div>}
    </div>

    <footer className="shrink-0 border-t border-white/10 bg-slate-900 px-3 py-3 sm:px-5">
      <div className="mx-auto max-w-6xl space-y-2">
        {detectionNote && <p role="status" className="text-xs text-slate-300">{detectionNote}</p>}
        <div className="flex flex-wrap items-center gap-2">
          {!showResult ? <>
            <div className="inline-flex shrink-0 rounded-xl border border-white/20 bg-slate-950 p-1" role="group" aria-label="Crop selection mode">
              <button type="button" aria-pressed={cropMode === 'rectangle'} onClick={() => chooseCropMode('rectangle')} disabled={saving} className={`min-h-10 rounded-lg px-3 text-xs font-semibold ${cropMode === 'rectangle' ? 'bg-blue-600 text-white' : 'text-slate-300'}`}>Rectangle</button>
              <button type="button" aria-pressed={cropMode === 'perspective'} onClick={() => chooseCropMode('perspective')} disabled={saving} className={`min-h-10 rounded-lg px-3 text-xs font-semibold ${cropMode === 'perspective' ? 'bg-blue-600 text-white' : 'text-slate-300'}`}>Perspective</button>
            </div>
            <button type="button" onClick={() => void detect()} disabled={detecting || !previewUrl || saving} className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-blue-400/50 bg-blue-900/40 px-3 text-xs font-semibold text-blue-100 disabled:opacity-50"><ScanLine className="size-4"/>{detecting ? 'Detecting…' : 'Detect card edges'}</button>
            <button type="button" onClick={() => { setQuad(defaultQuad()); setDetectionNote('Manual crop: drag all four corners to the card edges.'); }} disabled={saving} className="min-h-10 rounded-lg border border-white/20 px-3 text-xs font-semibold">Reset corners</button>
            <label className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/20 px-2 text-xs font-semibold"><WandSparkles className="size-4 text-blue-300"/><span className="sr-only sm:not-sr-only">Image mode</span><select value={processingMode} aria-label="Image processing mode" onChange={event => setProcessingMode(event.target.value as ProcessingMode)} className="max-w-36 bg-transparent py-2 text-xs text-white outline-none" >{PROCESSING_MODES.map(option => <option key={option.value} value={option.value} className="bg-slate-900 text-white">{option.label}</option>)}</select></label>
          </> : <button type="button" onClick={() => setShowResult(false)} className="min-h-10 rounded-lg border border-white/20 px-3 text-xs font-semibold">Back to crop</button>}
          <div className="flex-1"/>
          <button type="button" onClick={() => rotate(-1)} disabled={saving || showResult} className="flex size-10 items-center justify-center rounded-lg border border-white/20 disabled:opacity-40" aria-label="Rotate left"><RotateCcw className="size-4"/></button>
          <button type="button" onClick={() => rotate(1)} disabled={saving || showResult} className="flex size-10 items-center justify-center rounded-lg border border-white/20 disabled:opacity-40" aria-label="Rotate right"><RotateCw className="size-4"/></button>
        </div>
        <div className="flex items-center justify-between gap-2 pt-1">
          <button type="button" onClick={onCancel} disabled={saving} className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-white/20 px-3 text-sm font-semibold"><X className="size-4"/> Retake</button>
          <div className="flex items-center gap-2">
            {!showResult && <button type="button" disabled={!validQuad(quad) || previewBusy || saving} onClick={() => void previewResult()} className="min-h-11 rounded-xl border border-blue-300/60 px-3 text-sm font-semibold text-blue-100 disabled:opacity-50">{previewBusy ? 'Preparing…' : 'Preview straightened photo'}</button>}
            <button type="button" onClick={() => void apply()} disabled={saving || !sourceUrl || !validQuad(quad)} className="inline-flex min-h-11 items-center gap-1 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white disabled:opacity-50"><Check className="size-4"/>{saving ? 'Straightening…' : 'Use cropped photo'}</button>
          </div>
        </div>
      </div>
    </footer>
  </section>;

  if (!mounted) return null;
  return createPortal(panel, document.body);
}
