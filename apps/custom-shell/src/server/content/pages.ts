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
  customShellTrafficDailyFacts,
  customShellWorkspaces,
} from "@/server/schema"
import { now } from "@/server/auth/security"
import { parseWorkspaceSettings } from "@/server/people/workspaces"
import { OTHER_KEY, trafficDay } from "@/server/traffic"
import {
  findWrittenPage,
  listWrittenPages,
  normalizeWrittenPagePath,
  type WrittenPage,
} from "@/server/content/written-pages"

/**
 * The Pages dashboard's one read: every public page joined to the visit counts
 * the traffic tracker already keeps. Nothing new is recorded here — the beacon
 * writes per-address counters (`recordVisit`), and this sums them.
 *
 * "Every public page" is two lists, combined here rather than in the registry.
 * The registry is what the *code* declares; it is read by the browser and has
 * to answer the same on both sides without asking anything, so it cannot hold
 * rows from a database. Pages an admin wrote are read here, on the server,
 * where a query is fine — and from this point on the two are one list and
 * every page feature applies to both.
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
  /**
   * The row's id when an admin wrote this page, so the screen knows which ones
   * it may edit. Null for a page the code declares — those are changed by
   * changing the code.
   */
  writtenPageId: string | null
}

/**
 * A written page seen as an ordinary page. It is switchable like any other,
 * and it says it was written so the screen can offer Edit rather than leaving
 * an admin wondering why some rows can be changed and others cannot.
 */
function descriptorForWrittenPage(page: WrittenPage): PageDescriptor {
  return {
    path: page.path,
    name: page.title,
    summary: "Written in the app by an admin.",
    canSwitchOff: true,
    layout: "card",
    // `source` says whose code a page is, and a written page has no code —
    // the shell's own page-writing screen made it. So it takes the default and
    // carries no "added by this app" label, which is the truth: whichever app
    // this is, nobody added a file for it.
    source: "shell",
  }
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
  workspaceId: string,
  database: CustomShellDb = db,
  at: Date = now()
): Promise<PagesOverview> {
  const firstDay = trafficDay(
    new Date(at.getTime() - (PAGES_VISIT_DAYS - 1) * 24 * 60 * 60 * 1000)
  )
  const facts = customShellTrafficDailyFacts

  const [factRows, overrides, written] = await Promise.all([
    database
      .select({
        key: facts.key,
        views: sql<string>`sum(${facts.views})`,
      })
      .from(facts)
      // This site's visits. The counters are per site now, so without this
      // the Visits column would quietly add every site's together.
      .where(
        and(
          eq(facts.workspaceId, workspaceId),
          eq(facts.dimension, "path"),
          gte(facts.day, firstDay)
        )
      )
      .groupBy(facts.key),
    readWorkspacePageOverrides(workspaceId, database),
    listWrittenPages(workspaceId, database),
  ])

  const visitsByPath = new Map(
    factRows.map((row) => [row.key, Number(row.views)])
  )

  const rows: PublicPageRow[] = [
    // Pages first, counts second: a page nobody has visited still gets its
    // row, and an address the tracker counted but no page claims stays off the
    // list — this screen is about the pages, not the traffic.
    ...publicPages().map((page) => ({ ...page, writtenPageId: null })),
    ...written.map((page) => ({
      ...descriptorForWrittenPage(page),
      writtenPageId: page.id,
    })),
  ]
    .map((page) => ({
      ...page,
      visits: visitsByPath.get(page.path) ?? 0,
      visibility: pageVisibility(overrides, page),
    }))
    // One order for both kinds, by address, so a written page sits where its
    // address puts it rather than in a second group underneath.
    .sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0))

  return {
    visitDays: PAGES_VISIT_DAYS,
    rows,
    approximate: visitsByPath.has(OTHER_KEY),
  }
}

/**
 * Who may see one address, for the page's own loader to act on.
 *
 * Both kinds of page are asked about here. A code page is known from the
 * registry; a written page is known because a row exists, and it is always
 * switchable — so hiding one has to work, or the switch on the Pages screen
 * would be a lie for exactly the pages an admin can create themselves.
 *
 * An address neither list knows answers "everyone": this decides whether a
 * page the app serves is hidden, and something that is not a page at all is
 * the router's business, not this setting's.
 */
