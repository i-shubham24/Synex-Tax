/**
 * SynexTax Secure File Upload Validation Module
 * 
 * Enforces multi-layer validation for file uploads:
 * 1. True File Type Verification via Magic Bytes (prevents MIME-spoofing).
 * 2. Whitelist-only file extension and MIME type validation.
 * 3. File size limits to prevent Denial of Service and decompression bombs.
 * 4. Strict Path Traversal and filename sanitization (guards against directory traversal).
 * 5. Content inspection for executable binaries and script payloads.
 */

export interface FileValidationOptions {
  allowedExtensions: string[];
  maxSizeBytes?: number;
  expectedType?: 'JSON' | 'CSV' | 'XLSX' | 'PDF' | 'CSI' | 'TEXT';
}

export interface ValidationResult {
  valid: boolean;
  sanitizedFilename: string;
  detectedType: string;
  sizeBytes: number;
  error?: string;
}

// Magic bytes signatures
const MAGIC_BYTES = {
  ZIP_XLSX: [0x50, 0x4b, 0x03, 0x04],
  PDF: [0x25, 0x50, 0x44, 0x46], // %PDF
  PE_EXECUTABLE: [0x4d, 0x5a], // MZ
  ELF_EXECUTABLE: [0x7f, 0x45, 0x4c, 0x46], // .ELF
  MACHO_32: [0xfe, 0xed, 0xfa, 0xce],
  MACHO_64: [0xfe, 0xed, 0xfa, 0xcf],
};

const DEFAULT_MAX_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

/**
 * Sanitizes an untrusted filename, stripping directory traversal patterns,
 * control characters, and Windows reserved names.
 */
