const SIGNATURE_MAX = { width: 1400, height: 500 };
const LOGO_MAX = { width: 900, height: 900 };

export type BrandingImageKind = 'signature' | 'logo';

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read that image. Use a PNG or JPEG file.'));
    };
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) reject(new Error('Could not prepare that image'));
        else resolve(blob);
      },
      type,
      quality,
    );
  });
}

/**
 * Re-encode and downscale branding images so PDFs stay sharp without large uploads.
 * PNG is kept when the source has transparency (typical for signatures).
 */
export async function optimizeBrandingImage(
  file: File,
  kind: BrandingImageKind,
): Promise<File> {
  const type = (file.type || '').toLowerCase();
  if (type !== 'image/png' && type !== 'image/jpeg' && type !== 'image/jpg') {
    throw new Error('Use a PNG or JPEG image');
  }

  const img = await loadImage(file);
  const limits = kind === 'signature' ? SIGNATURE_MAX : LOGO_MAX;
  const scale = Math.min(1, limits.width / img.width, limits.height / img.height);
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not prepare that image');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, width, height);

  const preferPng = type === 'image/png' || kind === 'signature';
  const blob = preferPng
    ? await canvasToBlob(canvas, 'image/png')
    : await canvasToBlob(canvas, 'image/jpeg', 0.9);
  const ext = preferPng ? 'png' : 'jpg';
  return new File([blob], `${kind}.${ext}`, { type: blob.type, lastModified: Date.now() });
}
