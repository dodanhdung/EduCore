import { constants } from 'node:fs';
import {
  lstat,
  mkdir,
  open,
  realpath,
  link,
  unlink,
  readdir,
} from 'node:fs/promises';
import { isAbsolute, join, parse, relative, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { MAX_FILE_BYTES } from './file-validation.js';
export interface FileStoragePort {
  writeStaging(key: string, bytes: Buffer): Promise<void>;
  promote(key: string): Promise<void>;
  read(key: string): Promise<Buffer>;
  inventory(): Promise<string[]>;
}
const keyPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export function storageKey(tenant: string) {
  const key = tenant.toLowerCase() + '/' + randomUUID();
  if (!keyPattern.test(key)) throw Error('INVALID_TENANT');
  return key;
}
/** The root must be dedicated private storage, writable only by the API OS
 * identity. No static server mounts it. Every path component is checked before
 * IO; final objects are opened without following links and never overwritten. */
export class PrivateVolumeStorageAdapter implements FileStoragePort {
  readonly root: string;
  constructor(root: string) {
    if (!isAbsolute(root)) throw Error('ABSOLUTE_PRIVATE_ROOT_REQUIRED');
    this.root = resolve(root);
    if (this.root === parse(this.root).root)
      throw Error('DEDICATED_PRIVATE_ROOT_REQUIRED');
  }
  private async checkDirectory(path: string) {
    const parts = relative(parse(path).root, path).split(/[\\/]/);
    let cursor = parse(path).root;
    for (const part of parts) {
      cursor = join(cursor, part);
      const stat = await lstat(cursor);
      if (stat.isSymbolicLink() || !stat.isDirectory())
        throw Error('STORAGE_SYMLINK_DENIED');
    }
    if (resolve(await realpath(path)) !== resolve(path))
      throw Error('STORAGE_CONTAINMENT_DENIED');
  }
  async initialize() {
    let cursor = parse(this.root).root;
    for (const part of relative(cursor, this.root).split(/[\\/]/)) {
      cursor = join(cursor, part);
      await mkdir(cursor, { mode: 0o700 }).catch((e: NodeJS.ErrnoException) => {
        if (e.code !== 'EEXIST') throw e;
      });
      const stat = await lstat(cursor);
      if (stat.isSymbolicLink() || !stat.isDirectory())
        throw Error('STORAGE_SYMLINK_DENIED');
    }
    await this.checkDirectory(this.root);
  }
  private async path(key: string, stage = false) {
    if (!keyPattern.test(key)) throw Error('INVALID_STORAGE_KEY');
    await this.checkDirectory(this.root);
    const [tenant, object] = key.split('/'),
      dir = join(this.root, tenant);
    await mkdir(dir, { mode: 0o700 }).catch((e: NodeJS.ErrnoException) => {
      if (e.code !== 'EEXIST') throw e;
    });
    await this.checkDirectory(dir);
    return join(dir, stage ? '.staging-' + object : object);
  }
  async writeStaging(key: string, bytes: Buffer) {
    if (bytes.length < 1 || bytes.length > MAX_FILE_BYTES)
      throw Error('STORAGE_SIZE_LIMIT');
    const path = await this.path(key, true),
      handle = await open(
        path,
        constants.O_CREAT |
          constants.O_EXCL |
          constants.O_WRONLY |
          constants.O_NOFOLLOW,
        0o600,
      );
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
  }
  async promote(key: string) {
    const stage = await this.path(key, true),
      target = await this.path(key);
    const stat = await lstat(stage);
    if (stat.isSymbolicLink() || !stat.isFile() || stat.nlink !== 1)
      throw Error('STORAGE_LINK_DENIED');
    // link() is atomic and fails on collision; rename() can overwrite on POSIX.
    await link(stage, target);
    await unlink(stage);
  }
  async read(key: string) {
    const path = await this.path(key),
      stat = await lstat(path);
    if (
      stat.isSymbolicLink() ||
      !stat.isFile() ||
      stat.nlink !== 1 ||
      stat.size > MAX_FILE_BYTES
    )
      throw Error('STORAGE_OBJECT_INVALID');
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const actual = await handle.stat();
      if (
        actual.dev !== stat.dev ||
        actual.ino !== stat.ino ||
        actual.size !== stat.size ||
        actual.nlink !== 1
      )
        throw Error('STORAGE_OBJECT_CHANGED');
      const bytes = await handle.readFile();
      if (bytes.length !== stat.size || bytes.length > MAX_FILE_BYTES)
        throw Error('STORAGE_OBJECT_CHANGED');
      return bytes;
    } finally {
      await handle.close();
    }
  }
  async inventory() {
    await this.checkDirectory(this.root);
    const keys: string[] = [];
    for (const tenant of await readdir(this.root, { withFileTypes: true })) {
      const dir = join(this.root, tenant.name);
      if (tenant.isSymbolicLink() || !tenant.isDirectory()) {
        keys.push('[unsafe-root-entry]');
        continue;
      }
      await this.checkDirectory(dir);
      for (const item of await readdir(dir, { withFileTypes: true }))
        keys.push(tenant.name + '/' + item.name);
    }
    return keys;
  }
}
export function verifyBytes(
  bytes: Buffer,
  size: string | number,
  hash: string,
) {
  if (
    bytes.length !== Number(size) ||
    createHash('sha256').update(bytes).digest('hex') !== hash
  )
    throw Error('STORAGE_INTEGRITY_MISMATCH');
}
