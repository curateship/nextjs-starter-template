import { AI_PROVIDER_DEFAULT_MODELS } from '@/lib/utils/ai-models'
import { defaultAutomationSchedule } from './schedule'
import type {
  AutomationGraph,
  AutomationNode,
  AutomationNodeKind,
  AutomationSourcePort,
} from './types'

export const AUTOMATION_NODE_WIDTH = 260
export const AUTOMATION_NODE_HEIGHT = 88

export const AUTOMATION_NODE_CATALOG: Array<{
  kind: AutomationNodeKind
  name: string
  description: string
  group: 'Triggers' | 'Sources' | 'AI' | 'Actions'
}> = [
  { kind: 'time', name: 'Time', description: 'Start on a schedule.', group: 'Triggers' },
  { kind: 'scraper', name: 'Scraper', description: 'Read public web pages.', group: 'Sources' },
  { kind: 'router', name: 'AI Router', description: 'Group pages by content type.', group: 'AI' },
  { kind: 'agent', name: 'AI Agent', description: 'Write a structured article.', group: 'AI' },
  { kind: 'post', name: 'Post', description: 'Create a Hub post.', group: 'Actions' },
  { kind: 'listing', name: 'Listing', description: 'Draft directory listings.', group: 'Actions' },
]

export function createInitialAutomationGraph(): AutomationGraph {
  return {
    nodes: [createAutomationNode('time', 80, 180)],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  }
}

export function createAutomationNode(kind: AutomationNodeKind, x: number, y: number): AutomationNode {
  const common = { id: crypto.randomUUID(), kind, name: nodeKindName(kind), x, y }
  if (kind === 'time') return { ...common, kind, config: { schedule: defaultAutomationSchedule() } }
  if (kind === 'scraper') return { ...common, kind, config: { urls: [''] } }
  if (kind === 'router') {
    return {
      ...common,
      kind,
      config: {
        provider: 'openai',
        model: AI_PROVIDER_DEFAULT_MODELS.openai,
        routes: [
          { id: crypto.randomUUID(), name: 'News', description: 'News and current events.' },
          { id: crypto.randomUUID(), name: 'Guides', description: 'Tutorials and educational content.' },
        ],
      },
    }
  }
  if (kind === 'agent') {
    return {
      ...common,
      kind,
      name: 'Article Writer',
      config: {
        provider: 'openai',
        model: AI_PROVIDER_DEFAULT_MODELS.openai,
        instructions: 'Write an accurate, useful article from the supplied research.',
      },
    }
  }
  if (kind === 'listing') {
    return {
      ...common,
      kind: 'listing',
      config: {
        provider: 'openai',
        model: AI_PROVIDER_DEFAULT_MODELS.openai,
        templateId: '',
        categoryId: null,
        instructions: '',
      },
    }
  }
  return {
    ...common,
    kind: 'post',
    config: { templateId: '', publish: false, categoryIds: [], primaryCategoryId: null },
  }
}

export function nodeKindName(kind: AutomationNodeKind) {
  return AUTOMATION_NODE_CATALOG.find((item) => item.kind === kind)?.name ?? kind
}

export function nodeOutputPorts(node: AutomationNode): Array<{ id: AutomationSourcePort; label: string }> {
  if (node.kind === 'time') return [{ id: 'then', label: 'Then' }]
  if (node.kind === 'scraper') return [{ id: 'documents', label: 'Pages' }]
  if (node.kind === 'router') {
    return [
      ...node.config.routes.map((route) => ({ id: `route:${route.id}` as const, label: route.name })),
      { id: 'else' as const, label: 'Else' },
    ]
  }
  if (node.kind === 'agent') return [{ id: 'article', label: 'Article' }]
  // Post and Listing are terminal actions with no outputs.
  return []
}
