import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, readFileSync, unlinkSync } from 'node:fs'
import { resolve } from 'node:path'

// Local checkout repair only. Does not change SQL, expected digest, index or Git config.
const path = 'apps/api/prisma/migrations/202610190001_r1a_baseline/migration.sql'
const expected = 'c134fc7e71cc102236ee2c7c8e386f17467ef65d6050e3c7e75147413de37b20'
const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
const git = (args) => execFileSync('git', args, { cwd: root })
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const head = git(['show', `HEAD:${path}`])
const index = git(['show', `:${path}`])
const working = readFileSync(resolve(root, path))
if (digest(head) !== expected || !head.equals(index)) throw Error('BASELINE_OR_INDEX_CHANGED: owner review required')
const onlyCheckoutCRLF = Buffer.from(working.toString('utf8').replaceAll('\r\n', '\n')).equals(head)
if (!onlyCheckoutCRLF) throw Error('WORKING_SQL_CONTENT_CHANGED: refusing to overwrite owner edits')
const restore = process.argv.slice(2).includes('--restore')
if (process.argv.slice(2).some((arg) => arg !== '--restore')) throw Error('UNKNOWN_OPTION')
if (restore && !working.equals(head)) {
  // Configuration applies to this invocation and this single index path only.
  // --temp forces materialization even when Git's stat cache says the file is current.
  const temporary = git(['-c', 'core.autocrlf=false', '-c', 'core.eol=lf', 'checkout-index', '--temp', '--', path])
    .toString('utf8').split('\t')[0]
  if (!/^\.merge_file_[A-Za-z0-9]+$/.test(temporary)) throw Error('UNEXPECTED_GIT_CHECKOUT_PATH')
  const checkout = resolve(root, temporary)
  try {
    if (!readFileSync(checkout).equals(head)) throw Error('CHECKOUT_NOT_IDENTICAL_TO_GIT_BLOB')
    if (!readFileSync(resolve(root, path)).equals(working)) throw Error('WORKING_FILE_CHANGED_DURING_CHECK')
    copyFileSync(checkout, resolve(root, path))
  } finally { unlinkSync(checkout) }
  if (!readFileSync(resolve(root, path)).equals(head)) throw Error('CHECKOUT_NOT_IDENTICAL_TO_GIT_BLOB')
  if (!git(['show', `:${path}`]).equals(index)) throw Error('INDEX_CHANGED_UNEXPECTEDLY')
}
process.stdout.write(JSON.stringify({ path, headSHA256: digest(head), indexSHA256: digest(index),
  beforeSHA256: digest(working), afterSHA256: digest(readFileSync(resolve(root, path))),
  onlyCheckoutCRLF, restored: restore && !working.equals(head) }) + '\n')
