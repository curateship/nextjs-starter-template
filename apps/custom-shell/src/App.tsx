import * as React from "react"

import { AdminCard } from "@/components/admin-card"
import { AdminLayout } from "@/components/admin-layout"
import { AppSidebar } from "@/components/app-sidebar"
import { CustomShellEditor } from "@/components/custom-shell-editor"
import { StickyHeader } from "@/components/sticky-header"
import { Button } from "@/components/ui/button"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { appPages, getAppPageFromHash } from "@/lib/app-pages"
import { createDefaultShellConfig } from "@/lib/custom-shell"

export function App() {
  const [config, setConfig] = React.useState(() => createDefaultShellConfig())
  const [currentPage, setCurrentPage] = React.useState(() =>
    getAppPageFromHash(window.location.hash)
  )

  React.useEffect(() => {
    const handleHashChange = () => {
      setCurrentPage(getAppPageFromHash(window.location.hash))
    }

    window.addEventListener("hashchange", handleHashChange)
    return () => window.removeEventListener("hashchange", handleHashChange)
  }, [])

  const currentPageMeta =
    appPages.find((page) => page.id === currentPage) ?? appPages[0]

  return (
    <div
      className="min-h-screen bg-background"
      data-shell-theme={config.themePreset}
      data-shell-font={config.fontPreset}
    >
      <SidebarProvider className="h-screen">
        <AppSidebar config={config} currentPage={currentPage} />
        <SidebarInset>
          <StickyHeader
            navLinks={appPages.map((page) => ({
              label: page.label,
              href: page.href,
              active: page.id === currentPage,
            }))}
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
                  Config driven
                </Button>
                <Button variant="outline" size="sm">
                  Local only
                </Button>
                <Button variant="outline" size="sm">
                  No database
                </Button>
              </div>
            }
          >
            <div className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
              <AdminCard
                title={currentPageMeta.label}
                description="The shell preview on the left is driven by typed config, while the controls now live on dedicated workbench pages."
              >
                <div className="space-y-3 text-sm text-muted-foreground">
                  {currentPage === "overview" ? (
                    <>
                      <p>
                        Use the Workbench links in the sidebar to open the
                        dedicated Sidebar Editor and Appearance pages.
                      </p>
                      <p>
                        The editor keeps the shared mechanics from Hub and
                        shadcn, while the consuming app owns the actual nav
                        config.
                      </p>
                      <p>
                        There is still no persistence layer in this version.
                        The point is proving the editing mechanics first.
                      </p>
                    </>
                  ) : currentPage === "sidebar-editor" ? (
                    <p>
                      This page isolates sidebar structure changes so the shell
                      controls feel like a real admin screen instead of one long
                      combined form.
                    </p>
                  ) : (
                    <p>
                      This page isolates theme and font changes, while the live
                      shell preview updates immediately on the left.
                    </p>
                  )}
                </div>
              </AdminCard>
              <AdminCard
                title="What works now"
                description="This is the first real custom-shell control surface."
              >
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>Theme preset switching</p>
                  <p>Font preset switching</p>
                  <p>Icon picker modal</p>
                  <p>Sidebar reorder, add, hide, delete, and divider controls</p>
                </div>
              </AdminCard>
            </div>

            <div className="mt-4">
              {currentPage === "overview" ? null : (
                <CustomShellEditor
                  config={config}
                  onChange={setConfig}
                  onReset={() => setConfig(createDefaultShellConfig())}
                  mode={currentPage === "appearance" ? "appearance" : "sidebar"}
                />
              )}
            </div>
          </AdminLayout>
        </SidebarInset>
      </SidebarProvider>
    </div>
  )
}

export default App
