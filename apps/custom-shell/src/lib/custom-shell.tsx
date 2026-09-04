import {
  DynamicIcon,
  iconNames,
  type IconName as DynamicLucideIconName,
} from "lucide-react/dynamic"
import {
  createDefaultDashboardWidgets,
  type DashboardWidgetLayout,
} from "@/lib/dashboard/dashboard-widgets"
import {
  createDefaultPageOverrides,
  type ShellPageOverrides,
} from "@/lib/pages/page-visibility"
import {
  createDefaultPublicNavigation,
  type PublicNavigationItem,
  type PublicNavigationLink,
} from "@/lib/pages/public-navigation"
import {
  createDefaultPublicHeader,
  type PublicHeader,
} from "@/lib/pages/public-header"
import {
  createDefaultPublicSeo,
  createDefaultPublicSystemCopy,
  DEFAULT_SOCIAL_CARD_TYPE,
  type PublicSeo,
  type PublicSystemCopy,
  type SocialCardType,
} from "@/lib/pages/public-metadata"
import { createDefaultPublicTheme, type PublicTheme } from "@/lib/public-theme"
import type { PublicFontAsset } from "@/lib/public-font"
import type { FrontPageRow } from "@/lib/pages/front-page"
import type { PublicFaviconSet } from "@/lib/favicon"
import { scaffoldStyling } from "@/lib/layout/scaffold-styling"
import { DEFAULT_SIDEBAR_WIDTH } from "@/lib/layout/sidebar-width"
import { DEFAULT_TOAST_SECONDS } from "@/lib/toast/toast-seconds"
import {
  createDefaultNotificationTypeVisibility,
  type NotificationTypeVisibility,
} from "@/lib/notification-types"
import {
  AppWindowIcon,
  BarChart3Icon,
  BellIcon,
  BookOpenIcon,
  BriefcaseBusinessIcon,
  CalendarIcon,
  ClipboardCheckIcon,
  CreditCardIcon,
  FolderOpenIcon,
  GlobeIcon,
  HeartPulseIcon,
  ImageIcon,
  LayoutDashboardIcon,
  LibraryIcon,
  MailIcon,
  MessageSquarePlusIcon,
  PackageIcon,
  PaletteIcon,
  PanelsTopLeftIcon,
  SettingsIcon,
  ShieldCheckIcon,
  SlidersHorizontalIcon,
  SparklesIcon,
  SunMoonIcon,
  TagIcon,
  TypeIcon,
  UsersIcon,
  WorkflowIcon,
  type LucideIcon,
} from "lucide-react"

export const iconMeta = {
  layoutDashboard: {
    label: "Dashboard",
    icon: LayoutDashboardIcon,
  },
  bookOpen: {
    label: "Book open",
    icon: BookOpenIcon,
  },
  package: {
    label: "Package",
    icon: PackageIcon,
  },
  folderOpen: {
    label: "Folder open",
    icon: FolderOpenIcon,
  },
  mail: {
    label: "Mail",
    icon: MailIcon,
  },
  bell: {
    label: "Notifications",
    icon: BellIcon,
  },
  calendar: {
    label: "Calendar",
    icon: CalendarIcon,
  },
  tag: {
    label: "Tag",
    icon: TagIcon,
  },
  image: {
    label: "Image",
    icon: ImageIcon,
  },
  settings: {
    label: "Settings",
    icon: SettingsIcon,
  },
  barChart3: {
    label: "Analytics",
    icon: BarChart3Icon,
  },
  clipboardCheck: {
    label: "Checklist",
    icon: ClipboardCheckIcon,
  },
  creditCard: {
    label: "Credit card",
    icon: CreditCardIcon,
  },
  heartPulse: {
    label: "Health",
    icon: HeartPulseIcon,
  },
  globe: {
    label: "Globe",
    icon: GlobeIcon,
  },
  users: {
    label: "Users",
    icon: UsersIcon,
  },
  workflow: {
    label: "Workflow",
    icon: WorkflowIcon,
  },
  appWindow: {
    label: "App window",
    icon: AppWindowIcon,
  },
  briefcaseBusiness: {
    label: "Briefcase",
    icon: BriefcaseBusinessIcon,
  },
  palette: {
    label: "Palette",
    icon: PaletteIcon,
  },
  type: {
    label: "Type",
    icon: TypeIcon,
  },
  panelsTopLeft: {
    label: "Panels",
    icon: PanelsTopLeftIcon,
  },
  library: {
    label: "Library",
    icon: LibraryIcon,
  },
  slidersHorizontal: {
    label: "Sliders",
    icon: SlidersHorizontalIcon,
  },
  shieldCheck: {
    label: "Shield",
    icon: ShieldCheckIcon,
  },
  sparkles: {
    label: "Sparkles",
    icon: SparklesIcon,
  },
  messageSquarePlus: {
    label: "Feedback",
    icon: MessageSquarePlusIcon,
  },
} satisfies Record<string, { label: string; icon: LucideIcon }>

export type IconKey = keyof typeof iconMeta
export type ShellIcon = IconKey | string

const dynamicLucideIconNames = new Set<string>(iconNames)

