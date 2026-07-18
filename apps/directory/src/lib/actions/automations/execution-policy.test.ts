import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { RetryableAutomationError } from './errors'
import { deriveAutomationRunStatus, shouldRetryAutomationNode } from './execution-policy'

describe('automation execution policy', () => {
  it('derives success, partial, failed, and no-op run outcomes', () => {
    assert.equal(deriveAutomationRunStatus([{ failed: false, createdContent: true }]), 'success')
    assert.equal(deriveAutomationRunStatus([{ failed: true, createdContent: false }, { failed: false, createdContent: true }]), 'partial')
    assert.equal(deriveAutomationRunStatus([{ failed: true, createdContent: false }]), 'failed')
    assert.equal(deriveAutomationRunStatus([{ failed: false, createdContent: false }]), 'noop')
  })

  it('retries only temporary scraper and AI failures for at most three attempts', () => {
    const temporary = new RetryableAutomationError('Temporary failure')
    assert.equal(shouldRetryAutomationNode('scraper', temporary, 1), true)
    assert.equal(shouldRetryAutomationNode('router', temporary, 2), true)
    assert.equal(shouldRetryAutomationNode('listing', temporary, 1), true)
    assert.equal(shouldRetryAutomationNode('agent', temporary, 3), false)
    assert.equal(shouldRetryAutomationNode('post', temporary, 1), false)
    assert.equal(shouldRetryAutomationNode('scraper', new Error('Invalid response'), 1), false)
  })
})
