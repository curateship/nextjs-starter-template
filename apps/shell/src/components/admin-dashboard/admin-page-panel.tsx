import * as React from "react"

import {
  adminBlocks,
  AdminBlocksProvider,
  SectionsBlock,
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
import {
  getAdminPageErrorMessage,
  lockAdminPage,
  saveAdminPage,
  setAdminPageCoverPhoto,
} from "@/lib/api/admin-dashboard"
import { PANEL_GUTTER } from "@/lib/layout/panel-gutter"
import { pageWithoutBlock, type StoredPage } from "@/lib/notes/page-body"
import { LockedPageContext } from "@/components/shared/notes/block-card"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

type MenuTab = React.ComponentProps<typeof TabbedMenu>["tabs"][number]

/**
 * The Admin dashboard's left page (the Admin 3 panel design):
 *
 * - **Header:** the collapse button at the panel's outer edge, the title, and
 *   the ⋮: General (Cover photo, what the dashboard
 *   adds, Overview's date range, then Lock blocks last), then the dashboard's own tabs.
 * - **Page:** one per site, written on like any page in the design, with the
 *   basic "/" blocks and the Admin ones (`admin-blocks.tsx`), and the fixed
 *   Dashboards block.
 */
export function AdminPagePanel({
  title,
  menuLabel,
  actions,
  general,
  menuTabs = [],
  page,
  error,
  onRetry,
  blocks,
  onPageChange,
}: {
  title: string
  menuLabel: string
  /** Buttons before the ⋮, such as the + that adds an announcement or a user. */
  actions?: React.ReactNode
  /** Under the page's own rows in General. */
  general?: React.ReactNode
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
  // Made once: the editor's blocks must not change while the page shows.
  const [pageBlocks] = React.useState(adminBlocks)

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


  // Delete block on the locked page: unlocked, then saved without the block
  // (Tyler, 9 Nov 2026: "Ask, then unlock and delete").
  const lockedPage = page
    ? {
        locked: page.locked,
        removeBlock: async (nodeName: string) => {
          const body = pageWithoutBlock(page.body, nodeName)
          await change({ locked: false, body }, async () => {
            await lockAdminPage("left", false)
            await saveAdminPage("left", body)
          })
        },
      }
    : null

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-card">
      <PageCover url={page?.coverUrl ?? null} />
      {/* Wrapped in its own div, so the shell's table line under a header
          never matches this side panel's header. */}
      <div className="relative shrink-0">
        <DashboardCardHeader className={cn("gap-1", page?.coverUrl && "border-b-transparent")}>
          <SidePanelCollapseButton side="left" label="Hide the page" />
          <span className={cn("min-w-0 flex-1 truncate pl-1", dashboardCardHeadingClassName)}>{title}</span>
          {actions}
          {page ? (
            <TabbedMenu
              label={menuLabel}
              // Opens to the right, over the middle, rather than past the
              // panel's left edge.
              align="start"
              // 10% under the usual 22.7rem (Tyler, 9 Nov 2026: "reduce the
              // left panel dropdown width by 10%"); General, Plans and
              // Widgets still fit on one row.
              width="20.4rem"
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
                            images: page.coverImages,
                            busy,
                            set: ({ url, images }) => {
                              const cover = { coverUrl: url, coverImages: images }
                              void change(cover, () => setAdminPageCoverPhoto("left", cover))
                            },
                          }}
                        />
                      </PickGroup>
                      {general}
                    </div>
                  ),
                  // Under every group, as the CRM's ⋮ has it (Tyler, 9 Nov
                  // 2026: "this should be in the bottom").
                  footer: (
                    <LockRow
                      locked={page.locked}
                      busy={busy}
                      onLock={(locked) => void change({ locked }, () => lockAdminPage("left", locked))}
                    />
                  ),
                },
                ...menuTabs,
              ]}
            />
          ) : null}
        </DashboardCardHeader>
      </div>

      <ScrollArea className="relative min-h-0 flex-1">
        <div className={cn(PANEL_GUTTER, "grid grid-cols-[minmax(0,1fr)] pt-0")}>
          {page ? (
            <AdminBlocksProvider value={blocks}>
              <LockedPageContext.Provider value={lockedPage}>
              <SavingDocument
                // A lock reads again from the start, so the editor and the
                // lock always agree on what the page holds.
                key={page.locked ? "locked" : "open"}
                value={page.body}
                locked={page.locked}
                appBlocks={pageBlocks}
                placeholder="Write something, or type / for blocks"
                onSave={async (body) => {
                  // Kept before the save goes, so anything drawing the page
                  // afresh while it is on its way starts from what was typed.
                  onPageChange({ ...page, body })
                  try {
                    await saveAdminPage("left", body)
                  } catch (saveError) {
                    showErrorToast(getAdminPageErrorMessage(saveError))
                  }
                }}
              />
              </LockedPageContext.Provider>
            </AdminBlocksProvider>
          ) : (
            <>
              {/* The sections stay reachable while the page is read, or when
                  it could not be: the Dashboards block is their only way in. */}
              <div className="mt-3.75 overflow-hidden rounded-[var(--shell-block-radius,1rem)] border">
                <AdminBlocksProvider value={blocks}>
                  <SectionsBlock />
                </AdminBlocksProvider>
              </div>
              {error ? <ErrorRow message={error} onRetry={onRetry} /> : <LoadingRow label="Reading the page…" />}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
