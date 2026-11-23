const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ACCEPTED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const EXTENSION = /\.(jpe?g|png|webp)$/i;

export function validateImage(file: File): string | null {
  if (!ACCEPTED_MIME.has(file.type) || !EXTENSION.test(file.name)) return 'Use a JPG, PNG, or WebP image.';
  if (file.size === 0) return 'Image is empty.';
  if (file.size > MAX_UPLOAD_BYTES) return 'Image exceeds the 10 MB limit.';
  return null;
}

async function decodeImage(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) return createImageBitmap(file);
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Unable to decode image.')); };
    image.src = url;
  });
}

function render(canvasImage: ImageBitmap | HTMLImageElement, maxEdge: number, quality: number): Promise<Blob> {
  const width = canvasImage.width;
  const height = canvasImage.height;
  const ratio = Math.min(1, maxEdge / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * ratio));
  canvas.height = Math.max(1, Math.round(height * ratio));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is unavailable.');
  context.fillStyle = 'white';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(canvasImage, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob(
    blob => blob ? resolve(blob) : reject(new Error('Image compression failed.')),
    'image/jpeg', quality,
  ));
}

function asDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read preview.'));
    reader.readAsDataURL(blob);
  });
}

export async function prepareImage(file: File): Promise<{ upload: File; preview: string }> {
  const image = await decodeImage(file);
  try {
    const [upload, preview] = await Promise.all([
      render(image, 1800, 0.85), render(image, 550, 0.73),
    ]);
    return {
      upload: new File([upload], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' }),
      preview: await asDataUrl(preview),
    };
  } finally {
    if ('close' in image && typeof image.close === 'function') image.close();
  }
}
