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
  DEFAULT_SIDEBAR_WIDTH,
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
} from "@/lib/sidebar-width"
import { db, type CustomShellDb } from "@/server/db"
import {
  customShellWorkspaces,
  type CustomShellWorkspace,
} from "@/server/schema"
import { now, uuid } from "@/server/security"

const DEFAULT_WORKSPACE_NAME = "My project"
const DEFAULT_WORKSPACE_ICON = "briefcaseBusiness"

/** The pages that hang off the media library. */
const MEDIA_CHILD_LINKS: ShellChildItem[] = [
  {
    id: "item-media-storage",
    label: "Storage by user",
    href: "/admin/media/storage",
    icon: "hard-drive",
  },
  {
    id: "item-media-orphans",
    label: "Orphaned files",
    href: "/admin/media/orphans",
    icon: "unlink",
  },
]

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
 * Everything about members and money hangs off one parent. The three pages
 * already existed on their own; this is the section they now live under.
 */
const MEMBERSHIP_LINK_ID = "item-admin-membership"
const MEMBERSHIP_HREF = "/admin/membership"

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
    {
      id: "item-admin-revenue",
      label: "Revenue",
      href: "/admin/billing",
      icon: "barChart3",
      roles: ["admin"],
    },
  ]
}

/**
 * The ids the upgrade below looks for, in the order they belong under
 * Membership — read off the links themselves so the two can never disagree.
 */
const MEMBERSHIP_CHILD_IDS: readonly string[] = membershipChildLinks().map(
  (child) => child.id
)

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

/** The automation canvas. */
const AUTOMATIONS_LINK: ShellItem = {
  type: "item",
  id: "item-automations",
  label: "Automations",
  href: "/admin/automations",
  icon: "workflow",
  visible: true,
  roles: ["admin"],
}

/**
 * Bumped when the default sidebar is restructured in a way an existing
 * workspace should pick up. A workspace is brought up to this number once, ever
 * — see `applyNavigationUpgrade`.
 */
export const NAVIGATION_VERSION = 7

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
  // Starred palette nodes in the automation editor, saved per-workspace.
  automationFavoriteNodeKeys: string[]
}

export async function getOrCreateCurrentWorkspace(
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
        await setDefaultWorkspace(userId, existingWorkspace.id, tx),
        tx
      )
    }

    const createdAt = now()
    const [workspace] = await tx
      .insert(customShellWorkspaces)
      .values({
        id: uuid(),
        userId,
        name: DEFAULT_WORKSPACE_NAME,
        settings: defaultWorkspaceSettings(),
        isDefault: true,
        createdAt,
        updatedAt: createdAt,
      })
      .returning()

    if (!workspace) {
      throw new Error("Workspace was not created")
    }

    return workspace
  })
}

/** The workspace switcher's list, already serialized for the browser. */
export async function readWorkspaceList(
  userId: string,
  database: CustomShellDb = db
) {
  const { workspaces, currentWorkspaceId } = await listUserWorkspaces(
    userId,
    database
  )

  return {
    workspaces: workspaces.map((row) =>
      serializeWorkspace(row, currentWorkspaceId)
    ),
  }
}

export async function listUserWorkspaces(
  userId: string,
  database: CustomShellDb = db
) {
  const rows = await database
    .select()
    .from(customShellWorkspaces)
    .where(eq(customShellWorkspaces.userId, userId))
    .orderBy(asc(customShellWorkspaces.createdAt))

  const current =
    rows.find((workspace) => workspace.isDefault) ?? rows[0] ?? null

  return { workspaces: rows, currentWorkspaceId: current?.id ?? null }
}

export async function createUserWorkspace(
  userId: string,
  name: string,
  settings: Partial<WorkspaceSettings> = {},
  database: CustomShellDb = db
) {
  const trimmedName = name.trim()
  if (!trimmedName) {
    throw new Error("Workspace name is required")
  }

  return database.transaction(async (tx) => {
    const createdAt = now()
    const [workspace] = await tx
      .insert(customShellWorkspaces)
      .values({
        id: uuid(),
        userId,
        name: trimmedName.slice(0, 255),
        settings: cleanWorkspaceSettings(settings),
        isDefault: false,
        createdAt,
        updatedAt: createdAt,
      })
      .returning()

    if (!workspace) {
      throw new Error("Workspace was not created")
    }

    return setDefaultWorkspace(userId, workspace.id, tx)
  })
}

