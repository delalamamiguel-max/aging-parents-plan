import busboy from 'busboy';
import type { IncomingMessage } from 'node:http';

const MAX_AUDIO_BYTES = 30 * 1024 * 1024;

export interface ParsedTranscribeUpload {
  audio: Buffer;
  mimeType: string;
  language?: 'en' | 'es';
}

/**
 * Parse POST /transcribe multipart body. Expects field `file` (audio) and
 * optional `language` (en|es).
 */
export function parseTranscribeMultipart(req: IncomingMessage): Promise<ParsedTranscribeUpload> {
  return new Promise((resolve, reject) => {
    const bb = busboy({
      headers: req.headers,
      limits: { fileSize: MAX_AUDIO_BYTES, files: 1 },
    });

    const chunks: Buffer[] = [];
    let mimeType = 'application/octet-stream';
    let sawFile = false;
    let language: 'en' | 'es' | undefined;

    bb.on('file', (_fieldname, file, info) => {
      sawFile = true;
      mimeType = info.mimeType || 'application/octet-stream';
      file.on('data', (d: Buffer) => chunks.push(d));
      file.on('limit', () => {
        file.resume();
        reject(new ParseTranscribeError('file_too_large', 'Audio file exceeds size limit (30MB).'));
      });
      file.on('error', reject);
    });

    bb.on('field', (name, val) => {
      if (name === 'language' && (val === 'en' || val === 'es')) {
        language = val;
      }
    });

    bb.on('error', (err: Error) => reject(err));

    bb.on('finish', () => {
      if (!sawFile || chunks.length === 0) {
        reject(new ParseTranscribeError('missing_file', 'Missing audio file (multipart field "file").'));
        return;
      }
      resolve({
        audio: Buffer.concat(chunks),
        mimeType,
        language,
      });
    });

    req.on('error', reject);
    req.pipe(bb);
  });
}

export class ParseTranscribeError extends Error {
  constructor(
    public readonly code: 'missing_file' | 'file_too_large',
    message: string
  ) {
    super(message);
    this.name = 'ParseTranscribeError';
  }
}
