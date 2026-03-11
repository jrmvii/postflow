import { mkdir, writeFile } from "fs/promises";
import { join, resolve } from "path";
import { randomUUID } from "crypto";

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/quicktime"];
const ALLOWED_DOCUMENT_TYPES = ["application/pdf"];
const ALLOWED_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES, ...ALLOWED_DOCUMENT_TYPES];

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;     // 10 MB
const MAX_VIDEO_SIZE = 200 * 1024 * 1024;     // 200 MB
const MAX_DOCUMENT_SIZE = 100 * 1024 * 1024;  // 100 MB

const UPLOAD_DIR = join(process.cwd(), "uploads");

export type MediaCategory = "image" | "video" | "document";

export function getMediaCategory(mimeType: string): MediaCategory {
  if (ALLOWED_IMAGE_TYPES.includes(mimeType)) return "image";
  if (ALLOWED_VIDEO_TYPES.includes(mimeType)) return "video";
  if (ALLOWED_DOCUMENT_TYPES.includes(mimeType)) return "document";
  return "image"; // fallback
}

function getMaxSize(mimeType: string): number {
  const category = getMediaCategory(mimeType);
  switch (category) {
    case "video": return MAX_VIDEO_SIZE;
    case "document": return MAX_DOCUMENT_SIZE;
    default: return MAX_IMAGE_SIZE;
  }
}

function getSizeLabel(category: MediaCategory): string {
  switch (category) {
    case "video": return "200 MB";
    case "document": return "100 MB";
    default: return "10 MB";
  }
}

// Magic byte signatures for validating file content
const MAGIC_BYTES: Record<string, { offset: number; bytes: number[]; extra?: (buf: Buffer) => boolean }[]> = {
  "image/jpeg": [{ offset: 0, bytes: [0xff, 0xd8, 0xff] }],
  "image/png": [{ offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47] }],
  "image/gif": [{ offset: 0, bytes: [0x47, 0x49, 0x46, 0x38] }],
  "image/webp": [{ offset: 0, bytes: [0x52, 0x49, 0x46, 0x46], extra: (buf) => buf.length >= 12 && buf.slice(8, 12).toString("ascii") === "WEBP" }],
  "application/pdf": [{ offset: 0, bytes: [0x25, 0x50, 0x44, 0x46] }], // %PDF
  "video/mp4": [{ offset: 4, bytes: [0x66, 0x74, 0x79, 0x70] }], // ftyp at offset 4
  "video/quicktime": [{ offset: 4, bytes: [0x66, 0x74, 0x79, 0x70] }], // same ftyp signature
};

function validateMagicBytes(buffer: Buffer, mimeType: string): boolean {
  const signatures = MAGIC_BYTES[mimeType];
  if (!signatures) return true; // allow unknown types through if in ALLOWED_TYPES
  for (const sig of signatures) {
    if (buffer.length < sig.offset + sig.bytes.length) return false;
    const matches = sig.bytes.every((byte, i) => buffer[sig.offset + i] === byte);
    if (matches) {
      if (sig.extra) return sig.extra(buffer);
      return true;
    }
  }
  return false;
}

const EXTENSION_MAP: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
  "application/pdf": ".pdf",
};

function extensionForMime(mime: string): string {
  return EXTENSION_MAP[mime] || ".bin";
}

export async function saveUploadedFile(
  file: File,
  organizationId: string
): Promise<{
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
}> {
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error(`Type non supporté: ${file.type}. Types acceptés: JPEG, PNG, GIF, WebP, MP4, MOV, PDF.`);
  }

  const maxSize = getMaxSize(file.type);
  if (file.size > maxSize) {
    const category = getMediaCategory(file.type);
    throw new Error(`Fichier trop volumineux (${Math.round(file.size / 1024 / 1024)} MB). Maximum: ${getSizeLabel(category)}.`);
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // Validate actual file content matches claimed MIME type
  if (!validateMagicBytes(buffer, file.type)) {
    throw new Error(`Le contenu du fichier ne correspond pas au type déclaré (${file.type}).`);
  }

  const dir = join(UPLOAD_DIR, organizationId);
  await mkdir(dir, { recursive: true });

  const id = randomUUID();
  const ext = extensionForMime(file.type);
  const storageKey = `${organizationId}/${id}${ext}`;
  const filePath = join(UPLOAD_DIR, storageKey);

  await writeFile(filePath, buffer);

  return {
    fileName: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
    storageKey,
  };
}

export function getUploadPath(storageKey: string): string {
  const resolved = resolve(UPLOAD_DIR, storageKey);
  if (!resolved.startsWith(resolve(UPLOAD_DIR) + "/")) {
    throw new Error("Invalid storage key");
  }
  return resolved;
}

export { UPLOAD_DIR, ALLOWED_IMAGE_TYPES, ALLOWED_VIDEO_TYPES, ALLOWED_DOCUMENT_TYPES };