export async function updateUserWorkspace(
  userId: string,
  workspaceId: string,
  data: { name: string; settings: Partial<WorkspaceSettings> },
  database: CustomShellDb = db
) {
  const trimmedName = data.name.trim()
  if (!trimmedName) {
    throw new Error("Workspace name is required")
  }

  const [existing] = await database
    .select({ settings: customShellWorkspaces.settings })
    .from(customShellWorkspaces)
    .where(
      and(
        eq(customShellWorkspaces.id, workspaceId),
        eq(customShellWorkspaces.userId, userId)
      )
    )
    .limit(1)

  if (!existing) {
    throw new Error("Workspace not found")
  }

  const [workspace] = await database
    .update(customShellWorkspaces)
    .set({
      name: trimmedName.slice(0, 255),
      settings: cleanWorkspaceSettings({
        ...parseWorkspaceSettings(existing.settings),
        ...data.settings,
      }),
      updatedAt: now(),
    })
    .where(
      and(
        eq(customShellWorkspaces.id, workspaceId),
        eq(customShellWorkspaces.userId, userId)
      )
    )
    .returning()

  if (!workspace) {
    throw new Error("Workspace not found")
  }

  return workspace
}

export async function switchUserWorkspace(
  userId: string,
  workspaceId: string,
  database: CustomShellDb = db
) {
  return database.transaction((tx) =>
    setDefaultWorkspace(userId, workspaceId, tx)
  )
}

