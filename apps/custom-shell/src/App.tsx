import * as React from "react"

import { DashboardContent } from "@/components/dashboard-content"
import { DataTable4 } from "@/components/data-table4"
import { AppSidebar } from "@/components/sidebar"
import { StickyHeader } from "@/components/sticky-header"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import {
  createDefaultShellConfig,
  isShellItem,
  renderShellIcon,
} from "@/lib/custom-shell"

import { Button } from "@/components/ui/button"

export function App() {
  const [config, setConfig] = React.useState(() => createDefaultShellConfig())
  const overviewCards = [
    ["Revenue", "Monthly gross volume", "$48,240"],
    ["Orders", "Processed this week", "1,284"],
    ["Conversion", "Checkout completion rate", "4.82%"],
    ["Refunds", "Open review queue", "18"],
  ] as const
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
          <DashboardContent>
            <section className="grid gap-4 sm:gap-6 md:grid-cols-2 xl:grid-cols-4">
              {overviewCards.map(([title, description, value]) => (
                <Card key={title}>
                  <CardHeader>
                    <CardTitle>{title}</CardTitle>
                    <CardDescription>{description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-semibold tracking-tight">
                      {value}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </section>
            <DataTable4 />
          </DashboardContent>
        </SidebarInset>
      </SidebarProvider>
    </div>
  )
}

export default App
