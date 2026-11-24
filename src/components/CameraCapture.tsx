'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, Check, Focus, Flashlight, ImagePlus, LoaderCircle, RefreshCcw, RotateCcw, SwitchCamera, X } from 'lucide-react';
import { CardCropEditor } from '@/components/CardCropEditor';
import { validateImage } from '@/lib/images';

type Side = 'front' | 'back';
type Capture = { file: File; url: string };
type CameraRange = { min: number; max: number; step?: number };
type ExtendedCapabilities = MediaTrackCapabilities & {
  focusMode?: string[];
  zoom?: CameraRange;
  torch?: boolean;
};
type ExtendedConstraints = MediaTrackConstraintSet & {
  focusMode?: string;
  zoom?: number;
  torch?: boolean;
};
type PhotoCamera = { takePhoto: () => Promise<Blob> };
type PhotoCameraConstructor = new (track: MediaStreamTrack) => PhotoCamera;

/** ImageCapture is not available on every mobile browser. */
function stillPhotoCamera(track: MediaStreamTrack): PhotoCamera | null {
  const ctor = (window as Window & { ImageCapture?: PhotoCameraConstructor }).ImageCapture;
  if (!ctor) return null;
  try { return new ctor(track); } catch { return null; }
}

function clamp(value: number, range: CameraRange): number {
  return Math.max(range.min, Math.min(range.max, value));
}

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
  const [pending, setPending] = useState<File | null>(null);
  const [autoStart, setAutoStart] = useState(false);
  const [cameraDetails, setCameraDetails] = useState('');
  const [zoomRange, setZoomRange] = useState<CameraRange | null>(null);
  const [zoom, setZoom] = useState(1);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [focusAvailable, setFocusAvailable] = useState(false);
  const [photoMethod, setPhotoMethod] = useState<'still' | 'frame'>('frame');
  const controlsRequest = useRef(0);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const operation = useRef(0);
  const captured = useRef<{ front: Capture | null; back: Capture | null }>({ front: null, back: null });
  const nativeInput = useRef<HTMLInputElement>(null);

  const stopCamera = useCallback(() => {
    operation.current += 1;
    controlsRequest.current += 1;
    stream.current?.getTracks().forEach(track => track.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
    setActive(false);
    setBusy(false);
    setZoomRange(null);
    setZoom(1);
    setTorchAvailable(false);
    setTorchOn(false);
    setFocusAvailable(false);
    setPhotoMethod('frame');
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
    setPending(null);
    setAutoStart(false);
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
        acquired = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: preferred }, width: { ideal: 2560 }, height: { ideal: 1920 }, aspectRatio: { ideal: 4 / 3 } } });
      } catch (firstError) {
        if (firstError instanceof DOMException && (firstError.name === 'OverconstrainedError' || firstError.name === 'NotFoundError')) {
          acquired = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
        } else throw firstError;
      }
      if (operation.current !== ticket) { acquired.getTracks().forEach(track => track.stop()); return; }
      stream.current = acquired;
      const track = acquired.getVideoTracks()[0];
      if (track) {
        const capabilities = (track.getCapabilities?.() ?? {}) as ExtendedCapabilities;
        const canFocus = capabilities.focusMode?.includes('continuous') ?? false;
        setFocusAvailable(canFocus);
        if (canFocus) {
          try { await track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as ExtendedConstraints] }); }
          catch { setFocusAvailable(false); }
        }
        if (operation.current !== ticket) { acquired.getTracks().forEach(t => t.stop()); return; }
        const range = capabilities.zoom;
        if (range && Number.isFinite(range.min) && Number.isFinite(range.max) && range.max > range.min) {
          setZoomRange(range);
          setZoom(clamp((track.getSettings() as MediaTrackSettings & { zoom?: number }).zoom ?? range.min, range));
        }
        setTorchAvailable(capabilities.torch === true);
        setPhotoMethod(stillPhotoCamera(track) ? 'still' : 'frame');
        const settings = track.getSettings();
        setCameraDetails(`${settings.width ?? '?'} × ${settings.height ?? '?'} live preview`);
      }
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

  const setZoomLevel = async (desired: number) => {
    const track = stream.current?.getVideoTracks()[0];
    if (!track || !zoomRange) return;
    const request = ++controlsRequest.current;
    const value = clamp(desired, zoomRange);
    try {
      await track.applyConstraints({ advanced: [{ zoom: value } as ExtendedConstraints] });
      if (controlsRequest.current === request && track.readyState === 'live') setZoom(value);
    } catch { setMessage('This camera cannot change its zoom level.'); }
  };

  const toggleTorch = async () => {
    const track = stream.current?.getVideoTracks()[0];
    if (!track || !torchAvailable) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as ExtendedConstraints] });
      if (track.readyState === 'live') setTorchOn(next);
    } catch { setMessage('Torch control is unavailable on this camera.'); }
  };

  const refocus = async () => {
    const track = stream.current?.getVideoTracks()[0];
    if (!track || !focusAvailable) return;
    try {
      await track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as ExtendedConstraints] });
      setMessage('Continuous autofocus requested. Hold the card steady.');
    } catch { setMessage('This camera does not allow manual refocusing.'); }
  };

  const launch = () => {
    setOpen(true);
    setAutoStart(true);
    setSide('front');
    setMessage('');
    // The video element mounts on the next render; camera is started by the effect below.
  };

  useEffect(() => {
    if (open && !pending && autoStart && !stream.current && !active && !busy && message === '') void startCamera(facing);
  }, [open, pending, autoStart, active, busy, message, facing, startCamera]);

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
    const track = stream.current?.getVideoTracks()[0];
    if (!element || !active || !element.videoWidth || !element.videoHeight || !track) {
      setMessage('Camera is not ready. Try again in a moment.');
      return;
    }
    setBusy(true);
    try {
      // Prefer a full-resolution still exposure, independently of preview dimensions.
      // ImageCapture is optional; Safari and some webcams require the frame fallback.
      let blob: Blob | null = null;
      const still = stillPhotoCamera(track);
      if (still) {
        try {
          const candidate = await still.takePhoto();
          if (/^image\/(jpeg|png|webp)$/.test(candidate.type) && candidate.size) blob = candidate;
        } catch { /* Some browsers advertise ImageCapture but cannot take stills. */ }
      }
      if (!blob || !blob.size) {
        // Preserve text detail for the crop editor. Never crop the live preview itself.
        const maxEdge = 4096;
        const ratio = Math.min(1, maxEdge / Math.max(element.videoWidth, element.videoHeight));
        const canvas = document.createElement('canvas');
        try {
          canvas.width = Math.max(1, Math.round(element.videoWidth * ratio));
          canvas.height = Math.max(1, Math.round(element.videoHeight * ratio));
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('Could not prepare the camera photo.');
          ctx.drawImage(element, 0, 0, canvas.width, canvas.height);
          blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.94));
        } finally {
          canvas.width = 0;
          canvas.height = 0;
        }
      }
      if (!blob || !blob.size) throw new Error('Could not save the camera photo.');
      const mime = blob.type === 'image/png' ? 'image/png' : blob.type === 'image/webp' ? 'image/webp' : 'image/jpeg';
      const extension = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
      const filename = `card-${side}-${Date.now()}.${extension}`;
      const file = new File([blob], filename, { type: mime, lastModified: Date.now() });
      const invalid = validateImage(file);
      if (invalid) throw new Error(`${invalid} Try the device camera/gallery option for a smaller photo.`);
      stopCamera();
      setAutoStart(false);
      setPending(file);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not capture photo.');
    } finally { setBusy(false); }
  };

  const cancelCrop = () => {
    setPending(null);
    setMessage('');
    setAutoStart(true);
  };

  const applyCrop = (file: File) => {
    setCapture(side, file);
    setAutoStart(false);
    setPending(null);
    // Camera remains stopped while the crop and its review preview are retained.
    // Restart explicitly if another side must be photographed, saving mobile memory.
  };

  const removeSide = (target: Side) => {
    const current = captured.current[target];
    if (current) URL.revokeObjectURL(current.url);
    captured.current[target] = null;
    if (target === 'front') setFront(null); else setBack(null);
    setSide(target);
    setAutoStart(true);
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
    {open && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/75 sm:p-6" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
      <section role="dialog" aria-modal="true" aria-label="Capture visiting card" className="flex h-[100dvh] w-full max-w-4xl flex-col overflow-hidden bg-white shadow-2xl sm:h-auto sm:max-h-[96dvh] sm:rounded-2xl">
        <header className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3 sm:px-6"><div><h2 className="text-base font-bold">Capture visiting card</h2><p className="text-xs text-slate-500">Photograph the front, then optionally the back.</p></div><button type="button" aria-label="Close camera" onClick={close} className="rounded-lg p-2 hover:bg-slate-100"><X className="size-5" /></button></header>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3 sm:p-6">
          {pending && <CardCropEditor file={pending} side={side} onApply={applyCrop} onCancel={cancelCrop} onError={setMessage} />}
          {!pending && <div className="relative flex h-[min(61dvh,560px)] w-full items-center justify-center overflow-hidden rounded-xl bg-slate-950 sm:h-[min(58dvh,570px)]">
            <video ref={video} autoPlay muted playsInline className="h-full w-full object-contain" aria-label="Live camera preview" />
            {(!active || busy) && <div className="pointer-events-none absolute inset-0 grid place-items-center text-center text-sm text-white">{busy ? <LoaderCircle className="size-7 animate-spin" /> : <CameraOff className="size-7" />}</div>}
            {active && <div aria-hidden="true" className="pointer-events-none absolute inset-x-[6%] top-[25%] bottom-[25%] rounded-xl border-2 border-dashed border-white/80 sm:inset-x-[14%]" />}
            {active && <span className="absolute right-3 top-3 rounded-md bg-slate-950/75 px-2 py-1 text-xs text-white">{cameraDetails}</span>}
            <span className="absolute bottom-3 left-3 rounded-md bg-slate-950/80 px-3 py-1 text-xs font-medium text-white">Capturing {side} side</span>
          </div>}
          {!pending && active && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center gap-2 text-xs text-slate-600"><Camera className="size-4 text-blue-600" /> {photoMethod === 'still' ? 'Full-resolution still photo supported' : 'Camera frame capture (device fallback)'}</div>
            <div className="flex flex-wrap items-center gap-2">
              {focusAvailable && <button type="button" onClick={() => void refocus()} className="inline-flex items-center gap-1 rounded-lg border bg-white px-3 py-2 text-xs font-semibold"><Focus className="size-4" /> Refocus</button>}
              {torchAvailable && <button type="button" aria-pressed={torchOn} onClick={() => void toggleTorch()} className="inline-flex items-center gap-1 rounded-lg border bg-white px-3 py-2 text-xs font-semibold"><Flashlight className="size-4" /> {torchOn ? 'Torch off' : 'Torch on'}</button>}
              {zoomRange && <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">Zoom <input aria-label="Camera zoom" type="range" min={zoomRange.min} max={zoomRange.max} step={zoomRange.step || 0.1} value={zoom} onChange={event => void setZoomLevel(Number(event.target.value))} className="w-24 accent-blue-600" /><span className="min-w-8 text-right">{zoom.toFixed(1)}×</span></label>}
            </div>
          </div>}
          {message && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{message}</p>}
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button type="button" disabled={!active || busy || !!pending} onClick={() => void takePhoto()} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-40"><Camera className="size-4" /> Capture {side}</button>
            <button type="button" disabled={busy || !!pending} onClick={() => { const next = facing === 'environment' ? 'user' : 'environment'; setFacing(next); setAutoStart(true); void startCamera(next); }} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold disabled:opacity-40"><SwitchCamera className="size-4" /> Switch camera</button>
            <button type="button" disabled={busy || !!pending} onClick={() => { setMessage(''); setAutoStart(true); void startCamera(facing); }} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold disabled:opacity-40"><RefreshCcw className="size-4" /> {active ? 'Restart camera' : 'Start camera'}</button>
            <input ref={nativeInput} className="sr-only" type="file" accept="image/*" capture="environment" aria-label="Take photo with device camera" onChange={event => { const file = event.target.files?.[0]; if (file) { stopCamera(); setAutoStart(false); setPending(file); } event.target.value = ''; }} />
            <button type="button" disabled={!!pending} onClick={() => { stopCamera(); setMessage('Take a photo or choose an existing picture. Tap Retry camera to return to the live view.'); nativeInput.current?.click(); }} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold"><ImagePlus className="size-4" /> Device camera / gallery</button>
          </div>
          <div className="grid grid-cols-2 gap-3">{(['front', 'back'] as const).map(target => {
            const capture = target === 'front' ? front : back;
            return <div key={target} className="rounded-xl border border-slate-200 p-2"><div className="mb-2 flex items-center justify-between"><span className="text-xs font-bold capitalize">{target} {target === 'back' && '(optional)'}</span>{capture && <button aria-label={`Retake ${target}`} type="button" className="flex items-center gap-1 text-xs font-semibold text-blue-600" onClick={() => removeSide(target)}><RotateCcw className="size-3" /> Retake</button>}</div>
              {capture ? <button type="button" onClick={() => setSide(target)} className="w-full"><img src={capture.url} alt={`${target} card photo`} className="h-24 w-full rounded-lg bg-slate-50 object-contain sm:h-32" /></button> : <button type="button" onClick={() => setSide(target)} className="flex h-24 w-full items-center justify-center rounded-lg border border-dashed border-slate-200 text-xs text-slate-400 sm:h-32">{target === 'front' ? 'Capture front first' : 'Optional back photo'}</button>}
            </div>;
          })}</div>
          <p className="text-xs text-slate-500">Hold the phone steady and move close enough that text is sharp. Tap Capture, adjust the crop, then scan. Controls appear only when supported by your camera.</p>
        </div>
        <footer className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-200 px-4 py-3 sm:px-6"><button type="button" onClick={close} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold">Cancel</button><button type="button" onClick={submit} disabled={!front || processing || busy || !!pending} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-40"><Check className="size-4" /> Scan captured card</button></footer>
      </section>
    </div>}
  </>;
}
