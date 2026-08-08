import { and, asc, eq, inArray } from "drizzle-orm"

import {
  createDefaultTopRightNavigation,
  iconMeta,
  isShellItem,
  normalizeStyling,
  type IconKey,
  type ShellChildItem,
  type ShellItem,
  type ShellSection,
  type ShellStyling,
  type ShellTopRightNavigationItem,
} from "@/lib/custom-shell"
import { cleanAutomationPaletteKeys } from "@/lib/automations/node-registry"
import {
  createDefaultDashboardWidgets,
  normalizeDashboardWidgets,
  type DashboardWidgetLayout,
} from "@/lib/dashboard/dashboard-widgets"
import {
  cleanBroadcastBlockDefaults,
  type BroadcastBlock,
  type BroadcastBlockDefaults,
} from "@/lib/broadcasts/blocks"
import {
  DEFAULT_SIDEBAR_WIDTH,
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
} from "@/lib/layout/sidebar-width"
import {
  cleanCustomDomain,
  cleanSubdomain,
  customDomainProblem,
  MAX_SUBDOMAIN,
  MIN_SUBDOMAIN,
  subdomainProblem,
} from "@/lib/workspaces/addresses"
import {
  WORKSPACE_STATUSES,
  type WorkspaceStatus,
} from "@/lib/workspaces/status"
import { db, type CustomShellDb } from "@/server/db"
import {
  answerForRequest,
  dropWorkspaceCache,
  workspaceBaseDomain,
} from "@/server/workspaces/host"
import {
  customShellUsers,
  customShellWorkspaces,
  type CustomShellWorkspace,
} from "@/server/schema"
import { now, uuid } from "@/server/auth/security"

const DEFAULT_WORKSPACE_NAME = "My project"
const DEFAULT_WORKSPACE_ICON = "briefcaseBusiness"

/**
 * The two pages that used to hang off the media library. Both are gone: the
 * orphans are a choice in the library's own type filter now, and storage per
 * person is on that person's account. The ids and addresses stay so the step
 * that takes them off a saved sidebar knows what to look for.
 */
const MEDIA_STORAGE_LINK_ID = "item-media-storage"
const MEDIA_STORAGE_HREF = "/admin/media/storage"
const MEDIA_ORPHANS_LINK_ID = "item-media-orphans"
const MEDIA_ORPHANS_HREF = "/admin/media/orphans"

/**
 * The admin's front door — what needs doing, what has happened, and how the
 * app is going, above the pages that go into each of those in full.
 */
const OVERVIEW_LINK_ID = "item-admin-overview"
const OVERVIEW_HREF = "/admin/dashboard"

function overviewLink(children?: ShellChildItem[]): ShellItem {
  return {
    type: "item",
    id: OVERVIEW_LINK_ID,
    label: "Overview",
    href: OVERVIEW_HREF,
    icon: "layoutDashboard",
    visible: true,
    roles: ["admin"],
    // Only when it is handed some. `addOverviewLink` hands out a bare link and
    // the fold below fills it from the links the admin actually has, renames
    // and all — so an empty `children: []` here would be a key nothing asked
    // for, on a link that is meant to have none yet.
    ...(children ? { children } : {}),
  }
}

/**
 * The retired Membership parent. Its page is gone — the Overview shows the
 * members and the money — and Users and Plans hang off the Overview now.
 *
 * The id, the address and the two builders below stay here anyway, the same way
 * the Feeds ones did: a sidebar saved before any of this ran goes through the
 * whole chain in one pass, and the early steps still *create* this parent from
 * loose links, and anchor the Overview, AI usage and Traffic links on it,
 * before the last step takes it away again.
 */
const MEMBERSHIP_LINK_ID = "item-admin-membership"
const MEMBERSHIP_HREF = "/admin/membership"

/**
 * Kept after the link itself was retired. The Revenue page was folded into the
 * Membership page it hung under, and `removeRevenueLink` still has to recognise
 * it in a sidebar saved before that happened.
 */
const REVENUE_LINK_ID = "item-admin-revenue"
const REVENUE_HREF = "/admin/billing"

function membershipLink(children: ShellChildItem[]): ShellItem {
  return {
    type: "item",
    id: MEMBERSHIP_LINK_ID,
    label: "Membership",
    href: MEMBERSHIP_HREF,
    icon: "id-card",
    visible: true,
    roles: ["admin"],
    children,
  }
}

function membershipChildLinks(): ShellChildItem[] {
  return [
    {
      id: "item-admin-users",
      label: "Users",
      href: "/admin/users",
      icon: "users",
      roles: ["admin"],
    },
    {
      id: "item-admin-plans",
      label: "Plans",
      href: "/admin/plans",
      icon: "package",
      roles: ["admin"],
    },
  ]
}

/**
 * The ids `groupMembershipLinks` looks for, in the order they belong under
 * Membership.
 *
 * Written out rather than read off `membershipChildLinks`, because Revenue is
 * still on this list after being dropped from that one. That step runs on
 * sidebars saved back when Revenue was its own page, and it has to gather the
 * link where it finds it; `removeRevenueLink`, further down the chain, is what
 * takes it away again.
 */
const MEMBERSHIP_CHILD_IDS: readonly string[] = [
  "item-admin-users",
  "item-admin-plans",
  REVENUE_LINK_ID,
]

const AI_USAGE_LINK_ID = "item-admin-ai-usage"
const AI_USAGE_HREF = "/admin/ai"

function aiUsageLink(): ShellItem {
  return {
    type: "item",
    id: AI_USAGE_LINK_ID,
    label: "AI usage",
    href: AI_USAGE_HREF,
    icon: "sparkles",
    visible: true,
    roles: ["admin"],
  }
}

const TRAFFIC_LINK_ID = "item-admin-traffic"
const TRAFFIC_HREF = "/admin/traffic"

function trafficLink(): ShellItem {
  return {
    type: "item",
    id: TRAFFIC_LINK_ID,
    label: "Traffic",
    href: TRAFFIC_HREF,
    icon: "chart-line",
    visible: true,
    roles: ["admin"],
  }
}

const PAGES_LINK_ID = "item-admin-pages"
const PAGES_HREF = "/admin/pages"

function pagesLink(): ShellItem {
  return {
    type: "item",
    id: PAGES_LINK_ID,
    label: "Pages",
    href: PAGES_HREF,
    icon: "panelsTopLeft",
    visible: true,
    roles: ["admin"],
  }
}

/**
 * The retired Feeds parent. Its page is gone — the Overview shows what it
 * showed — and its four links hang off the Overview now.
 *
 * The id, the address and the two builders below stay here anyway, the same
 * way `AUDIT_LINK_ID` did: a sidebar saved before any of this ran through the
 * whole chain in one pass, and the second step still *creates* this parent
 * from loose links before the last step takes it away again.
 */
const FEEDS_LINK_ID = "item-admin-feeds"
const FEEDS_HREF = "/admin/feeds"

function feedsLink(children: ShellChildItem[]): ShellItem {
  return {
    type: "item",
    id: FEEDS_LINK_ID,
    label: "Feeds",
    href: FEEDS_HREF,
    icon: "rss",
    visible: true,
    roles: ["admin"],
    children,
  }
}

/**
 * The four feed links. These are the Overview's children now, and they are
 * still what the old grouping step gathers under the retired Feeds parent —
 * one list, so the two can never drift apart.
 *
 * Built fresh per call, like `membershipChildLinks`: a shared array would be
 * handed to every workspace to save into its own settings. The changelog pair
 * is deliberately not role-gated — What's new is the page a changelog notice
 * opens and everyone gets those notices, and Changelog sends anyone who cannot
 * write updates straight to it.
 */
function feedsChildLinks(): ShellChildItem[] {
  return [
    {
      id: "item-admin-announcements",
      label: "Announcements",
      href: "/admin/announcements",
      icon: "megaphone",
      roles: ["admin"],
    },
    {
      id: "item-notifications",
      label: "Notifications",
      href: "/admin/notifications",
      icon: "bell",
    },
    {
      id: "item-changelog",
      label: "Changelog",
      href: "/changelog",
      icon: "sparkles",
    },
    {
      id: "item-feedback",
      label: "Feedback",
      href: "/admin/feedback",
      icon: "messageSquarePlus",
    },
  ]
}

/** The retired Activity log link, which the upgrades below still recognise. */
const AUDIT_LINK_ID = "item-admin-audit"
const AUDIT_HREF = "/admin/audit"

/**
 * The ids and addresses the upgrade below looks for, in the order they belong
 * under Feeds — read off the links themselves so the two can never disagree.
 * The address list is there for a link an admin deleted and rebuilt by hand:
 * it carries a made-up id, but the page it points at still says what it is.
 *
 * The retired Activity log link is still on the lists so an old sidebar
 * groups exactly the way it always did — the removal step below then takes
 * that link out again.
 */
const FEEDS_CHILD_IDS: readonly string[] = [
  ...feedsChildLinks().map((child) => child.id),
  AUDIT_LINK_ID,
]
const FEEDS_CHILD_HREFS: readonly string[] = [
  ...feedsChildLinks().map((child) => child.href),
  AUDIT_HREF,
]

const AUTOMATIONS_LINK_ID = "item-automations"
const AUTOMATIONS_HREF = "/admin/automations"
const AUTOMATION_TEMPLATES_LINK_ID = "item-automation-templates"
const AUTOMATION_TEMPLATES_HREF = "/admin/automations/templates"

function automationTemplatesChildLink(): ShellChildItem {
  return {
    id: AUTOMATION_TEMPLATES_LINK_ID,
    label: "Templates",
    href: AUTOMATION_TEMPLATES_HREF,
  }
}

/** The automation canvas and the templates used to start new flows. */
const AUTOMATIONS_LINK: ShellItem = {
  type: "item",
  id: AUTOMATIONS_LINK_ID,
  label: "Automations",
  href: AUTOMATIONS_HREF,
  icon: "workflow",
  visible: true,
  roles: ["admin"],
  children: [automationTemplatesChildLink()],
}

