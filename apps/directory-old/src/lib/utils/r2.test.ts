import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'

import {
  deleteFromR2,
  getLocalObjectUrl,
  getFromR2,
  resolveLocalObjectPath,
  uploadToR2,
  usesLocalObjectStorage,
} from './r2'

test('local object paths stay inside the storage root', () => {
  const root = '/tmp/directory-object-storage'

  assert.equal(
    resolveLocalObjectPath('user/image.png', root),
    '/tmp/directory-object-storage/user/image.png',
  )
  assert.throws(() => resolveLocalObjectPath('../secret', root), /Invalid object storage key/)
  assert.throws(() => resolveLocalObjectPath('/absolute/file', root), /Invalid object storage key/)
  assert.throws(() => resolveLocalObjectPath('user\\secret', root), /Invalid object storage key/)
  assert.throws(() => resolveLocalObjectPath('user/secret\0.png', root), /Invalid object storage key/)
  assert.throws(() => resolveLocalObjectPath(`user/${'a'.repeat(1024)}`, root), /Invalid object storage key/)
})

test('local public object URLs map to Vite public files', () => {
  const key = 'user/image.png'
  assert.equal(getLocalObjectUrl(key), '/local-media/user/image.png')
})

test('development object storage writes, reads ranges, and deletes local files', async (context) => {
  if (!usesLocalObjectStorage()) {
    context.skip('Local object storage is disabled when R2 is configured')
    return
  }

  const key = `tests/${randomUUID()}.png`
  const source = Buffer.from('local-media')

  try {
    assert.equal(await uploadToR2(key, source, 'image/png'), getLocalObjectUrl(key))

    const complete = await getFromR2(key)
    assert.deepEqual(complete.Body, source)
    assert.equal(complete.ContentType, 'image/png')

    const partial = await getFromR2(key, 'bytes=0-4')
    assert.deepEqual(partial.Body, Buffer.from('local'))
    assert.equal(partial.ContentRange, `bytes 0-4/${source.length}`)
  } finally {
    await deleteFromR2(key)
  }

  await assert.rejects(() => getFromR2(key), /ENOENT/)
})
