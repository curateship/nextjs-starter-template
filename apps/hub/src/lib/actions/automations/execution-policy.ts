import type { AutomationNodeKind, AutomationRunStatus } from '@/features/automations/domain/types'
import { isRetryableAutomationError } from './errors'

export const MAX_AUTOMATION_NODE_ATTEMPTS = 3

export function deriveAutomationRunStatus(outcomes: Array<{ failed: boolean; createdPost: boolean }>): AutomationRunStatus {
  const failed = outcomes.some((outcome) => outcome.failed)
  const createdPost = outcomes.some((outcome) => outcome.createdPost)
  if (failed) return createdPost ? 'partial' : 'failed'
  return createdPost ? 'success' : 'noop'
}

export function shouldRetryAutomationNode(kind: AutomationNodeKind, error: unknown, attempts: number) {
  return (kind === 'scraper' || kind === 'router' || kind === 'agent')
    && isRetryableAutomationError(error)
    && attempts < MAX_AUTOMATION_NODE_ATTEMPTS
}