const NEWSLETTER_LINK_ID = "item-newsletter"
const NEWSLETTER_HREF = "/admin/newsletter"
const CONTACTS_LINK_ID = "item-newsletter-contacts"
const CONTACTS_HREF = "/admin/contacts"
const SEGMENTS_LINK_ID = "item-newsletter-segments"
const SEGMENTS_HREF = "/admin/segments"
const SYSTEM_EMAILS_LINK_ID = "item-newsletter-system-emails"
const SYSTEM_EMAILS_HREF = "/admin/system-emails"

/**
 * Writing and sending a newsletter, with the list of people it goes to, the
 * named groups of them, and the app's own emails hanging off it — questions
 * always asked in the same sitting, and a parent with children is what draws
 * the row of chips along the top of the page.
 */
function newsletterChildLinks(): ShellChildItem[] {
  return [
    newsletterSelfChildLink(),
    contactsChildLink(),
    segmentsChildLink(),
    systemEmailsChildLink(),
  ]
}

// One function each rather than positions in the list above: the upgrade steps
// below reach for individual children, and a step that said "the third one"
// would quietly start meaning something else the day a fourth was added.

function newsletterSelfChildLink(): ShellChildItem {
  return {
    id: `${NEWSLETTER_LINK_ID}-all`,
    label: "Newsletters",
    href: NEWSLETTER_HREF,
  }
}

function contactsChildLink(): ShellChildItem {
  return { id: CONTACTS_LINK_ID, label: "Contacts", href: CONTACTS_HREF }
}

function segmentsChildLink(): ShellChildItem {
  return { id: SEGMENTS_LINK_ID, label: "Segments", href: SEGMENTS_HREF }
}

function systemEmailsChildLink(): ShellChildItem {
  return {
    id: SYSTEM_EMAILS_LINK_ID,
    label: "System emails",
    href: SYSTEM_EMAILS_HREF,
  }
}

function newsletterLink(): ShellItem {
  return {
    type: "item",
    id: NEWSLETTER_LINK_ID,
    label: "Newsletter",
    href: NEWSLETTER_HREF,
    icon: "mail",
    visible: true,
    roles: ["admin"],
    children: newsletterChildLinks(),
  }
}

/**
 * Bumped when the default sidebar is restructured in a way an existing
 * workspace should pick up. A workspace is brought up to this number once, ever
 * — see `applyNavigationUpgrade`.
 */
export const NAVIGATION_VERSION = 18

export type WorkspaceSettings = {
  icon: IconKey
  favicon: string
  topRightNavigation: ShellTopRightNavigationItem[]
  sections: ShellSection[]
  /** How far this workspace's saved sidebar has been brought forward. */
  navVersion: number
  // Draggable sidebar width in px, saved per-workspace.
  sidebarWidth: number
  // Visual styling (spacing, card border, backgrounds), saved per-workspace.
  styling: ShellStyling
  // Which cards the Overview dashboard draws, and where, saved per-workspace.
  dashboardWidgets: DashboardWidgetLayout
  // Starred palette nodes in the automation editor, saved per-workspace.
  automationFavoriteNodeKeys: string[]
  // How each kind of newsletter block starts out, saved per-workspace.
  broadcastBlockDefaults: BroadcastBlockDefaults
}

/**
 * The workspace this person is in, or null.
 *
 * **Reading never creates one.** This used to be `getOrCreateCurrentWorkspace`,
 * and it made a workspace whenever it could not find one — from
 * `readShellSettings`, which runs on every signed-in page load, and from every
 * newsletter and contacts call. That meant a member who never sees a workspace
 * still owned one, and any code path that asked at the wrong moment minted a
 * row. Making one is `startWorkspaceFor`, and it is called on purpose.
 *
 * Somebody pointing at nothing is ordinary, not broken: a new account is in
 * that state, and so is anybody whose workspace was deleted.
 */
export async function currentWorkspace(
  userId: string,
  database: CustomShellDb = db
) {
  const current = await findCurrentWorkspace(userId, database)
  return current ? applyNavigationUpgrade(current, database) : null
}

/**
 * The id of the workspace this person is in.
 *
 * **The one way to answer that question.** It used to be a private three-line
 * function copy-pasted into four endpoint files, each calling a read that
 * created a workspace when it missed — so the same question had four answers
 * and any of them could mint a row. One definition means one place to change
 * when a request, rather than a person, starts deciding.
 *
 * Throws rather than returning null: every signed-in person is put in a
 * workspace when they sign in, so being in none here means something upstream
 * went wrong, and scoping a query to "no workspace" would quietly read nothing.
 */
export async function currentWorkspaceId(
  userId: string,
  database: CustomShellDb = db
): Promise<string> {
  return (await requireCurrentWorkspace(userId, database)).id
}

/** The same answer as `currentWorkspaceId`, for callers that need the row. */
export async function requireCurrentWorkspace(
  userId: string,
  database: CustomShellDb = db
) {
  const workspace = await currentWorkspace(userId, database)
  if (!workspace) {
    throw new Error("No workspace")
  }
  return workspace
}

/**
 * Makes sure this person is in a workspace, and makes one if they are not.
 *
 * The deliberate counterpart to the read above. Called where a workspace
 * genuinely should come into being — signing in, and seeding a fresh database —
 * never from a page load.
 *
 * An existing workspace of theirs is adopted before a new one is made, so
 * somebody whose pointer was emptied (their workspace was deleted) lands back
 * on one they already had rather than collecting another.
 */
export async function startWorkspaceFor(
  userId: string,
  database: CustomShellDb = db
) {
  const current = await findCurrentWorkspace(userId, database)
  if (current) return applyNavigationUpgrade(current, database)

  return database.transaction(async (tx) => {
    const [existingWorkspace] = await tx
      .select()
      .from(customShellWorkspaces)
      .where(eq(customShellWorkspaces.userId, userId))
      .orderBy(asc(customShellWorkspaces.createdAt))
      .limit(1)

    if (existingWorkspace) {
      return applyNavigationUpgrade(
        await setCurrentWorkspace(userId, existingWorkspace.id, tx),
        tx
      )
    }

    const createdAt = now()
    const id = uuid()
    const [workspace] = await tx
      .insert(customShellWorkspaces)
      .values({
        id,
        userId,
        name: DEFAULT_WORKSPACE_NAME,
        subdomain: await freeSubdomain(DEFAULT_WORKSPACE_NAME, id, tx),
        settings: defaultWorkspaceSettings(),
        createdAt,
        updatedAt: createdAt,
      })
      .returning()

    if (!workspace) {
      throw new Error("Workspace was not created")
    }

    await setCurrentWorkspace(userId, workspace.id, tx)
    dropWorkspaceCache()
    return workspace
  })
}

/** The workspace switcher's list, already serialized for the browser. */
export async function readWorkspaceList(
  userId: string,
  database: CustomShellDb = db,
  options: { seesEveryWorkspace?: boolean } = {}
) {
  const { workspaces, currentWorkspaceId } = await listUserWorkspaces(
    userId,
    database,
    options
  )

  return {
    workspaces: workspaces.map((row) =>
      serializeWorkspace(row, currentWorkspaceId)
    ),
    baseDomain: workspaceBaseDomain(),
  }
}

/**
 * This person's workspaces.
 *
 * A workspace now survives the account that made it, which leaves rows nobody
 * owns — and they are deliberately **not** listed here yet. Everything that
 * reads this list is reachable by any signed-in member (`loadWorkspacesFn` is
 * `userGet`, the delete pair is `userPost`, and `/workspaces` has no admin
 * check), so including them would let a member see and delete a workspace that
 * is nobody's — taking its contacts, segments and broadcasts with it.
 *
 * Reaching an ownerless workspace belongs with the task that makes any admin
 * able to see any workspace, because that is where the admin check gets made.
 * Until then an orphan is kept and unreachable, which is the safe way round.
 */
/**
 * An address nobody is using yet, derived from the workspace's name.
 *
 * Names are not unique and "My project" is what every workspace starts as, so a
 * number goes on the end until one is free. The id's first characters stand in
 * when a name gives nothing usable — "日本語" and "!!!" both do.
 */
