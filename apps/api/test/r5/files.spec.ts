import { beforeEach, afterEach, describe, it, expect } from 'vitest';
import {
  mkdtemp,
  rm,
  readFile,
  writeFile,
  symlink,
  mkdir,
  readdir,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  validateFile,
  MAX_FILE_BYTES,
  DOCX_MIME,
  safeFilename,
} from '../../src/file-management/file-validation.js';
import {
  PrivateVolumeStorageAdapter,
  storageKey,
  verifyBytes,
} from '../../src/file-management/private-volume.adapter.js';
import { pdf, png, jpg, docx, zip } from './file-fixtures.js';
let root: string, storage: PrivateVolumeStorageAdapter;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'educore-r5-files-'));
  storage = new PrivateVolumeStorageAdapter(root);
  await storage.initialize();
});
afterEach(async () => {
  if (
    !resolve(root).startsWith(resolve(tmpdir()) + requireSeparator()) ||
    !root.includes('educore-r5-files-')
  )
    throw Error('UNSAFE_TEST_CLEANUP');
  await rm(root, { recursive: true, force: true });
});
function requireSeparator() {
  return process.platform === 'win32' ? '\\' : '/';
}
describe('R5 actual private filesystem', () => {
  it.each([
    [pdf, 'answer.pdf', 'application/pdf'],
    [png, 'answer.png', 'image/png'],
    [jpg, 'answer.jpg', 'image/jpeg'],
    [docx, 'answer.docx', DOCX_MIME],
  ] as const)('F01 validates and persists %s', async (bytes, name, mime) => {
    const metadata = validateFile(bytes, name, mime),
      key = storageKey(randomUUID());
    await storage.writeStaging(key, bytes);
    await expect(storage.read(key)).rejects.toThrow();
    await storage.promote(key);
    const actual = await storage.read(key);
    expect(actual).toEqual(bytes);
    verifyBytes(actual, metadata.sizeBytes, metadata.sha256);
  });
  it('F02 spoofed MIME/extension, arbitrary ZIP, unsafe OOXML and expanded ZIP bombs rejected', () => {
    for (const [bytes, name, mime] of [
      [png, 'answer.pdf', 'application/pdf'],
      [pdf, 'answer.png', 'image/png'],
      [pdf, 'answer.pdf', 'image/png'],
      [zip({ hello: 'world' }), 'answer.docx', DOCX_MIME],
      [
        zip({
          '../word/document.xml': 'x',
          '[Content_Types].xml': 'x',
          '_rels/.rels': 'x',
        }),
        'answer.docx',
        DOCX_MIME,
      ],
      [
        zip({
          '[Content_Types].xml': 'x',
          '_rels/.rels': 'x',
          'word/document.xml': ' '.repeat(2_000_001),
        }),
        'answer.docx',
        DOCX_MIME,
      ],
    ] as const)
      expect(() => validateFile(bytes, name, mime)).toThrow();
  });
  it('F03 exact approved byte boundaries max-1, max and max+1', () => {
    for (const n of [MAX_FILE_BYTES - 1, MAX_FILE_BYTES, MAX_FILE_BYTES + 1]) {
      const bytes = Buffer.alloc(n, 32);
      pdf.copy(bytes);
      bytes.write('%%EOF', n - 5);
      if (n <= MAX_FILE_BYTES)
        expect(
          validateFile(bytes, 'large.pdf', 'application/pdf').sizeBytes,
        ).toBe(n);
      else
        expect(() =>
          validateFile(bytes, 'large.pdf', 'application/pdf'),
        ).toThrow();
    }
  });
  it('F04 traversal, absolute/encoded paths, collisions and tenant namespace are protected', async () => {
    for (const key of [
      '../escape',
      'C:/file',
      '/etc/passwd',
      '%2e%2e/file',
      randomUUID() + '/../file',
    ])
      await expect(storage.writeStaging(key, pdf)).rejects.toThrow();
    const tenant = randomUUID(),
      key = storageKey(tenant);
    await storage.writeStaging(key, pdf);
    await storage.promote(key);
    await expect(
      storage.writeStaging(key, png).then(() => storage.promote(key)),
    ).rejects.toThrow();
    expect(await storage.read(key)).toEqual(pdf);
    const other = storageKey(randomUUID());
    await storage.writeStaging(other, png);
    await storage.promote(other);
    expect(await storage.read(other)).toEqual(png);
    expect(safeFilename('../bad\r\n".pdf')).not.toMatch(/[/\\\r\n"]/);
  });
  it('F05 symlink directory/object escape is denied', async () => {
    const outside = join(root, 'outside');
    await mkdir(outside);
    await writeFile(join(outside, 'secret'), pdf);
    const tenant = randomUUID();
    await symlink(
      outside,
      join(root, tenant),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    await expect(storage.writeStaging(storageKey(tenant), pdf)).rejects.toThrow(
      /SYMLINK/,
    );
    const key = storageKey(randomUUID()),
      [namespace, object] = key.split('/');
    await mkdir(join(root, namespace));
    // A directory junction needs no Windows developer-mode file symlink privilege.
    await symlink(
      outside,
      join(root, namespace, object),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    await expect(storage.read(key)).rejects.toThrow();
    expect(await readFile(join(outside, 'secret'))).toEqual(pdf);
  });
  it('F06 interrupted promotion, missing bytes and checksum corruption remain discoverable', async () => {
    const key = storageKey(randomUUID());
    await storage.writeStaging(key, pdf);
    expect((await storage.inventory())[0]).toContain('.staging-');
    await storage.promote(key);
    expect(() => verifyBytes(png, pdf.length, '0'.repeat(64))).toThrow(
      /INTEGRITY/,
    );
    const [tenant, object] = key.split('/');
    await writeFile(join(root, tenant, object), png);
    expect(await storage.read(key)).toEqual(png);
    expect((await readdir(join(root, tenant))).length).toBe(1);
  });
  it('F07 root initialization rejects an ancestor junction before writing through it', async () => {
    const outside = join(root, 'initialization-target');
    await mkdir(outside);
    const linked = join(root, 'linked-root');
    await symlink(
      outside,
      linked,
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    const unsafe = new PrivateVolumeStorageAdapter(
      join(linked, 'must-not-create'),
    );
    await expect(unsafe.initialize()).rejects.toThrow(/SYMLINK/);
    expect(await readdir(outside)).toEqual([]);
  });
});