export function isIconKey(value?: string): value is IconKey {
  return Boolean(value && Object.prototype.hasOwnProperty.call(iconMeta, value))
}

export function normalizeDynamicLucideIconName(
  value: string
): DynamicLucideIconName | undefined {
  const cleaned = value
    .trim()
    .replace(/^https?:\/\/lucide\.dev\/icons\//i, "")
    .replace(/[?#].*$/, "")
    .replace(/Icon$/, "")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([a-zA-Z])([0-9])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase()

  return dynamicLucideIconNames.has(cleaned)
    ? (cleaned as DynamicLucideIconName)
    : undefined
}

export function isDynamicLucideIconName(
  value?: string
): value is DynamicLucideIconName {
  return Boolean(value && dynamicLucideIconNames.has(value))
}

export function getShellIconLabel(value?: ShellIcon) {
  if (!value) return "No icon"
  if (isIconKey(value)) return iconMeta[value].label
  if (isDynamicLucideIconName(value)) return getDynamicLucideIconLabel(value)
  return "Custom icon"
}

function getDynamicLucideIconLabel(value: string) {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

export const SHELL_ROLES = ["admin", "member"] as const

export type ShellRole = (typeof SHELL_ROLES)[number]

export type ShellChildItem = {
  id: string
  label: string
  href: string
  icon?: ShellIcon
  /** Switched off in navigation. Absent on older saved links means visible. */
  visible?: boolean
  /** Who sees this item. Absent means everyone. */
  roles?: ShellRole[]
}

export type ShellItem = {
  type: "item"
  id: string
  label: string
  href: string
  icon: ShellIcon
  visible: boolean
  /** Who sees this item. Absent means everyone. */
  roles?: ShellRole[]
  children?: ShellChildItem[]
}

export function isAdminHref(href: string | undefined) {
  return Boolean(href && (href === "/admin" || href.startsWith("/admin/")))
}

/**
 * Navigation is saved per workspace, so a stale or hand-edited entry could
 * still point at an admin page. Members never see those, whatever is stored,
 * and the /admin route guard refuses them a second time server-side.
 */
export function canSeeShellEntry(
  entry: { href?: string; roles?: ShellRole[] },
  role: string
) {
  if (role === "admin") {
    return true
  }
  if (entry.roles?.length && !entry.roles.includes(role as ShellRole)) {
    return false
  }

  return !isAdminHref(entry.href)
}

/** Older saved child links have no visibility field, so only `false` hides. */
export function isShellEntryVisible(entry: { visible?: boolean }) {
  return entry.visible !== false
}

/**
 * A link or child link with no label has nothing to render but its icon, so it
 * would show up in the sidebar and the header shortcuts as a nameless row that
 * still takes a click. New links start blank on purpose, so keep them out of
 * the navigation until they are named. They stay listed in Sidebar settings as
 * a placeholder row, which is where you finish them. Dividers are exempt — a
 * label-less divider is just a rule.
 *
 * `label` is typed as required, but stored sections are read back from jsonb
 * with only an Array.isArray check (`parseWorkspaceSettings`), so a legacy or
 * hand-edited row can still arrive without one. Treat that as unnamed rather
 * than throwing on `.trim()` mid-render.
 */
export function isShellEntryNamed(entry: { label?: string }) {
  return Boolean(entry.label?.trim())
}

/**
 * What a sidebar section with no name is called. Unlike a link, a nameless
 * section still shows in the sidebar, so it needs a name to show — and the
 * sidebar, the settings placeholder and the delete confirmation all have to
 * use the same one, which is why it lives here instead of in all three.
 */
export const UNTITLED_SECTION_LABEL = "Untitled section"

/**
 * Is this link the page we are on? Both the sidebar and the header's shortcut
 * row ask, so the rule lives here once — two copies drifted apart and the
 * header's kept the bug the sidebar's had already fixed.
 *
 * The blank check is the whole reason this is worth sharing. A new link starts
 * with no address, and `"".startsWith`-style prefix matching would say a blank
 * address matches every page — which made one unfinished link's children turn
 * up in the header on every screen in the app.
 */
export function isActiveShellHref(href: string | undefined, currentPath: string) {
  const link = href?.trim()
  if (!link) return false

  return link === currentPath || (link !== "/" && currentPath.startsWith(`${link}/`))
}

export type ShellDivider = {
  type: "divider"
  id: string
  label: string
}

export type ShellEntry = ShellItem | ShellDivider

export type ShellSection = {
  id: string
  title: string
  entries: ShellEntry[]
}

export const TOP_RIGHT_NAVIGATION_ITEM_IDS = [
  "feedback",
  "theme",
  "notifications",
] as const

export type ShellTopRightNavigationItemId =
  (typeof TOP_RIGHT_NAVIGATION_ITEM_IDS)[number]

/**
 * One of the three fixed header controls. It can be reordered and switched
 * off, but never renamed, re-iconed or deleted — switching it off is how it is
 * removed, and it stays in the editor with a "Hidden" pill so it can come back.
 */
export type ShellTopRightBuiltIn = {
  type: "builtIn"
  id: ShellTopRightNavigationItemId
  visible: boolean
}

/** An app-owned control that shares the fixed controls' order and visibility. */
export type ShellTopRightAppAction = {
  type: "app"
  id: string
  visible: boolean
}

/**
 * A link an admin added to the header row: a name, an icon and an address,
 * rendered like the Feedback button. Unlike a built-in it has no hidden state —
 * it is deleted outright instead.
 */
export type ShellTopRightLink = {
  type: "link"
  id: string
  label: string
  href: string
  icon: ShellIcon
}

export type ShellTopRightNavigationItem =
  | ShellTopRightBuiltIn
  | ShellTopRightAppAction
  | ShellTopRightLink

export function isShellTopRightLink(
  item: ShellTopRightNavigationItem
): item is ShellTopRightLink {
  return item.type === "link"
}

/**
 * What the three built-ins are called and drawn as in the editor. The header
 * itself renders the real controls, not these — this is only how the chips in
 * Settings → Top right menu present them.
 */
export const topRightBuiltInMeta: Record<
  ShellTopRightNavigationItemId,
  { label: string; icon: LucideIcon }
> = {
  feedback: { label: "Feedback", icon: MessageSquarePlusIcon },
  theme: { label: "Theme", icon: SunMoonIcon },
  notifications: { label: "Notifications", icon: BellIcon },
}

export type ShellConfig = {
  appName: string
  /**
   * The name of the site the reader is in — read from that site's own row and
   * written back to it, so this is how a site is renamed from Settings. It is
   * *not* an app-wide value that overrides anything; the switcher draws every
   * row from its own name.
   */
  workspaceName: string
  dashboardRowsPerPage: number
  /** How many seconds a success message stays on screen. Failures ignore it. */
  toastSeconds: number
  /**
   * Most top-bar links to draw before the rest fold into a "more" menu. Zero
   * means no limit, which is what every install had before this setting.
   */
  topLeftNavLimit: number
  // Draggable, per-workspace sidebar width in px. See lib/layout/sidebar-width.ts.
  sidebarWidth: number
  /** Route the home page (/) and /admin open for an admin; empty = Settings. */
  adminRoute: string
  /**
   * Route the home page opens for everybody else. Empty falls back to the first
   * link in the sidebar an admin built for them.
   */
  memberHomeRoute: string
  /** App-wide browser-tab image selected from the media library. */
  favicon: string
  /** Optional app-wide browser-tab image for dark browser chrome. */
  faviconDark: string
  /** Server-generated PNG sizes for the selected favicon images. */
  faviconSet: PublicFaviconSet | null
  /**
   * App-wide brand image drawn above the signed-out pages (sign in, register,
   * reset, pricing). A media-library URL, empty for no logo. It is app-wide for
   * the same reason as the favicon: these pages load before anybody has signed
   * in or picked a workspace.
   */
  logo: string
  /**
   * The same brand image redrawn for a dark background, used only while the
   * visitor is in dark mode. Optional: empty means the one logo above is shown
   * on both backgrounds, which is exactly how the app behaved before this
   * existed. A global for the same reason as `logo`.
   */
  logoDark: string
  /** App-wide image used by link previews for every public page. */
  shareImage: string
  /** Server-written version added to the share image URL after replacement. */
  shareImageVersion: string
  /** The compact or large-image X card used by every public page. */
  socialCardType: SocialCardType
  /** App-wide X account name, stored without the leading @. */
  socialHandle: string
  /** Home-page metadata and the fallback description for public pages. */
  publicSeo: PublicSeo
  /** Editable headings and bodies for the public 404 and maintenance pages. */
  publicSystemCopy: PublicSystemCopy
  /** Ordered app-wide rows that replace the built-in public front page. */
  frontPageRows: FrontPageRow[]
  /** App-wide on one-site apps; saved per workspace when domains enable multisite. */
  publicNavigation: PublicNavigationItem[]
  /** App-wide on one-site apps; saved per workspace when domains enable multisite. */
  publicFooter: PublicNavigationLink[]
  /** The short line shown beneath the public footer links. */
  publicFooterCopyright: string
  /** App-wide layout choices for the signed-out header. */
  publicHeader: PublicHeader
  /** Public font and corners, plus the active public site's brand colour. */
  publicTheme: PublicTheme
  /** One app-wide uploaded WOFF2 font, or null when none has been added. */
  publicFont: PublicFontAsset | null
  /** The signed-in admin's own header row, saved on their workspace. */
  topRightNavigation: ShellTopRightNavigationItem[]
  /**
   * The header row every member sees, built by an admin and saved app-wide —
   * the same one-list-in-one-place rule as memberSections, and for the same
   * reason: members used to get a private frozen copy nobody could edit.
   */
  memberTopRightNavigation: ShellTopRightNavigationItem[]
  /** The signed-in admin's own sidebar, saved on their workspace. */
  sections: ShellSection[]
  /**
   * The sidebar every member sees, built by an admin and saved app-wide rather
   * than per person. Members used to get a private copy of the starter links
   * the first time they signed in, which nobody — not even an admin — could
   * then edit.
   */
  memberSections: ShellSection[]
  /**
   * Whether a browser holds a connection open so the bell lights up the moment
   * something happens. Off, the bell still updates — just on its slow check
   * instead, up to a minute later. App-wide, and here rather than in an
   * environment variable so it can be switched off without a redeploy.
   */
  liveNotifications: boolean
  /** Which kinds appear in members' notification lists and unread counts. */
  notificationTypes: NotificationTypeVisibility
  /** App-wide lockout: members see the maintenance page, admins keep working. */
  maintenance: ShellMaintenance
  /** App-wide stop on every automation run. See ShellAutomationPause. */
  automationPause: ShellAutomationPause
  /** App-wide limits on how long a sign-in lasts. See ShellSessionPolicy. */
  sessionPolicy: ShellSessionPolicy
  /**
   * What has been changed about individual public pages, keyed by address. A
   * page with no entry is untouched and behaves as the shell ships it — see
   * `lib/pages/page-visibility.ts`.
   */
  pages: ShellPageOverrides
  /** Per-workspace visual styling: spacing, card border, backgrounds. */
  styling: ShellStyling
  /**
   * Which cards the Overview dashboard draws, and where. Saved per workspace
   * like the sidebar, so two admins can arrange their own. See
   * `lib/dashboard/dashboard-widgets.ts`.
   */
  dashboardWidgets: DashboardWidgetLayout
}

export const DASHBOARD_ROWS_PER_PAGE_OPTIONS = [10, 20, 25, 50] as const
export const DEFAULT_DASHBOARD_ROWS_PER_PAGE = 10

/** Zero is "show them all" and heads the list, because it is the default. */
export const TOP_LEFT_NAV_LIMIT_OPTIONS = [0, 3, 4, 5, 6, 7, 8] as const
export const DEFAULT_TOP_LEFT_NAV_LIMIT = 0

/**
 * A saved limit is only honoured if it is one of the offered choices. Anything
 * else — a row written before this setting existed, or a hand-edited value —
 * falls back to showing every link, which is how the top bar always behaved.
 */
export function normalizeTopLeftNavLimit(value: unknown): number {
  return TOP_LEFT_NAV_LIMIT_OPTIONS.includes(
    value as (typeof TOP_LEFT_NAV_LIMIT_OPTIONS)[number]
  )
    ? (value as number)
    : DEFAULT_TOP_LEFT_NAV_LIMIT
}

// ---------------------------------------------------------------------------
// Maintenance mode (Settings → General). App-wide, not per-workspace: it is the
// front door for everybody, so it lives in the global settings row.

export type ShellMaintenance = {
  enabled: boolean
}

export function createDefaultMaintenance(): ShellMaintenance {
  return { enabled: false }
}

/**
 * A saved value can predate this setting or have been hand-edited in the
 * database, and the maintenance page is the one screen a locked-out member can
 * reach — so anything that is not clearly a flag and a string reads as "off".
 */
export function normalizeMaintenance(value: unknown): ShellMaintenance {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return createDefaultMaintenance()
  }

  return { enabled: (value as Partial<ShellMaintenance>).enabled === true }
}


// ---------------------------------------------------------------------------
// The automations kill switch (Automations page). App-wide like maintenance
// mode, and in the same global settings row: one flow misbehaving at eleven at
// night is stopped in one click rather than by pausing flows one at a time.
//
// Nothing is thrown away while it is on. A run that was part-way through stays
// exactly where it stopped and carries on from there when you switch it back
// off — see `server/automations/pause.ts` for the whole rule in one place.

export type ShellAutomationPause = {
  enabled: boolean
  /**
   * The name of the admin who last flipped it, either way, and when — the
   * record of the flip. Empty on an install where nobody ever has.
   *
   * This app has no activity log any more (the table was dropped in migration
   * 0009), so the record of who stopped everything and when lives on the switch
   * itself and is shown on screen while it is on.
   */
  changedBy: string
  /** When they flipped it, as an ISO timestamp. Empty when nobody ever has. */
  changedAt: string
}

/** A name longer than this is not a name; it is somebody pasting an essay. */
export const MAX_AUTOMATION_PAUSE_NAME_LENGTH = 120

export function createDefaultAutomationPause(): ShellAutomationPause {
  return { enabled: false, changedBy: "", changedAt: "" }
}

/**
 * A saved value can predate this setting or have been hand-edited in the
 * database. Only a real `true` stops the engine — anything else reads as
 * running, because a junk value in the row silently freezing every automation
 * is far worse than one that is ignored.
 */
export function normalizeAutomationPause(value: unknown): ShellAutomationPause {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return createDefaultAutomationPause()
  }

  const pause = value as Partial<ShellAutomationPause>
  return {
    enabled: pause.enabled === true,
    changedBy:
      typeof pause.changedBy === "string"
        ? pause.changedBy.slice(0, MAX_AUTOMATION_PAUSE_NAME_LENGTH)
        : "",
    changedAt: typeof pause.changedAt === "string" ? pause.changedAt : "",
  }
}


// ---------------------------------------------------------------------------
// Session policy (Settings → Security). App-wide like maintenance mode, and
// written only by its own confirmed save (server/auth/session-policy.ts) — never by
// the settings page's auto-save, so a stale page cannot quietly loosen it.

export type ShellSessionPolicy = {
  /** Longest a sign-in can last, in days. 0 = no limit. */
  maxAgeDays: number
  /** How long someone can be away before they are signed out, in minutes. 0 = never. */
  idleMinutes: number
}

/** The choices the Security tab offers for how long a sign-in lasts. */
export const SESSION_MAX_AGE_DAY_OPTIONS = [0, 1, 7, 30, 90, 365] as const

/** The choices for how long someone can be away before being signed out. */
export const SESSION_IDLE_MINUTE_OPTIONS = [
  0, 15, 30, 60, 240, 480, 1440, 10080,
] as const

/**
 * The shortest idle limit allowed anywhere, not just in the dropdown. The
 * idle clock is only written once a minute (see server/auth/security.ts), so a
 * shorter limit would sign out people who are actively clicking around. A
 * hand-edited row or crafted save below it is raised to it.
 */
export const MIN_SESSION_IDLE_MINUTES = 15

/** Both limits off — exactly how the app behaved before this setting existed. */
export function createDefaultSessionPolicy(): ShellSessionPolicy {
  return { maxAgeDays: 0, idleMinutes: 0 }
}

/**
 * A saved value can predate this setting or have been hand-edited in the
 * database. Anything that is not a whole non-negative number reads as "off",
 * because a junk value must never sign the whole app out.
 */
export function normalizeSessionPolicy(value: unknown): ShellSessionPolicy {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return createDefaultSessionPolicy()
  }

  const policy = value as Partial<ShellSessionPolicy>
  const idleMinutes = normalizePolicyNumber(policy.idleMinutes)
  return {
    maxAgeDays: normalizePolicyNumber(policy.maxAgeDays),
    idleMinutes:
      idleMinutes === 0
        ? 0
        : Math.max(idleMinutes, MIN_SESSION_IDLE_MINUTES),
  }
}

function normalizePolicyNumber(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : 0
}


// ---------------------------------------------------------------------------
// Styling (Settings → Styling tab). Applied at runtime via inline CSS vars on
// the shell wrapper (chrome background) and DashboardContent (gutter, card
// border, content background); mirrors the --sidebar-width pattern.
// ---------------------------------------------------------------------------

export type ShellBackgroundMode = "default" | "muted" | "custom"

export type ShellBackground = {
  /** default = keep the theme's own token; muted = theme muted at a strength; custom = a fixed color. */
  mode: ShellBackgroundMode
  /** 0–100, applied when mode === "muted". */
  strength: number
  /** CSS color, applied when mode === "custom". */
  color: string
}

export type ShellStyling = {
  /** Outer padding + gap between cards, in px (0–48). 0 = flat mode. */
  gutter: number
  /** Card border width in px (0 = off). */
  cardBorderWidth: number
  /** Card + table border color. */
  cardBorderColor: ShellBackground
  /** Divider lines: the rules inside cards and tables, and the sidebar edge. */
  dividerColor: ShellBackground
  /** Main content area background. */
  content: ShellBackground
  /** Sidebar + sticky header background. */
  chrome: ShellBackground
  /** Dialog / modal styling. */
  modal: ShellModalStyling
}

export type ShellModalStyling = {
  /** Modal surface background. */
  background: ShellBackground
  /** Modal border width in px (0 = off). */
  borderWidth: number
  /** Modal border color. */
  borderColor: ShellBackground
  /** Inner padding in px. */
  padding: number
  /** Backdrop dimming behind the modal, 0–100. */
  overlayOpacity: number
  /** Background of cards inside the modal. */
  cardBackground: ShellBackground
  /** Border width of cards inside the modal, in px (0 = off). */
  cardBorderWidth: number
  /** Border color of cards inside the modal. */
  cardBorderColor: ShellBackground
}

export const MIN_CONTENT_GUTTER = 0
export const MAX_CONTENT_GUTTER = 48
export const DEFAULT_CONTENT_GUTTER = 14
export const MAX_CARD_BORDER_WIDTH = 3
export const DEFAULT_CARD_BORDER_WIDTH = 1
export const MAX_MODAL_PADDING = 48
export const DEFAULT_MODAL_PADDING = 20
export const DEFAULT_MODAL_OVERLAY_OPACITY = 8
// Fallback strength used when a stored value is missing/invalid.
export const DEFAULT_CONTENT_BACKGROUND_STRENGTH = 60
export const SHELL_BACKGROUND_MODES: readonly ShellBackgroundMode[] = [
  "default",
  "muted",
  "custom",
] as const

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.round(value)))
}