async function freeSubdomain(name: string, id: string, database: CustomShellDb) {
  const base =
    cleanSubdomain(name.replace(/[^a-zA-Z0-9]+/g, "-"))
      .replace(/^-+|-+$/g, "")
      .slice(0, MAX_SUBDOMAIN) || `w-${id.slice(0, 8)}`

  const taken = new Set(
    (
      await database
        .select({ subdomain: customShellWorkspaces.subdomain })
        .from(customShellWorkspaces)
    ).map((row) => row.subdomain)
  )

  const atLeastThree = base.length >= MIN_SUBDOMAIN ? base : `${base}-1`
  if (!taken.has(atLeastThree)) return atLeastThree

  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${atLeastThree.slice(0, MAX_SUBDOMAIN - 5)}-${n}`
    if (!taken.has(candidate)) return candidate
  }

  return `w-${id.slice(0, 8)}`
}

/** The address half of a workspace, as the form sends it. */
export type WorkspaceAddress = {
  subdomain: string
  customDomain: string
  status: WorkspaceStatus
}

/**
 * The address fields, checked and tidied.
 *
 * The same rules the form applies, applied again — the form is a courtesy to
 * whoever is typing, not a gate. Refusals are sentences because an admin reads
 * them and there is nothing else to turn them into.
 */
function cleanAddress(input: WorkspaceAddress): WorkspaceAddress {
  const subdomain = cleanSubdomain(input.subdomain)
  const addressProblem = subdomainProblem(subdomain)
  if (addressProblem) throw new Error(addressProblem)

  const customDomain = cleanCustomDomain(input.customDomain)
  const domainProblem = customDomainProblem(customDomain)
  if (domainProblem) throw new Error(domainProblem)

  if (!WORKSPACE_STATUSES.includes(input.status)) {
    throw new Error("That is not a state a workspace can be in.")
  }

  return { subdomain, customDomain, status: input.status }
}

/**
 * Turns the database's own complaint about a taken address into the sentence
 * the check would have given.
 *
 * The check before the write makes the message readable; the unique indexes are
 * what make it true when two admins save the same address in the same instant,
 * and the loser of that race gets Postgres's words rather than a refusal.
 */
function describeAddressClash(error: unknown, values: WorkspaceAddress) {
  const constraint =
    error && typeof error === "object" && "constraint" in error
      ? String((error as { constraint?: unknown }).constraint ?? "")
      : ""

  if (constraint === "ux_workspaces_subdomain") {
    return new Error(`Another workspace already answers on ${values.subdomain}.`)
  }
  if (constraint === "ux_workspaces_custom_domain") {
    return new Error(`Another workspace already uses ${values.customDomain}.`)
  }

  return error
}

/**
 * Points somebody at the workspace whose domain they arrived on, if any.
 *
 * Called when signing in. Somebody who went to alpha's address to sign in means
 * to work on alpha, so landing them wherever they were last is a step they then
 * have to undo. On the deployment's own address, and on an app with no base
 * domain configured, nothing resolves and their own last choice stands.
 *
 * Quiet when it cannot: a workspace that has gone, or a host belonging to
 * nobody, simply leaves the pointer alone.
 */
export async function pointAtWorkspaceForHost(
  userId: string,
  database: CustomShellDb = db
) {
  const answer = await answerForRequest(database)
  if (answer.kind !== "workspace") return

  await database
    .update(customShellUsers)
    .set({ currentWorkspaceId: answer.workspace.id, updatedAt: now() })
    .where(eq(customShellUsers.id, userId))
}

/** Which workspaces this person may act on: an admin any, anybody else theirs. */
function reachable(userId: string, seesEveryWorkspace: boolean) {
  return seesEveryWorkspace ? undefined : eq(customShellWorkspaces.userId, userId)
}

/**
 * The workspaces this person may see, and which one they are in.
 *
 * An admin sees every workspace on the deployment, because a workspace is a
 * thing the deployment has rather than one person's property — including the
 * ones nobody owns, which is how a departed admin's work stays reachable.
 * Anybody else sees only their own.
 *
 * `currentWorkspaceId` comes from the pointer on the person, so it is genuinely
 * theirs and never somebody else's idea of it.
 */
export async function listUserWorkspaces(
  userId: string,
  database: CustomShellDb = db,
  options: { seesEveryWorkspace?: boolean } = {}
) {
  const rows = await database
    .select()
    .from(customShellWorkspaces)
    .where(reachable(userId, options.seesEveryWorkspace ?? false))
    .orderBy(asc(customShellWorkspaces.createdAt))

  const [person] = await database
    .select({ currentWorkspaceId: customShellUsers.currentWorkspaceId })
    .from(customShellUsers)
    .where(eq(customShellUsers.id, userId))
    .limit(1)

  const pointed = person?.currentWorkspaceId ?? null
  const current = rows.some((row) => row.id === pointed) ? pointed : null

  return { workspaces: rows, currentWorkspaceId: current }
}

export async function createUserWorkspace(
  userId: string,
  name: string,
  settings: Partial<WorkspaceSettings> = {},
  database: CustomShellDb = db,
  address?: Partial<WorkspaceAddress>
) {
  const trimmedName = name.trim()
  if (!trimmedName) {
    throw new Error("Workspace name is required")
  }

  return database.transaction(async (tx) => {
    const createdAt = now()
    const id = uuid()
    const [workspace] = await tx
      .insert(customShellWorkspaces)
      .values({
        id,
        userId,
        name: trimmedName.slice(0, 255),
        // An address given by the form is checked; one left out is derived from
        // the name, which is what the switcher's "New workspace" does.
        ...(address?.subdomain
          ? cleanAddress({
              subdomain: address.subdomain,
              customDomain: address.customDomain ?? "",
              status: address.status ?? "active",
            })
          : { subdomain: await freeSubdomain(trimmedName, id, tx) }),
        settings: cleanWorkspaceSettings(settings),
        createdAt,
        updatedAt: createdAt,
      })
      .returning()
      .catch((error) => {
        throw describeAddressClash(error, {
          subdomain: cleanSubdomain(address?.subdomain ?? ""),
          customDomain: cleanCustomDomain(address?.customDomain ?? ""),
          status: address?.status ?? "active",
        })
      })

    if (!workspace) {
      throw new Error("Workspace was not created")
    }

    dropWorkspaceCache()
    return setCurrentWorkspace(userId, workspace.id, tx)
  })
}

export async function updateUserWorkspace(
  userId: string,
  workspaceId: string,
  data: {
    name: string
    settings: Partial<WorkspaceSettings>
    address?: WorkspaceAddress
  },
  database: CustomShellDb = db,
  options: { seesEveryWorkspace?: boolean } = {}
) {
  const mayReach = reachable(userId, options.seesEveryWorkspace ?? false)
  const trimmedName = data.name.trim()
  if (!trimmedName) {
    throw new Error("Workspace name is required")
  }

  const [existing] = await database
    .select({ settings: customShellWorkspaces.settings })
    .from(customShellWorkspaces)
    .where(and(eq(customShellWorkspaces.id, workspaceId), mayReach))
    .limit(1)

  if (!existing) {
    throw new Error("Workspace not found")
  }

  const [workspace] = await database
    .update(customShellWorkspaces)
    .set({
      name: trimmedName.slice(0, 255),
      ...(data.address ? cleanAddress(data.address) : {}),
      settings: cleanWorkspaceSettings({
        ...parseWorkspaceSettings(existing.settings),
        ...data.settings,
      }),
      updatedAt: now(),
    })
    .where(and(eq(customShellWorkspaces.id, workspaceId), mayReach))
    .returning()
    .catch((error) => {
      throw data.address ? describeAddressClash(error, data.address) : error
    })

  if (!workspace) {
    throw new Error("Workspace not found")
  }

  // An address or a state that just changed must not keep answering the old way.
  dropWorkspaceCache()
  return workspace
}

export async function switchUserWorkspace(
  userId: string,
  workspaceId: string,
  database: CustomShellDb = db,
  options: { seesEveryWorkspace?: boolean } = {}
) {
  return database.transaction((tx) =>
    setCurrentWorkspace(userId, workspaceId, tx, options.seesEveryWorkspace)
  )
}

export async function deleteUserWorkspace(
  userId: string,
  workspaceId: string,
  database: CustomShellDb = db,
  options: { seesEveryWorkspace?: boolean } = {}
) {
  const mayReach = reachable(userId, options.seesEveryWorkspace ?? false)
  return database.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(customShellWorkspaces)
      .where(mayReach)
      .orderBy(asc(customShellWorkspaces.createdAt))

    const workspace = rows.find((row) => row.id === workspaceId)
    if (!workspace) {
      throw new Error("Workspace not found")
    }

    if (rows.length <= 1) {
      throw new Error("At least one workspace is required")
    }

    const fallback = rows.find((row) => row.id !== workspaceId)
    if (!fallback) {
      throw new Error("At least one workspace is required")
    }

    // Whoever was in it has to be moved off before it goes. The foreign key
    // would empty their pointer on its own, but landing on nothing means the
    // next page load has no workspace to draw — so they are put somewhere real.
    await moveEveryoneOff(workspaceId, fallback.id, tx)

    const [deleted] = await tx
      .delete(customShellWorkspaces)
      .where(and(eq(customShellWorkspaces.id, workspaceId), mayReach))
      .returning({ id: customShellWorkspaces.id })

    if (!deleted) {
      throw new Error("Workspace not found")
    }

    dropWorkspaceCache()
    return { workspaceId: deleted.id }
  })
}

/**
 * Bulk delete for the table's multi-selection action. Same guards as deleting
 * one, in a single pass: an id that is not this user's is left alone, and one
 * workspace always survives — if every one of them was asked for, the one being
 * used is held back. The caller is told exactly which ids went so a run that
 * only got part way can say so.
 */
export async function deleteUserWorkspaces(
  userId: string,
  workspaceIds: string[],
  database: CustomShellDb = db,
  options: { seesEveryWorkspace?: boolean } = {}
): Promise<{ deleted: string[]; kept: string[] }> {
  const mayReach = reachable(userId, options.seesEveryWorkspace ?? false)
  return database.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(customShellWorkspaces)
      .where(mayReach)
      .orderBy(asc(customShellWorkspaces.createdAt))

    const requested = new Set(workspaceIds)
    const owned = rows.filter((row) => requested.has(row.id))
    const untouched = rows.filter((row) => !requested.has(row.id))

    const [person] = await tx
      .select({ currentWorkspaceId: customShellUsers.currentWorkspaceId })
      .from(customShellUsers)
      .where(eq(customShellUsers.id, userId))
      .limit(1)

    // Whatever was not asked for already survives; otherwise the one being used
    // is held back, and the oldest only when none of them is.
    const survivor =
      untouched[0] ??
      owned.find((row) => row.id === person?.currentWorkspaceId) ??
      owned[0] ??
      null
    const targetIds = owned
      .filter((row) => row.id !== survivor?.id)
      .map((row) => row.id)

    if (!survivor || targetIds.length === 0) {
      return { deleted: [], kept: workspaceIds }
    }

    // Anybody in one of the workspaces going moves to the one that survives.
    for (const id of targetIds) {
      await moveEveryoneOff(id, survivor.id, tx)
    }

    const deleted = await tx
      .delete(customShellWorkspaces)
      .where(
        and(mayReach, inArray(customShellWorkspaces.id, targetIds))
      )
      .returning({ id: customShellWorkspaces.id })

    const deletedIds = deleted.map((row) => row.id)
    dropWorkspaceCache()
    const wentThrough = new Set(deletedIds)
    return {
      deleted: deletedIds,
      kept: workspaceIds.filter((id) => !wentThrough.has(id)),
    }
  })
}

/**
 * Brings one workspace's saved sidebar forward, once. Reading never adds a link
 * back — that rule stands — so this is a write, and the version it stamps is
 * what stops it running a second time. Each restructure below runs only for a
 * sidebar saved before that restructure existed, so deleting Membership or
 * Feeds afterwards keeps it deleted.
 */
async function applyNavigationUpgrade(
  workspace: CustomShellWorkspace,
  database: Pick<CustomShellDb, "update">
): Promise<CustomShellWorkspace> {
  const settings = parseWorkspaceSettings(workspace.settings)
  if (settings.navVersion >= NAVIGATION_VERSION) {
    return workspace
  }

  let sections = settings.sections
  if (settings.navVersion < 1) {
    sections = groupMembershipLinks(sections)
  }
  if (settings.navVersion < 2) {
    sections = groupFeedsLinks(sections)
  }
  if (settings.navVersion < 3) {
    sections = groupFeedbackIntoFeeds(sections)
  }
  if (settings.navVersion < 4) {
    sections = removeWhatsNewLinks(sections)
  }
  if (settings.navVersion < 5) {
    sections = removeAuditLinks(sections)
  }
  // Last, so the steps above have finished rearranging before this one looks
  // for where the new link belongs.
  if (settings.navVersion < 6) {
    sections = addOverviewLink(sections)
  }
  // Last, and after the Overview link exists: this is the step that hands the
  // feed links to it, so the link it hands them to has to be there first.
  if (settings.navVersion < 7) {
    sections = foldFeedsIntoOverview(sections)
  }
  if (settings.navVersion < 8) {
    sections = addAiUsageLink(sections)
  }
  if (settings.navVersion < 9) {
    sections = addTrafficLink(sections)
  }
  // After `groupMembershipLinks` has had its turn above, so a Revenue link that
  // step just tucked under Membership is taken out again rather than missed.
  if (settings.navVersion < 10) {
    sections = removeRevenueLink(sections)
  }
  // 12 rather than 11: version 11 skipped a sidebar that already had a
  // newsletter link on it, which left Contacts with no way in for anyone who
  // had added that link themselves.
  if (settings.navVersion < 12) {
    sections = addNewsletterLink(sections)
  }
  // After the step above, so the parent it hangs a child on is there to hang it
  // on.
  if (settings.navVersion < 13) {
    sections = addSystemEmailsLink(sections)
  }
  // Last of all, and after every step above that anchors on Membership — they
  // put the Overview, AI usage and Traffic links in the right places by finding
  // it, so it has to still be there while they run.
  if (settings.navVersion < 14) {
    sections = foldMembershipIntoOverview(sections)
  }
  if (settings.navVersion < 15) {
    sections = removeMediaChildLinks(sections)
  }
  // After `addNewsletterLink` above, so the parent it hangs a child on is there
  // to hang it on.
  if (settings.navVersion < 16) {
    sections = addSegmentsLink(sections)
  }
  // After `addTrafficLink` above, so the link this one sits beside is there
  // first.
  if (settings.navVersion < 17) {
    sections = addPagesLink(sections)
  }
  if (settings.navVersion < 18) {
    sections = addAutomationTemplatesLink(sections)
  }

  const [updated] = await database
    .update(customShellWorkspaces)
    .set({
      settings: {
        ...settings,
        sections,
        navVersion: NAVIGATION_VERSION,
      },
      updatedAt: now(),
    })
    .where(eq(customShellWorkspaces.id, workspace.id))
    .returning()

  return updated ?? workspace
}

/**
 * Moves a saved Users, Plans and Revenue link under one Membership parent,
 * keeping whatever the admin renamed them to and leaving the parent where the
 * first of them already sat.
 *
 * Three things it deliberately will not do: touch a workspace that already has
 * a Membership entry, add the parent when all three links have been deleted, or
 * move a link that is switched off — a child link has no "hidden", so pulling a
 * hidden one in would put it back on screen.
 */
export function groupMembershipLinks(sections: ShellSection[]): ShellSection[] {
  const alreadyGrouped = sections.some((section) =>
    section.entries.some((entry) => entry.id === MEMBERSHIP_LINK_ID)
  )
  if (alreadyGrouped) {
    return sections
  }

  const moved: ShellChildItem[] = []
  let anchorSection = -1
  let anchorIndex = -1

  const remaining = sections.map((section, sectionIndex) => ({
    ...section,
    entries: section.entries.filter((entry, entryIndex) => {
      if (!isShellItem(entry) || !entry.visible) return true
      if (!MEMBERSHIP_CHILD_IDS.includes(entry.id)) return true

      if (anchorSection < 0) {
        anchorSection = sectionIndex
        // Nothing before the first match is removed, so its position in the
        // filtered list is the same one it has here.
        anchorIndex = entryIndex
      }
      moved.push({
        id: entry.id,
        label: entry.label,
        href: entry.href,
        icon: entry.icon,
        ...(entry.roles ? { roles: entry.roles } : {}),
      })
      return false
    }),
  }))

  if (!moved.length) {
    return sections
  }

  moved.sort(
    (a, b) =>
      MEMBERSHIP_CHILD_IDS.indexOf(a.id) - MEMBERSHIP_CHILD_IDS.indexOf(b.id)
  )

  return remaining.map((section, sectionIndex) =>
    sectionIndex === anchorSection
      ? {
          ...section,
          entries: [
            ...section.entries.slice(0, anchorIndex),
            membershipLink(moved),
            ...section.entries.slice(anchorIndex),
          ],
        }
      : section
  )
}

/**
 * Moves the saved Announcements, Notifications, Changelog, What's new and
 * Activity log links under one Feeds parent, keeping whatever the admin renamed
 * them to and leaving the parent where the first of them already sat. A link is
 * recognised by its saved id or, when an admin once deleted the original and
 * rebuilt it by hand under a made-up id, by the page it points at.
 *
 * Same deliberate refusals as `groupMembershipLinks`: it will not touch a
 * workspace that already has a Feeds entry, not add the parent when all five
 * links have been deleted, and not move a link that is switched off — a child
 * link has no "hidden", so pulling a hidden one in would put it back on screen.
 * A hidden Changelog therefore also keeps its What's new child right where it
 * is.
 *
 * The one new wrinkle: the sidebar only nests one level deep, so a moved link
 * cannot bring children along. Its children are promoted to siblings instead —
 * that is how What's new steps out from under Changelog, and how a child the
 * admin added by hand rides along rather than being dropped.
 */
export function groupFeedsLinks(sections: ShellSection[]): ShellSection[] {
  const alreadyGrouped = sections.some((section) =>
    section.entries.some((entry) => entry.id === FEEDS_LINK_ID)
  )
  if (alreadyGrouped) {
    return sections
  }

  // The canonical position of a link, whichever way it was recognised, or -1.
  const feedsKey = (link: { id: string; href?: string }) => {
    const idKey = FEEDS_CHILD_IDS.indexOf(link.id)
    if (idKey >= 0) return idKey
    return link.href ? FEEDS_CHILD_HREFS.indexOf(link.href) : -1
  }

  const moved: ShellChildItem[] = []
  const sortKeys = new Map<string, number>()
  const pushMoved = (link: ShellChildItem, sortKey: number) => {
    // One link per page: a rebuilt copy and the original never both move in.
    const duplicate = moved.some(
      (entry) => entry.id === link.id || (link.href && entry.href === link.href)
    )
    if (duplicate) return
    sortKeys.set(link.id, sortKey)
    moved.push(link)
  }
  let anchorSection = -1
  let anchorIndex = -1

  const remaining = sections.map((section, sectionIndex) => ({
    ...section,
    entries: section.entries.filter((entry, entryIndex) => {
      if (!isShellItem(entry) || !entry.visible) return true
      const parentKey = feedsKey(entry)
      if (parentKey < 0) return true

      if (anchorSection < 0) {
        anchorSection = sectionIndex
        // Nothing before the first match is removed, so its position in the
        // filtered list is the same one it has here.
        anchorIndex = entryIndex
      }
      pushMoved(
        {
          id: entry.id,
          label: entry.label,
          href: entry.href,
          icon: entry.icon,
          ...(entry.roles ? { roles: entry.roles } : {}),
        },
        parentKey
      )
      for (const child of entry.children ?? []) {
        // A promoted child the upgrade does not know keeps its parent's sort
        // key; the sort below is stable, so it stays right beside its parent.
        const childKey = feedsKey(child)
        pushMoved({ ...child }, childKey >= 0 ? childKey : parentKey)
      }
      return false
    }),
  }))

  if (!moved.length) {
    return sections
  }

  moved.sort(
    (a, b) => (sortKeys.get(a.id) ?? 0) - (sortKeys.get(b.id) ?? 0)
  )

  return remaining.map((section, sectionIndex) =>
    sectionIndex === anchorSection
      ? {
          ...section,
          entries: [
            ...section.entries.slice(0, anchorIndex),
            feedsLink(moved),
            ...section.entries.slice(anchorIndex),
          ],
        }
      : section
  )
}

const FEEDBACK_LINK_ID = "item-feedback"
const FEEDBACK_HREF = "/admin/feedback"
const FEEDBACK_COMMENTS_ID = "item-feedback-comments"
const FEEDBACK_COMMENTS_HREF = "/admin/feedback/comments"

/**
 * Brings a workspace saved before Feedback joined the Feeds section forward:
 * the saved Feedback link slides in under Feeds ahead of the Activity log, and
 * every link to the retired comments page is dropped — that page folded into
 * the feedback dashboard, so a link to it would only show "not found".
 *
 * Same refusals as the steps before it: a switched-off Feedback link stays
 * where it is, and a workspace that deleted its Feeds entry keeps Feedback
 * where the admin left it rather than growing a new parent. The dead comments
 * links go regardless — there is no page for them to open.
 */
export function groupFeedbackIntoFeeds(
  sections: ShellSection[]
): ShellSection[] {
  let changed = false

  const isCommentsLink = (link: { id: string; href?: string }) =>
    link.id === FEEDBACK_COMMENTS_ID || link.href === FEEDBACK_COMMENTS_HREF
  const isFeedbackLink = (link: { id: string; href?: string }) =>
    link.id === FEEDBACK_LINK_ID || link.href === FEEDBACK_HREF

  // Drop the dead comments links first, wherever they sit.
  const withoutComments = sections.map((section) => ({
    ...section,
    entries: section.entries.flatMap((entry) => {
      if (isShellItem(entry) && isCommentsLink(entry)) {
        changed = true
        return []
      }
      if (!isShellItem(entry) || !entry.children?.length) return [entry]
      const children = entry.children.filter((child) => !isCommentsLink(child))
      if (children.length === entry.children.length) return [entry]
      changed = true
      return [{ ...entry, children }]
    }),
  }))

  // The move only happens into a Feeds parent that is still there and does not
  // already hold a feedback link.
  const feeds = withoutComments
    .flatMap((section) => section.entries)
    .find((entry) => entry.id === FEEDS_LINK_ID && isShellItem(entry)) as
    | ShellItem
    | undefined
  const canMove =
    feeds !== undefined &&
    !feeds.children?.some((child) => isFeedbackLink(child))

  let movedFeedback: ShellChildItem | null = null
  let promoted: ShellChildItem[] = []

  const remaining = canMove
    ? withoutComments.map((section) => ({
        ...section,
        entries: section.entries.filter((entry) => {
          if (!isShellItem(entry) || !entry.visible) return true
          if (movedFeedback || !isFeedbackLink(entry)) return true
          movedFeedback = {
            id: entry.id,
            label: entry.label,
            href: entry.href,
            icon: entry.icon,
            ...(entry.roles ? { roles: entry.roles } : {}),
          }
          // One level of nesting only, so any hand-added children come along
          // as siblings, the same way the earlier restructures promoted them.
          promoted = (entry.children ?? []).map((child) => ({ ...child }))
          changed = true
          return false
        }),
      }))
    : withoutComments

  if (!changed) {
    return sections
  }
  const moved = movedFeedback as ShellChildItem | null
  if (!moved) {
    return remaining
  }

  return remaining.map((section) => ({
    ...section,
    entries: section.entries.map((entry) => {
      if (entry.id !== FEEDS_LINK_ID || !isShellItem(entry)) return entry
      const children = [...(entry.children ?? [])]
      const auditIndex = children.findIndex(
        (child) => child.id === AUDIT_LINK_ID || child.href === AUDIT_HREF
      )
      const insertAt = auditIndex >= 0 ? auditIndex : children.length
      children.splice(insertAt, 0, moved, ...promoted)
      return { ...entry, children }
    }),
  }))
}

/**
 * Puts the Overview link in a sidebar saved before the page existed.
 *
 * Every step before this one moved a link an admin already had, or took one
 * away. This is the first that hands out a new one — which is the thing
 * reading a sidebar must never do, so it is a write, it runs once per
 * workspace, and the navVersion stamp is what stops it running again. Delete
 * the link afterwards and it stays deleted, exactly like every other default.
 */
export function addOverviewLink(sections: ShellSection[]): ShellSection[] {
  // An admin who emptied their sidebar meant it. This must not be the one
  // upgrade that hands something back.
  if (!sections.length) return sections

  const isOverview = (link: { id: string; href?: string }) =>
    link.id === OVERVIEW_LINK_ID || link.href === OVERVIEW_HREF

  // The address, not only the id, so a link somebody deleted and rebuilt by
  // hand under a made-up id is still recognised. Hidden counts as present —
  // a switched-off Overview link is still one, and doubling it would put a
  // second copy on screen.
  const alreadyThere = sections.some((section) =>
    section.entries.some(
      (entry) =>
        isOverview(entry) ||
        (isShellItem(entry) && (entry.children ?? []).some(isOverview))
    )
  )
  if (alreadyThere) return sections

  // Where it belongs, in order: beside Membership, then the Administration
  // section, then the top of the sidebar. Matched by id and address rather
  // than by title, so a renamed "Administration" is still found.
  const besideMembership = sections.findIndex((section) =>
    section.entries.some(
      (entry) =>
        entry.id === MEMBERSHIP_LINK_ID ||
        (isShellItem(entry) && entry.href === MEMBERSHIP_HREF)
    )
  )
  const administration = sections.findIndex(
    (section) => section.id === "section-administration"
  )

  // `findIndex` gives -1 for "nowhere", and the last fallback is the first
  // section — so a sidebar with neither anchor still gets the link.
  const index = besideMembership >= 0 ? besideMembership : Math.max(0, administration)

  return sections.map((section, at) =>
    at === index
      ? { ...section, entries: [overviewLink(), ...section.entries] }
      : section
  )
}

/**
 * Puts the AI usage link in a sidebar saved before the page existed. Same
 * shape and same rules as `addOverviewLink` above: an emptied sidebar stays
 * empty, a link that is already there (by id or address, hidden included) is
 * never doubled, and it runs once per workspace on the navVersion stamp.
 */
export function addAiUsageLink(sections: ShellSection[]): ShellSection[] {
  if (!sections.length) return sections

  const isAiUsage = (link: { id: string; href?: string }) =>
    link.id === AI_USAGE_LINK_ID || link.href === AI_USAGE_HREF

  const alreadyThere = sections.some((section) =>
    section.entries.some(
      (entry) =>
        isAiUsage(entry) ||
        (isShellItem(entry) && (entry.children ?? []).some(isAiUsage))
    )
  )
  if (alreadyThere) return sections

  // Where it belongs, in order: right after Membership (money next to money),
  // then the Administration section, then the first section.
  const sectionIndex = sections.findIndex((section) =>
    section.entries.some(
      (entry) =>
        entry.id === MEMBERSHIP_LINK_ID ||
        (isShellItem(entry) && entry.href === MEMBERSHIP_HREF)
    )
  )
  const administration = sections.findIndex(
    (section) => section.id === "section-administration"
  )
  const index = sectionIndex >= 0 ? sectionIndex : Math.max(0, administration)

  return sections.map((section, at) => {
    if (at !== index) return section
    const membershipAt = section.entries.findIndex(
      (entry) =>
        entry.id === MEMBERSHIP_LINK_ID ||
        (isShellItem(entry) && entry.href === MEMBERSHIP_HREF)
    )
    const entries = [...section.entries]
    entries.splice(
      membershipAt >= 0 ? membershipAt + 1 : entries.length,
      0,
      aiUsageLink()
    )
    return { ...section, entries }
  })
}

/**
 * Puts the Traffic link in a sidebar saved before the page existed. Same
 * shape and same rules as `addAiUsageLink` above: an emptied sidebar stays
 * empty, a link that is already there (by id or address, hidden included) is
 * never doubled, and it runs once per workspace on the navVersion stamp.
 */
export function addTrafficLink(sections: ShellSection[]): ShellSection[] {
  if (!sections.length) return sections

  const isTraffic = (link: { id: string; href?: string }) =>
    link.id === TRAFFIC_LINK_ID || link.href === TRAFFIC_HREF

  const alreadyThere = sections.some((section) =>
    section.entries.some(
      (entry) =>
        isTraffic(entry) ||
        (isShellItem(entry) && (entry.children ?? []).some(isTraffic))
    )
  )
  if (alreadyThere) return sections

  // Where it belongs, in order: right after AI usage (a report next to a
  // report), then the Administration section, then the first section.
  const isAiUsage = (link: { id: string; href?: string }) =>
    link.id === AI_USAGE_LINK_ID || link.href === AI_USAGE_HREF

  const sectionIndex = sections.findIndex((section) =>
    section.entries.some(isAiUsage)
  )
  const administration = sections.findIndex(
    (section) => section.id === "section-administration"
  )
  const index = sectionIndex >= 0 ? sectionIndex : Math.max(0, administration)

  return sections.map((section, at) => {
    if (at !== index) return section
    const aiUsageAt = section.entries.findIndex(isAiUsage)
    const entries = [...section.entries]
    entries.splice(
      aiUsageAt >= 0 ? aiUsageAt + 1 : entries.length,
      0,
      trafficLink()
    )
    return { ...section, entries }
  })
}

/**
 * Puts the Pages link in a sidebar saved before the page existed. Same shape
 * and same rules as `addTrafficLink` above: an emptied sidebar stays empty, a
 * link that is already there (by id or address, hidden included) is never
 * doubled, and it runs once per workspace on the navVersion stamp. It lands
 * right after Traffic — the public pages next to the visits they get.
 */
export function addPagesLink(sections: ShellSection[]): ShellSection[] {
  if (!sections.length) return sections

  const isPages = (link: { id: string; href?: string }) =>
    link.id === PAGES_LINK_ID || link.href === PAGES_HREF

  const alreadyThere = sections.some((section) =>
    section.entries.some(
      (entry) =>
        isPages(entry) ||
        (isShellItem(entry) && (entry.children ?? []).some(isPages))
    )
  )
  if (alreadyThere) return sections

  const isTraffic = (link: { id: string; href?: string }) =>
    link.id === TRAFFIC_LINK_ID || link.href === TRAFFIC_HREF

  const sectionIndex = sections.findIndex((section) =>
    section.entries.some(isTraffic)
  )
  const administration = sections.findIndex(
    (section) => section.id === "section-administration"
  )
  const index = sectionIndex >= 0 ? sectionIndex : Math.max(0, administration)

  return sections.map((section, at) => {
    if (at !== index) return section
    const trafficAt = section.entries.findIndex(isTraffic)
    const entries = [...section.entries]
    entries.splice(
      trafficAt >= 0 ? trafficAt + 1 : entries.length,
      0,
      pagesLink()
    )
    return { ...section, entries }
  })
}

/**
 * Puts the Newsletter link into a sidebar that was saved before the section
 * existed, right above Automations — the two sit together because both are
 * "things the app sends on your behalf".
 *
 * Does nothing when the link is already somewhere, however it got there: a
 * workspace that has already been upgraded, or an admin who added it by hand,
 * must not end up with two.
 */
export function addNewsletterLink(sections: ShellSection[]): ShellSection[] {
  if (!sections.length) return sections

  const isNewsletter = (link: { id: string; href?: string }) =>
    link.id === NEWSLETTER_LINK_ID || link.href === NEWSLETTER_HREF
  const isContacts = (link: { id: string; href?: string }) =>
    link.id === CONTACTS_LINK_ID || link.href === CONTACTS_HREF

  const reachable = (match: (link: { id: string; href?: string }) => boolean) =>
    sections.some((section) =>
      section.entries.some(
        (entry) =>
          match(entry) ||
          (isShellItem(entry) && (entry.children ?? []).some(match))
      )
    )

  if (reachable(isNewsletter)) {
    // The newsletter is already on the sidebar, either because this ran before
    // or because somebody added the link by hand. Leave it exactly as it is —
    // its name and its place are theirs — but Contacts still has to be
    // reachable from somewhere, so it is hung underneath.
    if (reachable(isContacts)) return sections

    return sections.map((section) => ({
      ...section,
      entries: section.entries.map((entry) => {
        if (!isShellItem(entry) || !isNewsletter(entry)) return entry
        const children = entry.children ?? []
        return {
          ...entry,
          children: [
            // Only once the parent has children at all does the row of chips
            // appear, and a parent whose own page is missing from that row
            // reads as a gap — so its own address goes in beside Contacts.
            ...(children.length ? children : [newsletterSelfChildLink()]),
            contactsChildLink(),
          ],
        }
      }),
    }))
  }

  // Where it belongs, in order: just before Automations, then the Platform
  // Settings section, then the last section.
  const isAutomations = (link: { id: string; href?: string }) =>
    link.id === AUTOMATIONS_LINK.id || link.href === AUTOMATIONS_LINK.href

  const withAutomations = sections.findIndex((section) =>
    section.entries.some(isAutomations)
  )
  const platformSettings = sections.findIndex(
    (section) => section.id === "section-platform-settings"
  )
  const index =
    withAutomations >= 0
      ? withAutomations
      : platformSettings >= 0
        ? platformSettings
        : sections.length - 1

  return sections.map((section, at) => {
    if (at !== index) return section
    const automationsAt = section.entries.findIndex(isAutomations)
    const entries = [...section.entries]
    entries.splice(
      automationsAt >= 0 ? automationsAt : entries.length,
      0,
      newsletterLink()
    )
    return { ...section, entries }
  })
}

/**
 * Hangs "System emails" under the Newsletter link on a sidebar saved before the
 * page existed.
 *
 * Only ever adds a child; it never moves the parent or renames anything. If the
 * link is already reachable — because this ran before, or because an admin put
 * it somewhere themselves — it is left exactly where they left it. A sidebar
 * with no Newsletter link at all is left alone too: `addNewsletterLink` builds
 * that parent complete with every child, so there is nothing to fix.
 */
export function addSystemEmailsLink(sections: ShellSection[]): ShellSection[] {
  if (!sections.length) return sections

  const isNewsletter = (link: { id: string; href?: string }) =>
    link.id === NEWSLETTER_LINK_ID || link.href === NEWSLETTER_HREF
  const isSystemEmails = (link: { id: string; href?: string }) =>
    link.id === SYSTEM_EMAILS_LINK_ID || link.href === SYSTEM_EMAILS_HREF

  const reachable = sections.some((section) =>
    section.entries.some(
      (entry) =>
        isSystemEmails(entry) ||
        (isShellItem(entry) && (entry.children ?? []).some(isSystemEmails))
    )
  )
  if (reachable) return sections

  const systemEmailsChild = systemEmailsChildLink()

  return sections.map((section) => ({
    ...section,
    entries: section.entries.map((entry) => {
      if (!isShellItem(entry) || !isNewsletter(entry)) return entry
      const children = entry.children ?? []
      return {
        ...entry,
        children: [
          // A parent with no children yet has no row of chips, and adding one
          // child would leave its own page missing from that row.
          ...(children.length ? children : [newsletterSelfChildLink()]),
          systemEmailsChild,
        ],
      }
    }),
  }))
}

/**
 * Hangs "Segments" under the Newsletter link, right after Contacts — the two
 * answer the same question and are always looked at together.
 *
 * Same rules as `addSystemEmailsLink` above: only ever adds a child, never
 * doubles one that is already reachable however it got there, and leaves a
 * sidebar with no Newsletter link alone, because `addNewsletterLink` builds
 * that parent complete.
 */
export function addSegmentsLink(sections: ShellSection[]): ShellSection[] {
  if (!sections.length) return sections

  const isNewsletter = (link: { id: string; href?: string }) =>
    link.id === NEWSLETTER_LINK_ID || link.href === NEWSLETTER_HREF
  const isContacts = (link: { id: string; href?: string }) =>
    link.id === CONTACTS_LINK_ID || link.href === CONTACTS_HREF
  const isSegments = (link: { id: string; href?: string }) =>
    link.id === SEGMENTS_LINK_ID || link.href === SEGMENTS_HREF

  const reachable = sections.some((section) =>
    section.entries.some(
      (entry) =>
        isSegments(entry) ||
        (isShellItem(entry) && (entry.children ?? []).some(isSegments))
    )
  )
  if (reachable) return sections

  return sections.map((section) => ({
    ...section,
    entries: section.entries.map((entry) => {
      if (!isShellItem(entry) || !isNewsletter(entry)) return entry
      // A parent with no children yet has no row of chips, and adding one child
      // would leave its own page missing from that row.
      const children = entry.children?.length
        ? [...entry.children]
        : [newsletterSelfChildLink()]
      const contactsAt = children.findIndex(isContacts)
      children.splice(
        contactsAt >= 0 ? contactsAt + 1 : children.length,
        0,
        segmentsChildLink()
      )
      return { ...entry, children }
    }),
  }))
}

/** Adds Templates beneath an existing Automations sidebar item. */
export function addAutomationTemplatesLink(
  sections: ShellSection[]
): ShellSection[] {
  if (!sections.length) return sections

  const isAutomations = (link: { id: string; href?: string }) =>
    link.id === AUTOMATIONS_LINK_ID || link.href === AUTOMATIONS_HREF
  const isTemplates = (link: { id: string; href?: string }) =>
    link.id === AUTOMATION_TEMPLATES_LINK_ID ||
    link.href === AUTOMATION_TEMPLATES_HREF
  const alreadyThere = sections.some((section) =>
    section.entries.some(
      (entry) =>
        isTemplates(entry) ||
        (isShellItem(entry) && (entry.children ?? []).some(isTemplates))
    )
  )
  if (alreadyThere) return sections
  const hasAutomations = sections.some((section) =>
    section.entries.some((entry) => isShellItem(entry) && isAutomations(entry))
  )
  if (!hasAutomations) return sections

  return sections.map((section) => ({
    ...section,
    entries: section.entries.map((entry) => {
      if (!isShellItem(entry) || !isAutomations(entry)) return entry
      const children = entry.children?.length ? [...entry.children] : []
      return {
        ...entry,
        children: [...children, automationTemplatesChildLink()],
      }
    }),
  }))
}

/**
 * Folds the Feeds section into the Overview: the four links it held become the
 * Overview's children, and the parent goes, because its page has been deleted
 * — the Overview shows what it showed.
 */
export function foldFeedsIntoOverview(
  sections: ShellSection[]
): ShellSection[] {
  return foldParentIntoOverview(
    sections,
    (link) => link.id === FEEDS_LINK_ID || link.href === FEEDS_HREF
  )
}

/**
 * The same, for Membership: Users and Plans become the Overview's children and
 * the parent goes, because its page has been deleted too. The Overview already
 * drew the same joining chart, the same plan breakdown and the same stat strip,
 * so there was one page's worth of screen for two pages' worth of answer.
 */
export function foldMembershipIntoOverview(
  sections: ShellSection[]
): ShellSection[] {
  return foldParentIntoOverview(
    sections,
    (link) => link.id === MEMBERSHIP_LINK_ID || link.href === MEMBERSHIP_HREF
  )
}

/**
 * Retires one parent link whose page is gone, handing the children it held to
 * the Overview.
 *
 * They have to keep hanging off one parent rather than become loose top-level
 * links. The strip along the top of the page draws the sidebar link you are on
 * together with its children, and only a link that has children can be the one
 * drawn — so orphans would each show a single chip where a row used to be.
 *
 * They only move into the Overview when they come out as visible as they went
 * in: both links switched on, and the Overview at the top level. A hidden
 * parent hides its children with it, so moving those under a switched-on
 * Overview would put links back on screen that the admin turned off — the thing
 * `groupMembershipLinks` refuses to do. A hidden Overview would do the reverse
 * and take them away. In those cases, and when the Overview has been deleted,
 * they are promoted to top-level links standing where the retired parent stood,
 * wearing the visibility it had. Nothing appears, nothing vanishes, and each one
 * can still be thrown away on its own afterwards.
 */
function foldParentIntoOverview(
  sections: ShellSection[],
  isRetiring: (link: { id: string; href?: string }) => boolean
): ShellSection[] {
  const isOverview = (link: { id: string; href?: string }) =>
    link.id === OVERVIEW_LINK_ID || link.href === OVERVIEW_HREF

  const entriesOf = (list: ShellSection[]) =>
    list.flatMap((section) => section.entries)

  // The parent as it was saved, wherever it sits. Matched by address as well
  // as by id, so one somebody deleted and rebuilt by hand is still recognised.
  const retiring = entriesOf(sections).find(
    (entry) => isShellItem(entry) && isRetiring(entry)
  ) as ShellItem | undefined

  // A link to the retired page dragged in under another parent holds no
  // children of its own — the rail only nests one level — but it still points
  // at a page that is gone, so it goes too, the way the audit links did.
  const stray = entriesOf(sections).some(
    (entry) => isShellItem(entry) && (entry.children ?? []).some(isRetiring)
  )

  // Nothing to do — including an emptied sidebar, which this step could never
  // have added to anyway.
  if (!retiring && !stray) return sections

  // Top level only: a child cannot hold children, so an Overview somebody
  // nested under another link is not somewhere the children can go.
  const overview = entriesOf(sections).find(
    (entry) => isShellItem(entry) && isOverview(entry)
  ) as ShellItem | undefined

  const moveIn = Boolean(retiring?.visible && overview?.visible)

  // Copied as they were saved, never rebuilt from the shell's own list, so a
  // rename, a swapped icon and a role all survive the move.
  const carried = (retiring?.children ?? [])
    .filter((child) => !isRetiring(child))
    .map((child) => ({ ...child }))

  // One link per page, checked against the list they are joining: the
  // Overview's own children when they move in, the top-level links when they
  // are promoted. Two entries sharing an id is a duplicate row in Settings →
  // Sidebar and a duplicate key in the rail.
  const taken = new Set<string>()
  const remember = (link: { id: string; href?: string }) => {
    taken.add(link.id)
    if (link.href) taken.add(link.href)
  }
  if (moveIn) {
    for (const child of overview?.children ?? []) remember(child)
  } else {
    // Everywhere a promoted link could already be, children included: one that
    // already sits under some other parent is still reachable, so putting a
    // second copy at the top level would be two rows to the same page.
    for (const entry of entriesOf(sections)) {
      if (entry === retiring) continue
      remember(entry)
      if (isShellItem(entry)) {
        for (const child of entry.children ?? []) remember(child)
      }
    }
  }

  const arriving: ShellChildItem[] = []
  for (const child of carried) {
    if (taken.has(child.id) || taken.has(child.href)) continue
    remember(child)
    arriving.push(child)
  }

  // What stands where the parent stood when they cannot move into the
  // Overview. Built here, where the parent is known to exist.
  const standingIn = retiring
    ? arriving.map((child) => promoteChild(child, retiring))
    : []

  const withoutParent = sections.map((section) => ({
    ...section,
    entries: section.entries.flatMap((entry) => {
      // The parent itself: gone, leaving either nothing or the links it held
      // standing in its place.
      if (entry === retiring) return moveIn ? [] : standingIn
      // A second copy of it, and any link to it nested under something else.
      if (isShellItem(entry) && isRetiring(entry)) return []
      if (!isShellItem(entry) || !entry.children?.length) return [entry]
      const children = entry.children.filter((child) => !isRetiring(child))
      return children.length === entry.children.length
        ? [entry]
        : [{ ...entry, children }]
    }),
  }))

  if (!moveIn || !arriving.length) return withoutParent

  // Appended, not put in front: whatever an admin has already hung off the
  // Overview themselves keeps the place they gave it.
  return withoutParent.map((section) => ({
    ...section,
    entries: section.entries.map((entry) =>
      entry === overview
        ? { ...entry, children: [...(entry.children ?? []), ...arriving] }
        : entry
    ),
  }))
}

/**
 * A child link standing on its own. A child's icon is optional and an item's
 * is not, so one that never had its own wears the parent's — which means it
 * inherits a swapped icon the same way it keeps a rename.
 */
function promoteChild(
  child: ShellChildItem,
  parent: ShellItem
): ShellItem {
  return {
    type: "item",
    id: child.id,
    label: child.label,
    href: child.href,
    icon: child.icon ?? parent.icon,
    visible: Boolean(parent.visible),
    ...(child.roles ? { roles: child.roles } : {}),
  }
}

/**
 * Takes the Activity log link out wherever it sits — the feature is gone from
 * the app entirely, page and database table both, so a link to it would only
 * show "not found".
 */
export function removeAuditLinks(sections: ShellSection[]): ShellSection[] {
  let changed = false
  const isAuditLink = (link: { id: string; href?: string }) =>
    link.id === AUDIT_LINK_ID || link.href === AUDIT_HREF

  const result = sections.map((section) => ({
    ...section,
    entries: section.entries.flatMap((entry) => {
      if (isShellItem(entry) && isAuditLink(entry)) {
        changed = true
        return []
      }
      if (!isShellItem(entry) || !entry.children?.length) return [entry]
      const children = entry.children.filter((child) => !isAuditLink(child))
      if (children.length === entry.children.length) return [entry]
      changed = true
      return [{ ...entry, children }]
    }),
  }))

  return changed ? result : sections
}

/**
 * Takes the Revenue link out wherever it sits.
 *
 * Its page was folded into the Membership page directly above it — same tables,
 * same numbers — and `/admin/billing` now only redirects there. Two sidebar
 * links landing on one screen is worse than one, so the link goes.
 *
 * Matched by id or by address, and inside children as well as at the top level,
 * so a hand-rebuilt link is caught too. Runs once per workspace on the
 * navVersion stamp, which is what stops it fighting an admin who later makes
 * their own link to `/admin/billing` on purpose.
 */
export function removeRevenueLink(sections: ShellSection[]): ShellSection[] {
  let changed = false
  const isRevenue = (link: { id: string; href?: string }) =>
    link.id === REVENUE_LINK_ID || link.href === REVENUE_HREF

  const result = sections.map((section) => ({
    ...section,
    entries: section.entries.flatMap((entry) => {
      if (isShellItem(entry) && isRevenue(entry)) {
        changed = true
        return []
      }
      if (!isShellItem(entry) || !entry.children?.length) return [entry]
      const children = entry.children.filter((child) => !isRevenue(child))
      if (children.length === entry.children.length) return [entry]
      changed = true
      // An emptied `children` is dropped rather than left as a key nothing
      // asked for — a parent with no children reads as a plain link, which is
      // what Membership becomes if somebody had already removed the other two.
      return [
        children.length ? { ...entry, children } : stripChildren(entry),
      ]
    }),
  }))

  return changed ? result : sections
}

/**
 * Takes the media library's two child links off wherever they sit.
 *
 * Orphaned files is a choice in the library's own type filter now, and how much
 * space a person is using is on their account. Neither address exists any more,
 * so a saved sidebar keeping them would be two links to a 404.
 */
export function removeMediaChildLinks(sections: ShellSection[]): ShellSection[] {
  let changed = false
  const isMediaChild = (link: { id: string; href?: string }) =>
    link.id === MEDIA_STORAGE_LINK_ID ||
    link.href === MEDIA_STORAGE_HREF ||
    link.id === MEDIA_ORPHANS_LINK_ID ||
    link.href === MEDIA_ORPHANS_HREF

  const result = sections.map((section) => ({
    ...section,
    entries: section.entries.flatMap((entry) => {
      if (isShellItem(entry) && isMediaChild(entry)) {
        changed = true
        return []
      }
      if (!isShellItem(entry) || !entry.children?.length) return [entry]
      const children = entry.children.filter((child) => !isMediaChild(child))
      if (children.length === entry.children.length) return [entry]
      changed = true
      // Media is left as a plain link once both of its children have gone,
      // rather than a parent with an empty `children` key.
      return [children.length ? { ...entry, children } : stripChildren(entry)]
    }),
  }))

  return changed ? result : sections
}

/** The same link with no `children` key at all, rather than an empty one. */
function stripChildren(item: ShellItem): ShellItem {
  const { children: _children, ...rest } = item
  return rest
}

const WHATS_NEW_ID = "item-changelog-whats-new"
const WHATS_NEW_HREF = "/changelog/whats-new"

/**
 * Takes the What's new link out of the admin sidebar. The page itself stays —
 * it is what a changelog notice opens and what members read — but an admin now
 * previews an update from the changelog table's eye button, so the extra link
 * had nothing left to do. Member sidebars are stored elsewhere and keep their
 * own link.
 */
export function removeWhatsNewLinks(sections: ShellSection[]): ShellSection[] {
  let changed = false
  const isWhatsNew = (link: { id: string; href?: string }) =>
    link.id === WHATS_NEW_ID || link.href === WHATS_NEW_HREF

  const result = sections.map((section) => ({
    ...section,
    entries: section.entries.flatMap((entry) => {
      if (isShellItem(entry) && isWhatsNew(entry)) {
        changed = true
        return []
      }
      if (!isShellItem(entry) || !entry.children?.length) return [entry]
      const children = entry.children.filter((child) => !isWhatsNew(child))
      if (children.length === entry.children.length) return [entry]
      changed = true
      return [{ ...entry, children }]
    }),
  }))

  return changed ? result : sections
}

/**
 * The workspace this person is pointing at, or null when they point at none.
 *
 * Reads only — it never makes one. Somewhere having to answer "none" is the
 * whole reason this is separate from `startWorkspaceFor`: it used to create a
 * workspace whenever it could not find one, and it ran on every signed-in page
 * load, so a stray call quietly minted rows.
 */
async function findCurrentWorkspace(userId: string, database: CustomShellDb) {
  const [pointed] = await database
    .select({ workspace: customShellWorkspaces })
    .from(customShellUsers)
    .innerJoin(
      customShellWorkspaces,
      eq(customShellWorkspaces.id, customShellUsers.currentWorkspaceId)
    )
    .where(eq(customShellUsers.id, userId))
    .limit(1)

  if (pointed) return pointed.workspace

  // Nobody has pointed them anywhere yet, so the oldest workspace they own
  // stands in. That covers a fresh account, and somebody whose workspace was
  // deleted out from under them. It is a read: it settles on one, it does not
  // make one and it does not write the pointer.
  const [owned] = await database
    .select()
    .from(customShellWorkspaces)
    .where(eq(customShellWorkspaces.userId, userId))
    .orderBy(asc(customShellWorkspaces.createdAt))
    .limit(1)

  return owned ?? null
}

/**
 * Points this person at a workspace.
 *
 * One row written, on the person. The old version wrote across every workspace
 * with that owner to clear the flag first — which, once a workspace can be
 * shared, wiped whichever workspace the other admins were in.
 *
 * Any workspace may be pointed at, not only one you own. What a person is
 * allowed to *see* is decided by the caller; this only records where they are.
 */
async function setCurrentWorkspace(
  userId: string,
  workspaceId: string,
  database: Pick<CustomShellDb, "select" | "update">,
  seesEveryWorkspace = false
) {
  // **The permission check for switching.** Without it any signed-in person
  // could point themselves at a workspace by id and read its name, icon and
  // styling through the shell settings — this endpoint is `userPost`, so a
  // plain member reaches it. An admin may go anywhere; anybody else only into
  // one they own.
  const [workspace] = await database
    .select()
    .from(customShellWorkspaces)
    .where(
      seesEveryWorkspace
        ? eq(customShellWorkspaces.id, workspaceId)
        : and(
            eq(customShellWorkspaces.id, workspaceId),
            eq(customShellWorkspaces.userId, userId)
          )
    )
    .limit(1)

  if (!workspace) {
    throw new Error("Workspace not found")
  }

  await database
    .update(customShellUsers)
    .set({ currentWorkspaceId: workspaceId, updatedAt: now() })
    .where(eq(customShellUsers.id, userId))

  return workspace
}

/**
 * Moves everybody pointing at a workspace onto another one.
 *
 * Used before a workspace is deleted. The foreign key would empty their pointer
 * by itself, but somebody pointing at nothing has no sidebar, no settings and
 * no workspace name on their next page load — so they are moved somewhere real
 * instead of being left to land on empty.
 */
async function moveEveryoneOff(
  workspaceId: string,
  fallbackId: string,
  database: Pick<CustomShellDb, "update">
) {
  await database
    .update(customShellUsers)
    .set({ currentWorkspaceId: fallbackId, updatedAt: now() })
    .where(eq(customShellUsers.currentWorkspaceId, workspaceId))
}

export function serializeWorkspace(
  row: CustomShellWorkspace,
  currentWorkspaceId: string | null
) {
  const settings = parseWorkspaceSettings(row.settings)
  return {
    id: row.id,
    name: row.name,
    icon: settings.icon,
    favicon: settings.favicon,
    subdomain: row.subdomain,
    customDomain: row.customDomain,
    status: row.status,
    active: row.id === currentWorkspaceId,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  }
}

export function parseWorkspaceSettings(value: unknown): WorkspaceSettings {
  const fallback = defaultWorkspaceSettings()
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const settings = value as Partial<WorkspaceSettings>
    return {
      icon: isWorkspaceIcon(settings.icon) ? settings.icon : fallback.icon,
      favicon:
        typeof settings.favicon === "string"
          ? settings.favicon
          : fallback.favicon,
      topRightNavigation: Array.isArray(settings.topRightNavigation)
        ? settings.topRightNavigation
        : fallback.topRightNavigation,
      // Saved navigation is returned exactly as saved. The default links below
      // are handed out once, when the workspace is created — reading must never
      // add one back, or deleting it in Settings → Sidebar would not stick.
      sections: Array.isArray(settings.sections)
        ? settings.sections
        : fallback.sections,
      // Saved before this existed means never upgraded. Anything already
      // written carries its own number, so a workspace is only ever restructured
      // once and a link deleted afterwards stays deleted.
      navVersion:
        typeof settings.navVersion === "number" ? settings.navVersion : 0,
      // Default fills rows saved before this field existed.
      sidebarWidth: isValidSidebarWidth(settings.sidebarWidth)
        ? settings.sidebarWidth
        : fallback.sidebarWidth,
      styling: normalizeStyling(settings.styling),
      // A workspace saved before widgets existed has none, and gets the
      // arrangement it was already looking at.
      dashboardWidgets: normalizeDashboardWidgets(settings.dashboardWidgets),
      automationFavoriteNodeKeys: cleanAutomationPaletteKeys(
        settings.automationFavoriteNodeKeys
      ),
      broadcastBlockDefaults: cleanBroadcastBlockDefaults(
        settings.broadcastBlockDefaults
      ),
    }
  }

  return fallback
}

function cleanWorkspaceSettings(
  settings: Partial<WorkspaceSettings>
): WorkspaceSettings {
  const fallback = defaultWorkspaceSettings()
  return {
    icon: isWorkspaceIcon(settings.icon)
      ? settings.icon
      : fallback.icon,
    favicon:
      typeof settings.favicon === "string" ? settings.favicon : fallback.favicon,
    topRightNavigation: Array.isArray(settings.topRightNavigation)
      ? settings.topRightNavigation
      : fallback.topRightNavigation,
    sections: Array.isArray(settings.sections)
      ? settings.sections
      : fallback.sections,
    navVersion:
      typeof settings.navVersion === "number"
        ? settings.navVersion
        : fallback.navVersion,
    sidebarWidth: isValidSidebarWidth(settings.sidebarWidth)
      ? settings.sidebarWidth
      : fallback.sidebarWidth,
    styling: normalizeStyling(settings.styling),
    dashboardWidgets: normalizeDashboardWidgets(settings.dashboardWidgets),
    automationFavoriteNodeKeys: cleanAutomationPaletteKeys(
      settings.automationFavoriteNodeKeys
    ),
    broadcastBlockDefaults: cleanBroadcastBlockDefaults(
      settings.broadcastBlockDefaults
    ),
  }
}

/** Replaces the workspace's starred automation palette nodes, returning the saved list. */
export async function saveWorkspaceAutomationFavorites(
  userId: string,
  favoriteNodeKeys: string[],
  database: CustomShellDb = db
): Promise<string[]> {
  // A write, so making one is fair — somebody saving a workspace setting means
  // to have a workspace. It is *reading* that must never create.
  const workspace = await startWorkspaceFor(userId, database)
  const settings = {
    ...parseWorkspaceSettings(workspace.settings),
    automationFavoriteNodeKeys: cleanAutomationPaletteKeys(favoriteNodeKeys),
  }
  await database
    .update(customShellWorkspaces)
    .set({ settings, updatedAt: now() })
    .where(eq(customShellWorkspaces.id, workspace.id))
  return settings.automationFavoriteNodeKeys
}

/**
 * Remembers how one kind of newsletter block should start out, and answers with
 * every kind's setup afterwards.
 *
 * One kind at a time, because that is how it is edited — the left panel has one
 * block open at once. It takes a whole block rather than loose content so the
 * one schema that already describes a block is what checks it, here and on the
 * way back out.
 *
 * The block must already have been through `sanitizeBlocks`. A rich-text setup
 * saved here is written into real blocks later and drawn on the page before the
 * email it lands in ever saves itself, so markup that arrives dirty stays dirty
 * all the way to another admin's browser.
 */
export async function saveWorkspaceBroadcastBlockDefault(
  userId: string,
  block: BroadcastBlock,
  database: CustomShellDb = db
): Promise<BroadcastBlockDefaults> {
  // Same as the favourites above: a write may bring a workspace into being.
  const workspace = await startWorkspaceFor(userId, database)
  const current = parseWorkspaceSettings(workspace.settings)
  const settings = {
    ...current,
    broadcastBlockDefaults: cleanBroadcastBlockDefaults({
      ...current.broadcastBlockDefaults,
      // The block's id is thrown away here — ids belong to blocks in an email,
      // not to the setup new ones are cut from.
      [block.kind]: block.content,
    }),
  }
  await database
    .update(customShellWorkspaces)
    .set({ settings, updatedAt: now() })
    .where(eq(customShellWorkspaces.id, workspace.id))
  return settings.broadcastBlockDefaults
}

function defaultWorkspaceSettings(): WorkspaceSettings {
  return {
    icon: DEFAULT_WORKSPACE_ICON,
    favicon: "",
    topRightNavigation: createDefaultTopRightNavigation(),
    sections: createDefaultWorkspaceSections(),
    // The defaults above are already the current shape, so a new workspace has
    // nothing to be brought forward.
    navVersion: NAVIGATION_VERSION,
    sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
    styling: normalizeStyling(undefined),
    dashboardWidgets: createDefaultDashboardWidgets(),
    automationFavoriteNodeKeys: [],
    broadcastBlockDefaults: {},
  }
}

function createDefaultWorkspaceSections(): ShellSection[] {
  // The account area is a modal opened from the user menu, so it has no sidebar
  // section of its own.
  return [
    {
      // Members never see this section: every entry is admin-only, and the
      // /admin route guard refuses them again server-side.
      id: "section-administration",
      title: "Administration",
      entries: [
        // Users and Plans hang off the Overview beside the feed links, in the
        // order `foldMembershipIntoOverview` leaves them for a sidebar that
        // still had the Membership parent when it was last saved — so a new
        // workspace and an upgraded one read the same.
        overviewLink([...feedsChildLinks(), ...membershipChildLinks()]),
        aiUsageLink(),
        trafficLink(),
        pagesLink(),
      ],
    },
    {
      id: "section-platform-settings",
      title: "Platform settings",
      entries: [
        {
          type: "item",
          id: "item-media",
          label: "Media",
          href: "/admin/media",
          icon: "image",
          visible: true,
        },
        newsletterLink(),
        { ...AUTOMATIONS_LINK },
        {
          type: "item",
          id: "item-settings",
          label: "Settings",
          href: "/admin/settings",
          icon: "settings",
          visible: true,
        },
      ],
    },
  ]
}

function isWorkspaceIcon(value: unknown): value is IconKey {
  return typeof value === "string" && value in iconMeta
}

function isValidSidebarWidth(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MIN_SIDEBAR_WIDTH &&
    value <= MAX_SIDEBAR_WIDTH
  )
}
