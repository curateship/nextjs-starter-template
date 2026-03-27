import type { IconKey } from "@/lib/custom-shell"

export type AppPage = "overview" | "sidebar-editor" | "appearance"

export const appPages = [
  {
    id: "overview",
    label: "Overview",
    href: "#/",
    icon: "layoutDashboard",
  },
  {
    id: "sidebar-editor",
    label: "Sidebar Editor",
    href: "#/sidebar-editor",
    icon: "slidersHorizontal",
  },
  {
    id: "appearance",
    label: "Appearance",
    href: "#/appearance",
    icon: "palette",
  },
] as const satisfies ReadonlyArray<{
  id: AppPage
  label: string
  href: string
  icon: IconKey
}>

export function getAppPageFromHash(hash: string): AppPage {
  const path = hash.startsWith("#") ? hash.slice(1) || "/" : hash || "/"

  switch (path) {
    case "/sidebar-editor":
      return "sidebar-editor"
    case "/appearance":
      return "appearance"
    default:
      return "overview"
  }
}
