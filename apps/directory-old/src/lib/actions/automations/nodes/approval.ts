import type {
  ApprovalAutomationNode,
  AutomationApprovalSummary,
} from '@/features/automations/domain/types'
import { createHubNotificationForSuperAdmins } from '@/lib/actions/notifications/notification-service'
import { db } from '@/lib/db'
import { siteAutomationApprovals } from '@/lib/db/schema'
import type { RuntimeOutput } from '../runtime'

const HOUR_MS = 60 * 60 * 1000
const EXCERPT_LIMIT = 400

/**
 * Opens one approval gate: records the payload the run is holding for the nodes
 * after this one, sets the deadline, and tells the owner it needs an answer.
 * Returns the deadline so the runner can show it on the paused step.
 *
 * The notification helper swallows its own delivery errors, so a mail/notification
 * problem can never lose the paused work.
 */
export async function pauseForApproval(input: {
  siteId: string
  automationId: string
  automationName: string
  runId: string
  node: ApprovalAutomationNode
  payload: RuntimeOutput
}): Promise<{ expiresAt: Date }> {
  const summary = approvalSummary(input.payload)
  const expiresAt = new Date(Date.now() + input.node.config.expiryHours * HOUR_MS)
  const [approval] = await db
    .insert(siteAutomationApprovals)
    .values({
      runId: input.runId,
      automationId: input.automationId,
      nodeId: input.node.id,
      status: 'pending',
      payload: input.payload,
      summary,
      expiresAt,
    })
    .returning({ id: siteAutomationApprovals.id })
  if (!approval) throw new Error('The approval step could not be recorded')

  await createHubNotificationForSuperAdmins({
    type: 'automation_approval',
    siteId: input.siteId,
    sourceId: approval.id,
    title: `Approval needed: ${input.automationName}`,
    message: summary.title
      ? `"${summary.title}" is waiting for your approval. Nothing after this step runs until you decide.`
      : 'An automation run is waiting for your approval. Nothing after this step runs until you decide.',
    targetHref: `/admin/automations/${input.automationId}`,
    metadata: { runId: input.runId, nodeId: input.node.id, expiresAt: expiresAt.toISOString() },
  })

  return { expiresAt }
}

/**
 * The stored payload is re-read from the database hours after it was written, so
 * it is parsed rather than trusted. Only an article can reach a gate today: the
 * node's allowed targets (AI Image, Post, Newsletter) all consume one.
 */
export function parseApprovalPayload(value: unknown): RuntimeOutput {
  if (!isRecord(value) || value.type !== 'article' || !isRecord(value.article)) {
    throw new Error('The approved article could not be read back')
  }
  const article = value.article
  if (
    typeof article.title !== 'string'
    || typeof article.excerpt !== 'string'
    || typeof article.metaDescription !== 'string'
    || typeof article.html !== 'string'
    || (article.featuredImage !== undefined && typeof article.featuredImage !== 'string')
  ) {
    throw new Error('The approved article could not be read back')
  }
  return {
    type: 'article',
    article: {
      title: article.title,
      excerpt: article.excerpt,
      metaDescription: article.metaDescription,
      html: article.html,
      ...(article.featuredImage === undefined ? {} : { featuredImage: article.featuredImage }),
    },
  }
}

function approvalSummary(payload: RuntimeOutput): AutomationApprovalSummary {
  if (payload.type !== 'article') return {}
  return {
    title: payload.article.title,
    excerpt: payload.article.excerpt.slice(0, EXCERPT_LIMIT),
    wordCount: countWords(payload.article.html),
  }
}

function countWords(html: string) {
  const text = html.replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;|&#\d+;/gi, ' ')
  return text.split(/\s+/).filter(Boolean).length
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
