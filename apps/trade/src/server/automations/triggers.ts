import { and, asc, eq, gt, isNotNull, lte, sql } from "drizzle-orm"

import {
  automationCompiledConfigSchema,
  type AutomationCompiledConfig,
} from "@/lib/automations/compile"
import {
  automationEntryNodeId,
  automationTriggerKind,
  type AutomationTriggerFacts,
} from "@/lib/automations/run"
import {
  billingMomentNode,
  isBillingMoment,
  readTrialDaysBefore,
} from "@/lib/automations/nodes/billing-moment"
import type { MemberEvent } from "@/lib/automations/nodes/member-event"
import { readAutomationsPaused } from "@/server/automations/pause"
import type { CardExpiryWarning } from "@/server/billing/stripe"
import { db, type CustomShellDb } from "@/server/db"
import {
  customShellAutomationRuns,
  customShellAutomationMemberEventEnrollments,
  customShellAutomations,
  customShellPlans,
  customShellSubscriptions,
  customShellUsers,
  type CustomShellAutomationRun,
} from "@/server/schema"
import { now, uuid } from "@/server/auth/security"

/**
 * How a flow starts by itself.
 *
 * Three rules run through everything here, and they are the whole reason this
 * file exists rather than each trigger doing its own thing.
 *
 * - **A live flow only.** A flow that has not been switched on ignores every
 *   event, whatever is drawn on it. Off is the default, so nothing anybody is
 *   still building can act on real members.
 * - **Once, whatever happens.** Every run carries the one thing it was started
 *   for — a failed invoice, a trial's end date, a card in a billing period —
 *   and the database refuses a second run for the same flow and the same thing.
 *   A webhook delivered twice, a scan run twice and two servers scanning at the
 *   same instant all end up with one run.
 * - **The member is the subject.** The flow belongs to an admin; the run is
 *   about somebody else, and every step after the trigger reads them off the
 *   run rather than working them out again.
 */

/** A live flow that begins with the trigger being asked about. */
type WatchingFlow = {
  automationId: string
  /** The site the flow belongs to, and therefore the site its runs are for. */
  workspaceId: string
  /** The admin who wrote it, empty once they are gone — never the person the run is about. */
  userId: string | null
  config: AutomationCompiledConfig
  entryNodeId: string
  /** The trigger node's own settings, already strict-parsed at compile time. */
  settings: Record<string, unknown>
}

/** One thing that happened to one member. */
export type AutomationTriggerEvent = {
  subjectUserId: string
  /** When known, only flows from the member's own site may see this event. */
  workspaceId?: string
  /** Set only for lifecycle events whose once-only memory outlives run history. */
  memberEvent?: MemberEvent
  /** Name and address as they read today, kept so a deleted account still has a history. */
  subjectLabel: string
  /**
   * What makes this moment this moment, and nothing else. The trigger kind is
   * added on the way in, so two kinds of trigger can never collide on a key —
   * and where one kind covers several moments, the key names its own.
   */
  key: string
  facts: AutomationTriggerFacts
}

/** The longest a stored key may be, matching the column. */
const TRIGGER_KEY_MAX = 200
const SUBJECT_LABEL_MAX = 200

/**
 * A cap on how many members one scan may start flows for.
 *
 * Not a rate limit — it is the blast radius. Something wrong with the data, or
 * a flow switched on against a list far bigger than whoever drew it imagined,
 * should be a hundred runs to look at and undo rather than thousands of emails
 * already gone. Anything skipped is logged, out loud, rather than dropped
 * quietly.
 *
 * Both scans take the most urgent first — the trial closest to ending, the plan
 * closest to renewing — which is what stops the cap becoming a permanent
 * ceiling. Those are the ones that leave the window soonest, and the next lot
 * move up behind them.
 */
const SCAN_SUBJECT_LIMIT = 100

/** How a person reads in a run's history. */
export function automationSubjectLabel(
  user: Pick<typeof customShellUsers.$inferSelect, "name" | "email">
): string {
  const name = user.name.trim()
  const label = name ? `${name} (${user.email})` : user.email
  return label.slice(0, SUBJECT_LABEL_MAX)
}

/**
 * Every live flow that begins with this trigger and is set to the thing that
 * just happened.
 *
 * The kind alone is not enough: one trigger node covers several moments and
 * says which in its settings, so `matches` is how a caller asks for the flows
 * watching *its* moment rather than all of them.
 *
 * A stored config that cannot be read is skipped rather than thrown over: one
 * unreadable flow must not stop a webhook or a look from starting the others.
 */
