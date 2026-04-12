import * as React from "react"

import { DataTable4 } from "@/components/data-table4"
import { AppSidebar } from "@/components/sidebar"
import { StickyHeader } from "@/components/sticky-header"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import {
  createDefaultShellConfig,
  isShellItem,
  renderShellIcon,
} from "@/lib/custom-shell"

import { Button } from "@/components/ui/button"

export function App() {
  const [config, setConfig] = React.useState(() => createDefaultShellConfig())
  const currentPath =
    typeof window === "undefined"
      ? "/"
      : window.location.hash.startsWith("#")
        ? window.location.hash.slice(1) || "/"
        : window.location.hash || "/"
  const navLinks = config.sections.flatMap((section) =>
    section.entries
      .filter(isShellItem)
      .map((entry) => ({
        label: entry.label,
        href: `#${entry.href}`,
        icon: renderShellIcon(entry.icon, "h-3.5 w-3.5"),
        active: currentPath === entry.href,
      }))
  )

  return (
    <div
      className="min-h-screen bg-background"
      data-shell-theme={config.themePreset}
      data-shell-font={config.fontPreset}
    >
      <SidebarProvider className="h-screen">
        <AppSidebar config={config} />
        <SidebarInset>
          <StickyHeader
            navLinks={navLinks}
            rightActions={
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfig(createDefaultShellConfig())}
              >
                Reset shell
              </Button>
            }
          />
          <DataTable4 />
        </SidebarInset>
      </SidebarProvider>
    </div>
  )
}

export default App