export async function readPageVisibility(
  workspaceId: string,
  path: string,
  database: CustomShellDb = db
): Promise<PageVisibility> {
  const codePage = pageForPath(path)
  const page = codePage ?? {
    path: normalizeWrittenPagePath(path),
    canSwitchOff: true,
  }

  // Only worth a second query when the registry did not recognise it: a code
  // page can never be a written one, because a written page cannot claim an
  // address the registry already holds.
  if (!codePage && !(await findWrittenPage(workspaceId, page.path, database))) {
    return "everyone"
  }

  return pageVisibility(
    await readWorkspacePageOverrides(workspaceId, database),
    page
  )
}

/**
 * What a visitor may be shown at a written page's address.
 *
 * **The visibility check belongs here, not in the route.** The endpoint this
 * backs is public — it has to be, or no written page would be readable — so
 * anything it hands back is readable by anyone who calls it, whatever the page
 * that normally draws it does afterwards. Looking the page up first and
 * checking second would mean a switched-off page still gave up its words to a
 * direct call, which is the whole switch defeated.
 *
 * So the body only ever leaves here when the viewer may see it. Switched off
 * is reported as missing, exactly as it looks in a browser.
 */
export type WrittenPageView =
  | { status: "missing" }
  | { status: "signIn" }
  | { status: "ok"; page: WrittenPage }

export async function readWrittenPageForViewer(
  workspaceId: string,
  path: string,
  signedIn: boolean,
  database: CustomShellDb = db
): Promise<WrittenPageView> {
  const page = await findWrittenPage(workspaceId, path, database)
  if (!page) return { status: "missing" }

  const visibility = pageVisibility(
    await readWorkspacePageOverrides(workspaceId, database),
    { path: page.path, canSwitchOff: true }
  )

  // Indistinguishable from an address nobody wrote — a page that admitted to
  // being switched off would be telling the caller it is there.
  if (visibility === "off") return { status: "missing" }
  if (visibility === "members" && !signedIn) return { status: "signIn" }

  return { status: "ok", page }
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
  workspaceId: string,
  {
    path,
    visibility,
  }: {
    path: string
    visibility: PageVisibility
  },
  database: CustomShellDb = db
): Promise<ShellPageOverrides> {
  const codePage = pageForPath(path)
  // A written page is switchable like any other; it is simply known from a row
  // rather than from a file. Looked up only when the registry does not know
  // the address, because a written page can never have claimed one it does.
  const written = codePage
    ? null
    : await findWrittenPage(workspaceId, path, database)
  const page =
    codePage ??
    (written
      ? { path: written.path, name: written.title, canSwitchOff: true }
      : null)

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
    // maintenance switch and the automations kill switch do: the site's
    // settings are one JSON column, so two saves landing together would each
    // write back what they read and one would lose its changes.
    const [existing] = await tx
      .select({ settings: customShellWorkspaces.settings })
      .from(customShellWorkspaces)
      .where(eq(customShellWorkspaces.id, workspaceId))
      .limit(1)
      .for("update")

    if (!existing) {
      throw new Error("That site no longer exists.")
    }

    const settings = parseWorkspaceSettings(existing.settings)
    const pages = { ...settings.pages }
    // Keyed by the address the page actually answers on, not by what arrived:
    // a written page's address is tidied on the way in ("/About" is "/about"),
    // and a key written in the other spelling would be saved but never read.
    const key = page.path
    // Back to the default means no entry at all, so "never touched" and "set
    // back to normal" are one state rather than two that behave the same.
    if (visibility === "everyone") {
      delete pages[key]
    } else {
      pages[key] = { visibility }
    }

    await tx
      .update(customShellWorkspaces)
      .set({ settings: { ...settings, pages }, updatedAt: now() })
      .where(eq(customShellWorkspaces.id, workspaceId))

    return pages
  })
}

/**
 * Which pages this site has switched off or made members-only.
 *
 * Its own read rather than going through `readShellSettings`, which needs a
 * person: a signed-out visitor asking whether a page is hidden has no account,
 * and the answer belongs to the domain they typed rather than to them.
 */
export async function readWorkspacePageOverrides(
  workspaceId: string,
  database: CustomShellDb = db
): Promise<ShellPageOverrides> {
  const [row] = await database
    .select({ settings: customShellWorkspaces.settings })
    .from(customShellWorkspaces)
    .where(eq(customShellWorkspaces.id, workspaceId))
    .limit(1)

  return parseWorkspaceSettings(row?.settings).pages
}