export function clampGutter(value: unknown): number {
  return clampInt(value, MIN_CONTENT_GUTTER, MAX_CONTENT_GUTTER, DEFAULT_CONTENT_GUTTER)
}

export function clampCardBorderWidth(value: unknown): number {
  return clampInt(value, 0, MAX_CARD_BORDER_WIDTH, DEFAULT_CARD_BORDER_WIDTH)
}

export function clampStrength(value: unknown): number {
  return clampInt(value, 0, 100, DEFAULT_CONTENT_BACKGROUND_STRENGTH)
}

export function clampModalPadding(value: unknown): number {
  return clampInt(value, 0, MAX_MODAL_PADDING, DEFAULT_MODAL_PADDING)
}

export function clampOverlayOpacity(value: unknown): number {
  return clampInt(value, 0, 100, DEFAULT_MODAL_OVERLAY_OPACITY)
}

// The out-of-the-box look for a new workspace/app and every reset. These are the
// tuned values captured from Tyler's own workspace, kept verbatim (some settings
// are deliberately left on "default"/Automatic) so a reset lands on the look he
// actually wants rather than the raw theme colors.
export function createDefaultModalStyling(): ShellModalStyling {
  return {
    background: { mode: "muted", strength: 44, color: "#ffffff" },
    borderWidth: 1,
    borderColor: { mode: "default", strength: 28, color: "#d4d4d8" },
    padding: 20,
    overlayOpacity: 8,
    cardBackground: { mode: "muted", strength: 0, color: "#ffffff" },
    cardBorderWidth: 1,
    cardBorderColor: { mode: "muted", strength: 6, color: "#d4d4d8" },
  }
}

