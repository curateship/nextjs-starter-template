import { gte, sql } from "drizzle-orm"

import { loadRevenueSummary, type RevenueSummary } from "@/server/people/accounts"
import { db, type CustomShellDb } from "@/server/db"
import { isPaidPlan, listPlans } from "@/server/billing/plans"
import { customShellUsers } from "@/server/schema"
import { now } from "@/server/auth/security"

/**
 * The member and money numbers behind the admin Overview. There was a Membership
 * page of its own once, with the Revenue page folded into it; both are gone and
 * the Overview is the only thing reading this now.
 *
 * Nothing here is new data: every figure is read from the same tables the Users
 * and Plans pages read, so a tile and the page it links to can never disagree.
 *
 * Nothing in this app keeps history — there is no snapshot table — so the only
 * "last month" figures that exist are the ones that can be counted back from a
 * date already on the row. That is when somebody signed up, and nothing else.
 * Every other figure here is today's picture, and says so.
 */

/** One live plan and how many people are on it right now. */
export type MembershipPlanRow = {
  planId: string
  planName: string
  isPaid: boolean
  people: number
}

/** People who joined on one day of the month, beside the same day last month. */
export type MembershipSignupDay = {
  /** The day of the month, as a plain number. */
  day: string
  thisMonth: number
  lastMonth: number
}

export type MembershipSummary = {
  /** Everything the old Revenue page showed, unchanged. */
  revenue: RevenueSummary
  admins: number
  members: number
  suspended: number
  /** Live plans, and how many of those cost money. */
  livePlans: number
  paidPlans: number
  /**
   * Who is on which plan. Unlike the Revenue page this counts the free plan
   * too, so the numbers add up to every account in the app.
   */
  planMembership: MembershipPlanRow[]
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
        // Both counts ride the one pass over this table rather than a query
        // each.
        suspended: sql<number>`count(*) filter (where ${customShellUsers.status} = 'suspended')`,
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
    livePlans: livePlans.length,
    paidPlans: livePlans.filter(isPaidPlan).length,
    planMembership: livePlans.map((plan) => {
      const paid = paidBreakdown.get(plan.id)
      return {
        planId: plan.id,
        planName: plan.name,
        isPaid: isPaidPlan(plan),
        people: (paid?.subscribers ?? 0) + (plan.isDefault ? unsubscribed : 0),
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
 * The oldest date the chart can draw: the first of last month. The chart shows
 * this month against last, and the only other figures read off these rows are
 * how many joined in each of those two months. Reading further back would be
 * rows nothing counts.
 *
 * It used to reach back two years, for a twelve-month view that put each month
 * beside the same month a year earlier. That view lived on the Membership page,
 * which is gone.
 */
function chartWindowStart(today: Date) {
  return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1))
}

type SignupRow = { year: number; month: number; day: number; people: number }

/**
 * Turns "how many joined on each day" into what the chart draws: this month day
 * by day against the same days last month, and the two month totals beside it.
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
    signupsByDay,
    newThisMonth: monthAt(thisMonth),
    newLastMonth: monthAt(lastMonth),
  }
}
