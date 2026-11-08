import { and, asc, eq, inArray } from "drizzle-orm"

import {
} from "@/lib/pages/front-page"
import {
  normalizePublicFaviconSet,
  type PublicFaviconSet,
} from "@/lib/favicon"
import { normalizeShareImage } from "@/lib/pages/public-metadata"
import {
  createDefaultTopRightNavigation,
  iconMeta,
  isShellItem,
  type IconKey,
  type ShellChildItem,
  type ShellEntry,
  type ShellItem,
  type ShellSection,
  type ShellTopRightNavigationItem,
} from "@/lib/custom-shell"
import {
  normalizeStyling,
  type ShellStyling,
} from "@/lib/layout/styling-values"
import { cleanAutomationPaletteKeys } from "@/lib/automations/node-registry"
import {
  cleanBroadcastBlockDefaults,
  type BroadcastBlock,
  type BroadcastBlockDefaults,
} from "@/lib/broadcasts/blocks"
import {
  cleanCustomDomain,
  cleanSubdomain,
  customDomainProblem,
  MAX_SUBDOMAIN,
  MIN_SUBDOMAIN,
  subdomainProblem,
} from "@/lib/workspaces/addresses"
import {
  normalizePageOverrides,
  type ShellPageOverrides,
} from "@/lib/pages/page-visibility"
import {
  cleanPublicFooterCopyright,
  cleanPublicNavigationItems,
  cleanPublicNavigationLinks,
  createDefaultPublicNavigation,
  type PublicNavigationItem,
  type PublicNavigationLink,
} from "@/lib/pages/public-navigation"
import {
  normalizePublicBrandTheme,
  type PublicBrandTheme,
} from "@/lib/public-theme"
import {
  WORKSPACE_STATUSES,
  type WorkspaceStatus,
} from "@/lib/workspaces/status"
import { db, type CustomShellDb } from "@/server/db"
import {
  appWorkspaceCopyChoices,
  copyAppWorkspace,
} from "@/server/app-options"
import {
  answerForRequest,
  dropWorkspaceCache,
  workspaceBaseDomain,
} from "@/server/workspaces/host"
import {
  customShellUsers,
  customShellPageBlocks,
  customShellWrittenPages,
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
 * Admin: the one admin dashboard, with Overview, Users and Feedback as its
 * tabs and Plans and Announcements in its ⋮ (Tyler, 8 Nov 2026). It keeps the
 * Overview link's id and address, so a sidebar that moved or hid it keeps
 * that.
 */
const OVERVIEW_LINK_ID = "item-admin-overview"
const OVERVIEW_HREF = "/admin/dashboard"

function adminLink(): ShellItem {
  return {
    type: "item",
    id: OVERVIEW_LINK_ID,
    label: "Admin",
    href: OVERVIEW_HREF,
    icon: "layoutDashboard",
    visible: true,
    roles: ["admin"],
  }
}

/**
 * The retired Membership parent. Its page is gone, and the step for version
 * 14 still folds a saved one into the Overview link.
 */
const MEMBERSHIP_LINK_ID = "item-admin-membership"
const MEMBERSHIP_HREF = "/admin/membership"



const AI_USAGE_LINK_ID = "item-admin-ai-usage"
const AI_USAGE_HREF = "/admin/ai"

const METERED_USAGE_LINK_ID = "item-admin-metered-usage"
const METERED_USAGE_HREF = "/admin/ai-usage"

function meteredUsageChildLink(): ShellChildItem {
  return {
    id: METERED_USAGE_LINK_ID,
    label: "Metered usage",
    href: METERED_USAGE_HREF,
    icon: "barChart3",
    roles: ["admin"],
  }
}

function meteredUsageLink(): ShellItem {
  return {
    type: "item",
    id: METERED_USAGE_LINK_ID,
    label: "Metered usage",
    href: METERED_USAGE_HREF,
    icon: "barChart3",
    visible: true,
    roles: ["admin"],
  }
}

const TRAFFIC_LINK_ID = "item-admin-traffic"
const TRAFFIC_HREF = "/admin/traffic"

const ANALYTICS_LINK_ID = "item-admin-analytics"
const ANALYTICS_HREF = "/admin/analytics"


const CRM_LINK_ID = "item-crm"
const CRM_HREF = "/admin/crm"

/**
 * The CRM: mail that comes in, and the leads it turns into.
 *
 * In Administration rather than beside Newsletter, because it is work somebody
 * does every day. Newsletter is mail the app sends on your behalf; this is mail
 * a person reads and answers, which is a different sort of thing entirely.
 */
function crmLink(): ShellItem {
  return {
    type: "item",
    id: CRM_LINK_ID,
    label: "CRM",
    href: CRM_HREF,
    icon: "inbox",
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


/** Screens that became part of Admin on 8 Nov 2026, or went with it. */
const FEEDBACK_HREF = "/admin/feedback"
const ANNOUNCEMENTS_HREF = "/admin/announcements"
const NOTIFICATIONS_HREF = "/admin/notifications"
const CHANGELOG_HREF = "/changelog"
const USERS_HREF = "/admin/users"
const PLANS_HREF = "/admin/plans"



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

// The Newsletter link and its Contacts child are gone from the default sidebar
// since 7 Nov 2026: those screens are the CRM's tabs (`removeEmailScreenLinks`).
// System emails stays as a child an old step can still hang somewhere.

function newsletterSelfChildLink(): ShellChildItem {
  return { id: `${NEWSLETTER_LINK_ID}-all`, label: "Newsletters", href: NEWSLETTER_HREF }
}

function systemEmailsChildLink(): ShellChildItem {
  return {
    id: SYSTEM_EMAILS_LINK_ID,
    label: "System emails",
    href: SYSTEM_EMAILS_HREF,
  }
}

/**
 * Bumped when the default sidebar is restructured in a way an existing
 * workspace should pick up. A workspace is brought up to this number once, ever
 * — see `applyNavigationUpgrade`.
 */
export const NAVIGATION_VERSION = 23

export type WorkspaceSettings = {
  icon: IconKey
  /**
   * This site's brand pictures, all made from the one logo an admin uploads.
   *
   * The app-wide ones work the same way: you give it a logo, it makes the
   * dark-mode version and cuts the browser-tab icons from both. A site used to
   * ask for a favicon and a dark logo of its own as well, which was three
   * uploads for what one now does, and a site that set its own favicon lost the
   * cut-to-size icons entirely. Tyler called it redundant on 27 Sep 2026.
   *
   * `favicon` and `faviconDark` are the pictures the browser tab is cut from,
   * and `faviconSet` is the cut sizes. A site that has uploaded no logo has all
   * of them empty and falls back to the app-wide ones.
   */
  favicon: string
  faviconDark: string
  faviconSet: PublicFaviconSet | null
  logo: string
  logoDark: string
  shareImage: string
  publicNavigation: PublicNavigationItem[]
  publicFooter: PublicNavigationLink[]
  publicFooterCopyright: string
  /** The brand colour used by this site's signed-out pages. */
  publicTheme: PublicBrandTheme
  topRightNavigation: ShellTopRightNavigationItem[]
  sections: ShellSection[]
  /** How far this workspace's saved sidebar has been brought forward. */
  navVersion: number
  // Visual styling (spacing, card border, backgrounds), saved per-workspace.
  styling: ShellStyling
  // Starred palette nodes in the automation editor, saved per-workspace.
  automationFavoriteNodeKeys: string[]
  // How each kind of newsletter block starts out, saved per-workspace.
  broadcastBlockDefaults: BroadcastBlockDefaults
  /**
   * Which public pages are switched off or members-only, on this site.
   *
   * It used to live in the one app-wide settings row, keyed by the bare
   * address — so one site hiding its `/pricing` hid every site's, and two sites
   * with an `/about` each could not disagree about it. It is a per-site
   * decision, so it is saved per site.
   */
  pages: ShellPageOverrides
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
 *
 * Reads the id alone through `findCurrentWorkspaceId`, the same rule as the
 * full read. Most admin endpoints call this once per request and only scope a
 * query with the answer, so loading and parsing the whole settings row here was
 * wasted. The sidebar is still brought forward where the whole row is read:
 * at sign-in and when the shell settings load.
 */
export async function currentWorkspaceId(
  userId: string,
  database: CustomShellDb = db
): Promise<string> {
  const id = await findCurrentWorkspaceId(userId, database)
  if (!id) throw new Error("No workspace")
  return id
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

/**
 * Put this person in the deployment's ONE site, making it only if there is none.
 *
 * This is what `whoMayHave: "off"` uses instead of `startWorkspaceFor`. The
 * difference is ownership: `startWorkspaceFor` looks for a workspace this
 * PERSON owns and makes them one when they have none, which is how a
 * deployment ends up with a row per admin. Here there is one site for
 * everybody, so the oldest existing workspace is the answer for whoever signs
 * in, and a new one is made only when the table is empty.
 *
 * **Why make one at all.** Everything the shell writes is scoped to a
 * workspace — announcements, media, contacts, the site's own styling and
 * sidebar — and `currentWorkspaceId` throws for somebody in none. "Off" means
 * one site, not no site, so a fresh database still gets its single row on the
 * first sign-in.
 *
 * It is created owned by nobody. With one site there is nobody for it to
 * belong to, and `workspaces.user_id` is nullable for exactly this reason: a
 * site outlives whoever happened to sign in first.
 *
 * **The pointer is written straight here rather than through
 * `setCurrentWorkspace`.** That function is the permission check for the
 * switch endpoint — it refuses a workspace you do not own — and nobody owns
 * this one. Calling it with its check turned off would weaken the real switch
 * for the sake of a sign-in that has nothing to choose between. Same as
 * `pointAtWorkspaceForHost` just above, which writes it directly too.
 */
export async function startOnlyWorkspaceFor(
  userId: string,
  database: CustomShellDb = db
) {
  const current = await findCurrentWorkspace(userId, database)
  if (current) return applyNavigationUpgrade(current, database)

  return database.transaction(async (tx) => {
    const [oldest] = await tx
      .select()
      .from(customShellWorkspaces)
      .orderBy(asc(customShellWorkspaces.createdAt))
      .limit(1)

    let workspace = oldest
    if (!workspace) {
      const createdAt = now()
      const id = uuid()
      const [created] = await tx
        .insert(customShellWorkspaces)
        .values({
          id,
          userId: null,
          name: DEFAULT_WORKSPACE_NAME,
          subdomain: await freeSubdomain(DEFAULT_WORKSPACE_NAME, id, tx),
          settings: defaultWorkspaceSettings(),
          createdAt,
          updatedAt: createdAt,
        })
        .returning()

      if (!created) {
        throw new Error("Workspace was not created")
      }
      workspace = created
      dropWorkspaceCache()
    }

    await tx
      .update(customShellUsers)
      .set({ currentWorkspaceId: workspace.id, updatedAt: now() })
      .where(eq(customShellUsers.id, userId))

    return applyNavigationUpgrade(workspace, tx)
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
    copyChoices: appWorkspaceCopyChoices().map(({ key, label }) => ({
      key,
      label,
    })),
    baseDomain: workspaceBaseDomain(),
  }
}

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

/**
 * Starts a workspace from another reachable workspace's site setup.
 *
 * Settings, written pages and the app hook share one transaction. Anything
 * failing leaves no workspace, page or app row behind. The source is only
 * read, and the new workspace is always a draft.
 */
export async function copyUserWorkspace(
  userId: string,
  sourceWorkspaceId: string,
  name: string,
  settings: Partial<WorkspaceSettings> = {},
  database: CustomShellDb = db,
  address?: Partial<WorkspaceAddress>,
  options: {
    seesEveryWorkspace?: boolean
    choices?: readonly string[]
  } = {}
) {
  const trimmedName = name.trim()
  if (!trimmedName) throw new Error("Workspace name is required")

  const workspace = await database.transaction(async (tx) => {
    const mayReach = reachable(userId, options.seesEveryWorkspace ?? false)
    const [source] = await tx
      .select()
      .from(customShellWorkspaces)
      .where(and(eq(customShellWorkspaces.id, sourceWorkspaceId), mayReach))
      .limit(1)
    if (!source) throw new Error("Workspace not found")

    const createdAt = now()
    const id = uuid()
    const copiedSettings = cleanWorkspaceSettings({
      ...parseWorkspaceSettings(source.settings),
      ...settings,
    })
    const [created] = await tx
      .insert(customShellWorkspaces)
      .values({
        id,
        userId,
        name: trimmedName.slice(0, 255),
        ...(address?.subdomain
          ? cleanAddress({
              subdomain: address.subdomain,
              customDomain: address.customDomain ?? "",
              status: "draft",
            })
          : {
              subdomain: await freeSubdomain(trimmedName, id, tx),
              status: "draft" as const,
            }),
        settings: copiedSettings,
        createdAt,
        updatedAt: createdAt,
      })
      .returning()
      .catch((error) => {
        throw describeAddressClash(error, {
          subdomain: cleanSubdomain(address?.subdomain ?? ""),
          customDomain: cleanCustomDomain(address?.customDomain ?? ""),
          status: "draft",
        })
      })
    if (!created) throw new Error("Workspace was not created")

    const pages = await tx
      .select()
      .from(customShellWrittenPages)
      .where(eq(customShellWrittenPages.workspaceId, sourceWorkspaceId))
    if (pages.length) {
      await tx.insert(customShellWrittenPages).values(
        pages.map((page) => ({
          id: uuid(),
          workspaceId: created.id,
          path: page.path,
          title: page.title,
          hiddenFromSearch: page.hiddenFromSearch,
          canonicalUrl: page.canonicalUrl,
          createdAt,
          updatedAt: createdAt,
        }))
      )
    }

    // Every page's blocks, which is the front page's as well as the written
    // ones'. A copied site that arrived with its addresses and none of their
    // content would be a site of empty pages. The ids come across unchanged:
    // they are unique within a site, and this is a different site.
    const blocks = await tx
      .select()
      .from(customShellPageBlocks)
      .where(eq(customShellPageBlocks.workspaceId, sourceWorkspaceId))
    if (blocks.length) {
      await tx.insert(customShellPageBlocks).values(
        blocks.map((block) => ({
          id: block.id,
          workspaceId: created.id,
          path: block.path,
          position: block.position,
          kind: block.kind,
          appKind: block.appKind,
          settings: block.settings,
          createdAt,
          updatedAt: createdAt,
        }))
      )
    }

    await copyAppWorkspace(
      {
        sourceWorkspaceId,
        newWorkspaceId: created.id,
        choices: options.choices ?? [],
        database: tx,
      }
    )
    return setCurrentWorkspace(userId, created.id, tx)
  })

  dropWorkspaceCache()
  return workspace
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

/**
 * Removes a site and everything filed under it.
 *
 * "Everything" grew with `0050_custom_shell_workspace_content.sql`: the
 * contacts, segments, broadcasts and email settings it always took, and now its
 * announcements, feedback and media rows too. **The media files
 * themselves stay in the bucket** — no foreign key reaches outside the
 * database. They show up on the storage screen as objects nothing points at,
 * which is the same state a deleted account's files end in, and the same button
 * clears them.
 */
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

  // The steps for versions 1 to 12 are gone. On 3 Nov 2026 the oldest sidebar
  // on any live database was at 12 (a Trade site), so none of them could run
  // again. A sidebar older than 12, which only a local test database can hold,
  // skips straight to the steps below.
  let sections = settings.sections
  if (settings.navVersion < 13) {
    sections = addSystemEmailsLink(sections)
  }
  if (settings.navVersion < 14) {
    sections = foldMembershipIntoOverview(sections)
  }
  if (settings.navVersion < 15) {
    sections = removeMediaChildLinks(sections)
  }
  if (settings.navVersion < 17) {
    sections = addPagesLink(sections)
  }
  if (settings.navVersion < 18) {
    sections = addAutomationTemplatesLink(sections)
  }
  if (settings.navVersion < 19) {
    sections = addMeteredUsageLink(sections)
  }
  if (settings.navVersion < 20) {
    sections = addCrmLink(sections)
  }
  if (settings.navVersion < 21) {
    sections = removeSegmentsLink(sections)
  }
  if (settings.navVersion < 22) {
    sections = removeEmailScreenLinks(sections)
  }
  if (settings.navVersion < 23) {
    sections = foldScreensIntoAdmin(sections)
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


/** Adds Metered usage to the group that supplies the shell's top-left menu. */
export function addMeteredUsageLink(
  sections: ShellSection[]
): ShellSection[] {
  if (!sections.length) return sections

  const isMeteredUsage = (link: {
    id: string
    label?: string
    href?: string
  }) => {
    if (
      link.id === METERED_USAGE_LINK_ID ||
      link.href === METERED_USAGE_HREF
    ) {
      return true
    }

    if (link.label?.trim().toLowerCase() !== "metered usage" || !link.href) {
      return false
    }

    try {
      return new URL(link.href).pathname === METERED_USAGE_HREF
    } catch {
      return false
    }
  }

  let savedChild:
    | { sectionIndex: number; entryIndex: number; child: ShellChildItem }
    | undefined
  let savedTopLevel: ShellItem | undefined
  let overview:
    | { sectionIndex: number; entryIndex: number; item: ShellItem }
    | undefined

  sections.forEach((section, sectionIndex) => {
    section.entries.forEach((entry, entryIndex) => {
      if (!isShellItem(entry)) return

      if (!savedTopLevel && isMeteredUsage(entry)) {
        savedTopLevel = entry
      }
      if (
        !overview &&
        (entry.id === OVERVIEW_LINK_ID || entry.href === OVERVIEW_HREF)
      ) {
        overview = { sectionIndex, entryIndex, item: entry }
      }
      const child = entry.children?.find(isMeteredUsage)
      if (!savedChild && child) {
        savedChild = { sectionIndex, entryIndex, child }
      }
    })
  })

  // A saved copy elsewhere supplies its label and icon, but the Overview is
  // still the destination whenever it exists because that group draws the
  // top-left menu on admin pages.
  const target = overview ?? savedChild
  if (target) {
    const child: ShellChildItem = savedChild
      ? { ...savedChild.child, href: METERED_USAGE_HREF }
      : savedTopLevel
        ? {
            id: savedTopLevel.id,
            label: savedTopLevel.label,
            href: METERED_USAGE_HREF,
            icon: savedTopLevel.icon,
            roles: savedTopLevel.roles,
          }
        : meteredUsageChildLink()

    return sections.map((section, sectionIndex) => ({
      ...section,
      entries: section.entries.flatMap<ShellEntry>((entry, entryIndex) => {
        if (isMeteredUsage(entry)) return []
        if (!isShellItem(entry)) return [entry]

        const children = (entry.children ?? []).filter(
          (candidate) => !isMeteredUsage(candidate)
        )
        if (
          sectionIndex !== target.sectionIndex ||
          entryIndex !== target.entryIndex
        ) {
          return [
            children.length === (entry.children ?? []).length
              ? entry
              : { ...entry, children },
          ]
        }

        const plansAt = children.findIndex(
          (candidate) =>
            candidate.id === "item-admin-plans" ||
            candidate.href === "/admin/plans"
        )
        const nextChildren = [...children]
        nextChildren.splice(plansAt >= 0 ? plansAt + 1 : children.length, 0, child)
        return [{ ...entry, children: nextChildren }]
      }),
    }))
  }

  const alreadyThere = sections.some((section) =>
    section.entries.some(isMeteredUsage)
  )
  if (alreadyThere) return sections

  const administration = sections.findIndex(
    (section) => section.id === "section-administration"
  )
  const index = Math.max(0, administration)

  return sections.map((section, at) => {
    if (at !== index) return section
    const entries = [...section.entries]
    entries.push(meteredUsageLink())
    return { ...section, entries }
  })
}

/**
 * Puts the Pages link in a sidebar saved before the page existed. An emptied
 * sidebar stays empty, a
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
 * Puts the CRM link into a sidebar saved before the screen existed, under the
 * Overview.
 *
 * Same rules as every step here: it adds the link once, never doubles one that
 * is already reachable however it got there, and leaves an empty sidebar alone.
 */
export function addCrmLink(sections: ShellSection[]): ShellSection[] {
  if (!sections.length) return sections

  const isCrm = (link: { id: string; href?: string }) =>
    link.id === CRM_LINK_ID || link.href === CRM_HREF

  const alreadyThere = sections.some((section) =>
    section.entries.some(
      (entry) =>
        isCrm(entry) ||
        (isShellItem(entry) && (entry.children ?? []).some(isCrm))
    )
  )
  if (alreadyThere) return sections

  const isOverview = (link: { id: string; href?: string }) =>
    link.id === OVERVIEW_LINK_ID || link.href === OVERVIEW_HREF

  const overviewSection = sections.findIndex((section) =>
    section.entries.some(isOverview)
  )
  const administration = sections.findIndex(
    (section) => section.id === "section-administration"
  )
  // The Administration section when there is one, the first section otherwise:
  // a link nobody can reach is worse than a link in a surprising place.
  const index =
    overviewSection >= 0 ? overviewSection : Math.max(0, administration)

  return sections.map((section, at) => {
    if (at !== index) return section
    const overviewAt = section.entries.findIndex(isOverview)
    const entries = [...section.entries]
    entries.splice(overviewAt >= 0 ? overviewAt + 1 : 0, 0, crmLink())
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
 * with no Newsletter link at all is left alone too.
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
 * Takes the Segments link off wherever it sits. Segments live on the Contacts
 * dashboard's left panel now (Tyler, 19 Oct 2026), and `/admin/segments` only
 * forwards there, so a saved menu keeping the link would hold two ways to the
 * same page.
 */
export function removeSegmentsLink(sections: ShellSection[]): ShellSection[] {
  let changed = false
  const isSegments = (link: { id: string; href?: string }) =>
    link.id === SEGMENTS_LINK_ID || link.href === SEGMENTS_HREF

  const result = sections.map((section) => ({
    ...section,
    entries: section.entries.flatMap((entry) => {
      if (isShellItem(entry) && isSegments(entry)) {
        changed = true
        return []
      }
      if (!isShellItem(entry) || !entry.children?.length) return [entry]
      const children = entry.children.filter((child) => !isSegments(child))
      if (children.length === entry.children.length) return [entry]
      changed = true
      return [children.length ? { ...entry, children } : stripChildren(entry)]
    }),
  }))

  return changed ? result : sections
}

/** The addresses whose screens became tabs, pills and panels of the CRM on 7 Nov 2026. */
const EMAIL_SCREEN_HREFS = new Set([
  NEWSLETTER_HREF,
  CONTACTS_HREF,
  SEGMENTS_HREF,
  SYSTEM_EMAILS_HREF,
  "/admin/dev-outbox",
])
const EMAIL_SCREEN_IDS = new Set([NEWSLETTER_LINK_ID, CONTACTS_LINK_ID, SEGMENTS_LINK_ID, SYSTEM_EMAILS_LINK_ID])

/**
 * Takes the Newsletters, Contacts, Segments, System emails and Dev outbox
 * links out of a sidebar, because each is part of the CRM now (Tyler,
 * 7 Nov 2026: "I want to consolidate them all into one CRM dashboard", then
 * "not linked it outside"). The old addresses still forward into the CRM, so
 * a bookmark keeps working. The Newsletter link goes with everything under
 * it, which was those screens alone.
 */
export function removeEmailScreenLinks(sections: ShellSection[]): ShellSection[] {
  let changed = false
  const isEmailScreen = (link: { id: string; href?: string }) =>
    EMAIL_SCREEN_IDS.has(link.id) || (link.href !== undefined && EMAIL_SCREEN_HREFS.has(link.href))

  const result = sections.map((section) => ({
    ...section,
    entries: section.entries.flatMap((entry): ShellEntry[] => {
      if (!isShellItem(entry)) return [entry]
      if (isEmailScreen(entry)) {
        changed = true
        return []
      }
      const children = (entry.children ?? []).filter((child) => !isEmailScreen(child))
      if (children.length === (entry.children ?? []).length) return [entry]
      changed = true
      return [children.length ? { ...entry, children } : stripChildren(entry)]
    }),
  }))

  return changed ? result : sections
}

/**
 * The links whose screens are part of Admin now, or were removed with it on
 * 8 Nov 2026: Users, Plans, Feedback, Announcements, Analytics and its four
 * old screens, Notifications, Changelog and What's new.
 */
const ADMIN_SCREEN_IDS = new Set([
  "item-admin-users",
  "item-admin-plans",
  "item-feedback",
  "item-admin-announcements",
  "item-notifications",
  "item-changelog",
  "item-referrals",
  ANALYTICS_LINK_ID,
  AI_USAGE_LINK_ID,
  METERED_USAGE_LINK_ID,
  TRAFFIC_LINK_ID,
])
const ADMIN_SCREEN_HREFS = new Set([
  USERS_HREF,
  PLANS_HREF,
  FEEDBACK_HREF,
  ANNOUNCEMENTS_HREF,
  NOTIFICATIONS_HREF,
  CHANGELOG_HREF,
  "/changelog/whats-new",
  "/admin/referrals",
  ANALYTICS_HREF,
  AI_USAGE_HREF,
  METERED_USAGE_HREF,
  TRAFFIC_HREF,
])

/**
 * Folds the admin screens into one Admin link (Tyler, 8 Nov 2026: "consolidate
 * analytics with everything else (except images) into a dashboard called
 * "Admin""). The Overview link becomes Admin: it keeps its place, its shown
 * or hidden and a name somebody gave it, and loses the links hung under it
 * that went into Admin. Every other link to one of those screens goes, and a
 * section left with nothing in it goes too. A sidebar with no Overview link
 * gets Admin where the first of them was, keeping that one's shown or hidden;
 * when every one of them was under another link, Admin goes right after that
 * link. A sidebar with none of them is left as it is.
 */
export function foldScreensIntoAdmin(sections: ShellSection[]): ShellSection[] {
  const isAdminScreen = (link: { id: string; href?: string }) =>
    ADMIN_SCREEN_IDS.has(link.id) || (link.href !== undefined && ADMIN_SCREEN_HREFS.has(link.href))
  const isAdmin = (link: { id: string; href?: string }) =>
    link.id === OVERVIEW_LINK_ID || link.href === OVERVIEW_HREF

  let placed = sections.some((section) =>
    section.entries.some(
      (entry) => isAdmin(entry) || (isShellItem(entry) && (entry.children ?? []).some(isAdmin))
    )
  )
  // A link of its own wins over one under another link, wherever each sits.
  const topLevel = sections.some((section) =>
    section.entries.some((entry) => isShellItem(entry) && isAdminScreen(entry))
  )
  let changed = false

  const result = sections
    .map((section) => ({
      ...section,
      entries: section.entries.flatMap((entry): ShellEntry[] => {
        if (!isShellItem(entry)) return [entry]
        if (isAdmin(entry)) {
          changed = true
          const children = (entry.children ?? []).filter((child) => !isAdminScreen(child))
          const renamed = { ...entry, label: entry.label === "Overview" ? "Admin" : entry.label }
          return [children.length ? { ...renamed, children } : stripChildren(renamed)]
        }
        if (isAdminScreen(entry)) {
          changed = true
          if (placed) return []
          placed = true
          return [{ ...adminLink(), visible: entry.visible ?? true }]
        }
        const children = (entry.children ?? []).filter((child) => !isAdminScreen(child))
        if (children.length === (entry.children ?? []).length) return [entry]
        changed = true
        const kept = children.length ? { ...entry, children } : stripChildren(entry)
        if (placed || topLevel) return [kept]
        placed = true
        return [kept, adminLink()]
      }),
    }))
    .filter((section, index) => section.entries.length > 0 || sections[index].entries.length === 0)

  return changed ? result : sections
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
 * Overview would put links back on screen that the admin turned off. A hidden
 * Overview would do the reverse
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
    visible: Boolean(parent.visible && child.visible !== false),
    ...(child.roles ? { roles: child.roles } : {}),
  }
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
 * The same rule as `findCurrentWorkspace`, answering with the id alone.
 *
 * Beside it rather than derived from it on purpose: the full read parses the
 * workspace's settings and brings its sidebar up to date, and a caller that
 * only wants to know which site to scope a query to should pay for neither. It
 * runs on every content read and on every signed-in page load, so it is worth
 * the twenty lines.
 */
export async function findCurrentWorkspaceId(
  userId: string,
  database: CustomShellDb = db
) {
  const [pointed] = await database
    .select({ id: customShellWorkspaces.id })
    .from(customShellUsers)
    .innerJoin(
      customShellWorkspaces,
      eq(customShellWorkspaces.id, customShellUsers.currentWorkspaceId)
    )
    .where(eq(customShellUsers.id, userId))
    .limit(1)

  if (pointed) return pointed.id

  const [owned] = await database
    .select({ id: customShellWorkspaces.id })
    .from(customShellWorkspaces)
    .where(eq(customShellWorkspaces.userId, userId))
    .orderBy(asc(customShellWorkspaces.createdAt))
    .limit(1)

  return owned?.id ?? null
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
    const settings = value as Partial<WorkspaceSettings> & {
      accentColor?: unknown
    }
    return {
      icon: isWorkspaceIcon(settings.icon) ? settings.icon : fallback.icon,
      favicon:
        typeof settings.favicon === "string"
          ? settings.favicon
          : fallback.favicon,
      faviconDark:
        typeof settings.faviconDark === "string"
          ? settings.faviconDark
          : fallback.faviconDark,
      faviconSet: normalizePublicFaviconSet(settings.faviconSet),
      logo: normalizeShareImage(settings.logo),
      logoDark: normalizeShareImage(settings.logoDark),
      shareImage: normalizeShareImage(settings.shareImage),
      publicNavigation:
        settings.publicNavigation === undefined
          ? fallback.publicNavigation
          : cleanPublicNavigationItems(settings.publicNavigation),
      publicFooter: cleanPublicNavigationLinks(settings.publicFooter),
      publicFooterCopyright: cleanPublicFooterCopyright(
        settings.publicFooterCopyright
      ),
      publicTheme: normalizePublicBrandTheme(
        settings.publicTheme,
        settings.accentColor
      ),
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
      styling: normalizeStyling(settings.styling),
      automationFavoriteNodeKeys: cleanAutomationPaletteKeys(
        settings.automationFavoriteNodeKeys
      ),
      broadcastBlockDefaults: cleanBroadcastBlockDefaults(
        settings.broadcastBlockDefaults
      ),
      // A workspace saved before this moved here has none, which normalizes to
      // an empty map — every page on "everyone", exactly as a fresh site is.
      pages: normalizePageOverrides(settings.pages),
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
    faviconDark:
      typeof settings.faviconDark === "string"
        ? settings.faviconDark
        : fallback.faviconDark,
    faviconSet: normalizePublicFaviconSet(settings.faviconSet),
    logo: normalizeShareImage(settings.logo),
    logoDark: normalizeShareImage(settings.logoDark),
    shareImage: normalizeShareImage(settings.shareImage),
    publicNavigation:
      settings.publicNavigation === undefined
        ? fallback.publicNavigation
        : cleanPublicNavigationItems(settings.publicNavigation),
    publicFooter: cleanPublicNavigationLinks(settings.publicFooter),
    publicFooterCopyright: cleanPublicFooterCopyright(
      settings.publicFooterCopyright
    ),
    publicTheme: normalizePublicBrandTheme(settings.publicTheme),
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
    styling: normalizeStyling(settings.styling),
    automationFavoriteNodeKeys: cleanAutomationPaletteKeys(
      settings.automationFavoriteNodeKeys
    ),
    broadcastBlockDefaults: cleanBroadcastBlockDefaults(
      settings.broadcastBlockDefaults
    ),
    pages: normalizePageOverrides(settings.pages),
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
    faviconDark: "",
    faviconSet: null,
    logo: "",
    logoDark: "",
    shareImage: "",
    publicNavigation: createDefaultPublicNavigation(),
    publicFooter: [],
    publicFooterCopyright: "",
    publicTheme: normalizePublicBrandTheme(undefined),
    topRightNavigation: createDefaultTopRightNavigation(),
    sections: createDefaultWorkspaceSections(),
    // The defaults above are already the current shape, so a new workspace has
    // nothing to be brought forward.
    navVersion: NAVIGATION_VERSION,
    styling: normalizeStyling(undefined),
    automationFavoriteNodeKeys: [],
    broadcastBlockDefaults: {},
    // Nothing hidden. A new site shows every page it has.
    pages: {},
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
        // Admin holds Users, Plans, Feedback and Announcements, so the
        // links that once hung under the Overview are gone (8 Nov 2026).
        adminLink(),
        crmLink(),
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