export function createDefaultStyling(): ShellStyling {
  if (scaffoldStyling) {
    return {
      ...scaffoldStyling,
      cardBorderColor: { ...scaffoldStyling.cardBorderColor },
      dividerColor: { ...scaffoldStyling.dividerColor },
      content: { ...scaffoldStyling.content },
      chrome: { ...scaffoldStyling.chrome },
      modal: {
        ...scaffoldStyling.modal,
        background: { ...scaffoldStyling.modal.background },
        borderColor: { ...scaffoldStyling.modal.borderColor },
        cardBackground: { ...scaffoldStyling.modal.cardBackground },
        cardBorderColor: { ...scaffoldStyling.modal.cardBorderColor },
      },
    }
  }

  return {
    gutter: 14,
    cardBorderWidth: 1,
    cardBorderColor: { mode: "muted", strength: 7, color: "#d4d4d8" },
    // Starting value only — Tyler tunes this live, then it gets captured here.
    dividerColor: { mode: "muted", strength: 10, color: "#d4d4d8" },
    content: { mode: "muted", strength: 95, color: "#f4f4f5" },
    chrome: { mode: "muted", strength: 27, color: "#ffffff" },
    modal: createDefaultModalStyling(),
  }
}

function normalizeBackground(
  value: unknown,
  fallback: ShellBackground
): ShellBackground {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...fallback }
  }
  const bg = value as Partial<ShellBackground>
  return {
    mode: SHELL_BACKGROUND_MODES.includes(bg.mode as ShellBackgroundMode)
      ? (bg.mode as ShellBackgroundMode)
      : fallback.mode,
    strength: clampStrength(bg.strength ?? fallback.strength),
    color: typeof bg.color === "string" && bg.color.trim() ? bg.color : fallback.color,
  }
}