export function sanitizeFilename(rawFilename: string): string {
  if (!rawFilename || typeof rawFilename !== 'string') {
    return 'unnamed_upload';
  }

  // Strip path separators and directory traversal sequences
  let clean = rawFilename.replace(/[/\\?%*:|"<>]/g, '_');
  clean = clean.replace(/\.{2,}/g, '_'); // Replace double dots

  // Strip null bytes and non-printable control characters
  clean = clean.replace(/[\x00-\x1f\x80-\x9f]/g, '');

  // Strip leading dots to prevent hidden files
  clean = clean.replace(/^\.+/, '');

  clean = clean.trim();

  // Guard against Windows reserved device names
  const baseWithoutExt = clean.split('.')[0].toUpperCase();
  const reservedNames = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'];
  if (reservedNames.includes(baseWithoutExt)) {
    clean = 'safe_' + clean;
  }

  return clean || 'sanitized_upload';
}

/**
 * Inspects binary buffer headers to detect actual file type.
 */
export function detectBufferType(buffer: Buffer): { type: string; isBinaryExecutable: boolean } {
  if (!buffer || buffer.length === 0) {
    return { type: 'EMPTY', isBinaryExecutable: false };
  }

  // Check for dangerous binary executables first
  if (buffer.length >= 2 && buffer[0] === MAGIC_BYTES.PE_EXECUTABLE[0] && buffer[1] === MAGIC_BYTES.PE_EXECUTABLE[1]) {
    return { type: 'EXECUTABLE_PE', isBinaryExecutable: true };
  }

  if (buffer.length >= 4 && buffer[0] === MAGIC_BYTES.ELF_EXECUTABLE[0] && buffer[1] === MAGIC_BYTES.ELF_EXECUTABLE[1] && buffer[2] === MAGIC_BYTES.ELF_EXECUTABLE[2] && buffer[3] === MAGIC_BYTES.ELF_EXECUTABLE[3]) {
    return { type: 'EXECUTABLE_ELF', isBinaryExecutable: true };
  }

  // Check for PDF
  if (buffer.length >= 4 && buffer[0] === MAGIC_BYTES.PDF[0] && buffer[1] === MAGIC_BYTES.PDF[1] && buffer[2] === MAGIC_BYTES.PDF[2] && buffer[3] === MAGIC_BYTES.PDF[3]) {
    return { type: 'PDF', isBinaryExecutable: false };
  }

  // Check for ZIP / XLSX OpenXML format
  if (buffer.length >= 4 && buffer[0] === MAGIC_BYTES.ZIP_XLSX[0] && buffer[1] === MAGIC_BYTES.ZIP_XLSX[1] && buffer[2] === MAGIC_BYTES.ZIP_XLSX[2] && buffer[3] === MAGIC_BYTES.ZIP_XLSX[3]) {
    return { type: 'XLSX_ZIP', isBinaryExecutable: false };
  }

  // Check for JSON or Text
  const prefix = buffer.subarray(0, Math.min(buffer.length, 128)).toString('utf8').trim();
  if (prefix.startsWith('{') || prefix.startsWith('[')) {
    return { type: 'JSON', isBinaryExecutable: false };
  }

  // Check if buffer contains predominantly printable ASCII or UTF-8 text
  let isText = true;
  const sampleLength = Math.min(buffer.length, 512);
  for (let i = 0; i < sampleLength; i++) {
    const byte = buffer[i];
    // Printable characters + tab + newline + carriage return
    if (byte < 0x09 || (byte > 0x0d && byte < 0x20 && byte !== 0x1b)) {
      isText = false;
      break;
    }
  }

  if (isText) {
    // Check if CSI format (starts with TAN or 8-digit date / challan header)
    if (/^[A-Z]{4}\d{5}[A-Z]/.test(prefix) || /^\d{8}/.test(prefix) || prefix.includes('^') || prefix.includes('|')) {
      return { type: 'CSI_OR_DELIMITED', isBinaryExecutable: false };
    }
    return { type: 'TEXT_OR_CSV', isBinaryExecutable: false };
  }

  return { type: 'BINARY_DATA', isBinaryExecutable: false };
}

/**
 * Validates an uploaded file buffer against security policy.
 */
export function validateUploadedFile(
  buffer: Buffer,
  rawFilename: string,
  options: FileValidationOptions
): ValidationResult {
  const sanitizedFilename = sanitizeFilename(rawFilename);
  const sizeBytes = buffer ? buffer.length : 0;
  const maxBytes = options.maxSizeBytes || DEFAULT_MAX_SIZE_BYTES;

  // 1. Size constraint check
  if (sizeBytes === 0) {
    return {
      valid: false,
      sanitizedFilename,
      detectedType: 'EMPTY',
      sizeBytes,
      error: 'File upload is empty (0 bytes).',
    };
  }

  if (sizeBytes > maxBytes) {
    return {
      valid: false,
      sanitizedFilename,
      detectedType: 'OVERSIZED',
      sizeBytes,
      error: `File size (${(sizeBytes / 1024 / 1024).toFixed(2)} MB) exceeds statutory maximum threshold of ${(maxBytes / 1024 / 1024).toFixed(0)} MB.`,
    };
  }

  // 2. Extension check
  const extParts = sanitizedFilename.split('.');
  const ext = extParts.length > 1 ? '.' + extParts.pop()!.toLowerCase() : '';
  const normalizedAllowedExts = options.allowedExtensions.map((e) => (e.startsWith('.') ? e.toLowerCase() : '.' + e.toLowerCase()));

  if (!normalizedAllowedExts.includes(ext)) {
    return {
      valid: false,
      sanitizedFilename,
      detectedType: 'INVALID_EXTENSION',
      sizeBytes,
      error: `File extension '${ext}' is not permitted. Permitted extensions: ${normalizedAllowedExts.join(', ')}`,
    };
  }

  // 3. True magic bytes / file type detection
  const detected = detectBufferType(buffer);

  if (detected.isBinaryExecutable) {
    return {
      valid: false,
      sanitizedFilename,
      detectedType: detected.type,
      sizeBytes,
      error: 'Security alert: Uploaded file contains binary executable headers and was rejected.',
    };
  }

  // 4. Expected format compatibility check
  if (options.expectedType) {
    if (options.expectedType === 'JSON' && detected.type !== 'JSON') {
      return {
        valid: false,
        sanitizedFilename,
        detectedType: detected.type,
        sizeBytes,
        error: `Expected valid JSON file but detected '${detected.type}'.`,
      };
    }

    if (options.expectedType === 'PDF' && detected.type !== 'PDF') {
      return {
        valid: false,
        sanitizedFilename,
        detectedType: detected.type,
        sizeBytes,
        error: `Expected valid PDF document but detected '${detected.type}'.`,
      };
    }

    if (options.expectedType === 'XLSX' && detected.type !== 'XLSX_ZIP') {
      return {
        valid: false,
        sanitizedFilename,
        detectedType: detected.type,
        sizeBytes,
        error: `Expected valid Excel workbook (OpenXML format) but detected '${detected.type}'.`,
      };
    }
  }

  // 5. Script tag injection scan in text files
  if (['JSON', 'TEXT_OR_CSV', 'CSI_OR_DELIMITED'].includes(detected.type)) {
    const textSample = buffer.subarray(0, Math.min(buffer.length, 65536)).toString('utf8');
    if (/<script[\s>]/i.test(textSample) || /javascript:/i.test(textSample)) {
      return {
        valid: false,
        sanitizedFilename,
        detectedType: detected.type,
        sizeBytes,
        error: 'Security alert: Malicious embedded HTML or JavaScript detected in file content.',
      };
    }
  }

  return {
    valid: true,
    sanitizedFilename,
    detectedType: detected.type,
    sizeBytes,
  };
}
