import type { CSSProperties } from "react"

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

export function isIconKey(value?: string): value is IconKey {
  return Boolean(value && Object.prototype.hasOwnProperty.call(iconMeta, value))
}

export function isShellIconUrl(value?: string) {
  if (!value) return false
  if (!value.startsWith("/") || value.startsWith("//")) return false

  try {
    const url = new URL(value, "https://ai-video.local")
    return (
      url.origin === "https://ai-video.local" &&
      (url.pathname.toLowerCase().endsWith(".svg") ||
        /^\/api\/v1\/media\/[^/]+\/file$/i.test(url.pathname))
    )
  } catch {
    return false
  }
}

export function getShellIconLabel(value?: ShellIcon) {
  if (!value) return "No icon"
  if (isIconKey(value)) return iconMeta[value].label
  if (isShellIconUrl(value)) return "Media icon"
  return "Custom icon"
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

export type ShellConfig = {
  appName: string
  workspaceName: string
  workspacePlan: string
  favicon: string
  topNavigation: ShellTopNavigationItem[]
  topRightNavigation: ShellTopRightNavigationItem[]
  sections: ShellSection[]
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
    favicon: "",
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

function renderThemedSvgIcon(src: string, className: string) {
  const escapedSrc = src.replace(/["\\]/g, "\\$&")
  const maskImage = `url("${escapedSrc}")`
  const style: CSSProperties = {
    maskImage,
    maskPosition: "center",
    maskRepeat: "no-repeat",
    maskSize: "contain",
    WebkitMaskImage: maskImage,
    WebkitMaskPosition: "center",
    WebkitMaskRepeat: "no-repeat",
    WebkitMaskSize: "contain",
  }

  return (
    <span
      aria-hidden="true"
      className={`${className} inline-block shrink-0 bg-current`}
      style={style}
    />
  )
}

export function renderShellIcon(icon: ShellIcon | undefined, className = "size-4") {
  if (isIconKey(icon)) {
    const Icon = iconMeta[icon].icon
    return <Icon className={className} />
  }

  if (isShellIconUrl(icon)) {
    return renderThemedSvgIcon(icon, className)
  }

  const Icon = ImageIcon
  return <Icon className={className} />
}
