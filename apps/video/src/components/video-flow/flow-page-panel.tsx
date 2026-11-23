import * as React from "react"

import { DashboardCardHeader, dashboardCardHeadingClassName } from "@/components/shared/dashboard-card-header"
import { LockedPageContext } from "@/components/shared/notes/block-card"
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
  getFlowPageErrorMessage,
  lockFlowPage,
  saveFlowPage,
  setFlowPageCoverPhoto,
  type FlowPage,
} from "@/lib/api/video/flow-page"
import { PANEL_GUTTER } from "@/lib/layout/panel-gutter"
import { pageWithBlockMoved, pageWithoutBlock } from "@/lib/notes/page-body"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

import { FlowBlocksProvider, flowBlocks, FlowSectionsBlock, type FlowBlocks } from "./flow-blocks"

/**
 * The Flow dashboard's left page (the Admin 3 panel design), the same as
 * Automations' (`automation-page-panel.tsx`), but the person's own:
 *
 * - **Header:** the collapse button at the panel's outer edge, the title, and
 *   the + that makes a flow (a dropdown form), then the ⋮ with General:
 *   Cover photo, then Lock the notes at the foot.
 * - **Page:** written on like any page in the design, with the basic "/"
 *   blocks and the fixed Dashboards block, saved 700ms after typing stops.
 */
export function FlowPagePanel({
  page,
  error,
  onRetry,
  blocks,
  onPageChange,
  actions,
}: {
  /** Null while the page is first read, or when the read failed. */
  page: FlowPage | null
  error: string | null
  onRetry: () => void
  blocks: FlowBlocks
  onPageChange: (page: FlowPage) => void
  /** Before the ⋮: the + that makes a flow. */
  actions?: React.ReactNode
}) {
  const [busy, setBusy] = React.useState(false)
  const [menuOpen, setMenuOpen] = React.useState(false)
  // Made once: the editor's blocks must not change while the page shows.
  const [pageBlocks] = React.useState(flowBlocks)

  const change = async (values: Partial<FlowPage>, save: () => Promise<unknown>) => {
    if (!page) return
    setBusy(true)
    try {
      await save()
      onPageChange({ ...page, ...values })
    } catch (changeError) {
      showErrorToast(getFlowPageErrorMessage(changeError))
    } finally {
      setBusy(false)
    }
  }

  // Delete block on the locked page: unlocked, then saved without the block,
  // as on every page in the design.
  const lockedPage = page
    ? {
        locked: page.locked,
        removeBlock: async (nodeName: string) => {
          const body = pageWithoutBlock(page.body, nodeName)
          await change({ locked: false, body }, async () => {
            await lockFlowPage(false)
            await saveFlowPage(body)
          })
        },
        // Move up and Move down on the locked page: unlocked just long enough
        // to save the new order, then locked again (Tyler, 15 Nov 2026:
        // "Every block should have this function").
        moveBlock: async (nodeName: string, direction: -1 | 1) => {
          const body = pageWithBlockMoved(page.body, nodeName, direction)
          if (body === page.body) return
          await change({ body }, async () => {
            await lockFlowPage(false)
            try {
              await saveFlowPage(body)
            } finally {
              await lockFlowPage(true)
            }
          })
        },
      }
    : null

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-card">
      <PageCover url={page?.coverUrl ?? null} />
      {/* Its own div, so the shell's table line under a header never matches it. */}
      <div className="relative shrink-0">
        <DashboardCardHeader className={cn("gap-1", page?.coverUrl && "border-b-transparent")}>
          <SidePanelCollapseButton side="left" label="Hide the page" />
          <span className={cn("min-w-0 flex-1 truncate pl-1", dashboardCardHeadingClassName)}>Flow</span>
          {actions}
          {page ? (
            <TabbedMenu
              label="Flow page settings"
              align="start"
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
                              void change(cover, () => setFlowPageCoverPhoto(cover))
                            },
                          }}
                        />
                      </PickGroup>
                    </div>
                  ),
                  footer: (
                    <LockRow
                      locked={page.locked}
                      busy={busy}
                      onLock={(locked) => void change({ locked }, () => lockFlowPage(locked))}
                    />
                  ),
                },
              ]}
            />
          ) : null}
        </DashboardCardHeader>
      </div>

      <ScrollArea className="relative min-h-0 flex-1">
        <div data-side-panel-body="" className={cn(PANEL_GUTTER, "grid grid-cols-[minmax(0,1fr)] pt-0")}>
          {page ? (
            <FlowBlocksProvider value={blocks}>
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
                    onPageChange({ ...page, body })
                    try {
                      await saveFlowPage(body)
                    } catch (saveError) {
                      showErrorToast(getFlowPageErrorMessage(saveError))
                    }
                  }}
                />
              </LockedPageContext.Provider>
            </FlowBlocksProvider>
          ) : (
            <>
              {/* The sections stay reachable while the page is read, or when
                  it could not be: the Dashboards block is their only way in. */}
              <div className="mt-3.75 overflow-hidden rounded-[var(--shell-block-radius,1rem)] border">
                <FlowBlocksProvider value={blocks}>
                  <FlowSectionsBlock />
                </FlowBlocksProvider>
              </div>
              {error ? <ErrorRow message={error} onRetry={onRetry} /> : <LoadingRow label="Reading the page…" />}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
