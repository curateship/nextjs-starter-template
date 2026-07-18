import type { AutomationNodeKind, AutomationRunStatus } from '@/features/automations/domain/types'
import { isRetryableAutomationError } from './errors'

export const MAX_AUTOMATION_NODE_ATTEMPTS = 3

export function deriveAutomationRunStatus(outcomes: Array<{ failed: boolean; createdContent: boolean }>): AutomationRunStatus {
  const failed = outcomes.some((outcome) => outcome.failed)
  const createdContent = outcomes.some((outcome) => outcome.createdContent)
  if (failed) return createdContent ? 'partial' : 'failed'
  return createdContent ? 'success' : 'noop'
}

export function shouldRetryAutomationNode(kind: AutomationNodeKind, error: unknown, attempts: number) {
  return (kind === 'scraper' || kind === 'router' || kind === 'agent' || kind === 'listing')
    && isRetryableAutomationError(error)
    && attempts < MAX_AUTOMATION_NODE_ATTEMPTS
}