export function normalizeStyling(value: unknown): ShellStyling {
  const fallback = createDefaultStyling()
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fallback
  }
  const styling = value as Partial<ShellStyling>
  return {
    gutter: clampGutter(styling.gutter ?? fallback.gutter),
    cardBorderWidth: clampCardBorderWidth(
      styling.cardBorderWidth ?? fallback.cardBorderWidth
    ),
    cardBorderColor: normalizeBackground(
      styling.cardBorderColor,
      fallback.cardBorderColor
    ),
    dividerColor: normalizeBackground(
      styling.dividerColor,
      fallback.dividerColor
    ),
    content: normalizeBackground(styling.content, fallback.content),
    chrome: normalizeBackground(styling.chrome, fallback.chrome),
    modal: normalizeModalStyling(styling.modal),
  }
}

export function normalizeModalStyling(value: unknown): ShellModalStyling {
  const fallback = createDefaultModalStyling()
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fallback
  }
  const modal = value as Partial<ShellModalStyling>
  return {
    background: normalizeBackground(modal.background, fallback.background),
    borderWidth: clampCardBorderWidth(modal.borderWidth ?? fallback.borderWidth),
    borderColor: normalizeBackground(modal.borderColor, fallback.borderColor),
    padding: clampModalPadding(modal.padding ?? fallback.padding),
    overlayOpacity: clampOverlayOpacity(
      modal.overlayOpacity ?? fallback.overlayOpacity
    ),
    cardBackground: normalizeBackground(
      modal.cardBackground,
      fallback.cardBackground
    ),
    cardBorderWidth: clampCardBorderWidth(
      modal.cardBorderWidth ?? fallback.cardBorderWidth
    ),
    cardBorderColor: normalizeBackground(
      modal.cardBorderColor,
      fallback.cardBorderColor
    ),
  }
}

