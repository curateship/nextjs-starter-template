import {
  aiAgentAutomationReferences,
  aiAgentAutomationRuns,
  aiAgentAutomations,
} from '@/lib/db/schema'
import type { AIProvider } from '@/lib/utils/ai-models'
import { normalizeAiAutomationRecurrence } from './schedule'
import type {
  AiAgentAutomation,
  AiAgentAutomationReference,
  AiAgentAutomationRun,
  AiAutomationReferenceType,
  AiAutomationRunStatus,
  AiAutomationStatus,
} from './types'

type ReferenceSummaryRow = Omit<typeof aiAgentAutomationReferences.$inferSelect, 'extractedText'> & {
  extractedChars: number
}

export function rowToAutomation(row: typeof aiAgentAutomations.$inferSelect): AiAgentAutomation {
  return {
    id: row.id,
    site_id: row.siteId,
    name: row.name,
    prompt: row.prompt,
    status: row.status as AiAutomationStatus,
    provider: row.provider as AIProvider,
    model: row.model,
    recurrence: normalizeAiAutomationRecurrence(row.recurrence),
    next_run_at: row.nextRunAt?.toISOString() ?? null,
    last_run_at: row.lastRunAt?.toISOString() ?? null,
    last_run_status: row.lastRunStatus ?? null,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  }
}

export function rowToReference(row: typeof aiAgentAutomationReferences.$inferSelect): AiAgentAutomationReference {
  return rowToReferenceSummary({ ...row, extractedChars: row.extractedText.length })
}

export function rowToReferenceSummary(row: ReferenceSummaryRow): AiAgentAutomationReference {
  return {
    id: row.id,
    automation_id: row.automationId,
    reference_type: row.referenceType as AiAutomationReferenceType,
    label: row.label,
    source_url: row.sourceUrl ?? null,
    mime_type: row.mimeType ?? null,
    file_size: row.fileSize ?? null,
    extracted_chars: row.extractedChars,
    created_at: row.createdAt.toISOString(),
  }
}

export function rowToRun(row: typeof aiAgentAutomationRuns.$inferSelect): AiAgentAutomationRun {
  return {
    id: row.id,
    automation_id: row.automationId,
    status: row.status as AiAutomationRunStatus,
    trigger_type: row.triggerType,
    provider: row.provider as AIProvider,
    model: row.model,
    output: row.output ?? null,
    error: row.error ?? null,
    duration_ms: row.durationMs ?? null,
    usage: isRecord(row.usage) ? row.usage : {},
    started_at: row.startedAt.toISOString(),
    completed_at: row.completedAt?.toISOString() ?? null,
  }
}

export function countByAutomationId(rows: Array<{ automationId: string; count?: number }>) {
  const counts: Record<string, number> = {}
  for (const row of rows) counts[row.automationId] = row.count ?? (counts[row.automationId] || 0) + 1
  return counts
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
