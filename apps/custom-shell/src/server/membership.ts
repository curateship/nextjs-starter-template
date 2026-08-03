import { desc, gte, sql } from "drizzle-orm"

import { loadRevenueSummary, type RevenueSummary } from "@/server/accounts"
import { db, type CustomShellDb } from "@/server/db"
import { listDisputes, type DisputeList } from "@/server/disputes"
import { isPaidPlan, listPlans } from "@/server/plans"
import { customShellUsers } from "@/server/schema"
import {
  countFailedPayments,
  listRecentSubscriptionEvents,
} from "@/server/subscription-events"
import { now } from "@/server/security"

/**
 * The numbers behind /admin/membership — the one page for members and money,
 * since the separate Revenue page was folded into it. Nothing here is new data:
 * every figure is read from the same tables the Users and Plans pages read, so a
 * tile and the page it links to can never disagree.
 *
 * Nothing in this app keeps history — there is no snapshot table — so the only
 * "last month" figures that exist are the ones that can be counted back from a
 * date already on the row. That is when somebody signed up, and nothing else.
 * Every other card here is today's picture, and says so.
 */

/** One live plan and how many people are on it right now. */
export type MembershipPlanRow = {
  planId: string
  planName: string
  isPaid: boolean
  people: number
  monthlyCents: number
}

/** People who joined in one calendar month, beside the same month a year ago. */
export type MembershipSignupPoint = {
  /** "Jan", "Feb", … — the month this point is for. */
  month: string
  thisYear: number
  lastYear: number
}

/** People who joined on one day of the month, beside the same day last month. */
export type MembershipSignupDay = {
  /** The day of the month, as a plain number. */
  day: string
  thisMonth: number
  lastMonth: number
}

/**
 * One thing that happened to somebody's membership: a billing event, or a new
 * account. Both go in the same list because they are the same story read in
 * order — somebody joined, then started a trial, then paid.
 */
export type MembershipActivityItem = {
  id: string
  /** A billing event kind, or `joined` for a new account. */
  kind: string
  /**
   * Whose membership it was. Never blank: both reads behind this join to the
   * account, and deleting an account takes its events with it.
   */
  personName: string
  /** The plan it was about, as it was named at the time. Null for a signup. */
  planName: string | null
  detail: string | null
  /** `app` is the app itself noticing a signup; the other two are billing. */
  source: "stripe" | "admin" | "app"
  createdAt: string
}

/** How many rows the activity feed asks for and shows. */
const ACTIVITY_ROWS = 12

/** How far back the failed-payment warning looks. */
const FAILED_PAYMENT_DAYS = 7

export type MembershipSummary = {
  /** Everything the old Revenue page showed, unchanged. */
  revenue: RevenueSummary
  admins: number
  members: number
  suspended: number
  /** Accounts asked to be deleted that have not been erased yet. */
  pendingDeletion: number
  /** Live plans, and how many of those cost money. */
  livePlans: number
  paidPlans: number
  /**
   * Who is on which plan. Unlike the Revenue page this counts the free plan
   * too, so the numbers add up to every account in the app.
   */
  planMembership: MembershipPlanRow[]
  /** The last twelve months of joining, against the same months a year before. */
  signupsByMonth: MembershipSignupPoint[]
  /** This month's joining day by day, against the same days last month. */
  signupsByDay: MembershipSignupDay[]
  /** How many joined this calendar month, and last. */
  newThisMonth: number
  newLastMonth: number
  /** Accounts that existed at the end of last month, for the change figure. */
  accountsLastMonth: number
  /** Revenue a month divided by the people paying it. Zero when nobody is. */
  arpuCents: number
}