type ResolveBackgroundOptions = {
  /** CSS custom property to blend for the "muted" mode (default --muted). */
  base?: string
  /**
   * When true, "muted" blends toward the opaque background instead of
   * transparent — used for chrome so the sidebar and header render the same
   * solid color regardless of what sits behind them.
   */
  opaque?: boolean
}

/**
 * Resolve a background/color to a CSS color string, or undefined when the
 * theme's own token should be left in place (mode === "default").
 */
export function resolveBackground(
  bg: ShellBackground,
  options: ResolveBackgroundOptions = {}
): string | undefined {
  const { base = "--muted", opaque = false } = options
  if (bg.mode === "custom") return bg.color
  if (bg.mode === "muted") {
    const mixWith = opaque ? "var(--background)" : "transparent"
    return `color-mix(in oklab, var(${base}) ${clampStrength(bg.strength)}%, ${mixWith})`
  }
  return undefined
}

/**
 * CSS custom properties for modal styling. Applied to the document root (via an
 * effect in ShellLayout) so they reach the dialog, which portals to document.body
 * outside the shell subtree. Consumed by the modal rules in theme.css. Values in
 * "default" mode are omitted so the theme's own tokens show through.
 */
export function getModalStyleVars(modal: ShellModalStyling): Record<string, string> {
  const vars: Record<string, string> = {
    "--shell-modal-overlay-opacity": `${clampOverlayOpacity(modal.overlayOpacity)}%`,
    "--shell-modal-padding": `${clampModalPadding(modal.padding)}px`,
    "--shell-modal-border-width": String(clampCardBorderWidth(modal.borderWidth)),
    "--shell-modal-card-border-width": String(
      clampCardBorderWidth(modal.cardBorderWidth)
    ),
  }
  const background = resolveBackground(modal.background, {
    base: "--muted",
    opaque: true,
  })
  if (background) vars["--shell-modal-bg"] = background
  const borderColor = resolveBackground(modal.borderColor, {
    base: "--muted-foreground",
  })
  if (borderColor) vars["--shell-modal-border-color"] = borderColor
  const cardBackground = resolveBackground(modal.cardBackground, {
    base: "--muted",
    opaque: true,
  })
  if (cardBackground) vars["--shell-modal-card-bg"] = cardBackground
  const cardBorderColor = resolveBackground(modal.cardBorderColor, {
    base: "--muted-foreground",
  })
  if (cardBorderColor) vars["--shell-modal-card-border-color"] = cardBorderColor
  return vars
}

