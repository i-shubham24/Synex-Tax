import { randomUUID } from 'node:crypto';

/**
 * File types a firm may keep in a client's documents, recognised from the file's own bytes, never
 * from its name or the browser's claim. PDF, JPEG, PNG, WebP, Excel (xlsx, xls), Word (docx,
 * doc), CSV and ZIP. Executables, scripts, Office files with macros and ZIPs that carry an
 * executable are refused.
 */
export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;

export type DocumentMime =
  | 'application/pdf'
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp'
  | 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  | 'application/vnd.ms-excel'
  | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  | 'application/msword'
  | 'text/csv'
  | 'application/zip';

export interface DetectedType {
  mime: DocumentMime;
  ext: 'pdf' | 'jpg' | 'png' | 'webp' | 'xlsx' | 'xls' | 'docx' | 'doc' | 'csv' | 'zip';
  /** Shown in the browser (PDF and images); everything else is downloaded. */
  previewable: boolean;
}

export type Detection = { ok: true; type: DetectedType } | { ok: false; reason: string };

const REFUSED = 'Upload a PDF, a photo (JPEG, PNG or WebP), an Excel or Word file, a CSV or a ZIP.';
const EXECUTABLE = 'Programs and scripts cannot be uploaded.';
const MACROS = 'Office files with macros cannot be uploaded. Save it as a normal .xlsx or .docx.';
const EXEC_NAME = /\.(exe|dll|com|bat|cmd|msi|msp|scr|pif|cpl|ps1|psm1|vbs|vbe|js|jse|wsf|wsh|hta|jar|sh|bash|apk|app|dmg|pkg|deb|rpm|lnk|reg|iso|so|dylib|elf|bin)$/i;

const t = (mime: DocumentMime, ext: DetectedType['ext'], previewable = false): Detection => ({ ok: true, type: { mime, ext, previewable } });

function looksExecutable(buf: Buffer): boolean {
  if (buf.length >= 2 && buf[0] === 0x4d && buf[1] === 0x5a) return true; // MZ: Windows programs
  if (buf.length >= 4 && buf.readUInt32BE(0) === 0x7f454c46) return true; // ELF
  if (buf.length >= 4 && [0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe, 0xcafebabe].includes(buf.readUInt32BE(0))) return true; // Mach-O, Java class
  if (buf.length >= 2 && buf[0] === 0x23 && buf[1] === 0x21) return true; // #! scripts
  return false;
}

const MAX_ZIP_ENTRIES = 5000;
const MAX_ZIP_UNCOMPRESSED_BYTES = 100 * 1024 * 1024;

/** Names of the entries in a ZIP's central directory, or null when it cannot be read. */
export function zipEntryNames(buf: Buffer): string[] | null {
  const min = Math.max(0, buf.length - 22 - 0xffff);
  let eocd = -1;
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  if (count === 0xffff || p === 0xffffffff || count > MAX_ZIP_ENTRIES) return null; // ZIP64 / excessive entries are not accepted
  const names: string[] = [];
  let totalUncompressed = 0;
  for (let n = 0; n < count; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) return null;
    const uncompressedSize = buf.readUInt32LE(p + 24);
    if (uncompressedSize === 0xffffffff) return null;
    totalUncompressed += uncompressedSize;
    if (totalUncompressed > MAX_ZIP_UNCOMPRESSED_BYTES) return null;
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    if (p + 46 + nameLen > buf.length) return null;
    names.push(buf.subarray(p + 46, p + 46 + nameLen).toString('utf8'));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return names;
}

