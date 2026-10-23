import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { buildDirectoryCursorListQuery } from './directory-admin-list'

describe('buildDirectoryCursorListQuery', () => {
  it('preserves admin search and status filters for database-wide directory lookup', () => {
    assert.deepEqual(buildDirectoryCursorListQuery({
      cursor: 'cursor-1',
      limit: 25,
      search: 'mhel',
      siteId: 'site-1',
      sortColumn: null,
      sortDirection: 'asc',
      status: 'published',
    }), {
      cursor: 'cursor-1',
      limit: 25,
      search: 'mhel',
      siteId: 'site-1',
      sortBy: 'default',
      sortDirection: 'asc',
      status: 'published',
    })
  })

  it('maps supported admin sort columns to directory list sort modes', () => {
    assert.equal(buildDirectoryCursorListQuery({
      cursor: null,
      limit: 20,
      search: '',
      siteId: 'site-1',
      sortColumn: 'title',
      sortDirection: 'desc',
      status: 'all',
    }).sortBy, 'title')

    assert.equal(buildDirectoryCursorListQuery({
      cursor: null,
      limit: 20,
      search: '',
      siteId: 'site-1',
      sortColumn: 'modified',
      sortDirection: 'desc',
      status: 'all',
    }).sortBy, 'modified')
  })
})
