import { and, count, eq, isNotNull, notInArray, type SQL } from "drizzle-orm"

import {
  isAudienceKind,
  type AutomationAudienceKind,
} from "@/lib/automations/nodes/audience"
import { db, type CustomShellDb } from "@/server/db"
import { activeSubscriptionCondition } from "@/server/entitlements"
import {
  customShellPlans,
  customShellSubscriptions,
  customShellUsers,
} from "@/server/schema"
import { now } from "@/server/security"

/**
 * Who a flow is about, worked out fresh every single time.
 *
 * The flow stores the *choice* — everyone, confirmed members, paying members,
 * one plan — and never the people. That is the whole point of the node: a
 * member who cancelled yesterday is not in today's run, and nobody had to
 * remember to take them off a list.
 *
 * The compiled flow a run carries (`config_snapshot`) already holds this
 * choice, so a later send-style step reads it from there and asks again rather
 * than being handed a list that has since gone stale.
 */
export type AutomationAudience = {
  kind: AutomationAudienceKind
  /** The plan's short id, and "" for every kind except "plan". */
  planSlug: string
}

/** Thrown when a flow points at a plan that no longer exists. */
export class MissingAudiencePlanError extends Error {
  constructor(planSlug: string) {
    super(
      `No plan with the id "${planSlug}" exists any more, so this step cannot work out who it means.`
    )
    this.name = "MissingAudiencePlanError"
  }
}

/**
 * Reads a saved node's settings as an audience.
 *
 * Deliberately refuses rather than falling back. Every wrong answer this could
 * give is a *wider* audience than the flow asked for, and the whole point of
 * the node is that it is never wider than you said. Nothing valid can land here
 * anyway — a run only ever walks a flow the compiler has already accepted — so
 * an unreadable choice means something is genuinely wrong and the run should
 * stop and say so.
 */
export function readAutomationAudience(
  settings: Record<string, unknown>
): AutomationAudience {
  if (!isAudienceKind(settings.audience)) {
    throw new Error(
      "This step does not say who the flow is about, so it cannot go ahead."
    )
  }
  const kind = settings.audience
  const planSlug =
    kind === "plan" && typeof settings.planSlug === "string"
      ? settings.planSlug.trim()
      : ""
  return { kind, planSlug }
}

/**
 * Two kinds of account are never in an audience, whatever the choice says:
 * somebody who has been suspended, and somebody whose account is on its way out
 * because they asked to close it. Neither should be hearing from us.
 */
const EXCLUDED_STATUSES = ["suspended", "pending_deletion"]

/**
 * The database condition for one audience, joined against subscriptions and
 * plans by the callers below.
 */
function audienceCondition(
  audience: AutomationAudience,
  planId: string | null,
  timestamp: Date
): SQL {
  const filters: SQL[] = [
    notInArray(customShellUsers.status, EXCLUDED_STATUSES),
  ]

  if (audience.kind === "registered") {
    filters.push(isNotNull(customShellUsers.emailVerifiedAt))
  }

  if (audience.kind === "paying" || audience.kind === "plan") {
    // A subscription with no plan buys nothing, so it does not count as paying
    // whatever its status says.
    filters.push(isNotNull(customShellSubscriptions.planId))
    filters.push(activeSubscriptionCondition(timestamp))
  }

  if (audience.kind === "plan") {
    // Without the plan this would silently become "every paying member" — a far
    // bigger group than the flow asked for. Refuse instead; this is the same
    // refusal `requireAudiencePlan` already makes, kept here so no future
    // caller can reach the query without a plan.
    if (!planId) throw new MissingAudiencePlanError(audience.planSlug)
    filters.push(eq(customShellSubscriptions.planId, planId))
  }

  return and(...filters) as SQL
}

/** The plan row a "one plan" audience points at, refusing a slug nothing answers. */
async function requireAudiencePlan(
  audience: AutomationAudience,
  database: CustomShellDb
): Promise<string | null> {
  if (audience.kind !== "plan") return null

  const [plan] = await database
    .select({ id: customShellPlans.id })
    .from(customShellPlans)
    .where(eq(customShellPlans.slug, audience.planSlug))
    .limit(1)

  // Matching nobody and meaning nobody look identical from the outside, and the
  // difference matters when the next step is a send. Say so instead.
  if (!plan) throw new MissingAudiencePlanError(audience.planSlug)
  return plan.id
}

/**
 * How many accounts match right now.
 *
 * A count rather than the rows, because that is what a run records and what the
 * inspector shows. The step that finally sends something asks for the people
 * themselves, through the same condition, at the moment it sends.
 */
export async function countAutomationAudience(
  audience: AutomationAudience,
  database: CustomShellDb = db,
  timestamp: Date = now()
): Promise<number> {
  const planId = await requireAudiencePlan(audience, database)

  const [row] = await database
    .select({ total: count() })
    .from(customShellUsers)
    .leftJoin(
      customShellSubscriptions,
      eq(customShellSubscriptions.userId, customShellUsers.id)
    )
    .where(audienceCondition(audience, planId, timestamp))

  return row?.total ?? 0
}
