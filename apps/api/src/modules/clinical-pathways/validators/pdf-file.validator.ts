import { FileValidator } from '@nestjs/common';
import { IFile } from '@nestjs/common/pipes/file/interfaces';

const PDF_MIME_TYPES = new Set([
  'application/pdf',
  'application/x-pdf',
  'application/acrobat',
  'applications/vnd.pdf',
  'text/pdf',
  'text/x-pdf',
]);

const PDF_MAGIC = Buffer.from('%PDF');

export class PdfFileValidator extends FileValidator<{ maxSizeMb?: number }> {
  constructor(maxSizeMb = 20) {
    super({ maxSizeMb });
  }

  isValid(file?: IFile): boolean {
    if (!file) return false;

    const maxBytes = (this.validationOptions?.maxSizeMb ?? 20) * 1024 * 1024;
    if (file.size > maxBytes) return false;

    const mimetype = file.mimetype?.toLowerCase() ?? '';
    const multerFile = file as Express.Multer.File;
    const originalname = multerFile.originalname?.toLowerCase() ?? '';
    const hasPdfMime = PDF_MIME_TYPES.has(mimetype) || mimetype.includes('pdf');
    const hasPdfExt = originalname.endsWith('.pdf');

    if (!hasPdfMime && !hasPdfExt) return false;

    const buffer = multerFile.buffer;
    if (buffer?.length >= 4) {
      return buffer.subarray(0, 4).equals(PDF_MAGIC);
    }

    // Fall back to mime/extension when buffer unavailable
    return hasPdfMime || hasPdfExt;
  }

  buildErrorMessage(): string {
    return 'Only PDF files up to 20MB are allowed';
  }
}