export async function loadMembershipSummary(
  database: CustomShellDb = db
): Promise<MembershipSummary> {
  const today = now()

  // Four reads at once. The database answers in a second or two from a laptop,
  // so running them one after another would be the whole page's wait.
  const [revenue, [accountCounts], plans, signupRows] = await Promise.all([
    loadRevenueSummary(database),
    database
      .select({
        admins: sql<number>`count(*) filter (where ${customShellUsers.role} = 'admin')`,
        suspended: sql<number>`count(*) filter (where ${customShellUsers.status} = 'suspended')`,
        // A third count on the pass the other two already make, rather than a
        // fourth query — this table is read once and answers all three.
        pendingDeletion: sql<number>`count(*) filter (where ${customShellUsers.status} = 'pending_deletion')`,
      })
      .from(customShellUsers),
    listPlans(database),
    // Every day anybody joined on, back as far as the chart reaches. Grouping
    // by day rather than month costs one row per day people signed up and
    // answers both views of the chart from a single read — the months are these
    // same rows added up.
    //
    // `at time zone 'UTC'` is not decoration: bare `extract` reads the
    // database session's own timezone, so on a server that is not set to UTC
    // the months and days would land in different buckets than the ones built
    // from UTC below, and the chart would quietly be off by a day.
    database
      .select({
        year: sql<number>`extract(year from (${customShellUsers.createdAt} at time zone 'UTC'))`,
        month: sql<number>`extract(month from (${customShellUsers.createdAt} at time zone 'UTC'))`,
        day: sql<number>`extract(day from (${customShellUsers.createdAt} at time zone 'UTC'))`,
        people: sql<number>`count(*)`,
      })
      .from(customShellUsers)
      .where(gte(customShellUsers.createdAt, chartWindowStart(today)))
      .groupBy(
        sql`extract(year from (${customShellUsers.createdAt} at time zone 'UTC'))`,
        sql`extract(month from (${customShellUsers.createdAt} at time zone 'UTC'))`,
        sql`extract(day from (${customShellUsers.createdAt} at time zone 'UTC'))`
      ),
  ])

  const admins = Number(accountCounts?.admins ?? 0)
  const livePlans = plans.filter((plan) => plan.active)
  const paidBreakdown = new Map(
    revenue.planBreakdown.map((row) => [row.planId, row])
  )
  // Anyone without a live paid subscription is on the free plan, whether or not
  // they have a subscription row at all.
  const unsubscribed = Math.max(0, revenue.totalUsers - revenue.paidSubscribers)

  const joined = buildSignupHistory(signupRows, today)

  return {
    revenue,
    admins,
    // Everyone who is not an admin, so the two always add up to the account
    // total the Users page shows.
    members: Math.max(0, revenue.totalUsers - admins),
    suspended: Number(accountCounts?.suspended ?? 0),
    pendingDeletion: Number(accountCounts?.pendingDeletion ?? 0),
    livePlans: livePlans.length,
    paidPlans: livePlans.filter(isPaidPlan).length,
    planMembership: livePlans.map((plan) => {
      const paid = paidBreakdown.get(plan.id)
      return {
        planId: plan.id,
        planName: plan.name,
        isPaid: isPaidPlan(plan),
        people: (paid?.subscribers ?? 0) + (plan.isDefault ? unsubscribed : 0),
        monthlyCents: paid?.monthlyCents ?? 0,
      }
    }),
    ...joined,
    // Everybody who had joined by the end of last month is everybody, minus
    // the people who joined this month. Taken from the total the Revenue
    // summary already counted, so the chart's own query can stay bounded to
    // the window it draws.
    accountsLastMonth: Math.max(0, revenue.totalUsers - joined.newThisMonth),
    arpuCents: revenue.paidSubscribers
      ? Math.round(revenue.monthlyRecurringCents / revenue.paidSubscribers)
      : 0,
  }
}

/**
 * Everything the Membership page draws: the summary above, plus the money
 * detail only that page shows.
 *
 * Kept apart from `MembershipSummary` on purpose. The Overview reads the
 * summary too, and it shows none of this — folding these in would have made
 * that page pay for three reads it throws away, on the one code path with the
 * least room to spare for them.
 */
export type MembershipPage = MembershipSummary & {
  /** Chargebacks: the open ones, the recent ones, and how many ever. */
  disputes: DisputeList
  /** Payments Stripe could not take in the last week. */
  failedPayments: number
  /** The newest billing events and signups together, newest first. */
  activity: MembershipActivityItem[]
}

export async function loadMembershipPage(
  database: CustomShellDb = db
): Promise<MembershipPage> {
  const summary = await loadMembershipSummary(database)

  // Waves, not one big `Promise.all`, and after the summary rather than beside
  // it. The pool gives out past about five reads in flight; the summary is four
  // of them and `listDisputes` is three of its own, so disputes go alone and
  // the two cheap reads follow together.
  const disputes = await listDisputes(database)
  const [events, signups] = await Promise.all([
    listRecentSubscriptionEvents(ACTIVITY_ROWS, database),
    database
      .select({
        id: customShellUsers.id,
        name: customShellUsers.name,
        createdAt: customShellUsers.createdAt,
      })
      .from(customShellUsers)
      .orderBy(desc(customShellUsers.createdAt))
      .limit(ACTIVITY_ROWS),
  ])
  const failedPayments = await countFailedPayments(
    FAILED_PAYMENT_DAYS,
    database,
    now()
  )

  return {
    ...summary,
    disputes,
    failedPayments,
    activity: buildActivity(events, signups),
  }
}

