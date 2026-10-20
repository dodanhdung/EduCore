import { BadRequestException, HttpException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
export const MAX_FILE_BYTES = 10_000_000;
export const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const mimeByExtension: Record<string, string> = {
  pdf: 'application/pdf',
  docx: DOCX_MIME,
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
};
export function safeFilename(name: string): string {
  const safe = name
    .normalize('NFKC')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/^\.+/, '')
    .slice(-120);
  if (!safe || !safe.includes('.'))
    throw new BadRequestException('INVALID_FILENAME');
  return safe;
}
/** Read a bounded ZIP central directory and only inflate bounded XML parts.
 * No extraction, ZIP64, encryption, macros, external relationships or entities. */
function docx(bytes: Buffer): boolean {
  try {
    let end = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--)
      if (bytes.readUInt32LE(i) === 0x06054b50) {
        end = i;
        break;
      }
    if (
      end < 0 ||
      bytes.readUInt16LE(end + 4) !== 0 ||
      bytes.readUInt16LE(end + 6) !== 0 ||
      end + 22 + bytes.readUInt16LE(end + 20) !== bytes.length
    )
      return false;
    const count = bytes.readUInt16LE(end + 10),
      length = bytes.readUInt32LE(end + 12),
      offset = bytes.readUInt32LE(end + 16);
    if (
      count < 3 ||
      count > 512 ||
      bytes.readUInt16LE(end + 8) !== count ||
      offset + length !== end
    )
      return false;
    const parts = new Map<string, Buffer>();
    const names = new Set<string>();
    let pos = offset,
      total = 0;
    for (let n = 0; n < count; n++) {
      if (pos + 46 > end || bytes.readUInt32LE(pos) !== 0x02014b50)
        return false;
      const flags = bytes.readUInt16LE(pos + 8),
        method = bytes.readUInt16LE(pos + 10),
        compressed = bytes.readUInt32LE(pos + 20),
        size = bytes.readUInt32LE(pos + 24),
        nameLength = bytes.readUInt16LE(pos + 28),
        extra = bytes.readUInt16LE(pos + 30),
        comment = bytes.readUInt16LE(pos + 32),
        local = bytes.readUInt32LE(pos + 42);
      if (
        flags & 1 ||
        ![0, 8].includes(method) ||
        bytes.readUInt16LE(pos + 34) !== 0 ||
        pos + 46 + nameLength + extra + comment > end ||
        local + 30 >= offset
      )
        return false;
      const name = bytes
        .subarray(pos + 46, pos + 46 + nameLength)
        .toString('utf8');
      if (
        !/^[\x20-\x7e]+$/.test(name) ||
        name.startsWith('/') ||
        name.includes('\\') ||
        name.includes(':') ||
        name.split('/').some((s) => s === '..' || s === '.') ||
        names.has(name) ||
        /vbaProject|activeX|embeddings|\.bin$/i.test(name)
      )
        return false;
      names.add(name);
      total += size;
      if (total > 50_000_000) return false;
      if (
        bytes.readUInt32LE(local) !== 0x04034b50 ||
        bytes.readUInt16LE(local + 6) !== flags ||
        bytes.readUInt16LE(local + 8) !== method
      )
        return false;
      const localNameLength = bytes.readUInt16LE(local + 26),
        localExtra = bytes.readUInt16LE(local + 28),
        start = local + 30 + localNameLength + localExtra;
      if (
        start + compressed > offset ||
        bytes
          .subarray(local + 30, local + 30 + localNameLength)
          .toString('utf8') !== name
      )
        return false;
      if (name.endsWith('.xml') || name.endsWith('.rels')) {
        if (size > 2_000_000) return false;
        const packed = bytes.subarray(start, start + compressed),
          plain =
            method === 0
              ? packed
              : inflateRawSync(packed, { maxOutputLength: 2_000_000 });
        if (plain.length !== size) return false;
        const text = plain.toString('utf8');
        if (
          /<!DOCTYPE|<!ENTITY|TargetMode\s*=\s*["']External["']|macroEnabled/i.test(
            text,
          )
        )
          return false;
        parts.set(name, plain);
      }
      pos += 46 + nameLength + extra + comment;
    }
    const types = parts.get('[Content_Types].xml')?.toString('utf8') ?? '',
      rels = parts.get('_rels/.rels')?.toString('utf8') ?? '',
      document = parts.get('word/document.xml')?.toString('utf8') ?? '';
    return (
      pos === end &&
      /wordprocessingml\.document\.main\+xml/.test(types) &&
      /PartName\s*=\s*["']\/word\/document\.xml["']/.test(types) &&
      /officeDocument/.test(rels) &&
      /Target\s*=\s*["']\/?word\/document\.xml["']/.test(rels) &&
      /<w:document\b/.test(document) &&
      /wordprocessingml\/2006\/main/.test(document)
    );
  } catch {
    return false;
  }
}
export function validateFile(bytes: Buffer, name: string, mime: string) {
  if (bytes.length < 1 || bytes.length > MAX_FILE_BYTES)
    throw new HttpException('FILE_TOO_LARGE', 413);
  const filename = safeFilename(name),
    extension = filename.split('.').at(-1)!.toLowerCase(),
    expected = mimeByExtension[extension];
  let valid = false;
  if (expected && expected === mime) {
    if (extension === 'pdf')
      valid =
        bytes
          .subarray(0, 8)
          .toString('ascii')
          .match(/^%PDF-[12]\.\d/) != null &&
        bytes.subarray(-1024).includes(Buffer.from('%%EOF'));
    else if (extension === 'png')
      valid =
        bytes.length >= 45 &&
        bytes
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
        bytes.subarray(12, 16).toString('ascii') === 'IHDR' &&
        bytes.readUInt32BE(8) === 13 &&
        bytes.readUInt32BE(16) > 0 &&
        bytes.readUInt32BE(20) > 0 &&
        bytes.subarray(-8, -4).toString('ascii') === 'IEND';
    else if (extension === 'jpg' || extension === 'jpeg')
      valid =
        bytes.length >= 12 &&
        bytes[0] === 255 &&
        bytes[1] === 216 &&
        bytes[2] === 255 &&
        bytes.at(-2) === 255 &&
        bytes.at(-1) === 217;
    else valid = docx(bytes);
  }
  if (!valid) throw new HttpException('FILE_TYPE_UNSUPPORTED', 415);
  return {
    originalFilename: filename,
    mimeType: mime,
    sizeBytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}
