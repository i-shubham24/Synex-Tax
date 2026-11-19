import path from 'node:path';

export interface FileValidationOptions {
  maxSizeBytes?: number;
  allowedExtensions?: string[];
  allowedMimeTypes?: string[];
}

export interface FileValidationResult {
  isValid: boolean;
  sanitizedFilename: string;
  detectedExtension: string;
  fileSizeBytes: number;
  error?: string;
}

const DEFAULT_MAX_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB

const DEFAULT_ALLOWED_EXTENSIONS = ['.csv', '.tsv', '.xlsx', '.xml', '.json', '.csi', '.txt'];

// Magic bytes signatures for known malicious / executable formats
const DANGEROUS_SIGNATURES: { name: string; bytes: number[] }[] = [
  { name: 'Windows Executable (PE/MZ)', bytes: [0x4d, 0x5a] },
  { name: 'Linux ELF Binary', bytes: [0x7f, 0x45, 0x4c, 0x46] },
  { name: 'Java Class File', bytes: [0xca, 0xfe, 0xba, 0xbe] },
  { name: 'Compiled Python', bytes: [0x42, 0x4d, 0x0d, 0x0a] },
];

// ZIP/XLSX header signature: PK (0x50, 0x4B, 0x03, 0x04)
const ZIP_HEADER = [0x50, 0x4b, 0x03, 0x04];

/**
 * Sanitizes an uploaded filename to prevent directory traversal attacks.
 * Strips path separators, relative path markers, and control characters.
 */
export function sanitizeFilename(filename: string): string {
  if (!filename || typeof filename !== 'string') {
    return 'unnamed_upload';
  }

  // Remove null bytes
  const nullStripped = filename.replace(/\0/g, '');

  // Extract base filename only
  const basename = path.basename(nullStripped);

  // Strip non-printable and suspicious characters, replace spaces with underscores
  const clean = basename
    .replace(/[^\w\.\-\s]/g, '')
    .trim()
    .replace(/\s+/g, '_');

  // Prevent hidden dotfiles or empty names
  if (!clean || clean.startsWith('.')) {
    return `upload_${Date.now()}${path.extname(clean) || '.dat'}`;
  }

  return clean;
}

/**
 * Inspects XML text or buffer for dangerous XXE entities and billion laughs attacks.
 * Fails closed if <!DOCTYPE or <!ENTITY or external system entities are present.
 */
export function validateXmlSafety(xmlContent: string | Buffer): { isSafe: boolean; reason?: string } {
  const text = typeof xmlContent === 'string' ? xmlContent : xmlContent.toString('utf8', 0, Math.min(xmlContent.length, 65536));

  // Reject DTD declarations
  if (/<!DOCTYPE/i.test(text)) {
    return {
      isSafe: false,
      reason: 'XML DTD declarations are strictly prohibited to prevent XXE injection vulnerabilities.',
    };
  }

  // Reject entity declarations
  if (/<!ENTITY/i.test(text)) {
    return {
      isSafe: false,
      reason: 'XML entity expansions are prohibited to protect against entity expansion attacks.',
    };
  }

  // Reject SYSTEM or PUBLIC external references
  if (/(SYSTEM|PUBLIC)\s+["']/i.test(text)) {
    return {
      isSafe: false,
      reason: 'External entity loading is strictly disallowed in statutory ingestion.',
    };
  }

  return { isSafe: true };
}

/**
 * Validates uploaded file buffers against size limits, extension whitelists,
 * magic byte executable checks, and XXE / bomb vulnerabilities.
 */
export function validateUploadedFile(
  filename: string,
  buffer: Buffer,
  options: FileValidationOptions = {}
): FileValidationResult {
  const maxSizeBytes = options.maxSizeBytes || DEFAULT_MAX_SIZE_BYTES;
  const allowedExtensions = options.allowedExtensions || DEFAULT_ALLOWED_EXTENSIONS;

  const sanitizedFilename = sanitizeFilename(filename);
  const ext = path.extname(sanitizedFilename).toLowerCase();
  const fileSizeBytes = buffer.length;

  // 1. File size enforcement
  if (fileSizeBytes === 0) {
    return {
      isValid: false,
      sanitizedFilename,
      detectedExtension: ext,
      fileSizeBytes,
      error: 'Uploaded file is empty (0 bytes).',
    };
  }

  if (fileSizeBytes > maxSizeBytes) {
    return {
      isValid: false,
      sanitizedFilename,
      detectedExtension: ext,
      fileSizeBytes,
      error: `File size exceeds the allowed limit of ${Math.round(maxSizeBytes / (1024 * 1024))} MB.`,
    };
  }

  // 2. Extension whitelist
  if (!allowedExtensions.includes(ext)) {
    return {
      isValid: false,
      sanitizedFilename,
      detectedExtension: ext,
      fileSizeBytes,
      error: `File extension '${ext}' is not permitted. Allowed: ${allowedExtensions.join(', ')}`,
    };
  }

  // 3. Executable binary / magic bytes check
  for (const sig of DANGEROUS_SIGNATURES) {
    if (buffer.length >= sig.bytes.length) {
      const match = sig.bytes.every((b, i) => buffer[i] === b);
      if (match) {
        return {
          isValid: false,
          sanitizedFilename,
          detectedExtension: ext,
          fileSizeBytes,
          error: `Executable binary signature detected (${sig.name}). Upload rejected.`,
        };
      }
    }
  }

  // 4. Specific type inspections
  if (ext === '.xlsx') {
    // Must match ZIP header
    const hasZipHeader = ZIP_HEADER.every((b, i) => buffer[i] === b);
    if (!hasZipHeader) {
      return {
        isValid: false,
        sanitizedFilename,
        detectedExtension: ext,
        fileSizeBytes,
        error: 'Invalid spreadsheet file structure: missing required ZIP header for XLSX workbook.',
      };
    }
  }

  if (ext === '.xml') {
    const xmlCheck = validateXmlSafety(buffer);
    if (!xmlCheck.isSafe) {
      return {
        isValid: false,
        sanitizedFilename,
        detectedExtension: ext,
        fileSizeBytes,
        error: xmlCheck.reason,
      };
    }
  }

  return {
    isValid: true,
    sanitizedFilename,
    detectedExtension: ext,
    fileSizeBytes,
  };
}
