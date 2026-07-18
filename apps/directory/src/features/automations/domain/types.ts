import type { AIProvider } from '@/lib/utils/ai-models'

export type AutomationStatus = 'draft' | 'active' | 'paused'
export type AutomationRunStatus = 'running' | 'success' | 'partial' | 'failed' | 'noop'
export type AutomationStepStatus = 'pending' | 'running' | 'success' | 'failed' | 'skipped'
export type AutomationTriggerType = 'manual' | 'schedule'
export type AutomationNodeKind = 'time' | 'scraper' | 'router' | 'agent' | 'image' | 'post' | 'listing'

export type AutomationImageSize = 'square' | 'landscape' | 'portrait'

export type AutomationSchedule =
  | { frequency: 'once'; runAt: string; timezone: string }
  | { frequency: 'daily'; time: string; timezone: string }
  | { frequency: 'weekly'; time: string; timezone: string; dayOfWeek: number }
  | { frequency: 'monthly'; time: string; timezone: string; dayOfMonth: number }

export interface AutomationNodeBase {
  id: string
  kind: AutomationNodeKind
  name: string
  x: number
  y: number
}

export interface TimeAutomationNode extends AutomationNodeBase {
  kind: 'time'
  config: { schedule: AutomationSchedule }
}

export interface ScraperAutomationNode extends AutomationNodeBase {
  kind: 'scraper'
  config: { urls: string[] }
}

export interface AutomationRouterRoute {
  id: string
  name: string
  description: string
}

export interface RouterAutomationNode extends AutomationNodeBase {
  kind: 'router'
  config: {
    provider: AIProvider
    model: string
    routes: AutomationRouterRoute[]
  }
}

export interface AgentAutomationNode extends AutomationNodeBase {
  kind: 'agent'
  config: {
    provider: AIProvider
    model: string
    instructions: string
  }
}

export interface ImageAutomationNode extends AutomationNodeBase {
  kind: 'image'
  config: {
    provider: AIProvider
    model: string
    prompt: string
    size: AutomationImageSize
  }
}

export interface PostAutomationNode extends AutomationNodeBase {
  kind: 'post'
  config: {
    templateId: string
    publish: boolean
    categoryIds: string[]
    primaryCategoryId: string | null
  }
}

export interface ListingAutomationNode extends AutomationNodeBase {
  kind: 'listing'
  config: {
    provider: AIProvider
    model: string
    templateId: string
    categoryId: string | null
    instructions: string
  }
}

export type AutomationNode =
  | TimeAutomationNode
  | ScraperAutomationNode
  | RouterAutomationNode
  | AgentAutomationNode
  | ImageAutomationNode
  | PostAutomationNode
  | ListingAutomationNode

export type AutomationSourcePort = 'then' | 'documents' | 'article' | 'else' | `route:${string}`

export interface AutomationEdge {
  id: string
  from: string
  sourcePort: AutomationSourcePort
  to: string
}

export interface AutomationViewport {
  x: number
  y: number
  zoom: number
}

export interface AutomationGraph {
  nodes: AutomationNode[]
  edges: AutomationEdge[]
  viewport: AutomationViewport
}

export interface AutomationValidationError {
  code: string
  message: string
  nodeId?: string
  edgeId?: string
}

export interface AutomationListItem {
  id: string
  siteId: string
  name: string
  status: AutomationStatus
  nodeCount: number
  schedule: AutomationSchedule | null
  nextRunAt: string | null
  lastRunAt: string | null
  lastRunStatus: AutomationRunStatus | null
  createdAt: string
  updatedAt: string
}

export interface AutomationRunStepItem {
  id: string
  nodeId: string
  nodeKind: AutomationNodeKind
  nodeName: string
  status: AutomationStepStatus
  attemptCount: number
  inputSummary: Record<string, unknown>
  outputSummary: Record<string, unknown>
  error: string | null
  startedAt: string | null
  completedAt: string | null
  durationMs: number | null
}

export interface AutomationRunItem {
  id: string
  automationId: string
  status: AutomationRunStatus
  triggerType: AutomationTriggerType
  error: string | null
  startedAt: string
  completedAt: string | null
  durationMs: number | null
  steps: AutomationRunStepItem[]
}

export interface AutomationEditorData {
  automation: AutomationListItem & { graph: AutomationGraph }
  runs: AutomationRunItem[]
  templates: Array<{ id: string; name: string; isDefault: boolean }>
  listingTemplates: Array<{ id: string; name: string; isDefault: boolean }>
  categories: Array<{ id: string; title: string }>
  providers: Array<{ provider: AIProvider; label: string; defaultModel: string }>
  validationErrors: AutomationValidationError[]
}

export interface ScrapedDocument {
  url: string
  title: string
  text: string
  contentHash: string
}

export interface StructuredArticle {
  title: string
  excerpt: string
  metaDescription: string
  html: string
  // Public URL of a generated featured image, set by an AI Image node when one
  // sits between the AI Agent and the Post. Undefined when no image was made.
  featuredImage?: string
}
