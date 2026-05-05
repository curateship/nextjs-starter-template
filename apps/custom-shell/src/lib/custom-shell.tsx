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
} satisfies Record<string, { label: string; icon: LucideIcon }>

export type IconKey = keyof typeof iconMeta

export type ThemePresetKey = "graphite" | "verdant" | "ember" | "cobalt"
export type FontPresetKey = "urbanist" | "editorial" | "industrial" | "operator"

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

export type ShellConfig = {
  appName: string
  workspaceName: string
  workspacePlan: string
  themePreset: ThemePresetKey
  fontPreset: FontPresetKey
  sections: ShellSection[]
}

export const themePresets = [
  {
    id: "graphite",
    label: "Graphite",
    description: "Neutral grayscale shell with high contrast and minimal decoration.",
  },
  {
    id: "verdant",
    label: "Verdant",
    description: "Soft green product shell with calmer surfaces and muted highlights.",
  },
  {
    id: "ember",
    label: "Ember",
    description: "Warm editorial palette with amber accents and softer borders.",
  },
  {
    id: "cobalt",
    label: "Cobalt",
    description: "Sharper blue interface with a stronger admin-tool feel.",
  },
] as const satisfies ReadonlyArray<{
  id: ThemePresetKey
  label: string
  description: string
}>

export const fontPresets = [
  {
    id: "urbanist",
    label: "Urbanist",
    description: "Modern product UI with Geist for headings and body copy.",
  },
  {
    id: "editorial",
    label: "Editorial",
    description: "Serif-forward headings with a cleaner sans-serif body.",
  },
  {
    id: "industrial",
    label: "Industrial",
    description: "Compressed display headings with a utilitarian admin feel.",
  },
  {
    id: "operator",
    label: "Operator",
    description: "Monospaced shell preset for control-room and internal tools.",
  },
] as const satisfies ReadonlyArray<{
  id: FontPresetKey
  label: string
  description: string
}>

export function createDefaultShellConfig(): ShellConfig {
  return {
    appName: "custom-shell",
    workspaceName: "custom-shell",
    workspacePlan: "Internal",
    themePreset: "graphite",
    fontPreset: "urbanist",
    sections: [
      {
        id: "section-starter",
        title: "Starter Navigation",
        entries: [
          {
            type: "item",
            id: "item-dashboard",
            label: "Posts",
            href: "/admin/posts",
            icon: "layoutDashboard",
            visible: true,
          },
          {
            type: "item",
            id: "item-library",
            label: "Media Library",
            href: "/admin/media",
            icon: "library",
            visible: true,
            children: [
              {
                id: "item-library-images",
                label: "Images",
                href: "/admin/media/images",
                icon: "image",
              },
              {
                id: "item-library-folders",
                label: "Folders",
                href: "/admin/media/folders",
                icon: "folderOpen",
              },
            ],
          },
          {
            type: "item",
            id: "item-navbar-demo",
            label: "Navbar Demo",
            href: "/demo/navbar-09",
            icon: "panelsTopLeft",
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

export function isShellItem(entry: ShellEntry): entry is ShellItem {
  return entry.type === "item"
}

export function renderShellIcon(iconKey: IconKey, className = "size-4") {
  const Icon = iconMeta[iconKey].icon
  return <Icon className={className} />
}
