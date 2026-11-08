import * as React from "react"

import {
  ADMIN_APP_BLOCKS,
  AdminBlocksProvider,
  type AdminBlocks,
} from "@/components/admin-dashboard/admin-blocks"
import {
  DashboardCardHeader,
  dashboardCardHeadingClassName,
} from "@/components/shared/dashboard-card-header"
import { PageCover } from "@/components/shared/notes/page-cover"
import { CoverRow, LockRow } from "@/components/shared/notes/page-rows"
import { PickGroup } from "@/components/shared/notes/pick-rows"
import { SavingDocument } from "@/components/shared/notes/saving-document"
import { TabbedMenu } from "@/components/shared/notes/tabbed-menu"
import { SidePanelCollapseButton } from "@/components/shared/three-panels"
import { ErrorRow } from "@/components/ui/error-row"
import { LoadingRow } from "@/components/ui/loading-row"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { AdminPageSide } from "@/lib/admin-dashboard/admin-page"
import {
  getAdminPageErrorMessage,
  lockAdminPage,
  saveAdminPage,
  setAdminPageCoverPhoto,
} from "@/lib/api/admin-dashboard"
import { PANEL_GUTTER } from "@/lib/layout/panel-gutter"
import type { StoredPage } from "@/lib/notes/page-body"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

type MenuTab = React.ComponentProps<typeof TabbedMenu>["tabs"][number]

/**
 * One of the Admin dashboard's two side pages (the Admin 3 panel design):
 *
 * - **Header:** the collapse button at the panel's outer edge, the title with
 *   one muted line, and the ⋮: General (Cover photo, Lock the notes), then
 *   any tabs the side adds (the left one's Announcements and Plans).
 * - **Page:** one per site, written on like any page in the design, with the
 *   basic "/" blocks and the Admin ones (`admin-blocks.tsx`).
 */
export function AdminPagePanel({
  side,
  title,
  menuLabel,
  menuTabs = [],
  page,
  error,
  onRetry,
  blocks,
  onPageChange,
}: {
  side: AdminPageSide
  title: string
  menuLabel: string
  /** Tabs after General in the ⋮. */
  menuTabs?: MenuTab[]
  /** Null while the page is first read, or when the read failed. */
  page: StoredPage | null
  /** Why the page could not be read, with Try again. */
  error: string | null
  onRetry: () => void
  blocks: AdminBlocks
  onPageChange: (page: StoredPage) => void
}) {
  const [busy, setBusy] = React.useState(false)
  const [menuOpen, setMenuOpen] = React.useState(false)

  const change = async (values: Partial<StoredPage>, save: () => Promise<unknown>) => {
    if (!page) return
    setBusy(true)
    try {
      await save()
      onPageChange({ ...page, ...values })
    } catch (error) {
      showErrorToast(getAdminPageErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const collapse = (
    <SidePanelCollapseButton
      side={side}
      label={side === "left" ? "Hide the page" : "Hide the notes"}
    />
  )

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-card">
      <PageCover url={page?.coverUrl ?? null} />
      {/* Wrapped in its own div, so the shell's table line under a header
          never matches this side panel's header. */}
      <div className="relative shrink-0">
        <DashboardCardHeader className={cn("gap-1", page?.coverUrl && "border-b-transparent")}>
          {side === "left" ? collapse : null}
          <span className={cn("min-w-0 flex-1 truncate pl-1", dashboardCardHeadingClassName)}>{title}</span>
          {page ? (
            <TabbedMenu
              label={menuLabel}
              // The left one opens to the right, over the middle, rather than
              // past the panel's left edge; the right one the other way.
              align={side === "left" ? "start" : "end"}
              open={menuOpen}
              onOpenChange={setMenuOpen}
              tabs={[
                {
                  value: "general",
                  label: "General",
                  content: (
                    <div className="grid gap-3 p-3">
                      <PickGroup title="Page">
                        <CoverRow
                          cover={{
                            url: page.coverUrl,
                            busy,
                            set: (coverUrl) =>
                              void change({ coverUrl }, () => setAdminPageCoverPhoto(side, coverUrl)),
                          }}
                        />
                      </PickGroup>
                      <LockRow
                        locked={page.locked}
                        busy={busy}
                        onLock={(locked) => void change({ locked }, () => lockAdminPage(side, locked))}
                      />
                    </div>
                  ),
                },
                ...menuTabs,
              ]}
            />
          ) : null}
          {side === "right" ? collapse : null}
        </DashboardCardHeader>
      </div>

      <ScrollArea className="relative min-h-0 flex-1">
        <div className={cn(PANEL_GUTTER, "grid grid-cols-[minmax(0,1fr)] pt-0")}>
          {page ? (
            <AdminBlocksProvider value={blocks}>
              <SavingDocument
                // A lock reads again from the start, so the editor and the
                // lock always agree on what the page holds.
                key={page.locked ? "locked" : "open"}
                value={page.body}
                locked={page.locked}
                appBlocks={ADMIN_APP_BLOCKS}
                placeholder="Write something, or type / for blocks"
                onSave={async (body) => {
                  // Kept before the save goes, so anything drawing the page
                  // afresh while it is on its way starts from what was typed.
                  onPageChange({ ...page, body })
                  try {
                    await saveAdminPage(side, body)
                  } catch (saveError) {
                    showErrorToast(getAdminPageErrorMessage(saveError))
                  }
                }}
              />
            </AdminBlocksProvider>
          ) : error ? (
            <ErrorRow message={error} onRetry={onRetry} />
          ) : (
            <LoadingRow label="Reading the page…" />
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
