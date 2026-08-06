import { and, eq, gte, sql } from "drizzle-orm"

import type { PageDescriptor } from "@/lib/pages/page-descriptor"
import { pageForPath, publicPages } from "@/lib/pages/page-registry"
import {
  pageVisibility,
  type PageVisibility,
  type ShellPageOverrides,
} from "@/lib/pages/page-visibility"
import { db, type CustomShellDb } from "@/server/db"
import {
  customShellSettings,
  customShellTrafficDailyFacts,
  DEFAULT_SETTINGS_KEY,
} from "@/server/schema"
import { now } from "@/server/security"
import { parseShellGlobals, readShellGlobals } from "@/server/shell-settings"
import { OTHER_KEY, trafficDay } from "@/server/traffic"

/**
 * The Pages dashboard's one read: the page registry joined to the visit
 * counts the traffic tracker already keeps. Nothing new is recorded here —
 * the beacon writes per-address counters (`recordVisit`), and this sums them
 * for exactly the addresses the registry declares.
 */

/**
 * The one window the Visits column counts. Fixed rather than pickable — the
 * screen is "does anybody read this page", and one steady month answers it;
 * the Traffic page is where ranges are compared.
 */
export const PAGES_VISIT_DAYS = 30

export type PublicPageRow = PageDescriptor & {
  /** Views of this address over the last `PAGES_VISIT_DAYS` days. */
  visits: number
  /** Who may see it — always "everyone" for a page that cannot be switched off. */
  visibility: PageVisibility
}

export type PagesOverview = {
  /**
   * How many days the visit counts cover. Carried rather than assumed, so the
   * column heading says the window the numbers were actually summed over —
   * one number, written once, in `PAGES_VISIT_DAYS`.
   */
  visitDays: number
  /** One row per registered page, in the registry's address order. */
  rows: PublicPageRow[]
  /**
   * True when some day in the window hit the per-day address cap
   * (`FACT_KEY_CAPS.path`) and spilled the rest into the overflow bucket. A
   * page showing few visits may then have had more — the screen says so
   * rather than pretending the numbers are exact.
   */
  approximate: boolean
}

export async function loadPagesOverview(
  database: CustomShellDb = db,
  at: Date = now()
): Promise<PagesOverview> {
  const firstDay = trafficDay(
    new Date(at.getTime() - (PAGES_VISIT_DAYS - 1) * 24 * 60 * 60 * 1000)
  )
  const facts = customShellTrafficDailyFacts

  const [factRows, globals] = await Promise.all([
    database
      .select({
        key: facts.key,
        views: sql<string>`sum(${facts.views})`,
      })
      .from(facts)
      .where(and(eq(facts.dimension, "path"), gte(facts.day, firstDay)))
      .groupBy(facts.key),
    readShellGlobals(database),
  ])

  const visitsByPath = new Map(
    factRows.map((row) => [row.key, Number(row.views)])
  )

  return {
    visitDays: PAGES_VISIT_DAYS,
    // Registry first, counts second: a page nobody has visited still gets its
    // row, and an address the tracker counted but nobody declared stays off
    // the list — this screen is about the pages, not the traffic.
    rows: publicPages().map((page) => ({
      ...page,
      visits: visitsByPath.get(page.path) ?? 0,
      visibility: pageVisibility(globals.pages, page),
    })),
    approximate: visitsByPath.has(OTHER_KEY),
  }
}

/**
 * Who may see one address, for the page's own loader to act on.
 *
 * An address the registry does not know answers "everyone": this decides
 * whether a page the shell serves is hidden, and something that is not a
 * declared page is the router's business, not this setting's.
 */
export async function readPageVisibility(
  path: string,
  database: CustomShellDb = db
): Promise<PageVisibility> {
  const page = pageForPath(path)
  if (!page) return "everyone"

  const globals = await readShellGlobals(database)
  return pageVisibility(globals.pages, page)
}

/**
 * Changes who may see a page, and answers with the whole map as saved.
 *
 * Refused for a page the shell will not switch off, and for an address no page
 * declares. Both are refusals the screen already makes — repeated here because
 * the screen is not the only way in, and switching off the sign-in page would
 * lock every admin out of their own app.
 */
export async function setPageVisibility(
  {
    path,
    visibility,
  }: {
    path: string
    visibility: PageVisibility
  },
  database: CustomShellDb = db
): Promise<ShellPageOverrides> {
  const page = pageForPath(path)
  if (!page) {
    throw new Error(`There is no public page at "${path}".`)
  }
  if (!page.canSwitchOff) {
    throw new Error(
      `"${page.name}" is part of how people reach the app, so it cannot be hidden.`
    )
  }

  return database.transaction(async (tx) => {
    // Read, merge and write with the row locked, the same dance the
    // maintenance switch and the automations kill switch do: this one row
    // holds every global, so two saves landing together would each write back
    // what they read and one would lose its changes.
    const [existing] = await tx
      .select({ settings: customShellSettings.settings })
      .from(customShellSettings)
      .where(eq(customShellSettings.key, DEFAULT_SETTINGS_KEY))
      .limit(1)
      .for("update")

    const globals = parseShellGlobals(existing?.settings)
    const pages = { ...globals.pages }
    // Back to the default means no entry at all, so "never touched" and "set
    // back to normal" are one state rather than two that behave the same.
    if (visibility === "everyone") {
      delete pages[path]
    } else {
      pages[path] = { visibility }
    }

    const settings = { ...globals, pages }
    const timestamp = now()

    if (existing) {
      await tx
        .update(customShellSettings)
        .set({ settings, updatedAt: timestamp })
        .where(eq(customShellSettings.key, DEFAULT_SETTINGS_KEY))
    } else {
      await tx.insert(customShellSettings).values({
        key: DEFAULT_SETTINGS_KEY,
        settings,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
    }

    return pages
  })
}
