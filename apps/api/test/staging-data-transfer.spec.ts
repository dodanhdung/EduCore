import { describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import {
  canonicalCheck,
  connection,
  credentialPlan,
  decrypt,
  encrypt,
  orderGraph,
  planRows,
  requireImportTarget,
  RENDER_HOST,
} from '../scripts/staging-data-transfer.js';

describe('staging transfer security boundary', () => {
  it('allows exactly the reviewed Render identity, with TLS verification', () => {
    const raw = `postgresql://operator:synthetic-secret@${RENDER_HOST}/educore_staging_k80x?sslmode=require`;
    expect(connection(raw, 'render').ssl).toEqual({ rejectUnauthorized: true });
    for (const url of [
      raw.replace(RENDER_HOST, 'other.singapore-postgres.render.com'),
      raw.replace('staging_k80x', 'production'),
      raw + '&options=-c%20row_security%3Doff',
      raw.replace('sslmode=require', 'sslmode=disable'),
    ])
      expect(() => connection(url, 'render')).toThrow();
  });
  it('rejects Render import before any database client is created', () => {
    expect(() =>
      requireImportTarget(
        `postgresql://operator:synthetic-secret@${RENDER_HOST}/educore_staging_k80x`,
      ),
    ).toThrow('RENDER_IMPORT_NOT_APPROVED');
    expect(() =>
      requireImportTarget('postgresql://u:p@127.0.0.1/educore_demo_local_x'),
    ).toThrow('TARGET_NOT_ALLOWLISTED');
  });
  it('authenticates encrypted backups and fails closed for wrong keys/truncation/tampering', () => {
    const key = randomBytes(32),
      payload = Buffer.from('synthetic database backup bytes'),
      sealed = encrypt(payload, key);
    expect(decrypt(sealed, key)).toEqual(payload);
    expect(sealed.includes(payload)).toBe(false);
    expect(() => decrypt(sealed, randomBytes(32))).toThrow(
      'AUTHENTICATION_FAILED',
    );
    const changed = Buffer.from(sealed);
    changed[changed.length - 1] ^= 1;
    expect(() => decrypt(changed, key)).toThrow('AUTHENTICATION_FAILED');
    expect(() => decrypt(sealed.subarray(0, 12), key)).toThrow();
  });
  it('holds unattested PII, permanently excludes auth/runtime records and holds guarded histories even with attestation', () => {
    const rows = [
      {
        table: 'public.student_profiles',
        key: 's',
        json: '{"id":"s","tenant_id":"t","date_of_birth":"2000-01-01"}',
      },
      { table: 'public.credentials', key: 'u', json: '{"user_id":"u"}' },
      { table: 'educore_r2.effect_permits', key: 'e', json: '{"id":"e"}' },
      {
        table: 'public.submission_versions',
        key: 'v',
        json: '{"id":"v","tenant_id":"t"}',
      },
    ];
    expect(planRows(rows, 'snapshot').map((e) => e.decision)).toEqual([
      'HOLD',
      'EXCLUDE',
      'EXCLUDE',
      'HOLD',
    ]);
    const policy = {
      sourceDigest: 'snapshot',
      approvedBy: 'owner-reviewed-fixture',
      syntheticTenantIds: ['t'],
      syntheticUserIds: ['u'],
    };
    expect(planRows(rows, 'snapshot', policy).map((e) => e.decision)).toEqual([
      'INCLUDE',
      'EXCLUDE',
      'EXCLUDE',
      'HOLD',
    ]);
    expect(planRows(rows, 'changed-snapshot', policy)[0].decision).toBe('HOLD');
  });
  it('orders dependencies and rejects cyclic plans instead of suppressing constraints', () => {
    expect(
      orderGraph(
        ['invoice', 'tenant', 'student'],
        [
          ['invoice', 'student'],
          ['student', 'tenant'],
        ],
      ),
    ).toEqual(['tenant', 'student', 'invoice']);
    expect(() =>
      orderGraph(
        ['sub', 'version'],
        [
          ['sub', 'version'],
          ['version', 'sub'],
        ],
      ),
    ).toThrow('NONDEFERRABLE_OR_GUARDED_CYCLE');
  });
  it('recognizes PostgreSQL AND regrouping without removing meaningful OR grouping or quoted data', () => {
    expect(canonicalCheck('CHECK (((a AND b) AND c))')).toBe(
      canonicalCheck('CHECK ((a AND b AND c))'),
    );
    expect(canonicalCheck('CHECK ((a AND (b OR c)))')).not.toBe(
      canonicalCheck('CHECK (((a AND b) OR c))'),
    );
    expect(canonicalCheck("CHECK ((x = 'A AND B' AND y))")).not.toBe(
      canonicalCheck("CHECK ((x = 'A OR B' AND y))"),
    );
  });
  it('credential provisioning remains a review-bound design and never copies a hash or writes credentials', () => {
    const policy = {
      sourceDigest: 's',
      approvedBy: 'owner-reviewed-fixture',
      syntheticTenantIds: ['t'],
      syntheticUserIds: ['u'],
    };
    expect(credentialPlan('u', 't', policy, 's').state).toBe(
      'DESIGN_ONLY_NO_CREDENTIAL_WRITTEN',
    );
    expect(() => credentialPlan('u', 'different-tenant', policy, 's')).toThrow(
      'CREDENTIAL_PROVISIONING_REVIEW_REQUIRED',
    );
    expect(() => credentialPlan('u', 't', policy, 'changed')).toThrow(
      'CREDENTIAL_PROVISIONING_REVIEW_REQUIRED',
    );
  });
});
