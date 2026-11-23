'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, Check, ImagePlus, LoaderCircle, RefreshCcw, RotateCcw, SwitchCamera, X } from 'lucide-react';
import { validateImage } from '@/lib/images';

type Side = 'front' | 'back';
type Capture = { file: File; url: string };
type Props = {
  processing: boolean;
  onScan: (front: File, back?: File) => boolean;
  onError: (message: string) => void;
};

function cameraMessage(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') return 'Camera permission was denied. Allow camera access in your browser settings or use the photo picker.';
    if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') return 'No camera was found. Use the photo picker instead.';
    if (error.name === 'NotReadableError' || error.name === 'TrackStartError') return 'The camera is in use by another application. Close it there and try again.';
    if (error.name === 'OverconstrainedError') return 'The requested camera is not available on this device.';
  }
  return error instanceof Error ? error.message : 'Could not start the camera. Use the photo picker instead.';
}

export function CameraCapture({ processing, onScan, onError }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(false);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [side, setSide] = useState<Side>('front');
  const [front, setFront] = useState<Capture | null>(null);
  const [back, setBack] = useState<Capture | null>(null);
  const [message, setMessage] = useState('');
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const operation = useRef(0);
  const captured = useRef<{ front: Capture | null; back: Capture | null }>({ front: null, back: null });
  const nativeInput = useRef<HTMLInputElement>(null);

  const stopCamera = useCallback(() => {
    operation.current += 1;
    stream.current?.getTracks().forEach(track => track.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
    setActive(false);
    setBusy(false);
  }, []);

  const releaseCaptures = useCallback(() => {
    if (captured.current.front) URL.revokeObjectURL(captured.current.front.url);
    if (captured.current.back) URL.revokeObjectURL(captured.current.back.url);
    captured.current = { front: null, back: null };
    setFront(null);
    setBack(null);
  }, []);

  const close = useCallback(() => {
    stopCamera();
    releaseCaptures();
    setOpen(false);
    setMessage('');
    setSide('front');
  }, [stopCamera, releaseCaptures]);

  useEffect(() => () => {
    // Invalidate any pending permission prompt when the component unmounts.
    operation.current += 1;
    stream.current?.getTracks().forEach(track => track.stop());
    if (captured.current.front) URL.revokeObjectURL(captured.current.front.url);
    if (captured.current.back) URL.revokeObjectURL(captured.current.back.url);
  }, []);

  const startCamera = useCallback(async (preferred: 'environment' | 'user') => {
    stopCamera();
    const ticket = operation.current;
    setMessage('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setMessage('Live camera is unavailable. Use the photo picker to take a picture instead.');
      return;
    }
    if (!window.isSecureContext) {
      setMessage('Live camera requires HTTPS or localhost. Use the photo picker instead.');
      return;
    }
    setBusy(true);
    let acquired: MediaStream | null = null;
    try {
      try {
        acquired = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: preferred }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
      } catch (firstError) {
        if (firstError instanceof DOMException && (firstError.name === 'OverconstrainedError' || firstError.name === 'NotFoundError')) {
          acquired = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
        } else throw firstError;
      }
      if (operation.current !== ticket) { acquired.getTracks().forEach(track => track.stop()); return; }
      stream.current = acquired;
      if (video.current) {
        video.current.srcObject = acquired;
        await video.current.play();
      }
      if (operation.current !== ticket) { acquired.getTracks().forEach(track => track.stop()); return; }
      setActive(true);
    } catch (error) {
      acquired?.getTracks().forEach(track => track.stop());
      if (operation.current === ticket) setMessage(cameraMessage(error));
    } finally {
      if (operation.current === ticket) setBusy(false);
    }
  }, [stopCamera]);

  const launch = () => {
    setOpen(true);
    setSide('front');
    setMessage('');
    // The video element mounts on the next render; camera is started by the effect below.
  };

  useEffect(() => {
    if (open && !stream.current && !active && !busy && message === '') void startCamera(facing);
  }, [open, active, busy, message, facing, startCamera]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    window.addEventListener('keydown', onEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onEscape);
    };
  }, [open, close]);

  const setCapture = (target: Side, file: File) => {
    const invalid = validateImage(file);
    if (invalid) { onError(`${file.name}: ${invalid}`); return; }
    const current = captured.current[target];
    if (current) URL.revokeObjectURL(current.url);
    const next = { file, url: URL.createObjectURL(file) };
    captured.current[target] = next;
    if (target === 'front') { setFront(next); setSide('back'); }
    else setBack(next);
    setMessage('');
  };

  const takePhoto = async () => {
    const element = video.current;
    if (!element || !active || !element.videoWidth || !element.videoHeight) {
      setMessage('Camera is not ready. Try again in a moment.');
      return;
    }
    setBusy(true);
    try {
      const maxEdge = 1280;
      const ratio = Math.min(1, maxEdge / Math.max(element.videoWidth, element.videoHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(element.videoWidth * ratio);
      canvas.height = Math.round(element.videoHeight * ratio);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not prepare the camera photo.');
      ctx.drawImage(element, 0, 0, canvas.width, canvas.height);
      // Release backing pixels before the local OCR models allocate memory.
      // The photo itself is kept as an independent Blob/File. 
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.78));
      if (!blob) throw new Error('Could not save the camera photo.');
      canvas.width = 0;
      canvas.height = 0;
      const file = new File([blob], `card-${side}-${Date.now()}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
      setCapture(side, file);
    } catch (error) { onError(error instanceof Error ? error.message : 'Could not capture photo.'); }
    finally { setBusy(false); }
  };

  const removeSide = (target: Side) => {
    const current = captured.current[target];
    if (current) URL.revokeObjectURL(current.url);
    captured.current[target] = null;
    if (target === 'front') setFront(null); else setBack(null);
    setSide(target);
  };

  const submit = () => {
    const frontFile = captured.current.front?.file;
    const backFile = captured.current.back?.file;
    if (!frontFile || processing || busy) return;

    // Stop the live video before starting local OCR to free the camera and memory.
    // File objects remain valid after preview URLs are revoked.
    stopCamera();
    try {
      const accepted = onScan(frontFile, backFile);
      if (accepted) close();
      else setMessage('The scan was not queued. Your captured photos are still available; resolve the notice and try again.');
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Could not queue the captured card.';
      setMessage(detail);
      onError(detail);
    }
  };

  return <>
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-label="Camera scanning">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3"><div className="grid size-11 place-items-center rounded-xl bg-blue-50 text-blue-600"><Camera className="size-5" /></div><div><h3 className="font-bold text-slate-900">Scan with camera</h3><p className="mt-1 text-xs text-slate-500">Capture a visiting card using your phone or webcam. No paid OCR service required.</p></div></div>
        <button type="button" onClick={launch} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700"><Camera className="size-4" /> Open camera</button>
      </div>
    </section>
    {open && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/75 p-3 sm:p-6" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
      <section role="dialog" aria-modal="true" aria-label="Capture visiting card" className="flex max-h-[95dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3 sm:px-6"><div><h2 className="text-base font-bold">Capture visiting card</h2><p className="text-xs text-slate-500">Photograph the front, then optionally the back.</p></div><button type="button" aria-label="Close camera" onClick={close} className="rounded-lg p-2 hover:bg-slate-100"><X className="size-5" /></button></header>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
          <div className="relative aspect-[4/3] max-h-[45dvh] overflow-hidden rounded-xl bg-slate-950 sm:aspect-video">
            <video ref={video} autoPlay muted playsInline className="h-full w-full object-contain" aria-label="Live camera preview" />
            {(!active || busy) && <div className="pointer-events-none absolute inset-0 grid place-items-center text-center text-sm text-white">{busy ? <LoaderCircle className="size-7 animate-spin" /> : <CameraOff className="size-7" />}</div>}
            {active && <div aria-hidden="true" className="pointer-events-none absolute inset-[12%] rounded-lg border-2 border-dashed border-white/70" />}
            <span className="absolute bottom-3 left-3 rounded-md bg-slate-950/80 px-3 py-1 text-xs font-medium text-white">Capturing {side} side</span>
          </div>
          {message && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{message}</p>}
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button type="button" disabled={!active || busy} onClick={() => void takePhoto()} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-40"><Camera className="size-4" /> Capture {side}</button>
            <button type="button" disabled={busy} onClick={() => { const next = facing === 'environment' ? 'user' : 'environment'; setFacing(next); void startCamera(next); }} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold disabled:opacity-40"><SwitchCamera className="size-4" /> Switch camera</button>
            <button type="button" disabled={busy} onClick={() => void startCamera(facing)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold disabled:opacity-40"><RefreshCcw className="size-4" /> Retry camera</button>
            <input ref={nativeInput} className="sr-only" type="file" accept="image/*" capture="environment" aria-label="Take photo with device camera" onChange={event => { const file = event.target.files?.[0]; if (file) setCapture(side, file); event.target.value = ''; }} />
            <button type="button" onClick={() => { stopCamera(); setMessage('Take a photo or choose an existing picture. Tap Retry camera to return to the live view.'); nativeInput.current?.click(); }} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold"><ImagePlus className="size-4" /> Device camera / gallery</button>
          </div>
          <div className="grid grid-cols-2 gap-3">{(['front', 'back'] as const).map(target => {
            const capture = target === 'front' ? front : back;
            return <div key={target} className="rounded-xl border border-slate-200 p-2"><div className="mb-2 flex items-center justify-between"><span className="text-xs font-bold capitalize">{target} {target === 'back' && '(optional)'}</span>{capture && <button aria-label={`Retake ${target}`} type="button" className="flex items-center gap-1 text-xs font-semibold text-blue-600" onClick={() => removeSide(target)}><RotateCcw className="size-3" /> Retake</button>}</div>
              {capture ? <button type="button" onClick={() => setSide(target)} className="w-full"><img src={capture.url} alt={`${target} card photo`} className="h-24 w-full rounded-lg bg-slate-50 object-contain sm:h-32" /></button> : <button type="button" onClick={() => setSide(target)} className="flex h-24 w-full items-center justify-center rounded-lg border border-dashed border-slate-200 text-xs text-slate-400 sm:h-32">{target === 'front' ? 'Capture front first' : 'Optional back photo'}</button>}
            </div>;
          })}</div>
          <p className="text-xs text-slate-500">Keep the full card visible with good lighting. You can review extracted fields before exporting or using them.</p>
        </div>
        <footer className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-200 px-4 py-3 sm:px-6"><button type="button" onClick={close} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold">Cancel</button><button type="button" onClick={submit} disabled={!front || processing || busy} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-40"><Check className="size-4" /> Scan captured card</button></footer>
      </section>
    </div>}
  </>;
}
