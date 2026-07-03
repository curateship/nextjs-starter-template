import {
  DynamicIcon,
  iconNames,
  type IconName as DynamicLucideIconName,
} from "lucide-react/dynamic.mjs"
import {
  DEFAULT_TEXT_FONT_ID,
  TEXT_FONT_IDS,
  type TextFontId,
} from "@/lib/text-fonts"
import { API_USAGE_DEFAULT_MONTHLY_CREDITS } from "@/lib/api-usage-constants"
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

function getDynamicLucideIconName(value?: string) {
  if (!value) return undefined
  return normalizeDynamicLucideIconName(value)
}

export function getShellIconLabel(value?: ShellIcon) {
  if (!value) return "No icon"
  if (isIconKey(value)) return iconMeta[value].label
  const dynamicIconName = getDynamicLucideIconName(value)
  if (dynamicIconName) return getDynamicLucideIconLabel(dynamicIconName)
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

export type ShellTopNavigationItem = {
  id: string
  label: string
  href: string
  icon?: ShellIcon
  visible: boolean
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
  dashboardRowsPerPage: number
  mediaUploadMaxMb: number
  favicon: string
  brandKit: BrandKitConfig
  topNavigation: ShellTopNavigationItem[]
  topRightNavigation: ShellTopRightNavigationItem[]
  sections: ShellSection[]
}

export const DASHBOARD_ROWS_PER_PAGE_OPTIONS = [10, 20, 25, 50] as const
export const DEFAULT_DASHBOARD_ROWS_PER_PAGE = 10
export const DEFAULT_MEDIA_UPLOAD_MAX_MB = 500
export const MEDIA_UPLOAD_MAX_MB_LIMIT = 500

const DEFAULT_BRAND_KIT_COLORS: BrandKitColor[] = [
  { name: "Primary", value: "#111827" },
  { name: "Accent", value: "#22c55e" },
  { name: "Caption", value: "#ffffff" },
  { name: "Box", value: "#000000" },
]

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

function isTextFontId(value: unknown): value is TextFontId {
  return (
    typeof value === "string" && TEXT_FONT_IDS.includes(value as TextFontId)
  )
}

function cleanHexColor(value: unknown, fallback: string) {
  return typeof value === "string" && HEX_COLOR.test(value)
    ? value.toLowerCase()
    : fallback
}

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
    ctaPhrases: [],
    exportNamingPattern: "{project}-{date}",
  }
}

export function cleanBrandKitConfig(value: unknown): BrandKitConfig {
  const fallback = createDefaultBrandKitConfig()
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fallback
  }

  const settings = value as Partial<BrandKitConfig>
  const colors = Array.isArray(settings.colors)
    ? settings.colors
        .map((color) => ({
          name:
            typeof color?.name === "string"
              ? color.name.trim().slice(0, 40)
              : "",
          value: cleanHexColor(color?.value, ""),
        }))
        .filter((color) => color.name && color.value)
        .slice(0, 20)
    : fallback.colors
  const fonts = settings.fonts ?? fallback.fonts
  const captionStyle = settings.captionStyle ?? fallback.captionStyle
  const logo = settings.logo ?? fallback.logo
  const watermark = settings.watermark ?? fallback.watermark
  const position = watermark.position

  return {
    colors: colors.length ? colors : fallback.colors,
    fonts: {
      heading: isTextFontId(fonts.heading)
        ? fonts.heading
        : fallback.fonts.heading,
      body: isTextFontId(fonts.body) ? fonts.body : fallback.fonts.body,
      caption: isTextFontId(fonts.caption)
        ? fonts.caption
        : fallback.fonts.caption,
    },
    captionStyle: {
      fontId: isTextFontId(captionStyle.fontId)
        ? captionStyle.fontId
        : fallback.captionStyle.fontId,
      fontSize:
        typeof captionStyle.fontSize === "number" &&
        Number.isFinite(captionStyle.fontSize)
          ? Math.min(Math.max(Math.round(captionStyle.fontSize), 8), 240)
          : fallback.captionStyle.fontSize,
      color: cleanHexColor(captionStyle.color, fallback.captionStyle.color),
      highlightColor: captionStyle.highlightColor
        ? cleanHexColor(
            captionStyle.highlightColor,
            fallback.captionStyle.highlightColor ?? "#000000"
          )
        : null,
    },
    logo: {
      mediaId: typeof logo.mediaId === "string" ? logo.mediaId : null,
      previewUrl:
        typeof logo.previewUrl === "string"
          ? logo.previewUrl.slice(0, 2048)
          : "",
    },
    watermark: {
      enabled: watermark.enabled === true,
      position: BRAND_KIT_WATERMARK_POSITIONS.includes(
        position as BrandKitWatermarkPosition
      )
        ? (position as BrandKitWatermarkPosition)
        : fallback.watermark.position,
      widthPercent:
        typeof watermark.widthPercent === "number" &&
        Number.isFinite(watermark.widthPercent)
          ? Math.min(Math.max(Math.round(watermark.widthPercent), 1), 100)
          : fallback.watermark.widthPercent,
      opacity:
        typeof watermark.opacity === "number" &&
        Number.isFinite(watermark.opacity)
          ? Math.min(Math.max(Math.round(watermark.opacity), 0), 100)
          : fallback.watermark.opacity,
    },
    ctaPhrases: Array.isArray(settings.ctaPhrases)
      ? settings.ctaPhrases
          .map((phrase) =>
            typeof phrase === "string" ? phrase.trim().slice(0, 180) : ""
          )
          .filter(Boolean)
          .slice(0, 20)
      : fallback.ctaPhrases,
    exportNamingPattern:
      typeof settings.exportNamingPattern === "string" &&
      settings.exportNamingPattern.trim()
        ? settings.exportNamingPattern.trim().slice(0, 120)
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
    dashboardRowsPerPage: DEFAULT_DASHBOARD_ROWS_PER_PAGE,
    mediaUploadMaxMb: DEFAULT_MEDIA_UPLOAD_MAX_MB,
    favicon: "",
    brandKit: createDefaultBrandKitConfig(),
    topNavigation: [],
    topRightNavigation: createDefaultTopRightNavigation(),
    sections: [],
  }
}

export function normalizeTopRightNavigation(
  items: ShellTopRightNavigationItem[] | undefined
) {
  const fallback = createDefaultTopRightNavigation()
  if (!Array.isArray(items)) {
    return fallback
  }

  const validIds = new Set<ShellTopRightNavigationItemId>(
    TOP_RIGHT_NAVIGATION_ITEM_IDS
  )
  const savedItems = items.filter((item) => validIds.has(item.id))
  const savedIds = new Set(savedItems.map((item) => item.id))
  const missingItems = fallback.filter((item) => !savedIds.has(item.id))

  return [...savedItems, ...missingItems]
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

  const dynamicIconName = getDynamicLucideIconName(icon)
  if (dynamicIconName) {
    return (
      <DynamicIcon
        name={dynamicIconName}
        className={className}
        fallback={() => <ImageIcon className={className} />}
      />
    )
  }

  const Icon = ImageIcon
  return <Icon className={className} />
}
