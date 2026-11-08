/**
 * fileValidation.ts
 * ---------------------------------------------------------------------------
 * Pure, dependency-free logic for the upload pipeline. No React, no DOM APIs
 * that require a browser, so it can be imported verbatim by the Node test
 * harness (test-step1.js) and by the UI alike.
 *
 * Contract:
 *   validateFile(file)        -> boolean            (the anti-cheat assertions)
 *   validateFileDetailed(file)-> ValidationResult   (UI needs a reason)
 *   formatFileSize(bytes)     -> "1.0 MB"           (human readable)
 */

export const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MiB
export const MAX_FILE_SIZE_LABEL = '100 MB';

export const ACCEPTED_EXTENSIONS = ['.mp4', '.webm', '.mov'] as const;
export const ACCEPTED_MIME_TYPES = [
  'video/mp4',
  'video/webm',
  'video/quicktime',
] as const;

export type ValidationErrorCode = 'NO_FILE' | 'EMPTY_FILE' | 'TOO_LARGE' | 'WRONG_TYPE';

export interface ValidationResult {
  ok: boolean;
  code: ValidationErrorCode | null;
  message: string | null;
}

/** Minimal structural type so Node `File`, browser `File` and plain objects all work. */
export interface FileLike {
  name: string;
  size: number;
  type?: string;
}

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

/** Lowercased extension including the dot, e.g. "movie.MP4" -> ".mp4". */
export function getFileExtension(filename: string): string {
  if (typeof filename !== 'string' || filename.length === 0) return '';
  const lastDot = filename.lastIndexOf('.');
  if (lastDot <= 0 || lastDot === filename.length - 1) return '';
  return filename.slice(lastDot).toLowerCase();
}

/**
 * Human readable byte count using 1024-based units and exactly one decimal for
 * every unit above bytes. formatFileSize(1048576) === "1.0 MB".
 */
export function formatFileSize(bytes: number): string {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }
  if (bytes < 1024) {
    return `${Math.round(bytes)} B`;
  }
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < BYTE_UNITS.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  // Round first, then guard against "1024.0 MB" style overflow.
  let rounded = Math.round(value * 10) / 10;
  if (rounded >= 1024 && unitIndex < BYTE_UNITS.length - 1) {
    rounded = Math.round((rounded / 1024) * 10) / 10;
    unitIndex += 1;
  }
  return `${rounded.toFixed(1)} ${BYTE_UNITS[unitIndex]}`;
}

/** Seconds -> "MM:SS", or "H:MM:SS" past an hour. */
export function formatDuration(seconds: number): string {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) {
    return '00:00';
  }
  const total = Math.round(seconds);
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return hrs > 0 ? `${hrs}:${pad(mins)}:${pad(secs)}` : `${pad(mins)}:${pad(secs)}`;
}

function isAcceptableType(file: FileLike): boolean {
  const ext = getFileExtension(file.name);
  const extOk = (ACCEPTED_EXTENSIONS as readonly string[]).includes(ext);
  if (extOk) return true;
  const mime = typeof file.type === 'string' ? file.type.toLowerCase().trim() : '';
  return mime !== '' && (ACCEPTED_MIME_TYPES as readonly string[]).includes(mime);
}

/** Full diagnosis used by the UI to render an actionable message. */
export function validateFileDetailed(file: FileLike | null | undefined): ValidationResult {
  if (!file || typeof file.name !== 'string' || typeof file.size !== 'number') {
    return { ok: false, code: 'NO_FILE', message: 'No file was selected. Please choose a video.' };
  }
  if (file.size <= 0) {
    return {
      ok: false,
      code: 'EMPTY_FILE',
      message: `"${file.name}" is empty (0 B). Please pick a video that contains footage.`,
    };
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      ok: false,
      code: 'TOO_LARGE',
      message: `"${file.name}" is ${formatFileSize(
        file.size,
      )} — that exceeds the ${MAX_FILE_SIZE_LABEL} limit by ${formatFileSize(
        file.size - MAX_FILE_SIZE_BYTES,
      )}. Compress or trim the file and try again.`,
    };
  }
  if (!isAcceptableType(file)) {
    const ext = getFileExtension(file.name);
    const shown = ext || (file.type ? file.type : 'unknown type');
    return {
      ok: false,
      code: 'WRONG_TYPE',
      message: `Unsupported file type "${shown}". Upload an MP4, WebM or MOV video.`,
    };
  }
  return { ok: true, code: null, message: null };
}

/**
 * The single boolean gate the UI uses before touching bytes.
 * Kept as a thin wrapper so there is exactly one implementation of the rules.
 */
export function validateFile(file: FileLike | null | undefined): boolean {
  return validateFileDetailed(file).ok;
}
