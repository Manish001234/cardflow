/** Browser-only, deterministic pixel preparation. No server or paid OCR calls. */
export type ProcessingMode = 'original' | 'auto' | 'grayscale' | 'high-contrast' | 'ocr-optimized';
export const PROCESSING_MODES: ReadonlyArray<{ value: ProcessingMode; label: string }> = [
  { value: 'original', label: 'Original' },
  { value: 'auto', label: 'Auto enhance' },
  { value: 'grayscale', label: 'Grayscale' },
  { value: 'high-contrast', label: 'High contrast' },
  { value: 'ocr-optimized', label: 'OCR optimized' },
];
const clamp = (n: number) => Math.round(Math.max(0, Math.min(255, n)));

/** Works on a copy: the captured image and selected source pixels never change. */
export function processPixels(input: ImageData, mode: ProcessingMode): ImageData {
  const { width, height } = input;
  const pixels = new Uint8ClampedArray(input.data);
  if (mode === 'original') return new ImageData(pixels, width, height);
  const luminance = new Uint8Array(width * height);
  const histogram = new Uint32Array(256);
  for (let i = 0; i < luminance.length; i++) {
    const index = i * 4;
    const value = clamp(.299 * pixels[index] + .587 * pixels[index + 1] + .114 * pixels[index + 2]);
    luminance[i] = value;
    histogram[value]++;
  }
  // Use percentile stretching instead of hard thresholding, which can erase thin characters.
  const percentile = (ratio: number) => {
    const target = width * height * ratio;
    let count = 0;
    for (let i = 0; i < 256; i++) { count += histogram[i]; if (count >= target) return i; }
    return 255;
  };
  const low = percentile(.02), high = percentile(.98);
  const range = Math.max(24, high - low);
  for (let i = 0; i < luminance.length; i++) {
    const j = i * 4;
    const l = luminance[i];
    const stretched = clamp((l - low) * 255 / range);
    if (mode === 'auto') {
      // Mild contrast; preserve color information important for brand/text separation.
      const correction = clamp(l * .64 + stretched * .36) - l;
      pixels[j] = clamp(pixels[j] + correction);
      pixels[j + 1] = clamp(pixels[j + 1] + correction);
      pixels[j + 2] = clamp(pixels[j + 2] + correction);
    } else {
      const value = mode === 'grayscale' ? l : mode === 'high-contrast' ? clamp((stretched - 128) * 1.15 + 128) : stretched;
      pixels[j] = pixels[j + 1] = pixels[j + 2] = value;
    }
    // Preserve alpha in all modes.
  }
  if (mode === 'ocr-optimized' && width > 2 && height > 2) {
    // Gentle 4-neighbor unsharp mask. Avoid binarization; retain fine/light lettering.
    const source = new Uint8ClampedArray(pixels);
    for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
      const i = (y * width + x) * 4;
      const center = source[i];
      const avg = (source[i - 4] + source[i + 4] + source[i - width * 4] + source[i + width * 4]) / 4;
      const sharpened = clamp(center + (center - avg) * .26);
      pixels[i] = pixels[i + 1] = pixels[i + 2] = sharpened;
    }
  }
  return new ImageData(pixels, width, height);
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Unable to open image for OCR optimization.')); };
    img.src = url;
  });
}

/** At most one extra bounded-resolution variant is created for an incomplete scan. */
export async function prepareOCRVariant(file: File, mode: ProcessingMode = 'ocr-optimized'): Promise<File> {
  if (mode === 'original') return file;
  const img = await loadImage(file);
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, 2000 / Math.max(img.naturalWidth, img.naturalHeight));
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  try {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Image processing is not supported by this browser.');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    ctx.putImageData(processPixels(ctx.getImageData(0, 0, canvas.width, canvas.height), mode), 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('Image processing failed.')), 'image/jpeg', .92));
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '-ocr.jpg', { type: 'image/jpeg', lastModified: file.lastModified });
  } finally { canvas.width = canvas.height = 0; }
}

export type OCRCandidateQuality = {
  fullName: string; jobTitle: string; companyName: string; email: string;
  phone: string; website: string; address: string; confidenceScore: 'High' | 'Medium' | 'Low';
};
/** Heuristic ranking, not a guarantee that a string is factually correct. */
export function contactQuality(contact: OCRCandidateQuality): number {
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email.trim());
  const phoneDigits = contact.phone.replace(/\D/g, '').length;
  const plausibleName = /\p{L}{2,}(?:[\s'’.-]+\p{L}{2,})+/u.test(contact.fullName.trim());
  const nameGarbage = /(?:\b(?:ee|te|qq|qo)\b\s*){2,}/i.test(contact.fullName);
  return (plausibleName && !nameGarbage ? 7 : contact.fullName.trim() ? 1 : 0)
    + (validEmail ? 5 : 0) + (phoneDigits >= 10 && phoneDigits <= 15 ? 4 : 0)
    + (contact.companyName.trim().length > 2 ? 3 : 0)
    + (contact.jobTitle.trim().length > 2 ? 2 : 0)
    + (contact.website.trim() ? 2 : 0) + (contact.address.trim() ? 1 : 0)
    + (contact.confidenceScore === 'High' ? 2 : contact.confidenceScore === 'Medium' ? 1 : 0);
}

/** Prefer known-good first pass unless the follow-up clearly improves the contact. */
export function shouldTryAlternative(contact: OCRCandidateQuality): boolean {
  return !contact.fullName.trim() || contact.confidenceScore === 'Low' ||
    (!contact.email.trim() && !contact.phone.trim());
}
export function preferAlternative(first: OCRCandidateQuality, second: OCRCandidateQuality): boolean {
  // Avoid trading an existing valid identity for a weak candidate in an alternative render.
  const firstHasName = first.fullName.trim().length > 1;
  const secondHasName = second.fullName.trim().length > 1;
  if (firstHasName && !secondHasName) return false;
  return contactQuality(second) >= contactQuality(first) + (firstHasName ? 2 : 1);
}
