import { ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AuthService } from '../identity-access/auth.service.js';
import { result, type R4Tx } from '../identity-access/r4-repository.js';
import type { FileStoragePort } from './private-volume.adapter.js';
import { storageKey, verifyBytes } from './private-volume.adapter.js';
import { validateFile } from './file-validation.js';
export interface FileRecord {
  id: string;
  tenant_id: string;
  recipient_id: string;
  private_storage_key: string;
  original_filename: string;
  mime_type: string;
  size_bytes: string;
  sha256: string;
  storage_status: string;
}
export function safeFile(f: FileRecord) {
  return {
    id: f.id,
    originalFilename: f.original_filename,
    mimeType: f.mime_type,
    sizeBytes: String(f.size_bytes),
    sha256: f.sha256,
    status: f.storage_status,
  };
}
export class FileService {
  constructor(
    readonly auth: AuthService,
    readonly storage?: FileStoragePort,
  ) {}
  private volume() {
    if (!this.storage)
      throw new ServiceUnavailableException('PRIVATE_STORAGE_UNAVAILABLE');
    return this.storage;
  }
  private transaction<T>(token: string, action: (tx: R4Tx) => Promise<T>) {
    this.auth.tokens.verify(token);
    return this.auth.repository.transaction(token, action);
  }
  async upload(
    token: string,
    tenant: string,
    recipient: string,
    name: string,
    mime: string,
    bytes: Buffer,
  ) {
    const volume = this.volume(),
      metadata = validateFile(bytes, name, mime),
      key = storageKey(tenant);
    const f = await this.transaction<FileRecord>(token, (tx) =>
      result(
        tx,
        'SELECT educore_r5.file_stage($1::uuid,$2::jsonb) result',
        tenant,
        JSON.stringify({
          ...metadata,
          id: randomUUID(),
          recipientId: recipient,
          privateStorageKey: key,
        }),
      ),
    );
    try {
      await volume.writeStaging(key, bytes);
      await volume.promote(key);
      return await this.transaction(token, async (tx) => {
        const checked = await result<FileRecord>(
          tx,
          'SELECT educore_r5.file_info($1::uuid,$2::uuid,$3::text) result',
          tenant,
          f.id,
          'file.upload',
        );
        verifyBytes(
          await volume.read(checked.private_storage_key),
          checked.size_bytes,
          checked.sha256,
        );
        const ready = await result<FileRecord>(
          tx,
          'SELECT educore_r5.file_ready($1::uuid,$2::uuid) result',
          tenant,
          f.id,
        );
        return safeFile(ready);
      });
    } catch {
      throw new ServiceUnavailableException('FILE_UPLOAD_NOT_FINALIZED');
    }
  }
  metadata(token: string, tenant: string, id: string) {
    return this.transaction(token, async (tx) =>
      safeFile(
        await result<FileRecord>(
          tx,
          'SELECT educore_r5.file_info($1::uuid,$2::uuid,$3::text) result',
          tenant,
          id,
          'file.read',
        ),
      ),
    );
  }
  download(token: string, tenant: string, id: string) {
    return this.transaction(token, async (tx) => {
      const f = await result<FileRecord>(
        tx,
        'SELECT educore_r5.file_info($1::uuid,$2::uuid,$3::text) result',
        tenant,
        id,
        'file.download',
      );
      try {
        const bytes = await this.volume().read(f.private_storage_key);
        verifyBytes(bytes, f.size_bytes, f.sha256);
        return { file: safeFile(f), bytes };
      } catch {
        throw new ServiceUnavailableException('FILE_BYTES_UNAVAILABLE');
      }
    });
  }
  /** Snapshot under the same tenant lock as linking/finalization. No delete,
   * status rewrite, TTL, automatic restore or namespace keys in HTTP responses. */
  reconcile(token: string, tenant: string) {
    return this.transaction(token, async (tx) => {
      const files = await result<FileRecord[]>(
          tx,
          'SELECT educore_r5.file_inventory($1::uuid) result',
          tenant,
        ),
        volume = this.volume();
      const inventory = (await volume.inventory()).filter((key) =>
        key.startsWith(tenant.toLowerCase() + '/'),
      );
      const expected = new Set(
        files.flatMap((f) => [
          f.private_storage_key,
          f.private_storage_key.replace(/\/([^/]+)$/, '/.staging-$1'),
        ]),
      );
      const anomalies: { fileId: string; kind: string }[] = [];
      for (const f of files) {
        if (f.storage_status === 'ORPHANED')
          anomalies.push({ fileId: f.id, kind: 'ORPHANED_METADATA' });
        try {
          const bytes = await volume.read(f.private_storage_key);
          verifyBytes(bytes, f.size_bytes, f.sha256);
          if (f.storage_status === 'STAGING')
            anomalies.push({ fileId: f.id, kind: 'PROMOTED_NOT_FINALIZED' });
        } catch {
          anomalies.push({
            fileId: f.id,
            kind: inventory.includes(f.private_storage_key)
              ? 'INTEGRITY_OR_UNSAFE_OBJECT'
              : 'MISSING_OBJECT',
          });
        }
      }
      const summary = {
        anomalies,
        anomalyCount: anomalies.length,
        unreferencedObjects: inventory.filter((key) => !expected.has(key))
          .length,
        physicalDeletes: 0,
      };
      await result(
        tx,
        'SELECT educore_r5.file_reconciliation_audit($1::uuid,$2::jsonb)::text result',
        tenant,
        JSON.stringify(summary),
      );
      return summary;
    });
  }
}
