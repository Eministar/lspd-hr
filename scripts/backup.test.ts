import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { verifyBackup, containedPath } from '../src/lib/backup-verify'
import { berlinDay } from '../src/lib/daily-backup-job'
import { normalizeSnapshot } from '../src/lib/db-restore'
import { collectSnapshot } from '../src/lib/db-backup'
import { acquireBackupLock } from '../src/lib/backup-lock'

// No database or production files are modified by these recovery tests.
test('missing or unreadable tables abort rather than becoming empty arrays', async () => {
  await assert.rejects(collectSnapshot({}, ['User']), /Modell User fehlt/)
  await assert.rejects(collectSnapshot({ user: { findMany: async () => { throw new Error('read failure') } } }, ['User']), /read failure/)
  assert.deepEqual(await collectSnapshot({ user: { findMany: async () => [{ id: '1' }] } }, ['User']), { User: [{ id: '1' }] })
})
test('Berlin calendar day handles midnight and daylight-saving time', () => {
  assert.equal(berlinDay(new Date('2026-09-13T22:01:00Z')), '2026-09-14')
  assert.equal(berlinDay(new Date('2026-01-13T22:01:00Z')), '2026-01-13')
})
test('rejects traversal, absolute paths, and Windows separators', () => {
  for (const input of ['../secret', '/secret', 'a/../../secret', 'a\\secret', 'a/./secret']) {
    assert.throws(() => containedPath('C:/backups', input))
  }
})
test('journal is archived but only restored with explicit recovery option', () => {
  const snapshot = { data: { FailoverJournalEntry: [{ seq: '1' }] } }
  assert.equal(normalizeSnapshot(snapshot).data.FailoverJournalEntry, undefined)
  assert.equal(normalizeSnapshot(snapshot, true).data.FailoverJournalEntry.length, 1)
})
test('verifies binary uploads and rejects corruption, missing files and incomplete backups', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lspd-backup-test-'))
  try {
    const release = await acquireBackupLock(root)
    assert.ok(release)
    assert.equal(await acquireBackupLock(root), null)
    await release()
    const reacquired = await acquireBackupLock(root)
    assert.ok(reacquired)
    await reacquired()
    const companion = path.join(root, 'db-test.json.files')
    await fs.mkdir(path.join(companion, 'uploads'), { recursive: true })
    const bytes = Buffer.from([0, 255, 12, 4, 128])
    const upload = path.join(companion, 'uploads', 'example.bin')
    await fs.writeFile(upload, bytes)
    const snapshot = { meta: { formatVersion: 3, complete: true, filesDirectory: 'db-test.json.files', files: [
      { path: 'uploads/example.bin', bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') },
    ] }, data: { User: [{ id: 'test' }] } }
    const file = path.join(root, 'snapshot.json')
    await fs.writeFile(file, JSON.stringify(snapshot))
    assert.equal((await verifyBackup(file)).files.length, 1)
    await fs.writeFile(upload, 'corrupt')
    await assert.rejects(verifyBackup(file), /Prüfsumme/)
    await fs.unlink(upload)
    await assert.rejects(verifyBackup(file), /ENOENT/)
    snapshot.meta.complete = false
    await fs.writeFile(file, JSON.stringify(snapshot))
    await assert.rejects(verifyBackup(file), /vollständige/)
  } finally {
    const relative = path.relative(os.tmpdir(), root)
    assert.ok(relative.startsWith('lspd-backup-test-') && !relative.includes(path.sep))
    await fs.rm(root, { recursive: true, force: true })
  }
})
