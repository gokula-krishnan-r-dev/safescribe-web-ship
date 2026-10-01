import { FileValidator } from '@nestjs/common';
import { IFile } from '@nestjs/common/pipes/file/interfaces';

const ACCEPTED_MIMES = new Set([
  // PDF
  'application/pdf',
  'application/x-pdf',
  // DOCX
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  // DOC (legacy)
  'application/msword',
  'application/vnd.ms-word',
  // Text
  'text/plain',
]);

const ACCEPTED_EXTENSIONS = ['.pdf', '.docx', '.doc', '.txt'];

const PDF_MAGIC = Buffer.from('%PDF');
const DOCX_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]); // ZIP (Office Open XML)
const DOC_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0]);  // OLE2

export class ClinicalFileValidator extends FileValidator<{ maxSizeMb?: number }> {
  constructor(maxSizeMb = 20) {
    super({ maxSizeMb });
  }

  isValid(file?: IFile): boolean {
    if (!file) return false;

    const maxBytes = (this.validationOptions?.maxSizeMb ?? 20) * 1024 * 1024;
    if (file.size > maxBytes) return false;

    const mime = file.mimetype?.toLowerCase() ?? '';
    const ext = this.getExtension((file as Express.Multer.File).originalname ?? '');

    const mimeOk = ACCEPTED_MIMES.has(mime) || mime.includes('pdf') || mime.includes('word');
    const extOk = ACCEPTED_EXTENSIONS.includes(ext);
    if (!mimeOk && !extOk) return false;

    // Magic-byte check when buffer is available
    const buf = (file as Express.Multer.File).buffer;
    if (buf && buf.length >= 4) {
      const head = buf.subarray(0, 4);
      const isPdf = head.equals(PDF_MAGIC);
      const isDocx = head.equals(DOCX_MAGIC);
      const isDoc = head.equals(DOC_MAGIC);
      const isTxt = ext === '.txt';
      return isPdf || isDocx || isDoc || isTxt;
    }

    return mimeOk || extOk;
  }

  buildErrorMessage(): string {
    return `Unsupported file type. Please upload PDF, DOCX, DOC, or TXT (max ${this.validationOptions?.maxSizeMb ?? 20} MB each)`;
  }

  private getExtension(filename: string): string {
    const dot = filename.lastIndexOf('.');
    return dot >= 0 ? filename.slice(dot).toLowerCase() : '';
  }
}
