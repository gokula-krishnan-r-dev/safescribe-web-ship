import { jsPDF } from 'jspdf';
import { api } from '@/lib/api-client';
import type { PdfContext } from './types';

export interface PdfBrandingImage {
  dataUrl: string;
  format: 'PNG' | 'JPEG';
  widthPx: number;
  heightPx: number;
}

export function fitImageBox(
  widthPx: number,
  heightPx: number,
  maxW: number,
  maxH: number,
): { w: number; h: number } {
  const ratio = widthPx > 0 && heightPx > 0 ? widthPx / heightPx : 1;
  let w = maxW;
  let h = w / ratio;
  if (h > maxH) {
    h = maxH;
    w = h * ratio;
  }
  return { w, h };
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read image'));
    reader.readAsDataURL(blob);
  });
}

function readImageSize(dataUrl: string): Promise<{ widthPx: number; heightPx: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ widthPx: img.naturalWidth || 1, heightPx: img.naturalHeight || 1 });
    img.onerror = () => reject(new Error('Could not measure image'));
    img.src = dataUrl;
  });
}

async function fetchPdfImage(path: string): Promise<PdfBrandingImage | undefined> {
  try {
    const blob = await api.download(path);
    if (!blob.size) return undefined;
    const dataUrl = await blobToDataUrl(blob);
    const format: 'PNG' | 'JPEG' = blob.type.includes('png') || dataUrl.startsWith('data:image/png')
      ? 'PNG'
      : 'JPEG';
    const size = await readImageSize(dataUrl);
    return { dataUrl, format, ...size };
  } catch {
    return undefined;
  }
}

export async function hydratePdfImages(ctx: PdfContext): Promise<PdfContext> {
  if (!ctx.pharmacistSignatureUrl && !ctx.pharmacyLogoUrl) return ctx;
  const [pharmacistSignature, pharmacyLogo] = await Promise.all([
    ctx.pharmacistSignature ?? (ctx.pharmacistSignatureUrl
      ? fetchPdfImage(ctx.pharmacistSignatureUrl)
      : undefined),
    ctx.pharmacyLogo ?? (ctx.pharmacyLogoUrl ? fetchPdfImage(ctx.pharmacyLogoUrl) : undefined),
  ]);
  return {
    ...ctx,
    pharmacistSignature,
    pharmacyLogo,
  };
}

export function drawPdfImage(
  doc: jsPDF,
  image: PdfBrandingImage,
  x: number,
  y: number,
  maxW: number,
  maxH: number,
): { w: number; h: number } {
  const box = fitImageBox(image.widthPx, image.heightPx, maxW, maxH);
  doc.addImage(image.dataUrl, image.format, x, y, box.w, box.h, undefined, 'FAST');
  return box;
}