async function listFlowsWatching(
  kind: string,
  matches: (settings: Record<string, unknown>) => boolean,
  database: CustomShellDb = db,
  workspaceId?: string
): Promise<WatchingFlow[]> {
  const rows = await database
    .select({
      id: customShellAutomations.id,
      workspaceId: customShellAutomations.workspaceId,
      userId: customShellAutomations.userId,
      compiledConfig: customShellAutomations.compiledConfig,
    })
    .from(customShellAutomations)
    .where(
      and(
        eq(customShellAutomations.enabled, true),
        isNotNull(customShellAutomations.compiledConfig),
        workspaceId
          ? eq(customShellAutomations.workspaceId, workspaceId)
          : undefined
      )
    )

  const watching: WatchingFlow[] = []
  for (const row of rows) {
    const parsed = automationCompiledConfigSchema.safeParse(row.compiledConfig)
    if (!parsed.success) continue
    const config = parsed.data
    if (automationTriggerKind(config) !== kind) continue

    const entryNodeId = automationEntryNodeId(config)
    const entry = entryNodeId ? config.nodes[entryNodeId] : undefined
    if (!entryNodeId || !entry) continue
    if (!matches(entry.settings)) continue

    watching.push({
      automationId: row.id,
      workspaceId: row.workspaceId,
      userId: row.userId,
      config,
      entryNodeId,
      settings: entry.settings,
    })
  }
  return watching
}

/**
 * Starts one flow for one member, unless it has already been started for this
 * exact moment.
 *
 * The guard is the unique index on (automation, trigger key), not a read
 * followed by a write — two servers reaching this line at the same instant both
 * insert, and the database keeps one. Returns null when the other one won.
 */
