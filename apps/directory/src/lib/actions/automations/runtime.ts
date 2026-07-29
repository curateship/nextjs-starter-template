import type { ScrapedDocument, StructuredArticle } from '@/features/automations/domain/types'
import type { EventNodeResult } from './nodes/event'
import type { ListingNodeResult } from './nodes/listing'
import type { PostNodeResult } from './nodes/post'

// The value a node produces at run time, carried along its outgoing edges to the
// next node. Shapes are keyed by `type`, not node kind, so several node kinds can
// share one shape (e.g. AI Agent and AI Image both emit `article`).
export type RuntimeOutput =
  | { type: 'signal' }
  | { type: 'documents'; documents: ScrapedDocument[]; fetchedCount?: number; unchangedCount?: number }
  | { type: 'routes'; groups: Record<string, ScrapedDocument[]> }
  | { type: 'article'; article: StructuredArticle; imageError?: string }
  | { type: 'post'; post: PostNodeResult }
  | { type: 'listing'; listing: ListingNodeResult }
  | { type: 'event'; event: EventNodeResult }

export function articleFrom(payloads: RuntimeOutput[]) {
  return payloads.find((payload): payload is Extract<RuntimeOutput, { type: 'article' }> => payload.type === 'article')?.article
}

export function documentsFrom(payloads: RuntimeOutput[]) {
  const byUrl = new Map<string, ScrapedDocument>()
  for (const payload of payloads) {
    if (payload.type !== 'documents') continue
    for (const document of payload.documents) byUrl.set(document.url, document)
  }
  return [...byUrl.values()]
}