/** The full set of modal CSS variable names, used to clear stale values. */
export const MODAL_STYLE_VAR_NAMES = [
  "--shell-modal-overlay-opacity",
  "--shell-modal-padding",
  "--shell-modal-border-width",
  "--shell-modal-border-color",
  "--shell-modal-bg",
  "--shell-modal-card-border-width",
  "--shell-modal-card-border-color",
  "--shell-modal-card-bg",
] as const

/**
 * Border CSS custom properties from the Styling settings, applied to the
 * document root (via an effect in ShellLayout) so they reach content that
 * portals to document.body — popovers, dropdown menus, selects, sheets, and
 * toasts. Inside the shell subtree the same values are already set closer to
 * the content (ShellLayout's wrapper and DashboardContent), so this only
 * changes what the portaled layers see. Values in "default" mode are omitted
 * so the theme's own tokens show through.
 */
export function getBorderStyleVars(styling: ShellStyling): Record<string, string> {
  const vars: Record<string, string> = {
    "--shell-card-border-width": String(
      clampCardBorderWidth(styling.cardBorderWidth)
    ),
  }
  const dividerColor = resolveBackground(styling.dividerColor, {
    base: "--muted-foreground",
  })
  if (dividerColor) {
    vars["--border"] = dividerColor
    vars["--sidebar-border"] = dividerColor
  }
  const cardBorderColor = resolveBackground(styling.cardBorderColor, {
    base: "--muted-foreground",
  })
  if (cardBorderColor) vars["--shell-card-border-color"] = cardBorderColor
  return vars
}

/** The full set of border CSS variable names, used to clear stale values. */
export const BORDER_STYLE_VAR_NAMES = [
  "--border",
  "--sidebar-border",
  "--shell-card-border-width",
  "--shell-card-border-color",
] as const

export function createDefaultTopRightNavigation(
  appActionIds: readonly string[] = []
): ShellTopRightNavigationItem[] {
  return [
    ...appActionIds.map((id) => ({
      type: "app" as const,
      id,
      visible: true,
    })),
    ...TOP_RIGHT_NAVIGATION_ITEM_IDS.map((id) => ({
      type: "builtIn" as const,
      id,
      visible: true,
    })),
  ]
}

