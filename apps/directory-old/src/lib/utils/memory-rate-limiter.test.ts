import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { MemoryRateLimiter } from './memory-rate-limiter'

describe('MemoryRateLimiter', () => {
  it('enforces a fixed-window limit', () => {
    const limiter = new MemoryRateLimiter()
    assert.equal(limiter.isLimited('key', 2, 1000, 0), false)
    assert.equal(limiter.isLimited('key', 2, 1000, 1), false)
    assert.equal(limiter.isLimited('key', 2, 1000, 2), true)
    assert.equal(limiter.isLimited('key', 2, 1000, 1000), false)
  })

  it('keeps attacker-controlled keys bounded', () => {
    const limiter = new MemoryRateLimiter(3, 100)
    for (let index = 0; index < 20; index += 1) {
      limiter.isLimited(`key-${index}`, 1, 60_000, index)
    }
    assert.ok(limiter.size <= 3)
  })
})
