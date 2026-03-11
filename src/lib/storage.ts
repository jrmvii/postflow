import { mkdir, writeFile } from "fs/promises";
import { join, resolve } from "path";
import { randomUUID } from "crypto";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB (LinkedIn limit)
const UPLOAD_DIR = join(process.cwd(), "uploads");

// Magic byte signatures for validating file content
const MAGIC_BYTES: Record<string, number[][]> = {
  "image/jpeg": [[0xff, 0xd8, 0xff]],
  "image/png": [[0x89, 0x50, 0x4e, 0x47]],
  "image/gif": [[0x47, 0x49, 0x46, 0x38]],
  "image/webp": [[0x52, 0x49, 0x46, 0x46]], // RIFF header; full check includes WEBP at offset 8
};

function validateMagicBytes(buffer: Buffer, mimeType: string): boolean {
  const signatures = MAGIC_BYTES[mimeType];
  if (!signatures) return false;
  for (const sig of signatures) {
    if (buffer.length < sig.length) return false;
    if (sig.every((byte, i) => buffer[i] === byte)) {
      // Extra check for WebP: bytes 8-11 must be "WEBP"
      if (mimeType === "image/webp") {
        if (buffer.length < 12) return false;
        return buffer.slice(8, 12).toString("ascii") === "WEBP";
      }
      return true;
    }
  }
  return false;
}

function extensionForMime(mime: string): string {
  const map: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
  };
  return map[mime] || ".bin";
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
    throw new Error(`Type non supporté: ${file.type}. Utilisez JPEG, PNG, GIF ou WebP.`);
  }
  if (file.size > MAX_SIZE) {
    throw new Error(`Fichier trop volumineux (${Math.round(file.size / 1024 / 1024)} MB). Maximum: 10 MB.`);
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

export { UPLOAD_DIR };
