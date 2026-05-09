import { and, desc, eq, sql, type SQL } from 'drizzle-orm'

import { db } from '@/lib/db'
import { newsletterContacts, newsletterDeliveries } from '@/lib/db/schema'

export type NewsletterSourceType = 'broadcast' | 'automation'
export type NewsletterDeliveryEventType = 'delivered' | 'opened' | 'clicked' | 'bounced' | 'complained'
export type NewsletterSourceEventType = NewsletterDeliveryEventType | 'sent' | 'unsubscribed'

export const RECENT_EMAIL_ACTIVITY_LIMIT = 50
export const NEWSLETTER_DELIVERY_RETENTION_DAYS = 60

type DbExecutor = typeof db | any

async function withAdvisoryLock<T>(
  executor: DbExecutor,
  key: string,
  callback: (lockedExecutor: DbExecutor) => Promise<T>,
) {
  if (typeof executor.transaction === 'function') {
    return executor.transaction(async (tx: DbExecutor) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${key}))`)
      return callback(tx)
    })
  }

  await executor.execute(sql`select pg_advisory_xact_lock(hashtext(${key}))`)
  return callback(executor)
}

export function normalizeNewsletterStepOrder(sourceType: NewsletterSourceType, stepOrder?: number | null) {
  if (sourceType === 'broadcast') return 0
  return Math.max(1, Math.floor(Number(stepOrder) || 0))
}

export function getRecentEmailActivityKey(sourceType: NewsletterSourceType, sourceId: string, stepOrder: number) {
  return sourceType === 'automation'
    ? `${sourceType}:${sourceId}:step:${stepOrder}`
    : `${sourceType}:${sourceId}`
}

function asMetadata(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...(value as Record<string, any>) }
    : {}
}

function asActivityList(metadata: Record<string, any>) {
  return Array.isArray(metadata.recent_email_activity)
    ? metadata.recent_email_activity.filter((entry: unknown): entry is Record<string, any> => (
        !!entry && typeof entry === 'object' && !Array.isArray(entry)
      ))
    : []
}

async function updateRecentEmailActivity(
  executor: DbExecutor,
  contactId: string,
  updater: (activity: Record<string, any>[]) => Record<string, any>[],
) {
  return withAdvisoryLock(executor, `newsletter-recent-activity:${contactId}`, async (lockedExecutor) => {
    return updateRecentEmailActivityLocked(lockedExecutor, contactId, updater)
  })
}

async function updateRecentEmailActivityLocked(
  executor: DbExecutor,
  contactId: string,
  updater: (activity: Record<string, any>[]) => Record<string, any>[],
) {
  const [contact] = await executor
    .select({ metadata: newsletterContacts.metadata })
    .from(newsletterContacts)
    .where(eq(newsletterContacts.id, contactId))
    .limit(1)

  if (!contact) return

  const metadata = asMetadata(contact.metadata)
  const activity = updater(asActivityList(metadata)).slice(0, RECENT_EMAIL_ACTIVITY_LIMIT)

  await executor
    .update(newsletterContacts)
    .set({
      metadata: {
        ...metadata,
        recent_email_activity: activity,
      },
      updatedAt: new Date(),
    })
    .where(eq(newsletterContacts.id, contactId))
}

async function recordRecentEmailSent(
  executor: DbExecutor,
  input: {
    contactId: string
    sourceType: NewsletterSourceType
    sourceId: string
    stepOrder: number
    sentAt: Date
  },
) {
  const key = getRecentEmailActivityKey(input.sourceType, input.sourceId, input.stepOrder)
  await updateRecentEmailActivity(executor, input.contactId, (activity) => {
    const existing = activity.find((entry) => entry.key === key)
    const next = {
      key,
      sent_at: input.sentAt.toISOString(),
      ...(existing?.opened_at ? { opened_at: existing.opened_at } : {}),
    }

    return [next, ...activity.filter((entry) => entry.key !== key)]
  })
}

async function markRecentEmailActivity(
  executor: DbExecutor,
  input: {
    contactId: string
    sourceType: NewsletterSourceType
    sourceId: string
    stepOrder: number
    sentAt: Date
    openedAt?: Date
  },
) {
  const key = getRecentEmailActivityKey(input.sourceType, input.sourceId, input.stepOrder)
  await updateRecentEmailActivity(executor, input.contactId, (activity) => {
    const existing = activity.find((entry) => entry.key === key)
    const next = {
      key,
      sent_at: existing?.sent_at || input.sentAt.toISOString(),
      ...(input.openedAt ? { opened_at: existing?.opened_at || input.openedAt.toISOString() } : {}),
    }

    return [next, ...activity.filter((entry) => entry.key !== key)]
      .sort((a, b) => new Date(b.sent_at || 0).getTime() - new Date(a.sent_at || 0).getTime())
  })
}

export async function incrementNewsletterSourceStats(
  executor: DbExecutor,
  input: {
    siteId: string
    sourceType: NewsletterSourceType
    sourceId: string
    stepOrder?: number | null
    eventType: NewsletterSourceEventType
    occurredAt?: Date
    isDuplicateSend?: boolean
  },
) {
  const occurredAt = input.occurredAt ?? new Date()
  const stepOrder = normalizeNewsletterStepOrder(input.sourceType, input.stepOrder)
  const sent = input.eventType === 'sent' && !input.isDuplicateSend ? 1 : 0
  const delivered = input.eventType === 'delivered' ? 1 : 0
  const opened = input.eventType === 'opened' ? 1 : 0
  const clicked = input.eventType === 'clicked' ? 1 : 0
  const bounced = input.eventType === 'bounced' ? 1 : 0
  const complained = input.eventType === 'complained' ? 1 : 0
  const unsubscribed = input.eventType === 'unsubscribed' ? 1 : 0
  const duplicateSends = input.eventType === 'sent' && input.isDuplicateSend ? 1 : 0
  const firstSentAt = input.eventType === 'sent' && !input.isDuplicateSend ? occurredAt : null
  const lastSentAt = input.eventType === 'sent' ? occurredAt : null

  await executor.execute(sql`
    insert into newsletter_source_stats (
      site_id,
      source_type,
      source_id,
      step_order,
      sent,
      delivered,
      opened,
      clicked,
      bounced,
      complained,
      unsubscribed,
      duplicate_sends,
      first_sent_at,
      last_sent_at,
      last_event_at,
      updated_at
    )
    values (
      ${input.siteId}::uuid,
      ${input.sourceType},
      ${input.sourceId}::uuid,
      ${stepOrder},
      ${sent},
      ${delivered},
      ${opened},
      ${clicked},
      ${bounced},
      ${complained},
      ${unsubscribed},
      ${duplicateSends},
      ${firstSentAt},
      ${lastSentAt},
      ${occurredAt},
      now()
    )
    on conflict (site_id, source_type, source_id, step_order) do update set
      sent = newsletter_source_stats.sent + excluded.sent,
      delivered = newsletter_source_stats.delivered + excluded.delivered,
      opened = newsletter_source_stats.opened + excluded.opened,
      clicked = newsletter_source_stats.clicked + excluded.clicked,
      bounced = newsletter_source_stats.bounced + excluded.bounced,
      complained = newsletter_source_stats.complained + excluded.complained,
      unsubscribed = newsletter_source_stats.unsubscribed + excluded.unsubscribed,
      duplicate_sends = newsletter_source_stats.duplicate_sends + excluded.duplicate_sends,
      first_sent_at = case
        when excluded.first_sent_at is null then newsletter_source_stats.first_sent_at
        when newsletter_source_stats.first_sent_at is null then excluded.first_sent_at
        else least(newsletter_source_stats.first_sent_at, excluded.first_sent_at)
      end,
      last_sent_at = case
        when excluded.last_sent_at is null then newsletter_source_stats.last_sent_at
        when newsletter_source_stats.last_sent_at is null then excluded.last_sent_at
        else greatest(newsletter_source_stats.last_sent_at, excluded.last_sent_at)
      end,
      last_event_at = case
        when newsletter_source_stats.last_event_at is null then excluded.last_event_at
        else greatest(newsletter_source_stats.last_event_at, excluded.last_event_at)
      end,
      updated_at = now()
  `)
}

export async function recordNewsletterDeliverySent(
  executor: DbExecutor,
  input: {
    siteId: string
    contactId: string
    sourceType: NewsletterSourceType
    sourceId: string
    stepOrder?: number | null
    providerMessageId: string
    sentAt?: Date
  },
) {
  const sentAt = input.sentAt ?? new Date()
  const stepOrder = normalizeNewsletterStepOrder(input.sourceType, input.stepOrder)
  const lockKey = [
    'newsletter-delivery-sent',
    input.siteId,
    input.contactId,
    input.sourceType,
    input.sourceId,
    stepOrder,
  ].join(':')

  return withAdvisoryLock(executor, lockKey, async (lockedExecutor) => {
    return recordNewsletterDeliverySentLocked(lockedExecutor, input, sentAt, stepOrder)
  })
}

async function recordNewsletterDeliverySentLocked(
  executor: DbExecutor,
  input: {
    siteId: string
    contactId: string
    sourceType: NewsletterSourceType
    sourceId: string
    providerMessageId: string
  },
  sentAt: Date,
  stepOrder: number,
) {
  const [existingDeliveryForContact] = await executor
    .select({ id: newsletterDeliveries.id })
    .from(newsletterDeliveries)
    .where(and(
      eq(newsletterDeliveries.siteId, input.siteId),
      eq(newsletterDeliveries.contactId, input.contactId),
      eq(newsletterDeliveries.sourceType, input.sourceType),
      eq(newsletterDeliveries.sourceId, input.sourceId),
      eq(newsletterDeliveries.stepOrder, stepOrder),
    ))
    .limit(1)

  const isDuplicateSend = !!existingDeliveryForContact
  const [inserted] = await executor
    .insert(newsletterDeliveries)
    .values({
      siteId: input.siteId,
      contactId: input.contactId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      stepOrder,
      providerMessageId: input.providerMessageId,
      isDuplicateSend,
      sentAt,
      lastEventAt: sentAt,
    })
    .onConflictDoNothing()
    .returning({ id: newsletterDeliveries.id })

  if (!inserted) return { inserted: false, isDuplicateSend }

  await incrementNewsletterSourceStats(executor, {
    siteId: input.siteId,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    stepOrder,
    eventType: 'sent',
    occurredAt: sentAt,
    isDuplicateSend,
  })

  if (!isDuplicateSend) {
    await recordRecentEmailSent(executor, {
      contactId: input.contactId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      stepOrder,
      sentAt,
    })
  }

  return { inserted: true, isDuplicateSend }
}

export async function recordNewsletterDeliveryEvent(
  executor: DbExecutor,
  input: {
    siteId: string
    providerMessageId: string
    eventType: NewsletterDeliveryEventType
    occurredAt?: Date
    linkUrl?: string | null
  },
) {
  return withAdvisoryLock(executor, `newsletter-delivery-event:${input.siteId}:${input.providerMessageId}`, async (lockedExecutor) => {
    return recordNewsletterDeliveryEventLocked(lockedExecutor, input)
  })
}

async function recordNewsletterDeliveryEventLocked(
  executor: DbExecutor,
  input: {
    siteId: string
    providerMessageId: string
    eventType: NewsletterDeliveryEventType
    occurredAt?: Date
    linkUrl?: string | null
  },
) {
  const occurredAt = input.occurredAt ?? new Date()
  const [delivery] = await executor
    .select()
    .from(newsletterDeliveries)
    .where(and(
      eq(newsletterDeliveries.siteId, input.siteId),
      eq(newsletterDeliveries.providerMessageId, input.providerMessageId),
    ))
    .limit(1)

  if (!delivery) return { matched: false as const, counted: false as const, delivery: null }

  const sourceType = delivery.sourceType as NewsletterSourceType
  const counted =
    (input.eventType === 'delivered' && !delivery.deliveredAt)
    || (input.eventType === 'opened' && !delivery.firstOpenedAt)
    || (input.eventType === 'clicked' && !delivery.firstClickedAt)
    || (input.eventType === 'bounced' && !delivery.bouncedAt)
    || (input.eventType === 'complained' && !delivery.complainedAt)

  const updates: Partial<typeof newsletterDeliveries.$inferInsert> = {
    lastEventAt: occurredAt,
    updatedAt: new Date(),
  }

  if (input.eventType === 'delivered' && !delivery.deliveredAt) updates.deliveredAt = occurredAt
  if (input.eventType === 'opened') {
    if (!delivery.firstOpenedAt) updates.firstOpenedAt = occurredAt
    updates.lastOpenedAt = occurredAt
  }
  if (input.eventType === 'clicked') {
    if (!delivery.firstClickedAt) updates.firstClickedAt = occurredAt
    updates.lastClickedAt = occurredAt
    if (input.linkUrl) updates.lastClickedUrl = input.linkUrl
  }
  if (input.eventType === 'bounced' && !delivery.bouncedAt) updates.bouncedAt = occurredAt
  if (input.eventType === 'complained' && !delivery.complainedAt) updates.complainedAt = occurredAt

  await executor
    .update(newsletterDeliveries)
    .set(updates)
    .where(eq(newsletterDeliveries.id, delivery.id))

  if (counted) {
    await incrementNewsletterSourceStats(executor, {
      siteId: delivery.siteId,
      sourceType,
      sourceId: delivery.sourceId,
      stepOrder: delivery.stepOrder,
      eventType: input.eventType,
      occurredAt,
    })
  }

  if (delivery.contactId && counted && (input.eventType === 'opened' || input.eventType === 'clicked')) {
    await markRecentEmailActivity(executor, {
      contactId: delivery.contactId,
      sourceType,
      sourceId: delivery.sourceId,
      stepOrder: delivery.stepOrder,
      sentAt: delivery.sentAt,
      openedAt: occurredAt,
    })
  }

  return { matched: true as const, counted, delivery }
}

export async function recordNewsletterUnsubscribe(
  executor: DbExecutor,
  input: {
    siteId: string
    contactId: string
    sourceType: NewsletterSourceType
    sourceId: string
    stepOrder?: number | null
    occurredAt?: Date
  },
) {
  const occurredAt = input.occurredAt ?? new Date()
  const stepOrder = normalizeNewsletterStepOrder(input.sourceType, input.stepOrder)

  await incrementNewsletterSourceStats(executor, {
    siteId: input.siteId,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    stepOrder,
    eventType: 'unsubscribed',
    occurredAt,
  })

  const [delivery] = await executor
    .select({ id: newsletterDeliveries.id, unsubscribedAt: newsletterDeliveries.unsubscribedAt })
    .from(newsletterDeliveries)
    .where(and(
      eq(newsletterDeliveries.siteId, input.siteId),
      eq(newsletterDeliveries.contactId, input.contactId),
      eq(newsletterDeliveries.sourceType, input.sourceType),
      eq(newsletterDeliveries.sourceId, input.sourceId),
      eq(newsletterDeliveries.stepOrder, stepOrder),
    ))
    .orderBy(desc(newsletterDeliveries.sentAt))
    .limit(1)

  if (delivery && !delivery.unsubscribedAt) {
    await executor
      .update(newsletterDeliveries)
      .set({ unsubscribedAt: occurredAt, lastEventAt: occurredAt, updatedAt: new Date() })
      .where(eq(newsletterDeliveries.id, delivery.id))
  }
}

export function buildRecentEmailOpenCondition(
  times: number | string,
  operator: 'has_opened' | 'hasnt_opened',
): SQL {
  const limit = Math.min(RECENT_EMAIL_ACTIVITY_LIMIT, Math.max(1, Math.floor(Number(times) || 1)))
  const activity = sql`
    case
      when jsonb_typeof(${newsletterContacts.metadata}->'recent_email_activity') = 'array'
      then ${newsletterContacts.metadata}->'recent_email_activity'
      else '[]'::jsonb
    end
  `
  const hasOpened = sql`exists (
    select 1
    from jsonb_array_elements(${activity}) with ordinality as recent_email(entry, position)
    where recent_email.position <= ${limit}
      and nullif(recent_email.entry->>'opened_at', '') is not null
  )`

  return operator === 'has_opened' ? hasOpened : sql`not ${hasOpened}`
}
