import * as React from "react"

import {
  botsBlocks,
  BotsBlocksProvider,
  BotsSectionsBlock,
  type BotsBlocks,
} from "@/components/bots/bots-blocks"
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
  getBotsErrorMessage,
  lockBotsPage,
  saveBotsPage,
  setBotsPageCoverPhoto,
} from "@/lib/api/trade/bots"
import { PANEL_GUTTER } from "@/lib/layout/panel-gutter"
import type { StoredPage } from "@/lib/notes/page-body"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

type MenuTab = React.ComponentProps<typeof TabbedMenu>["tabs"][number]

/**
 * The Bots dashboard's left page, drawn as the shell's Admin page is
 * (`admin-page-panel.tsx`):
 *
 * - **Header:** the collapse button at the panel's outer edge, the title, and
 *   the ⋮: General (Cover photo, Lock the notes), then Widgets.
 * - **Page:** one per person, with the shell's basic "/" blocks and the fixed
 *   Dashboards block. It stays put whatever the middle shows (Tyler, 9 Nov
 *   2026: "if we combine all the sidebars, there's like 3 sidebar on the
 *   left").
 */
export function BotsPagePanel({
  menuTabs,
  page,
  error,
  onRetry,
  blocks,
  onPageChange,
}: {
  /** Tabs after General in the ⋮. */
  menuTabs: MenuTab[]
  /** Null while the page is first read, or when the read failed. */
  page: StoredPage | null
  error: string | null
  onRetry: () => void
  blocks: BotsBlocks
  onPageChange: (page: StoredPage) => void
}) {
  const [busy, setBusy] = React.useState(false)
  const [menuOpen, setMenuOpen] = React.useState(false)
  // Made once: the editor's blocks must not change while the page shows.
  const [pageBlocks] = React.useState(botsBlocks)

  const change = async (values: Partial<StoredPage>, save: () => Promise<unknown>) => {
    if (!page) return
    setBusy(true)
    try {
      await save()
      onPageChange({ ...page, ...values })
    } catch (saveError) {
      showErrorToast(getBotsErrorMessage(saveError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-card">
      <PageCover url={page?.coverUrl ?? null} />
      {/* Its own div, so the shell's table line under a header never matches it. */}
      <div className="relative shrink-0">
        <DashboardCardHeader className={cn("gap-1", page?.coverUrl && "border-b-transparent")}>
          <SidePanelCollapseButton side="left" label="Hide the page" />
          <span className={cn("min-w-0 flex-1 truncate pl-1", dashboardCardHeadingClassName)}>Bots</span>
          {page ? (
            <TabbedMenu
              label="Bots settings"
              align="start"
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
                              void change(cover, () => setBotsPageCoverPhoto(cover))
                            },
                          }}
                        />
                      </PickGroup>
                      <LockRow
                        locked={page.locked}
                        busy={busy}
                        onLock={(locked) => void change({ locked }, () => lockBotsPage(locked))}
                      />
                    </div>
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
            <BotsBlocksProvider value={blocks}>
              <SavingDocument
                // A lock reads again from the start, so the editor and the lock agree.
                key={page.locked ? "locked" : "open"}
                value={page.body}
                locked={page.locked}
                appBlocks={pageBlocks}
                placeholder="Write something, or type / for blocks"
                onSave={async (body) => {
                  // Kept before the save goes, so a redraw on the way starts from what was typed.
                  onPageChange({ ...page, body })
                  try {
                    await saveBotsPage(body)
                  } catch (saveError) {
                    showErrorToast(getBotsErrorMessage(saveError))
                  }
                }}
              />
            </BotsBlocksProvider>
          ) : (
            <>
              {/* The sections stay reachable while the page is read, or when it could not be. */}
              <div className="mt-3.75 overflow-hidden rounded-[var(--shell-block-radius,1rem)] border">
                <BotsBlocksProvider value={blocks}>
                  <BotsSectionsBlock />
                </BotsBlocksProvider>
              </div>
              {error ? <ErrorRow message={error} onRetry={onRetry} /> : <LoadingRow label="Reading the page…" />}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
