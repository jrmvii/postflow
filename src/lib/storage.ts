import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB (LinkedIn limit)
const UPLOAD_DIR = join(process.cwd(), "public", "uploads");

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

  const dir = join(UPLOAD_DIR, organizationId);
  await mkdir(dir, { recursive: true });

  const id = randomUUID();
  const ext = extensionForMime(file.type);
  const storageKey = `${organizationId}/${id}${ext}`;
  const filePath = join(UPLOAD_DIR, storageKey);

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filePath, buffer);

  return {
    fileName: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
    storageKey,
  };
}

export function getUploadPath(storageKey: string): string {
  return join(UPLOAD_DIR, storageKey);
}
