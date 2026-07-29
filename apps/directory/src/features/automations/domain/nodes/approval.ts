import { finiteNumber } from '../parse-utils'
import { defineNode } from '../node-descriptor'

// 1 hour to 30 days. Short enough to test, long enough to cover a holiday.
const MIN_EXPIRY_HOURS = 1
const MAX_EXPIRY_HOURS = 720
const DEFAULT_EXPIRY_HOURS = 48

/**
 * A pause-and-ask gate. The run stops here, the owner is notified, and only an
 * approval lets the nodes after it run.
 *
 * Its targets are deliberately limited to AI Image and Post, which both take
 * exactly one input. That keeps everything after a gate reachable only through
 * the gate, which is what makes resuming a paused run on a later cron invocation
 * safe: the gate's own held payload is all the downstream nodes ever need.
 */
export const approvalNode = defineNode({
  kind: 'approval',
  meta: { name: 'Approval', description: 'Pause until you approve.', group: 'Actions' },
  inputs: 'single',
  createConfig: () => ({ expiryHours: DEFAULT_EXPIRY_HOURS }),
  ports: () => [{ id: 'approved', label: 'Approved' }],
  parseConfig: (config) => {
    const expiryHours = finiteNumber(config.expiryHours, 'Approval expiry window')
    if (!Number.isInteger(expiryHours) || expiryHours < MIN_EXPIRY_HOURS || expiryHours > MAX_EXPIRY_HOURS) {
      throw new Error('Approval expiry window is invalid')
    }
    return { expiryHours }
  },
  validate: (node, push) => {
    if (node.config.expiryHours < MIN_EXPIRY_HOURS || node.config.expiryHours > MAX_EXPIRY_HOURS) {
      push('approval-expiry', 'Choose how long this approval waits before it expires.')
    }
  },
  allowedTargets: (port) => (port === 'approved' ? ['image', 'post'] : []),
})
