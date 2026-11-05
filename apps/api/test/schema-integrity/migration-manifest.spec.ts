import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';

// Migration history through the owner-approved R13 attendance integrity addition. Update only with an intentionally reviewed
// migration addition; editing an applied migration must remain visible in CI.
it('matches the reviewed ordered migration manifest and SQL', () => {
  const root = resolve('prisma/migrations');
  const names = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  expect(names).toHaveLength(51);
  expect(names.every((name) => /^[0-9]{12}_[a-z0-9_]+$/.test(name))).toBe(true);
  expect(readFileSync(resolve(root, 'migration_lock.toml'), 'utf8')).toContain(
    'provider = "postgresql"',
  );

  const hash = createHash('sha256');
  for (const name of names) {
    hash.update(name + '\0');
    // Git stores LF; native Windows checkout line endings are not SQL changes.
    hash.update(
      readFileSync(resolve(root, name, 'migration.sql'), 'utf8').replace(
        /\r\n/g,
        '\n',
      ),
    );
    hash.update('\0');
  }
  expect(hash.digest('hex')).toBe(
    '3d71aa8bd4c3cb225c7645bab9fe94c9f4f1bdc49b42a61b781111ca7895cc1a',
  );
});
