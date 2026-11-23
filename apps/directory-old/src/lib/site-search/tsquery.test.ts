import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildSiteSearchTsQuery } from './tsquery'

describe('buildSiteSearchTsQuery', () => {
  it('makes every word a prefix match so half-typed words still find results', () => {
    assert.equal(buildSiteSearchTsQuery('pizz'), "'pizz':*")
    assert.equal(buildSiteSearchTsQuery('pizza rom'), "'pizza':* & 'rom':*")
  })

  it('ignores extra whitespace', () => {
    assert.equal(buildSiteSearchTsQuery('  pizza   roma  '), "'pizza':* & 'roma':*")
  })

  it('strips the characters that could escape the quoted term', () => {
    assert.equal(buildSiteSearchTsQuery("o'brien"), "'obrien':*")
    assert.equal(buildSiteSearchTsQuery('back\\slash'), "'backslash':*")
  })

  it('keeps tsquery operators inside the quoted term instead of running them', () => {
    assert.equal(buildSiteSearchTsQuery('cafe|bar'), "'cafe|bar':*")
    assert.equal(buildSiteSearchTsQuery('!pizza'), "'!pizza':*")
  })

  it('returns an empty expression when nothing usable is left', () => {
    assert.equal(buildSiteSearchTsQuery(''), '')
    assert.equal(buildSiteSearchTsQuery('   '), '')
    assert.equal(buildSiteSearchTsQuery("'''"), '')
  })
})
