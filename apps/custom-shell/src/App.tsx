import * as React from "react"

import {
  AppSidebar,
  createDefaultShellConfig,
  SidebarInset,
  SidebarProvider,
  StickyHeader,
} from "@repo/admin-shell"

import { AdminCard } from "@/components/admin-card"
import { AdminLayout } from "@/components/admin-layout"
import { Button } from "@/components/ui/button"

export function App() {
  const [config, setConfig] = React.useState(() => createDefaultShellConfig())

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
            navContent={
              <div className="flex flex-col">
                <span className="text-sm font-medium">Admin Panel</span>
                <span className="text-xs text-muted-foreground">
                  Shared shell extracted from Hub
                </span>
              </div>
            }
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
          <AdminLayout
            headerActions={
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm">
                  Shared Sidebar
                </Button>
                <Button variant="outline" size="sm">
                  Sticky Header
                </Button>
                <Button variant="outline" size="sm">
                  Hub Patterns
                </Button>
              </div>
            }
          >
            <div className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
              <AdminCard
                title="Admin Shell"
                description="This app now renders the shell chrome directly instead of the old custom-shell editor surface."
              >
                <div className="space-y-3 text-sm text-muted-foreground">
                  <p>
                    The previous overview, sidebar editor, and appearance editor
                    screens have been removed.
                  </p>
                  <p>
                    The left rail and sticky top bar now behave like the Hub
                    admin shell, while this center area is a normal dashboard
                    surface.
                  </p>
                  <p>
                    The shell config still drives theme, font, and nav content,
                    but there is no editor UI mounted in this app anymore.
                  </p>
                </div>
              </AdminCard>
              <AdminCard
                title="Included"
                description="The extracted shell pieces now present as the base admin frame."
              >
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>Grouped sidebar navigation</p>
                  <p>Collapsible child navigation</p>
                  <p>Workspace switcher</p>
                  <p>User menu and theme toggle</p>
                </div>
              </AdminCard>
            </div>
          </AdminLayout>
        </SidebarInset>
      </SidebarProvider>
    </div>
  )
}

export default App
