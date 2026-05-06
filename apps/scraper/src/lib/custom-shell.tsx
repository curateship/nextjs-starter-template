import {
  AppWindowIcon,
  CalendarIcon,
  LayoutDashboardIcon,
  ListChecksIcon,
  PlayCircleIcon,
  SettingsIcon,
  WorkflowIcon,
  type LucideIcon,
} from "lucide-react"

import { config } from "@/lib/config"
import { scraperModules } from "@/modules/registry"

export const iconMeta = {
  layoutDashboard: {
    label: "Dashboard",
    icon: LayoutDashboardIcon,
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
        id: "section-modules",
        title: "Modules",
        entries: scraperModules.map((module) => ({
          type: "item",
          id: `item-module-${module.key}`,
          label: module.name,
          href: module.href,
          icon: module.icon,
          visible: true,
        })),
      },
      {
        id: "section-workspace",
        title: "Workspace",
        entries: [
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
