import type { AIProvider } from '@/lib/utils/ai-models'
import type { AiAutomationRecurrence } from './schedule'

export type AiAutomationStatus = 'draft' | 'active' | 'paused'
export type AiAutomationRunStatus = 'running' | 'success' | 'failed'
export type AiAutomationReferenceType = 'file' | 'url'
export type AutomationSortColumn = 'name' | 'provider' | 'status' | 'lastRun' | 'nextRun'
export type AutomationStatusFilter = 'all' | AiAutomationStatus

export interface AiAgentAutomation {
  id: string
  site_id: string
  name: string
  prompt: string
  status: AiAutomationStatus
  provider: AIProvider
  model: string
  recurrence: AiAutomationRecurrence
  next_run_at: string | null
  last_run_at: string | null
  last_run_status: string | null
  created_at: string
  updated_at: string
  references_count?: number
  runs_count?: number
}

export interface AiAgentAutomationReference {
  id: string
  automation_id: string
  reference_type: AiAutomationReferenceType
  label: string
  source_url: string | null
  mime_type: string | null
  file_size: number | null
  extracted_chars: number
  created_at: string
}

export interface AiAgentAutomationRun {
  id: string
  automation_id: string
  status: AiAutomationRunStatus
  trigger_type: string
  provider: AIProvider
  model: string
  output: string | null
  error: string | null
  duration_ms: number | null
  usage: Record<string, unknown>
  started_at: string
  completed_at: string | null
}

export interface AiAutomationStatusCounts {
  all: number
  active: number
  paused: number
  draft: number
}
