import {
  AppWindowIcon,
  BarChart3Icon,
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

export type ShellChildItem = {
  id: string
  label: string
  href: string
  icon?: IconKey
}

export type ShellItem = {
  type: "item"
  id: string
  label: string
  href: string
  icon: IconKey
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
  icon?: IconKey
  visible: boolean
}

export type ShellConfig = {
  appName: string
  workspaceName: string
  workspacePlan: string
  topNavigation: ShellTopNavigationItem[]
  sections: ShellSection[]
}

export function createDefaultTopNavigation(): ShellTopNavigationItem[] {
  return [
    {
      id: "top-nav-dashboard",
      label: "Dashboard 1",
      href: "/",
      icon: "panelsTopLeft",
      visible: true,
    },
  ]
}

function createMediaLibraryItem(): ShellItem {
  return {
    type: "item",
    id: "item-media-library",
    label: "Media Library",
    href: "/admin/media",
    icon: "image",
    visible: true,
    children: [
      {
        id: "item-media-library-all",
        label: "All",
        href: "/admin/media",
      },
      {
        id: "item-media-library-images",
        label: "Images",
        href: "/admin/media/images",
        icon: "image",
      },
      {
        id: "item-media-library-videos",
        label: "Videos",
        href: "/admin/media/videos",
        icon: "library",
      },
    ],
  }
}

export function createDefaultShellConfig(): ShellConfig {
  return {
    appName: "custom-shell",
    workspaceName: "custom-shell",
    workspacePlan: "Internal",
    topNavigation: createDefaultTopNavigation(),
    sections: [
      {
        id: "section-starter",
        title: "Navigation",
        entries: [
          createMediaLibraryItem(),
          {
            type: "item",
            id: "item-feedback",
            label: "Feedback",
            href: "/admin/feedback",
            icon: "messageSquarePlus",
            visible: true,
          },
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
    ],
  }
}

export function ensureDefaultShellNavigation(config: ShellConfig): ShellConfig {
  const hasMediaLibrary = config.sections.some((section) =>
    section.entries.some(
      (entry) =>
        isShellItem(entry) &&
        (entry.id === "item-media-library" || entry.href === "/admin/media")
    )
  )

  if (hasMediaLibrary) {
    return config
  }

  const mediaLibraryItem = createMediaLibraryItem()
  if (config.sections.length === 0) {
    return {
      ...config,
      sections: [
        {
          id: "section-starter",
          title: "Navigation",
          entries: [mediaLibraryItem],
        },
      ],
    }
  }

  return {
    ...config,
    sections: config.sections.map((section, index) =>
      index === 0
        ? {
            ...section,
            entries: [mediaLibraryItem, ...section.entries],
          }
        : section
    ),
  }
}

export function isShellItem(entry: ShellEntry): entry is ShellItem {
  return entry.type === "item"
}

export function renderShellIcon(iconKey: IconKey, className = "size-4") {
  const Icon = iconMeta[iconKey].icon
  return <Icon className={className} />
}