async function startTriggeredRun(
  flow: WatchingFlow,
  kind: string,
  event: AutomationTriggerEvent,
  database: CustomShellDb = db,
  timestamp: Date = now()
): Promise<CustomShellAutomationRun | null> {
  if (event.memberEvent) {
    const [enrolled] = await database
      .insert(customShellAutomationMemberEventEnrollments)
      .values({
        automationId: flow.automationId,
        userId: event.subjectUserId,
        event: event.memberEvent,
        startedAt: timestamp,
      })
      .onConflictDoNothing()
      .returning({
        automationId: customShellAutomationMemberEventEnrollments.automationId,
      })
    if (!enrolled) return null
  }

  const [run] = await database
    .insert(customShellAutomationRuns)
    .values({
      id: uuid(),
      automationId: flow.automationId,
      userId: flow.userId,
      // **The flow's site, not its author's.** This used to ask whoever wrote
      // the flow which site they were looking at right now, so an admin
      // switching site changed which customers a trigger reached — and an
      // admin who had left had no answer to give at all.
      workspaceId: flow.workspaceId,
      status: "active",
      currentNodeId: flow.entryNodeId,
      configSnapshot: flow.config,
      wakeAt: timestamp,
      attempts: 0,
      subjectUserId: event.subjectUserId,
      subjectLabel: event.subjectLabel,
      triggerKind: kind,
      triggerKey: `${kind}:${event.key}`.slice(0, TRIGGER_KEY_MAX),
      triggerFacts: event.facts,
      startedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .onConflictDoNothing()
    .returning()

  return run ?? null
}

/**
 * The webhook path: something happened to one member, right now.
 *
 * Meant to be called inside the same transaction as the change it describes, so
 * a webhook that fails half way through does not leave a flow running for
 * something that was rolled back.
 *
 * The kill switch skips the moment rather than queueing it. A payment that
 * failed while everything was paused is not chased when the pause lifts —
 * catching up would mean a burst of week-old apologies landing at once, which
 * is the opposite of what somebody pressing pause was asking for.
 */
export async function fireAutomationTrigger(
  kind: string,
  matches: (settings: Record<string, unknown>) => boolean,
  event: AutomationTriggerEvent,
  database: CustomShellDb = db
): Promise<number> {
  return database.transaction(async (tx) => {
    if (await readAutomationsPaused(tx)) return 0

    const flows = await listFlowsWatching(
      kind,
      matches,
      tx,
      event.workspaceId
    )
    let started = 0
    for (const flow of flows) {
      if (await startTriggeredRun(flow, kind, event, tx)) started += 1
    }
    return started
  })
}

/**
 * Takes the right to run a periodic look, or answers false because somebody
 * else already has it.
 *
 * One statement, and the condition is inside it: the update only lands when the
 * stored moment is old enough, so two servers ticking together cannot both
 * take the scan — the first one's write moves the timestamp and the second
 * matches nothing.
 *
 * **Deliberately not per site, even though everything around it now is.** This
 * is a rate limit on a look that already covers the whole deployment: the scans
 * read every live flow and every subscriber in one pass, and start a run for
 * each pair. So two sites watching for the same moment are both already
 * scanned. Keying this per site would run the same deployment-wide sweep once
 * per site — the same runs at the end of it, several times the work, and
 * several times the questions asked of Stripe on the card look.
 */
export async function claimTriggerScan(
  kind: string,
  everyMinutes: number,
  database: CustomShellDb = db
): Promise<boolean> {
  const claimed = await database.execute(sql`
    INSERT INTO automation_trigger_scans (kind, last_scanned_at)
    VALUES (${kind}, now())
    ON CONFLICT (kind) DO UPDATE SET last_scanned_at = now()
    WHERE automation_trigger_scans.last_scanned_at
      < now() - interval '${sql.raw(String(everyMinutes))} minutes'
    RETURNING kind
  `)
  return claimed.rows.length > 0
}

/**
 * The members whose plan the scans care about, with the person attached.
 *
 * Only accounts in good standing: somebody suspended or on their way to being
 * deleted should not be sent a friendly nudge about their trial.
 */
function subscriptionScanQuery(database: CustomShellDb) {
  return database
    .select({
      subscription: customShellSubscriptions,
      user: customShellUsers,
      planName: customShellPlans.name,
    })
    .from(customShellSubscriptions)
    .innerJoin(
      customShellUsers,
      eq(customShellUsers.id, customShellSubscriptions.userId)
    )
    .leftJoin(
      customShellPlans,
      eq(customShellPlans.id, customShellSubscriptions.planId)
    )
}

const DAY_MS = 24 * 60 * 60 * 1000

/** The whole days between now and then, rounded up — "3 days left". */
function daysUntil(target: Date, from: Date): number {
  return Math.ceil((target.getTime() - from.getTime()) / DAY_MS)
}

/**
 * Trials that have crossed into their flow's window.
 *
 * Keyed to the day the trial ends rather than to the subscription, which is
 * what makes an extended trial re-arm: moving the date makes it a different
 * moment, and the flow runs again against the new one. Leaving the date alone
 * can never fire twice, however often this looks.
 */
export async function scanTrialEndingTriggers(
  database: CustomShellDb = db,
  timestamp: Date = now()
): Promise<number> {
  const kind = billingMomentNode.kind
  const flows = await listFlowsWatching(
    kind,
    isBillingMoment("trialEnding"),
    database
  )
  if (flows.length === 0) return 0

  // The widest window any live flow asked for. Nothing outside it can matter to
  // any of them, so the database never hands back rows nobody wants.
  const widest = Math.max(
    ...flows.map((flow) => readTrialDaysBefore(flow.settings))
  )
  if (widest <= 0) return 0

  const rows = await subscriptionScanQuery(database)
    .where(
      and(
        eq(customShellSubscriptions.status, "trialing"),
        eq(customShellUsers.status, "active"),
        isNotNull(customShellSubscriptions.trialEndsAt),
        // Still to come. A trial that already ended has nothing left to warn
        // about, and firing then would read as a message sent too late.
        gt(customShellSubscriptions.trialEndsAt, timestamp),
        lte(
          customShellSubscriptions.trialEndsAt,
          new Date(timestamp.getTime() + widest * DAY_MS)
        )
      )
    )
    .orderBy(asc(customShellSubscriptions.trialEndsAt))
    .limit(SCAN_SUBJECT_LIMIT + 1)

  const considered = rows.slice(0, SCAN_SUBJECT_LIMIT)
  if (rows.length > considered.length) {
    console.warn(
      `Trial-ending scan took the ${SCAN_SUBJECT_LIMIT} trials closest to ending. The rest wait until those end and leave the window.`
    )
  }

  let started = 0
  for (const row of considered) {
    const endsAt = row.subscription.trialEndsAt
    if (!endsAt) continue
    const left = daysUntil(endsAt, timestamp)

    for (const flow of flows) {
      const daysBefore = readTrialDaysBefore(flow.settings)
      if (daysBefore <= 0 || left > daysBefore) continue

      const run = await startTriggeredRun(
        flow,
        kind,
        {
          subjectUserId: row.user.id,
          subjectLabel: automationSubjectLabel(row.user),
          key: `trialEnding:${row.subscription.id}:${endsAt.toISOString()}`,
          facts: {
            trialEndsAt: endsAt.toISOString(),
            daysLeft: left,
            planName: row.planName,
            subscriptionId: row.subscription.id,
          },
        },
        database,
        timestamp
      )
      if (run) started += 1
    }
  }
  return started
}

/**
 * Reads the card a member's plan renews on. Injectable so tests need no Stripe.
 *
 * The answer is `findExpiringCard`'s own type, imported rather than copied —
 * `import type` is erased, so this adds no runtime import and the one-way
 * direction between these two files (billing reaches for automations, never the
 * other way) is untouched.
 */
export type ExpiringCardReader = (
  subscription: typeof customShellSubscriptions.$inferSelect,
  timestamp: Date
) => Promise<CardExpiryWarning | null>

/**
 * Saved cards that will not survive the next bill.
 *
 * The detection is the member's own billing page's, not a second copy of it —
 * `findExpiringCard` compares the last day the card works against the day the
 * plan renews, and stays quiet in every case where a warning would be wrong.
 *
 * Every card here costs one question to Stripe, which is why this is a daily
 * job and why it does not run at all unless a live flow is watching for it.
 *
 * Keyed to the card and the billing period, so the same card found again
 * tomorrow starts nothing and a card swapped for another short one does.
 */
export async function scanCardExpiryTriggers(
  readCard: ExpiringCardReader,
  database: CustomShellDb = db,
  timestamp: Date = now()
): Promise<number> {
  const kind = billingMomentNode.kind
  const flows = await listFlowsWatching(
    kind,
    isBillingMoment("cardExpiring"),
    database
  )
  if (flows.length === 0) return 0

  const rows = await subscriptionScanQuery(database)
    .where(
      and(
        eq(customShellSubscriptions.source, "stripe"),
        eq(customShellUsers.status, "active"),
        eq(customShellSubscriptions.cancelAtPeriodEnd, false),
        isNotNull(customShellSubscriptions.stripeSubscriptionId),
        // A plan whose period has already run out has no next bill for a card
        // to fail on, so there is nothing here worth a question to Stripe. This
        // is not the entitlement rule in disguise — `findExpiringCard` still
        // decides that, and this only avoids paying to ask about the obvious.
        gt(customShellSubscriptions.currentPeriodEnd, timestamp)
      )
    )
    .orderBy(asc(customShellSubscriptions.currentPeriodEnd))
    .limit(SCAN_SUBJECT_LIMIT + 1)

  const considered = rows.slice(0, SCAN_SUBJECT_LIMIT)
  if (rows.length > considered.length) {
    console.warn(
      `Card-expiry scan took the ${SCAN_SUBJECT_LIMIT} plans closest to renewing. The rest wait until those renew.`
    )
  }

  let started = 0
  for (const row of considered) {
    const renewsAt = row.subscription.currentPeriodEnd
    if (!renewsAt) continue

    // One member Stripe will not answer about must not stop the rest.
    const card = await readCard(row.subscription, timestamp).catch((error) => {
      console.error(
        `Card-expiry scan could not read ${row.subscription.stripeSubscriptionId}`,
        error
      )
      return null
    })
    if (!card) continue

    for (const flow of flows) {
      const run = await startTriggeredRun(
        flow,
        kind,
        {
          subjectUserId: row.user.id,
          subjectLabel: automationSubjectLabel(row.user),
          key: `cardExpiring:${row.subscription.id}:${card.last4}:${card.expYear}-${card.expMonth}:${renewsAt.toISOString()}`,
          facts: {
            cardBrand: card.brand,
            cardLast4: card.last4,
            cardExpiresOn: `${String(card.expMonth).padStart(2, "0")}/${card.expYear}`,
            cardAlreadyExpired: card.expired,
            renewsAt: renewsAt.toISOString(),
            planName: row.planName,
            subscriptionId: row.subscription.id,
          },
        },
        database,
        timestamp
      )
      if (run) started += 1
    }
  }
  return started
}