function detectZip(buf: Buffer): Detection {
  const names = zipEntryNames(buf);
  if (!names) return { ok: false, reason: 'This ZIP file could not be read.' };
  if (names.some((n) => /(^|\/)vbaProject\.bin$/i.test(n))) return { ok: false, reason: MACROS };
  if (names.some((n) => EXEC_NAME.test(n))) return { ok: false, reason: 'This ZIP contains a program or script, so it cannot be uploaded.' };
  const office = names.includes('[Content_Types].xml');
  if (office && names.some((n) => n.startsWith('xl/'))) return t('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'xlsx');
  if (office && names.some((n) => n.startsWith('word/'))) return t('application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx');
  return t('application/zip', 'zip');
}

const utf16 = (s: string) => Buffer.from(s, 'utf16le');

/** Old Office files share one container; the stream names inside tell Word from Excel. */
function detectCompound(buf: Buffer): Detection {
  if (buf.includes(utf16('_VBA_PROJECT'))) return { ok: false, reason: MACROS };
  if (buf.includes(utf16('WordDocument'))) return t('application/msword', 'doc');
  if (buf.includes(utf16('Workbook')) || buf.includes(utf16('Book'))) return t('application/vnd.ms-excel', 'xls');
  return { ok: false, reason: REFUSED };
}

/** A CSV is plain UTF-8 text in rows, with commas, semicolons or tabs, and a .csv name. */
function detectCsv(buf: Buffer, name: string): Detection | null {
  if (!/\.csv$/i.test(name)) return null;
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return null;
  }
  text = text.replace(/^\uFEFF/, '');
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text)) return null;
  if (/^\s*</.test(text)) return null; // markup is not a spreadsheet
  const first = text.split(/\r?\n/, 1)[0] ?? '';
  if (!/[,;\t]/.test(first)) return null;
  return t('text/csv', 'csv');
}

export function detectDocument(buf: Buffer, name: string): Detection {
  if (!buf.length) return { ok: false, reason: 'The file is empty.' };
  if (looksExecutable(buf)) return { ok: false, reason: EXECUTABLE };
  if (EXEC_NAME.test(name)) return { ok: false, reason: EXECUTABLE };
  if (buf.length >= 5 && buf.subarray(0, 5).toString('latin1') === '%PDF-') return t('application/pdf', 'pdf', true);
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return t('image/jpeg', 'jpg', true);
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return t('image/png', 'png', true);
  if (buf.length >= 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return t('image/webp', 'webp', true);
  if (buf.length >= 4 && buf.readUInt32LE(0) === 0x04034b50) return detectZip(buf);
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))) return detectCompound(buf);
  return detectCsv(buf, name) ?? { ok: false, reason: REFUSED };
}

export const PREVIEWABLE = new Set<string>(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

/**
 * The shared file stores (modules/storage/fileStore.ts and integrations/s3Store.ts) accept keys
 * ending .jpg, .png or .pdf only. Other types are kept under a .pdf key until those stores accept
 * more; the real type is the version's mime_type, and nothing reads the key's ending.
 */
const STORE_EXTS = new Set(['jpg', 'png', 'pdf']);
export function documentStorageKey(firmId: string, entityId: string, ext: string): string {
  return `${firmId}/${entityId}/${randomUUID()}.${STORE_EXTS.has(ext) ? ext : 'pdf'}`;
}

/** A file name safe to store and to put in a Content-Disposition header. */
export function cleanFileName(raw: string | undefined, ext: string): string {
  let decoded = raw ?? '';
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    /* a malformed name is used as sent, then cleaned */
  }
  const base = decoded.split(/[\\/]/).pop() ?? '';
  const cleaned = base.replace(/[^\w .()&,+-]+/g, '_').replace(/^[ .]+/, '').slice(0, 110).trim();
  if (!cleaned) return `document.${ext}`;
  // The stored name ends in the detected type, whatever it was called.
  return cleaned.toLowerCase().endsWith(`.${ext}`) ? cleaned : `${cleaned.replace(/\.[A-Za-z0-9]{1,5}$/, '')}.${ext}`.slice(0, 120);
}

/** Content-Disposition with an ASCII fallback and the UTF-8 name. */
export function contentDisposition(kind: 'inline' | 'attachment', name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '');
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