/**
 * The two streams woven into one list, newest first.
 *
 * Each side asks for the same number of rows and the merged list is cut back to
 * that number, so a quiet week of billing does not push the signups off the
 * bottom, and a busy one does not bury them.
 */
function buildActivity(
  events: Awaited<ReturnType<typeof listRecentSubscriptionEvents>>,
  signups: { id: string; name: string; createdAt: Date }[]
): MembershipActivityItem[] {
  const billing: MembershipActivityItem[] = events.map((event) => ({
    id: event.id,
    kind: event.kind,
    personName: event.personName,
    planName: event.planName,
    detail: event.detail,
    source: event.source,
    createdAt: event.createdAt,
  }))

  const joined: MembershipActivityItem[] = signups.map((person) => ({
    // Prefixed because the account's id is not the event's id — the same
    // account will show up again the moment it starts paying for something.
    id: `joined-${person.id}`,
    kind: "joined",
    personName: person.name,
    planName: null,
    detail: null,
    source: "app",
    createdAt: person.createdAt.toISOString(),
  }))

  return [...billing, ...joined]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, ACTIVITY_ROWS)
}

/**
 * The oldest date the chart can draw: the twelve months it shows, plus the
 * twelve before that, because each month is put beside the same month a year
 * earlier. Reading further back would be rows nothing plots.
 */
function chartWindowStart(today: Date) {
  return new Date(Date.UTC(today.getUTCFullYear() - 2, today.getUTCMonth(), 1))
}

type SignupRow = { year: number; month: number; day: number; people: number }

/**
 * Turns "how many joined on each day, ever" into the two views the chart
 * offers: the twelve months ending this one against the same months a year
 * earlier, and this month day by day against the same days last month.
 *
 * `accountsLastMonth` counts everybody who had joined by the end of last month.
 * Deleting an account removes the row, so a month that has since lost people
 * reads lower than it did at the time — there is nothing left to count them by.
 */
function buildSignupHistory(rows: SignupRow[], today: Date) {
  const byDay = new Map<string, number>()
  const byMonth = new Map<string, number>()

  for (const row of rows) {
    const year = Number(row.year)
    const month = Number(row.month)
    const people = Number(row.people)
    byDay.set(`${year}-${month}-${Number(row.day)}`, people)
    byMonth.set(
      `${year}-${month}`,
      (byMonth.get(`${year}-${month}`) ?? 0) + people
    )
  }

  const monthAt = (date: Date) =>
    byMonth.get(`${date.getUTCFullYear()}-${date.getUTCMonth() + 1}`) ?? 0
  const dayAt = (date: Date, day: number) =>
    byDay.get(
      `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}-${day}`
    ) ?? 0

  const thisMonth = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)
  )
  const lastMonth = new Date(
    Date.UTC(thisMonth.getUTCFullYear(), thisMonth.getUTCMonth() - 1, 1)
  )
  const monthName = new Intl.DateTimeFormat("en-US", {
    month: "short",
    timeZone: "UTC",
  })

  const signupsByMonth: MembershipSignupPoint[] = []
  for (let back = 11; back >= 0; back -= 1) {
    const month = new Date(
      Date.UTC(thisMonth.getUTCFullYear(), thisMonth.getUTCMonth() - back, 1)
    )
    const yearBefore = new Date(
      Date.UTC(month.getUTCFullYear() - 1, month.getUTCMonth(), 1)
    )
    signupsByMonth.push({
      month: monthName.format(month),
      thisYear: monthAt(month),
      lastYear: monthAt(yearBefore),
    })
  }

  // Only as far as today: the rest of the month has not happened, and drawing
  // it as zero would read as "nobody joined" rather than "not yet".
  const signupsByDay: MembershipSignupDay[] = []
  for (let day = 1; day <= today.getUTCDate(); day += 1) {
    signupsByDay.push({
      day: String(day),
      thisMonth: dayAt(thisMonth, day),
      lastMonth: dayAt(lastMonth, day),
    })
  }

  return {
    signupsByMonth,
    signupsByDay,
    newThisMonth: monthAt(thisMonth),
    newLastMonth: monthAt(lastMonth),
  }
}
