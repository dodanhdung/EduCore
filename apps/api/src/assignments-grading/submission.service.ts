import { AuthService } from '../identity-access/auth.service.js';
import { RuntimeService } from '../workflow-approval/runtime.service.js';
import { ServiceUnavailableException } from '@nestjs/common';
import { result } from '../identity-access/r4-repository.js';
import {
  verifyBytes,
  type FileStoragePort,
} from '../file-management/private-volume.adapter.js';
import type { FileRecord } from '../file-management/file.service.js';
export class SubmissionService extends RuntimeService {
  constructor(
    auth: AuthService,
    readonly storage?: FileStoragePort,
  ) {
    super(auth);
  }
  submit(token: string, tenant: string, body: Record<string, unknown>) {
    this.auth.tokens.verify(token);
    return this.auth.repository.transaction(token, async (tx) => {
      for (const id of Array.isArray(body.fileIds) ? body.fileIds : []) {
        const f = await result<FileRecord>(
          tx,
          'SELECT educore_r5.file_info($1::uuid,$2::uuid,$3::text,$4::uuid) result',
          tenant,
          id,
          'file.upload',
          body.recipientId,
        );
        if (!this.storage)
          throw new ServiceUnavailableException('PRIVATE_STORAGE_UNAVAILABLE');
        try {
          verifyBytes(
            await this.storage.read(f.private_storage_key),
            f.size_bytes,
            f.sha256,
          );
        } catch {
          throw new ServiceUnavailableException('FILE_BYTES_UNAVAILABLE');
        }
      }
      return result(
        tx,
        'SELECT educore_r5.submit($1::uuid,$2::jsonb) result',
        tenant,
        JSON.stringify({ ...body, operation: 'SUBMIT' }),
      );
    });
  }
  history(token: string, tenant: string, recipient: string) {
    return this.run(
      token,
      'SELECT educore_r5.history($1::uuid,$2::uuid) result',
      tenant,
      recipient,
    );
  }
}
