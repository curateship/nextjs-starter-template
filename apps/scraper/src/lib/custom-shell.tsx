import {
  AppWindowIcon,
  CalendarIcon,
  GlobeIcon,
  LayoutDashboardIcon,
  ListChecksIcon,
  PlayCircleIcon,
  SettingsIcon,
  WorkflowIcon,
  type LucideIcon,
} from "lucide-react"

import { config } from "@/lib/config"

export const iconMeta = {
  layoutDashboard: {
    label: "Dashboard",
    icon: LayoutDashboardIcon,
  },
  globe: {
    label: "Globe",
    icon: GlobeIcon,
  },
  workflow: {
    label: "Workflow",
    icon: WorkflowIcon,
  },
  calendar: {
    label: "Calendar",
    icon: CalendarIcon,
  },
  listChecks: {
    label: "Runs",
    icon: ListChecksIcon,
  },
  appWindow: {
    label: "App Window",
    icon: AppWindowIcon,
  },
  playCircle: {
    label: "New Run",
    icon: PlayCircleIcon,
  },
  settings: {
    label: "Settings",
    icon: SettingsIcon,
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

export type ShellTopNavigationItem = {
  id: string
  label: string
  href: string
  icon: IconKey
  visible: boolean
}

export type ShellConfig = {
  appName: string
  workspaceName: string
  workspacePlan: string
  themePreset: ThemePresetKey
  fontPreset: FontPresetKey
  topNavigation: ShellTopNavigationItem[]
  sections: ShellSection[]
}

export function createDefaultTopNavigation(): ShellTopNavigationItem[] {
  return [
    {
      id: "top-nav-dashboard",
      label: "Dashboard",
      href: "/",
      icon: "layoutDashboard",
      visible: true,
    },
  ]
}

export function createScraperShellConfig(): ShellConfig {
  return {
    appName: config.appName,
    workspaceName: "Scraper",
    workspacePlan: "Operations",
    themePreset: "graphite",
    fontPreset: "urbanist",
    topNavigation: createDefaultTopNavigation(),
    sections: [
      {
        id: "section-scrapers",
        title: "Scrapers",
        entries: [
          {
            type: "item",
            id: "item-google-maps",
            label: "Google Maps",
            href: "/google-maps",
            icon: "globe",
            visible: true,
            children: [
              {
                id: "item-google-maps-runs",
                label: "Runs",
                href: "/google-maps/runs",
                icon: "listChecks",
              },
              {
                id: "item-google-maps-schedules",
                label: "Schedules",
                href: "/google-maps/schedules",
                icon: "calendar",
              },
            ],
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

export function createDefaultShellConfig(): ShellConfig {
  return createScraperShellConfig()
}

export function isShellItem(entry: ShellEntry): entry is ShellItem {
  return entry.type === "item"
}

export function renderShellIcon(iconKey: IconKey, className = "size-4") {
  const Icon = iconMeta[iconKey].icon
  return <Icon className={className} />
}
