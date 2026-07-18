import type { AutomationRunStatus } from '@/features/automations/domain/types'
import { isRetryableAutomationError } from './errors'

export const MAX_AUTOMATION_NODE_ATTEMPTS = 3

export function deriveAutomationRunStatus(outcomes: Array<{ failed: boolean; createdContent: boolean }>): AutomationRunStatus {
  const failed = outcomes.some((outcome) => outcome.failed)
  const createdContent = outcomes.some((outcome) => outcome.createdContent)
  if (failed) return createdContent ? 'partial' : 'failed'
  return createdContent ? 'success' : 'noop'
}

/**
 * Retry a node only when it opts into retries (see the node executor registry),
 * the error is a temporary provider/network failure, and we are under the cap.
 */
export function shouldRetryAutomationNode(retryable: boolean, error: unknown, attempts: number) {
  return retryable && isRetryableAutomationError(error) && attempts < MAX_AUTOMATION_NODE_ATTEMPTS
}
