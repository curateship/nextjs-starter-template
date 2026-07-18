import type {
  AgentAutomationNode,
  AutomationNode,
  AutomationNodeKind,
  AutomationTriggerType,
  ImageAutomationNode,
  ListingAutomationNode,
  PostAutomationNode,
  RouterAutomationNode,
  ScraperAutomationNode,
} from '@/features/automations/domain/types'
import { runAgentNode } from './nodes/agent'
import { runImageNode } from './nodes/image'
import { runListingNode } from './nodes/listing'
import { runPostNode } from './nodes/post'
import { runRouterNode } from './nodes/router'
import { runScraperNode } from './nodes/scraper'
import { articleFrom, documentsFrom, type RuntimeOutput } from './runtime'

export interface NodeExecutionContext {
  siteId: string
  automationId: string
  triggerType: AutomationTriggerType
}

export interface NodeExecutor {
  // Whether temporary (retryable) errors from this node are retried.
  retry: boolean
  run(ctx: NodeExecutionContext, payloads: RuntimeOutput[], node: AutomationNode): Promise<RuntimeOutput>
}

// One executor per node kind. Adding a node kind means adding one entry here;
// the graph runner in execution.ts dispatches through getNodeExecutor.
const NODE_EXECUTORS: Record<AutomationNodeKind, NodeExecutor> = {
  time: {
    retry: false,
    run: async () => ({ type: 'signal' }),
  },
  scraper: {
    retry: true,
    run: async (ctx, _payloads, node) => {
      const result = await runScraperNode(ctx.automationId, node as ScraperAutomationNode)
      return {
        type: 'documents',
        documents: result.documents,
        fetchedCount: result.fetchedCount,
        unchangedCount: result.unchangedCount,
      }
    },
  },
  router: {
    retry: true,
    run: async (ctx, payloads, node) => {
      const result = await runRouterNode(ctx.siteId, node as RouterAutomationNode, documentsFrom(payloads))
      return { type: 'routes', groups: result.groups }
    },
  },
  agent: {
    retry: true,
    run: async (ctx, payloads, node) => {
      const result = await runAgentNode(ctx.siteId, node as AgentAutomationNode, documentsFrom(payloads))
      return { type: 'article', article: result.article }
    },
  },
  image: {
    retry: false,
    run: async (ctx, payloads, node) => {
      const article = articleFrom(payloads)
      if (!article) throw new Error('AI Image did not receive an article')
      const result = await runImageNode(ctx.siteId, node as ImageAutomationNode, article)
      return { type: 'article', article: result.article, imageError: result.imageError }
    },
  },
  post: {
    retry: false,
    run: async (ctx, payloads, node) => {
      const article = articleFrom(payloads)
      if (!article) throw new Error('Post did not receive an article')
      const post = await runPostNode(ctx.siteId, node as PostAutomationNode, article)
      return { type: 'post', post }
    },
  },
  listing: {
    retry: true,
    run: async (ctx, payloads, node) => {
      const listing = await runListingNode(ctx.siteId, node as ListingAutomationNode, documentsFrom(payloads), {
        automationId: ctx.automationId,
      })
      return { type: 'listing', listing }
    },
  },
}

export function getNodeExecutor(kind: AutomationNodeKind): NodeExecutor {
  return NODE_EXECUTORS[kind]
}