export function createDefaultShellConfig(): ShellConfig {
  return {
    appName: "",
    workspaceName: "",
    dashboardRowsPerPage: DEFAULT_DASHBOARD_ROWS_PER_PAGE,
    toastSeconds: DEFAULT_TOAST_SECONDS,
    topLeftNavLimit: DEFAULT_TOP_LEFT_NAV_LIMIT,
    sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
    adminRoute: "",
    memberHomeRoute: "",
    favicon: "",
    faviconDark: "",
    faviconSet: null,
    logo: "",
    logoDark: "",
    shareImage: "",
    shareImageVersion: "",
    socialCardType: DEFAULT_SOCIAL_CARD_TYPE,
    socialHandle: "",
    publicSeo: createDefaultPublicSeo(),
    publicSystemCopy: createDefaultPublicSystemCopy(),
    frontPageRows: [],
    publicNavigation: createDefaultPublicNavigation(),
    publicFooter: [],
    publicFooterCopyright: "",
    publicHeader: createDefaultPublicHeader(),
    publicTheme: createDefaultPublicTheme(),
    publicFont: null,
    topRightNavigation: createDefaultTopRightNavigation(),
    // Like memberSections below: the real starting point for a fresh install,
    // handed out only while the settings row has never held a member list.
    memberTopRightNavigation: createDefaultTopRightNavigation(),
    sections: [],
    // Unlike `sections`, which a workspace fills in when it is created, this is
    // the real starting point — a fresh install has no settings row to read it
    // from, and members would otherwise open the app to nothing at all.
    memberSections: createDefaultMemberSections(),
    liveNotifications: true,
    notificationTypes: createDefaultNotificationTypeVisibility(),
    maintenance: createDefaultMaintenance(),
    automationPause: createDefaultAutomationPause(),
    sessionPolicy: createDefaultSessionPolicy(),
    pages: createDefaultPageOverrides(),
    styling: createDefaultStyling(),
    dashboardWidgets: createDefaultDashboardWidgets(),
  }
}

/**
 * What a brand-new install offers members before an admin has built anything.
 *
 * Deliberately short: their own home page and the changelog are the only two
 * places in this app a member can go. It is a starting point, not a rule — an
 * admin can rename these, reorder them or empty the list out entirely, and an
 * empty list stays empty.
 */
export function createDefaultMemberSections(): ShellSection[] {
  return [
    {
      id: "section-member-home",
      title: "Home",
      entries: [
        {
          type: "item",
          id: "item-member-home",
          label: "Home",
          href: "/home",
          icon: "house",
          visible: true,
        },
      ],
    },
    {
      id: "section-member-updates",
      title: "Updates",
      entries: [
        {
          type: "item",
          id: "item-member-changelog",
          label: "Changelog",
          href: "/changelog",
          icon: "sparkles",
          visible: true,
          children: [
            {
              id: "item-member-whats-new",
              label: "What's new",
              href: "/changelog/whats-new",
              icon: "sparkles",
            },
          ],
        },
      ],
    },
  ]
}

/**
 * Reads whatever the row holds back into the two-way union, keeping the saved
 * order. A built-in is matched by its id alone, so a row saved in the old
 * `{ id, visible }` shape — before links existed — reads exactly the same as
 * one saved by the editor. Anything that is neither a known built-in nor a
 * well-formed link is dropped, and any built-in missing from the saved list is
 * appended, so the three fixed controls can be hidden but never lost.
 */
export function normalizeTopRightNavigation(
  items: unknown,
  appActionIds: readonly string[] = []
): ShellTopRightNavigationItem[] {
  const fallback = createDefaultTopRightNavigation(appActionIds)
  if (!Array.isArray(items)) {
    return fallback
  }

  const builtInIds = new Set<string>(TOP_RIGHT_NAVIGATION_ITEM_IDS)
  const appIds = new Set(appActionIds)
  const seenIds = new Set<string>()
  const kept: ShellTopRightNavigationItem[] = []

  for (const raw of items) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue
    const item = raw as Partial<ShellTopRightLink> & { visible?: unknown }
    if (typeof item.id !== "string" || !item.id || seenIds.has(item.id)) continue

    if (builtInIds.has(item.id)) {
      seenIds.add(item.id)
      kept.push({
        type: "builtIn",
        id: item.id as ShellTopRightNavigationItemId,
        // Missing reads as shown: hiding is a deliberate saved `false`.
        visible: item.visible !== false,
      })
      continue
    }

    if (appIds.has(item.id)) {
      seenIds.add(item.id)
      kept.push({
        type: "app",
        id: item.id,
        visible: item.visible !== false,
      })
      continue
    }

    if (
      item.type === "link" &&
      typeof item.label === "string" &&
      typeof item.href === "string" &&
      typeof item.icon === "string"
    ) {
      seenIds.add(item.id)
      kept.push({
        type: "link",
        id: item.id,
        label: item.label,
        href: item.href,
        icon: item.icon,
      })
    }
  }

  const missing = fallback.filter((item) => !seenIds.has(item.id))
  return [
    ...missing.filter((item) => item.type === "app"),
    ...kept,
    ...missing.filter((item) => item.type !== "app"),
  ]
}

export function isShellItem(entry: ShellEntry): entry is ShellItem {
  return entry.type === "item"
}

export function renderShellIcon(icon: ShellIcon | undefined, className = "size-4") {
  if (isIconKey(icon)) {
    const Icon = iconMeta[icon].icon
    return <Icon className={className} />
  }

  if (isDynamicLucideIconName(icon)) {
    return (
      <DynamicIcon
        name={icon}
        className={className}
        fallback={() => <ImageIcon className={className} />}
      />
    )
  }

  const Icon = ImageIcon
  return <Icon className={className} />
}
