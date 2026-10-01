import { Injectable, Logger } from '@nestjs/common';
import { createRequire } from 'module';

/**
 * createRequire(__filename) makes Node resolve packages starting from THIS
 * compiled file's directory and walking up — always landing in
 * apps/api/node_modules regardless of cwd or monorepo hoisting.
 */
const pkgRequire = createRequire(__filename);

export type DocumentType = 'PDF' | 'DOCX' | 'DOC' | 'TXT' | 'UNKNOWN';

export interface ExtractedDocument {
  text: string;
  pageCount: number;
  wordCount: number;
  type: DocumentType;
  metadata: Record<string, string | number>;
}

@Injectable()
export class DocumentExtractorService {
  private readonly logger = new Logger(DocumentExtractorService.name);

  detectType(mimetype: string, originalname: string): DocumentType {
    const mime = mimetype.toLowerCase();
    const ext = originalname.split('.').pop()?.toLowerCase() ?? '';

    if (mime.includes('pdf') || ext === 'pdf') return 'PDF';
    if (
      mime.includes('wordprocessingml') ||
      mime.includes('openxmlformats') ||
      ext === 'docx'
    ) return 'DOCX';
    if (mime.includes('msword') || ext === 'doc') return 'DOC';
    if (mime.includes('text/plain') || ext === 'txt') return 'TXT';
    return 'UNKNOWN';
  }

  async extract(buffer: Buffer, mimetype: string, originalname: string): Promise<ExtractedDocument> {
    const type = this.detectType(mimetype, originalname);
    this.logger.log(`Extracting text from ${originalname} (${type}, ${(buffer.length / 1024).toFixed(0)} KB)`);

    switch (type) {
      case 'PDF': return this.extractPdf(buffer);
      case 'DOCX':
      case 'DOC': return this.extractDocx(buffer);
      case 'TXT': return this.extractTxt(buffer);
      default:
        throw new Error(
          `Unsupported file "${originalname}". Please upload PDF, DOCX, DOC, or TXT.`,
        );
    }
  }

  private async extractPdf(buffer: Buffer): Promise<ExtractedDocument> {
    // pkgRequire uses __filename so it resolves from this compiled file's
    // directory → apps/api/node_modules/pdf-parse — always correct.
    const pdfParse = pkgRequire('pdf-parse') as (
      buf: Buffer,
      opts?: { max?: number },
    ) => Promise<{ text: string; numpages: number; info?: Record<string, unknown> }>;

    const result = await pdfParse(buffer, { max: 0 });
    const text = this.clean(result.text);

    return {
      text,
      pageCount: result.numpages,
      wordCount: text.split(/\s+/).filter(Boolean).length,
      type: 'PDF',
      metadata: {
        pages: result.numpages,
        title: String(result.info?.Title ?? ''),
        author: String(result.info?.Author ?? ''),
      },
    };
  }

  private async extractDocx(buffer: Buffer): Promise<ExtractedDocument> {
    const mammoth = pkgRequire('mammoth') as {
      extractRawText: (o: { buffer: Buffer }) => Promise<{ value: string }>;
    };

    const result = await mammoth.extractRawText({ buffer });
    const text = this.clean(result.value);
    const words = text.split(/\s+/).filter(Boolean).length;

    return {
      text,
      pageCount: Math.max(1, Math.ceil(words / 250)),
      wordCount: words,
      type: 'DOCX',
      metadata: { estimatedPages: Math.max(1, Math.ceil(words / 250)) },
    };
  }

  private extractTxt(buffer: Buffer): ExtractedDocument {
    const text = this.clean(buffer.toString('utf-8'));
    const words = text.split(/\s+/).filter(Boolean).length;
    return { text, pageCount: 1, wordCount: words, type: 'TXT', metadata: {} };
  }

  private clean(raw: string): string {
    return raw
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\f/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
  }
}
