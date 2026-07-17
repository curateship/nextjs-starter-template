import {
  DynamicIcon,
  iconNames,
  type IconName as DynamicLucideIconName,
} from "lucide-react/dynamic"
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

export type ShellConfig = {
  appName: string
  workspaceName: string
  workspacePlan: string
  dashboardRowsPerPage: number
  adminRoute: string
  favicon: string
  topRightNavigation: ShellTopRightNavigationItem[]
  sections: ShellSection[]
}

export const DASHBOARD_ROWS_PER_PAGE_OPTIONS = [10, 20, 25, 50] as const
export const DEFAULT_DASHBOARD_ROWS_PER_PAGE = 10

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
    dashboardRowsPerPage: DEFAULT_DASHBOARD_ROWS_PER_PAGE,
    adminRoute: "",
    favicon: "",
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