export async function deleteUserWorkspace(
  userId: string,
  workspaceId: string,
  database: CustomShellDb = db
) {
  return database.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(customShellWorkspaces)
      .where(eq(customShellWorkspaces.userId, userId))
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

    if (workspace.isDefault) {
      await setDefaultWorkspace(userId, fallback.id, tx)
    }

    const [deleted] = await tx
      .delete(customShellWorkspaces)
      .where(
        and(
          eq(customShellWorkspaces.id, workspaceId),
          eq(customShellWorkspaces.userId, userId)
        )
      )
      .returning({ id: customShellWorkspaces.id })

    if (!deleted) {
      throw new Error("Workspace not found")
    }

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
  database: CustomShellDb = db
): Promise<{ deleted: string[]; kept: string[] }> {
  return database.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(customShellWorkspaces)
      .where(eq(customShellWorkspaces.userId, userId))
      .orderBy(asc(customShellWorkspaces.createdAt))

    const requested = new Set(workspaceIds)
    const owned = rows.filter((row) => requested.has(row.id))
    const untouched = rows.filter((row) => !requested.has(row.id))

    // Whatever was not asked for already survives; otherwise the workspace in
    // use is the one held back, or the oldest when none is marked.
    const survivor =
      untouched[0] ?? owned.find((row) => row.isDefault) ?? owned[0] ?? null
    const targetIds = owned
      .filter((row) => row.id !== survivor?.id)
      .map((row) => row.id)

    if (!survivor || targetIds.length === 0) {
      return { deleted: [], kept: workspaceIds }
    }

    // Deleting the workspace in use moves the user to the one that survives.
    if (owned.some((row) => row.isDefault && row.id !== survivor.id)) {
      await setDefaultWorkspace(userId, survivor.id, tx)
    }

    const deleted = await tx
      .delete(customShellWorkspaces)
      .where(
        and(
          eq(customShellWorkspaces.userId, userId),
          inArray(customShellWorkspaces.id, targetIds)
        )
      )
      .returning({ id: customShellWorkspaces.id })

    const deletedIds = deleted.map((row) => row.id)
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
 * Folds the Feeds section into the Overview: the four links it held become the
 * Overview's children, and the parent goes, because its page has been deleted
 * — the Overview shows what it showed.
 *
 * The four have to keep hanging off one parent rather than become loose
 * top-level links. The strip along the top of the page draws the sidebar link
 * you are on together with its children, and only a link that has children can
 * be the one drawn — so four orphans would each show a single chip where a row
 * of five used to be.
 *
 * They only move into the Overview when they come out as visible as they went
 * in: both links switched on, and the Overview at the top level. A hidden
 * parent hides its children with it, so moving those under a switched-on
 * Overview would put four links back on screen that the admin turned off — the
 * thing `groupMembershipLinks` refuses to do. A hidden Overview would do the
 * reverse and take four away. In those cases, and when the Overview has been
 * deleted, the four are promoted to top-level links standing where the Feeds
 * parent stood, wearing the visibility it had. Nothing appears, nothing
 * vanishes, and each one can still be thrown away on its own afterwards.
 */
export function foldFeedsIntoOverview(
  sections: ShellSection[]
): ShellSection[] {
  const isFeeds = (link: { id: string; href?: string }) =>
    link.id === FEEDS_LINK_ID || link.href === FEEDS_HREF
  const isOverview = (link: { id: string; href?: string }) =>
    link.id === OVERVIEW_LINK_ID || link.href === OVERVIEW_HREF

  const entriesOf = (list: ShellSection[]) =>
    list.flatMap((section) => section.entries)

  // The parent as it was saved, wherever it sits. Matched by address as well
  // as by id, so one somebody deleted and rebuilt by hand is still recognised.
  const feeds = entriesOf(sections).find(
    (entry) => isShellItem(entry) && isFeeds(entry)
  ) as ShellItem | undefined

  // A Feeds link dragged in under another parent holds no children of its own
  // — the rail only nests one level — but it still points at a page that is
  // gone, so it goes too, the way the audit links did.
  const stray = entriesOf(sections).some(
    (entry) => isShellItem(entry) && (entry.children ?? []).some(isFeeds)
  )

  // Nothing to do — including an emptied sidebar, which this step could never
  // have added to anyway.
  if (!feeds && !stray) return sections

  // Top level only: a child cannot hold children, so an Overview somebody
  // nested under another link is not somewhere these four can go.
  const overview = entriesOf(sections).find(
    (entry) => isShellItem(entry) && isOverview(entry)
  ) as ShellItem | undefined

  const moveIn = Boolean(feeds?.visible && overview?.visible)

  // Copied as they were saved, never rebuilt from `feedsChildLinks()`, so a
  // rename, a swapped icon and a role all survive the move.
  const carried = (feeds?.children ?? [])
    .filter((child) => !isFeeds(child))
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
      if (entry === feeds) continue
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

  // What stands where the parent stood when the four cannot move into the
  // Overview. Built here, where the parent is known to exist.
  const standingIn = feeds
    ? arriving.map((child) => promoteFeedsChild(child, feeds))
    : []

  const withoutFeeds = sections.map((section) => ({
    ...section,
    entries: section.entries.flatMap((entry) => {
      // The parent itself: gone, leaving either nothing or the links it held
      // standing in its place.
      if (entry === feeds) return moveIn ? [] : standingIn
      // A second copy of it, and any Feeds link nested under something else.
      if (isShellItem(entry) && isFeeds(entry)) return []
      if (!isShellItem(entry) || !entry.children?.length) return [entry]
      const children = entry.children.filter((child) => !isFeeds(child))
      return children.length === entry.children.length
        ? [entry]
        : [{ ...entry, children }]
    }),
  }))

  if (!moveIn || !arriving.length) return withoutFeeds

  // Appended, not put in front: whatever an admin has already hung off the
  // Overview themselves keeps the place they gave it.
  return withoutFeeds.map((section) => ({
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
function promoteFeedsChild(
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

async function findCurrentWorkspace(userId: string, database: CustomShellDb) {
  const [row] = await database
    .select()
    .from(customShellWorkspaces)
    .where(
      and(
        eq(customShellWorkspaces.userId, userId),
        eq(customShellWorkspaces.isDefault, true)
      )
    )
    .limit(1)

  return row ?? null
}

async function setDefaultWorkspace(
  userId: string,
  workspaceId: string,
  database: Pick<CustomShellDb, "select" | "update">
) {
  const updatedAt = now()
  const [workspace] = await database
    .select()
    .from(customShellWorkspaces)
    .where(
      and(
        eq(customShellWorkspaces.id, workspaceId),
        eq(customShellWorkspaces.userId, userId)
      )
    )
    .limit(1)

  if (!workspace) {
    throw new Error("Workspace not found")
  }

  await database
    .update(customShellWorkspaces)
    .set({ isDefault: false, updatedAt })
    .where(eq(customShellWorkspaces.userId, userId))

  const [updated] = await database
    .update(customShellWorkspaces)
    .set({ isDefault: true, updatedAt })
    .where(
      and(
        eq(customShellWorkspaces.id, workspaceId),
        eq(customShellWorkspaces.userId, userId)
      )
    )
    .returning()

  if (!updated) {
    throw new Error("Workspace not found")
  }

  return updated
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
      automationFavoriteNodeKeys: cleanAutomationPaletteKeys(
        settings.automationFavoriteNodeKeys
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
    automationFavoriteNodeKeys: cleanAutomationPaletteKeys(
      settings.automationFavoriteNodeKeys
    ),
  }
}

/** Replaces the workspace's starred automation palette nodes, returning the saved list. */
export async function saveWorkspaceAutomationFavorites(
  userId: string,
  favoriteNodeKeys: string[],
  database: CustomShellDb = db
): Promise<string[]> {
  const workspace = await getOrCreateCurrentWorkspace(userId, database)
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
    automationFavoriteNodeKeys: [],
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
        overviewLink(feedsChildLinks()),
        membershipLink(membershipChildLinks()),
      ],
    },
    {
      id: "section-platform-settings",
      title: "Platform Settings",
      entries: [
        {
          type: "item",
          id: "item-media",
          label: "Media",
          href: "/admin/media",
          icon: "image",
          visible: true,
          children: MEDIA_CHILD_LINKS.map((child) => ({ ...child })),
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

function isValidSidebarWidth(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MIN_SIDEBAR_WIDTH &&
    value <= MAX_SIDEBAR_WIDTH
  )
}
