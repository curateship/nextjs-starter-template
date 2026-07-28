import {
  DynamicIcon,
  iconNames,
  type IconName as DynamicLucideIconName,
} from "lucide-react/dynamic"

import {
  DEFAULT_TEXT_FONT_ID,
  TEXT_FONT_IDS,
  type TextFontId,
} from "@/lib/text-fonts"
import {
  API_USAGE_DEFAULT_COST_PER_CREDIT_USD,
  API_USAGE_DEFAULT_MONTHLY_CREDITS,
} from "@/lib/api-usage-constants"
import { DEFAULT_DUCK_DB } from "@/lib/audio-ducking"
import { DEFAULT_SIDEBAR_WIDTH } from "@/lib/sidebar-width"
import {
  AppWindowIcon,
  BarChart3Icon,
  BellIcon,
  BookOpenIcon,
  BriefcaseBusinessIcon,
  CalendarIcon,
  ClipboardCheckIcon,
  CreditCardIcon,
  DownloadIcon,
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
    label: "Book Open",
    icon: BookOpenIcon,
  },
  package: {
    label: "Package",
    icon: PackageIcon,
  },
  folderOpen: {
    label: "Folder Open",
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
    label: "Credit Card",
    icon: CreditCardIcon,
  },
  download: {
    label: "Download",
    icon: DownloadIcon,
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
    label: "App Window",
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

export type ShellChildItem = {
  id: string
  label: string
  href: string
  icon?: ShellIcon
}

export type ShellItem = {
  type: "item"
  id: string
  label: string
  href: string
  icon: ShellIcon
  visible: boolean
  children?: ShellChildItem[]
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

export type ShellTopRightNavigationItem = {
  id: ShellTopRightNavigationItemId
  visible: boolean
}

export const BRAND_KIT_WATERMARK_POSITIONS = [
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
] as const

export type BrandKitWatermarkPosition =
  (typeof BRAND_KIT_WATERMARK_POSITIONS)[number]

export type BrandKitColor = {
  name: string
  value: string
}

export type BrandKitConfig = {
  colors: BrandKitColor[]
  fonts: {
    heading: TextFontId
    body: TextFontId
    caption: TextFontId
  }
  captionStyle: {
    fontId: TextFontId
    fontSize: number
    color: string
    highlightColor: string | null
  }
  logo: {
    mediaId: string | null
    previewUrl: string
  }
  watermark: {
    enabled: boolean
    position: BrandKitWatermarkPosition
    widthPercent: number
    opacity: number
  }
  endCard: {
    enabled: boolean
    durationSeconds: number
    backgroundColor: string
    ctaText: string
  }
  ctaPhrases: string[]
  exportNamingPattern: string
}

function padDatePart(value: number) {
  return String(value).padStart(2, "0")
}

function formatLocalDate(date: Date) {
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(
    date.getDate()
  )}`
}

function formatLocalTime(date: Date) {
  return `${padDatePart(date.getHours())}${padDatePart(date.getMinutes())}`
}

function formatBrandKitExportNamePattern(
  pattern: string,
  tokens: Record<string, string>
) {
  const filename = pattern.replace(
    /\{(project|workspace|date|time)\}/g,
    (_match, token: string) => tokens[token] ?? ""
  )
  return (
    filename
      .replace(/[^\w. -]+/g, "")
      .trim()
      .replace(/\.mp4$/i, "") || "export"
  )
}

export function brandKitExportFilename(
  pattern: string,
  projectName: string,
  workspaceName: string,
  date = new Date()
) {
  return formatBrandKitExportNamePattern(pattern, {
    project: projectName,
    workspace: workspaceName || "workspace",
    date: formatLocalDate(date),
    time: formatLocalTime(date),
  })
}

export type ShellConfig = {
  appName: string
  workspaceName: string
  workspacePlan: string
  defaultApiUsageMonthlyCredits: number
  apiUsageCostPerCreditUsd: number
  dashboardRowsPerPage: number
  mediaUploadMaxMb: number
  // Draggable, per-workspace sidebar width in px. See lib/sidebar-width.ts.
  sidebarWidth: number
  // Per-workspace "duck under voice" amount in dB (negative; 0 = off). Applied
  // by the export renderer. See lib/audio-ducking.ts.
  duckingDb: number
  favicon: string
  // Route "/" and "/admin" forward to. Empty opens the Home dashboard.
  // See lib/home-route.ts and routes/_authenticated/index.tsx.
  adminRoute: string
  brandKit: BrandKitConfig
  topRightNavigation: ShellTopRightNavigationItem[]
  sections: ShellSection[]
  /** Per-workspace visual styling: spacing, card border, backgrounds. */
  styling: ShellStyling
}

export const DASHBOARD_ROWS_PER_PAGE_OPTIONS = [10, 20, 25, 50] as const
export const DEFAULT_DASHBOARD_ROWS_PER_PAGE = 10
export const DEFAULT_MEDIA_UPLOAD_MAX_MB = 500
export const MEDIA_UPLOAD_MAX_MB_LIMIT = 500

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
export const DEFAULT_CONTENT_GUTTER = 24
export const MAX_CARD_BORDER_WIDTH = 3
export const DEFAULT_CARD_BORDER_WIDTH = 1
export const MAX_MODAL_PADDING = 48
export const DEFAULT_MODAL_PADDING = 24
export const DEFAULT_MODAL_OVERLAY_OPACITY = 10
// Default content background reproduces today's `bg-muted/60`.
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
  return clampInt(
    value,
    MIN_CONTENT_GUTTER,
    MAX_CONTENT_GUTTER,
    DEFAULT_CONTENT_GUTTER
  )
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

export function createDefaultModalStyling(): ShellModalStyling {
  return {
    background: { mode: "default", strength: 100, color: "#ffffff" },
    borderWidth: DEFAULT_CARD_BORDER_WIDTH,
    borderColor: { mode: "default", strength: 40, color: "#d4d4d8" },
    padding: DEFAULT_MODAL_PADDING,
    overlayOpacity: DEFAULT_MODAL_OVERLAY_OPACITY,
    cardBackground: { mode: "default", strength: 100, color: "#ffffff" },
    cardBorderWidth: DEFAULT_CARD_BORDER_WIDTH,
    cardBorderColor: { mode: "default", strength: 40, color: "#d4d4d8" },
  }
}

export function createDefaultStyling(): ShellStyling {
  return {
    gutter: DEFAULT_CONTENT_GUTTER,
    cardBorderWidth: DEFAULT_CARD_BORDER_WIDTH,
    cardBorderColor: { mode: "default", strength: 40, color: "#d4d4d8" },
    dividerColor: { mode: "muted", strength: 10, color: "#d4d4d8" },
    content: {
      mode: "muted",
      strength: DEFAULT_CONTENT_BACKGROUND_STRENGTH,
      color: "#f4f4f5",
    },
    chrome: { mode: "default", strength: 100, color: "#ffffff" },
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
    color:
      typeof bg.color === "string" && bg.color.trim() ? bg.color : fallback.color,
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
export function getModalStyleVars(
  modal: ShellModalStyling
): Record<string, string> {
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

const DEFAULT_BRAND_KIT_COLORS: BrandKitColor[] = [
  { name: "Primary", value: "#111827" },
  { name: "Accent", value: "#22c55e" },
  { name: "Caption", value: "#ffffff" },
  { name: "Box", value: "#000000" },
]

export function createDefaultBrandKitConfig(): BrandKitConfig {
  return {
    colors: DEFAULT_BRAND_KIT_COLORS,
    fonts: {
      heading: DEFAULT_TEXT_FONT_ID,
      body: DEFAULT_TEXT_FONT_ID,
      caption: "bebas-neue",
    },
    captionStyle: {
      fontId: "bebas-neue",
      fontSize: 72,
      color: "#ffffff",
      highlightColor: "#000000",
    },
    logo: {
      mediaId: null,
      previewUrl: "",
    },
    watermark: {
      enabled: false,
      position: "bottom-right",
      widthPercent: 16,
      opacity: 80,
    },
    endCard: {
      enabled: false,
      durationSeconds: 3,
      backgroundColor: DEFAULT_BRAND_KIT_COLORS[0].value,
      ctaText: "",
    },
    ctaPhrases: [],
    exportNamingPattern: "{project}-{date}",
  }
}

const BRAND_KIT_HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

function normalizeHexColor(value: unknown, fallback: string): string {
  return typeof value === "string" && BRAND_KIT_HEX_COLOR.test(value)
    ? value
    : fallback
}

function normalizeFontId(value: unknown, fallback: TextFontId): TextFontId {
  return TEXT_FONT_IDS.includes(value as TextFontId)
    ? (value as TextFontId)
    : fallback
}

function normalizeText(value: unknown, maxLength: number, fallback: string) {
  return typeof value === "string" ? value.slice(0, maxLength) : fallback
}

/**
 * Fill a saved brand kit field by field, same as {@link normalizeStyling}.
 *
 * A row saved before a brand-kit field existed keeps everything it does have;
 * only the missing field falls back. Bounds match `brandKitConfigSchema`, so
 * the result still passes the strict check the save path applies to form input.
 */
export function normalizeBrandKit(value: unknown): BrandKitConfig {
  const fallback = createDefaultBrandKitConfig()
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fallback
  }
  const brandKit = value as Partial<BrandKitConfig>
  const colors = Array.isArray(brandKit.colors)
    ? brandKit.colors
        .filter(
          (color): color is BrandKitColor =>
            !!color &&
            typeof color === "object" &&
            typeof (color as BrandKitColor).name === "string" &&
            (color as BrandKitColor).name.trim().length > 0 &&
            BRAND_KIT_HEX_COLOR.test(String((color as BrandKitColor).value))
        )
        .slice(0, 20)
        .map((color) => ({ name: color.name.slice(0, 40), value: color.value }))
    : fallback.colors

  return {
    colors,
    fonts: {
      heading: normalizeFontId(brandKit.fonts?.heading, fallback.fonts.heading),
      body: normalizeFontId(brandKit.fonts?.body, fallback.fonts.body),
      caption: normalizeFontId(brandKit.fonts?.caption, fallback.fonts.caption),
    },
    captionStyle: {
      fontId: normalizeFontId(
        brandKit.captionStyle?.fontId,
        fallback.captionStyle.fontId
      ),
      fontSize: clampInt(
        brandKit.captionStyle?.fontSize,
        8,
        240,
        fallback.captionStyle.fontSize
      ),
      color: normalizeHexColor(
        brandKit.captionStyle?.color,
        fallback.captionStyle.color
      ),
      highlightColor:
        brandKit.captionStyle?.highlightColor === null
          ? null
          : normalizeHexColor(
              brandKit.captionStyle?.highlightColor,
              fallback.captionStyle.highlightColor ?? "#000000"
            ),
    },
    logo: {
      mediaId:
        typeof brandKit.logo?.mediaId === "string" && brandKit.logo.mediaId
          ? brandKit.logo.mediaId.slice(0, 36)
          : null,
      previewUrl: normalizeText(
        brandKit.logo?.previewUrl,
        2048,
        fallback.logo.previewUrl
      ),
    },
    watermark: {
      enabled:
        typeof brandKit.watermark?.enabled === "boolean"
          ? brandKit.watermark.enabled
          : fallback.watermark.enabled,
      position: BRAND_KIT_WATERMARK_POSITIONS.includes(
        brandKit.watermark?.position as BrandKitWatermarkPosition
      )
        ? (brandKit.watermark?.position as BrandKitWatermarkPosition)
        : fallback.watermark.position,
      widthPercent: clampInt(
        brandKit.watermark?.widthPercent,
        1,
        100,
        fallback.watermark.widthPercent
      ),
      opacity: clampInt(
        brandKit.watermark?.opacity,
        0,
        100,
        fallback.watermark.opacity
      ),
    },
    endCard: {
      enabled:
        typeof brandKit.endCard?.enabled === "boolean"
          ? brandKit.endCard.enabled
          : fallback.endCard.enabled,
      durationSeconds: clampInt(
        brandKit.endCard?.durationSeconds,
        2,
        5,
        fallback.endCard.durationSeconds
      ),
      backgroundColor: normalizeHexColor(
        brandKit.endCard?.backgroundColor,
        fallback.endCard.backgroundColor
      ),
      ctaText: normalizeText(
        brandKit.endCard?.ctaText,
        180,
        fallback.endCard.ctaText
      ),
    },
    ctaPhrases: Array.isArray(brandKit.ctaPhrases)
      ? brandKit.ctaPhrases
          .filter((phrase): phrase is string => typeof phrase === "string")
          .slice(0, 20)
          .map((phrase) => phrase.slice(0, 180))
      : fallback.ctaPhrases,
    exportNamingPattern:
      typeof brandKit.exportNamingPattern === "string" &&
      brandKit.exportNamingPattern.trim()
        ? brandKit.exportNamingPattern.slice(0, 120)
        : fallback.exportNamingPattern,
  }
}

export function createDefaultTopRightNavigation(): ShellTopRightNavigationItem[] {
  return TOP_RIGHT_NAVIGATION_ITEM_IDS.map((id) => ({
    id,
    visible: true,
  }))
}

export function createDefaultShellConfig(): ShellConfig {
  return {
    appName: "",
    workspaceName: "",
    workspacePlan: "",
    defaultApiUsageMonthlyCredits: API_USAGE_DEFAULT_MONTHLY_CREDITS,
    apiUsageCostPerCreditUsd: API_USAGE_DEFAULT_COST_PER_CREDIT_USD,
    dashboardRowsPerPage: DEFAULT_DASHBOARD_ROWS_PER_PAGE,
    mediaUploadMaxMb: DEFAULT_MEDIA_UPLOAD_MAX_MB,
    sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
    duckingDb: DEFAULT_DUCK_DB,
    favicon: "",
    adminRoute: "",
    brandKit: createDefaultBrandKitConfig(),
    topRightNavigation: createDefaultTopRightNavigation(),
    sections: [],
    styling: createDefaultStyling(),
  }
}

export function isShellItem(entry: ShellEntry): entry is ShellItem {
  return entry.type === "item"
}

export function renderShellIcon(
  icon: ShellIcon | undefined,
  className = "size-4"
) {
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
