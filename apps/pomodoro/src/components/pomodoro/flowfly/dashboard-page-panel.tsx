import * as React from "react"

import { DashboardCardHeader, dashboardCardHeadingClassName } from "@/components/shared/dashboard-card-header"
import { LockedPageContext } from "@/components/shared/notes/block-card"
import type { AppBlock } from "@/components/shared/notes/note-block-nodes"
import { PageCover } from "@/components/shared/notes/page-cover"
import { CoverRow, LockRow } from "@/components/shared/notes/page-rows"
import { PickGroup } from "@/components/shared/notes/pick-rows"
import { SavingDocument } from "@/components/shared/notes/saving-document"
import { TabbedMenu, type TabbedMenuState } from "@/components/shared/notes/tabbed-menu"
import { SidePanelCollapseButton } from "@/components/shared/three-panels"
import { ErrorRow } from "@/components/ui/error-row"
import { LoadingRow } from "@/components/ui/loading-row"
import { ScrollArea } from "@/components/ui/scroll-area"
import { PANEL_GUTTER } from "@/lib/layout/panel-gutter"
import { pageWithoutBlock, type StoredPage } from "@/lib/notes/page-body"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

/** How a dashboard's left page is saved: its words, its lock and its cover, each the signed-in person's own. */
export type DashboardPageApi = {
  save: (body: string) => Promise<unknown>
  lock: (locked: boolean) => Promise<unknown>
  setCover: (cover: { coverUrl: string | null; coverImages: string[] }) => Promise<unknown>
  message: (error: unknown) => string
}

/**
 * A dashboard's left panel, copied from Promo's (`apps/promo/src/components/dashboard-page/`)
 * for the Flowfly admin dashboard (Tyler, 13 Nov 2026). Drawn as the CRM's
 * and Travel's Trips left pages are.
 *
 * - **Header:** the collapse button, the dashboard's name, and the ⋮:
 *   General (the page's Cover photo, and Lock blocks in its footer) and
 *   Widgets, Overview's rows and spots.
 * - **Page:** the person's own, written on like any page in the design, with
 *   the fixed Dashboards block that picks the section and the "/" blocks.
 *   While the page is read, or when it could not be, the Dashboards block is
 *   drawn on its own, since it is the only way between the sections.
 * - The body carries `data-side-panel-body`, the shell's mark that draws the
 *   first block at Settings → Styling → Panel cards → Opacity.
 */
export function DashboardPagePanel({
  title,
  page,
  error,
  onRetry,
  api,
  appBlocks,
  blocks,
  sectionsBlock,
  widgets,
  extraTabs = [],
  menuState,
  onPageChange,
}: {
  title: string
  /** Null while the page is first read, or when the read failed. */
  page: StoredPage | null
  error: string | null
  onRetry: () => void
  api: DashboardPageApi
  appBlocks: readonly AppBlock[]
  /** Wraps the page in the blocks' Provider, so they draw the dashboard's sections and projects. */
  blocks: (children: React.ReactNode) => React.ReactNode
  /** The Dashboards block alone, for while the page is read. */
  sectionsBlock: React.ReactNode
  /** The ⋮'s Widgets tab: Overview's rows and spots. */
  widgets: React.ReactNode
  /** The dashboard's own tabs after Widgets, such as the Anti Detect dashboard's Rack program. */
  extraTabs?: { value: string; label: string; content: React.ReactNode }[]
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
    } catch (failure) {
      showErrorToast(api.message(failure))
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
            await api.lock(false)
            await api.save(body)
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
          <span className={cn("min-w-0 flex-1 truncate pl-1", dashboardCardHeadingClassName)}>{title}</span>
          {page ? (
            <TabbedMenu
              label={`${title} settings`}
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
                              void change(() => api.setCover({ coverUrl: url, coverImages: images }), {
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
                      onLock={(locked) => void change(() => api.lock(locked), { ...page, locked })}
                    />
                  ),
                },
                { value: "widgets", label: "Widgets", content: widgets },
                ...extraTabs,
              ]}
            />
          ) : null}
        </DashboardCardHeader>
      </div>

      <ScrollArea className="relative min-h-0 flex-1">
        <div data-side-panel-body="" className={cn(PANEL_GUTTER, "grid grid-cols-[minmax(0,1fr)] pt-0")}>
          {page
            ? blocks(
                <LockedPageContext.Provider value={lockedPage}>
                  <SavingDocument
                    // A lock reads again from the start, so the editor and the lock always agree.
                    key={page.locked ? "locked" : "open"}
                    value={page.body}
                    locked={page.locked}
                    appBlocks={appBlocks}
                    placeholder="Write something, or type / for blocks"
                    onSave={async (body) => {
                      try {
                        await api.save(body)
                        onPageChange({ ...page, body })
                      } catch (failure) {
                        showErrorToast(api.message(failure))
                      }
                    }}
                  />
                </LockedPageContext.Provider>
              )
            : (
              <>
                <div className="mt-3.75 overflow-hidden rounded-[var(--shell-block-radius,1rem)] border">
                  {blocks(sectionsBlock)}
                </div>
                {error ? <ErrorRow message={error} onRetry={onRetry} /> : <LoadingRow label="Reading the page…" />}
              </>
            )}
        </div>
      </ScrollArea>
    </div>
  )
}
