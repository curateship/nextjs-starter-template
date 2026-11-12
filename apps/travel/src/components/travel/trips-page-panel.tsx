import * as React from "react"

import { TRIPS_APP_BLOCKS, TripsBlocksProvider, TripsSectionsBlock, type TripsBlocks } from "@/components/travel/trips-blocks"
import { DashboardCardHeader, dashboardCardHeadingClassName } from "@/components/shared/dashboard-card-header"
import { LockedPageContext } from "@/components/shared/notes/block-card"
import { PageCover } from "@/components/shared/notes/page-cover"
import { CoverRow, LockRow } from "@/components/shared/notes/page-rows"
import { PickGroup } from "@/components/shared/notes/pick-rows"
import { SavingDocument } from "@/components/shared/notes/saving-document"
import { TabbedMenu, type TabbedMenuState } from "@/components/shared/notes/tabbed-menu"
import { SidePanelCollapseButton } from "@/components/shared/three-panels"
import { ErrorRow } from "@/components/ui/error-row"
import { LoadingRow } from "@/components/ui/loading-row"
import { ScrollArea } from "@/components/ui/scroll-area"
import { lockTripsPage, saveTripsPage, setTripsPageCoverPhoto } from "@/lib/api/travel/trips-dashboard"
import { PANEL_GUTTER } from "@/lib/layout/panel-gutter"
import { pageWithoutBlock, type StoredPage } from "@/lib/notes/page-body"
import { getTravelErrorMessage } from "@/lib/travel/errors"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

/**
 * The Trips dashboard's left panel (Tyler, 12 Nov 2026), drawn as the CRM's
 * left page is.
 *
 * - **Header:** the collapse button, "Trips", and the ⋮: General (the page's
 *   Cover photo, and Lock blocks in its footer) and Widgets, Overview's rows
 *   and spots.
 * - **Page:** the person's own, written on like any page in the design, with
 *   the fixed Dashboards block that picks the section and the "/" blocks:
 *   the basic ones and Tags. A new page starts with Dashboards and Tags.
 *   While the page is read, or when it could not be, the Dashboards block is
 *   drawn on its own, since it is the only way between the sections.
 */
export function TripsPagePanel({
  page,
  error,
  onRetry,
  blocks,
  widgets,
  menuState,
  onPageChange,
}: {
  /** Null while the page is first read, or when the read failed. */
  page: StoredPage | null
  error: string | null
  onRetry: () => void
  blocks: TripsBlocks
  /** The ⋮'s Widgets tab: Overview's rows and spots. */
  widgets: React.ReactNode
  /** The ⋮'s open state and tab, held by the dashboard so a widget's Manage widgets opens it at Widgets. */
  menuState: TabbedMenuState
  onPageChange: (page: StoredPage) => void
}) {
  const [busy, setBusy] = React.useState(false)

  const change = async (work: () => Promise<unknown>, next: StoredPage) => {
    setBusy(true)
    try {
      await work()
      onPageChange(next)
    } catch (error) {
      showErrorToast(getTravelErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  // Delete block on a locked page: unlocked, then saved without the block.
  const lockedPage = page
    ? {
        locked: page.locked,
        removeBlock: async (nodeName: string) => {
          const body = pageWithoutBlock(page.body, nodeName)
          await change(async () => {
            await lockTripsPage(false)
            await saveTripsPage(body)
          }, { ...page, locked: false, body })
        },
      }
    : null

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-card">
      <PageCover url={page?.coverUrl ?? null} />
      {/* Wrapped in its own div, so the shell's table line under a header never matches this side panel's header. */}
      <div className="relative shrink-0">
        <DashboardCardHeader className={cn("gap-1", page?.coverUrl && "border-b-transparent")}>
          <SidePanelCollapseButton side="left" label="Hide the page" />
          <span className={cn("min-w-0 flex-1 truncate pl-1", dashboardCardHeadingClassName)}>Trips</span>
          {page ? (
            <TabbedMenu
              label="Trips settings"
              align="start"
              width="20.25rem"
              open={menuState.open}
              onOpenChange={menuState.onOpenChange}
              tab={menuState.tab}
              onTabChange={menuState.onTabChange}
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
                            set: ({ url, images }) =>
                              void change(() => setTripsPageCoverPhoto({ coverUrl: url, coverImages: images }), {
                                ...page,
                                coverUrl: url,
                                coverImages: images,
                              }),
                          }}
                        />
                      </PickGroup>
                    </div>
                  ),
                  footer: (
                    <LockRow
                      locked={page.locked}
                      busy={busy}
                      onLock={(locked) => void change(() => lockTripsPage(locked), { ...page, locked })}
                    />
                  ),
                },
                { value: "widgets", label: "Widgets", content: widgets },
              ]}
            />
          ) : null}
        </DashboardCardHeader>
      </div>

      <ScrollArea className="relative min-h-0 flex-1">
        <div className={cn(PANEL_GUTTER, "grid grid-cols-[minmax(0,1fr)] pt-0")}>
          {page ? (
            <TripsBlocksProvider value={blocks}>
              <LockedPageContext.Provider value={lockedPage}>
                <SavingDocument
                  // A lock reads again from the start, so the editor and the lock always agree.
                  key={page.locked ? "locked" : "open"}
                  value={page.body}
                  locked={page.locked}
                  appBlocks={TRIPS_APP_BLOCKS}
                  placeholder="Write something, or type / for blocks"
                  onSave={async (body) => {
                    try {
                      await saveTripsPage(body)
                      onPageChange({ ...page, body })
                    } catch (error) {
                      showErrorToast(getTravelErrorMessage(error))
                    }
                  }}
                />
              </LockedPageContext.Provider>
            </TripsBlocksProvider>
          ) : (
            <>
              <div className="mt-3.75 overflow-hidden rounded-[var(--shell-block-radius,1rem)] border">
                <TripsBlocksProvider value={blocks}>
                  <TripsSectionsBlock />
                </TripsBlocksProvider>
              </div>
              {error ? <ErrorRow message={error} onRetry={onRetry} /> : <LoadingRow label="Reading the page…" />}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
