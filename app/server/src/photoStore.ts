import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { log } from './log.js';

/** Client photos (anamnese forms, before/after) are health data, so they are
 *  encrypted at rest: each file on the volume is AES-256-GCM — random IV,
 *  auth tag, then ciphertext. The key never touches the disk: it comes from
 *  the PHOTOS_KEY secret (preferred) or falls back to JWT_SECRET so the
 *  feature works before the dedicated secret is configured. Someone walking
 *  away with the volume gets noise, not faces and health forms. */

function key(): Buffer {
  const source = process.env.PHOTOS_KEY || process.env.JWT_SECRET;
  if (!process.env.PHOTOS_KEY) {
    log.warn('PHOTOS_KEY não configurada — usando chave derivada do JWT_SECRET. Configure PHOTOS_KEY nos secrets para poder trocar uma sem afetar a outra.');
  }
  return crypto.createHash('sha256').update(String(source)).digest();
}

function photosDir(): string {
  return process.env.PHOTOS_DIR || path.join(process.env.BACKUP_DIR ? path.dirname(process.env.BACKUP_DIR) : '/data', 'photos');
}

function fileFor(businessId: string, photoId: string): string {
  return path.join(photosDir(), businessId, photoId + '.bin');
}

export function savePhoto(businessId: string, photoId: string, data: Buffer): void {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(data), cipher.final()]);
  const tag = cipher.getAuthTag();
  const file = fileFor(businessId, photoId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.concat([iv, tag, enc]));
}

export function readPhoto(businessId: string, photoId: string): Buffer | null {
  try {
    const raw = fs.readFileSync(fileFor(businessId, photoId));
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const enc = raw.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]);
  } catch {
    return null; // missing file or wrong key — the route turns this into 404
  }
}

export function deletePhotoFile(businessId: string, photoId: string): void {
  try {
    fs.unlinkSync(fileFor(businessId, photoId));
  } catch {
    // already gone — deleting is idempotent
  }
}
