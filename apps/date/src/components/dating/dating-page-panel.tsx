import * as React from "react"
import { Loader2Icon, PauseIcon, PlayIcon, PlusIcon, Trash2Icon } from "lucide-react"

import { DashboardCardHeader } from "@/components/shared/dashboard-card-header"
import { LockedPageContext } from "@/components/shared/notes/block-card"
import { PageCover } from "@/components/shared/notes/page-cover"
import { CoverRow, LockRow } from "@/components/shared/notes/page-rows"
import { PickGroup } from "@/components/shared/notes/pick-rows"
import { SavingDocument } from "@/components/shared/notes/saving-document"
import { MenuFooterButton, TabbedMenu, type MySettingsTab, type TabbedMenuState } from "@/components/shared/notes/tabbed-menu"
import { SidePanelCollapseButton } from "@/components/shared/three-panels"
import { Button } from "@/components/ui/button"
import { ErrorRow } from "@/components/ui/error-row"
import { LoadingRow } from "@/components/ui/loading-row"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { DatingDashboard } from "@/lib/api/dating/dashboard"
import { lockDatingPage, saveDatingPage, setDatingPageCoverPhoto } from "@/lib/api/dating/page"
import { datingErrorMessage } from "@/lib/dating/errors"
import { PANEL_GUTTER } from "@/lib/layout/panel-gutter"
import { pageWithBlockMoved, pageWithoutBlock, type StoredPage } from "@/lib/notes/page-body"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

import { DatingBlocksProvider, datingBlocks, DatingSectionsBlock, type DatingBlocks } from "./dating-blocks"
import { DatingGeneralGroups, DatingRulesTab, DatingYouTab } from "./dating-settings"
import { ProfileTitle } from "./profiles"

/**
 * The Dating dashboard's left panel, in the Admin 3 panel design (task
 * "features/07-three-panel-design"), built as the shell's Automations page is
 * (`automation-page-panel.tsx`):
 *
 * - **Header:** the collapse button at the outer edge, the open profile (its
 *   photo or letter, its name, its app and phone), then the ⋮. Start
 *   swiping moved to the list's header, and switching profile into the ⋮
 *   (Tyler, 18 Nov 2026).
 * - **The ⋮** took the place of the cog's settings window (Tyler, 18 Nov 2026:
 *   "THe left panel cog needs to be changed to a 3 dot dropdown and the modal
 *   needs to be a dropdown with the new dropdown ui"): General (Cover photo,
 *   Open profile, the profile's name, Google Calendar, New profile, Pause and
 *   Delete profile, Lock blocks), You, Rules and Widgets.
 * - **Page:** one per profile, written on like any page in the design, with
 *   the basic "/" blocks, Date's own blocks and the fixed Dashboards block.
 */
export function DatingPagePanel({
  data,
  page,
  error,
  onRetry,
  blocks,
  onPageChange,
  menu,
  widgetsTab,
  busy,
  onPickProfile,
  onNewProfile,
  onRenamed,
  onPause,
  onDelete,
}: {
  data: DatingDashboard
  /** Null while the page is first read, or when the read failed. */
  page: StoredPage | null
  error: string | null
  onRetry: () => void
  blocks: DatingBlocks
  onPageChange: (page: StoredPage) => void
  /** The ⋮'s open state and tab, held by the dashboard so a widget's Manage widgets opens it at Widgets. */
  menu: TabbedMenuState
  widgetsTab: React.ReactNode
  busy: string | null
  onPickProfile: (accountId: string) => void
  onNewProfile: () => void
  onRenamed: () => void
  onPause: (paused: boolean) => void
  onDelete: () => void
}) {
  const [saving, setSaving] = React.useState(false)
  // Made once per app: the editor's blocks must not change while the page shows.
  const pageBlocks = React.useMemo(() => datingBlocks(data.profile.app), [data.profile.app])

  const change = async (values: Partial<StoredPage>, save: () => Promise<unknown>) => {
    if (!page) return
    setSaving(true)
    try {
      await save()
      onPageChange({ ...page, ...values })
    } catch (changeError) {
      showErrorToast(datingErrorMessage(changeError))
    } finally {
      setSaving(false)
    }
  }

  // Delete block and Move up or down on the locked page: unlocked just long
  // enough to save, as on every page in the design.
  const lockedPage = page
    ? {
        locked: page.locked,
        removeBlock: async (nodeName: string) => {
          const body = pageWithoutBlock(page.body, nodeName)
          await change({ locked: false, body }, async () => {
            await lockDatingPage(false)
            await saveDatingPage(body)
          })
        },
        moveBlock: async (nodeName: string, direction: -1 | 1) => {
          const body = pageWithBlockMoved(page.body, nodeName, direction)
          if (body === page.body) return
          await change({ body }, async () => {
            await lockDatingPage(false)
            try {
              await saveDatingPage(body)
            } finally {
              await lockDatingPage(true)
            }
          })
        },
      }
    : null

  const tabs: MySettingsTab[] = [
    {
      value: "general",
      label: "General",
      content: (
        <div className="grid">
          <div className="grid gap-3 p-3">
            {page ? (
              <PickGroup title="Page">
                <CoverRow
                  cover={{
                    url: page.coverUrl,
                    images: page.coverImages,
                    busy: saving,
                    set: ({ url, images }) => {
                      const cover = { coverUrl: url, coverImages: images }
                      void change(cover, () => setDatingPageCoverPhoto(cover))
                    },
                  }}
                />
              </PickGroup>
            ) : null}
            <DatingGeneralGroups data={data} onPickProfile={onPickProfile} onRenamed={onRenamed} />
          </div>
          {/* The action rows sit at the same edge as Lock blocks under them
              (Tyler, 18 Nov 2026: "fix the buttons ui"): one inset, one
              line above Delete, no space left under it. */}
          <div className="grid px-1.5 pb-1.5">
            <MenuFooterButton icon={<PlusIcon />} onClick={onNewProfile}>
              New profile
            </MenuFooterButton>
            <MenuFooterButton
              icon={busy === "pause" ? <Loader2Icon className="animate-spin" /> : data.profile.paused ? <PlayIcon /> : <PauseIcon />}
              disabled={busy === "pause"}
              onClick={() => onPause(!data.profile.paused)}
            >
              {data.profile.paused ? "Resume profile" : "Pause profile"}
            </MenuFooterButton>
          </div>
          {/* 2px under it, as the menu's own 4px under its rows makes 6px, the same as above the line. */}
          <div className="grid border-t px-1.5 pt-1.5 pb-0.5">
            <Button
              type="button"
              variant="ghost"
              className="w-full justify-start gap-2 px-2 font-normal text-destructive hover:text-destructive [&_svg]:size-4"
              onClick={onDelete}
            >
              <Trash2Icon />
              Delete profile
            </Button>
          </div>
        </div>
      ),
      footer: page ? <LockRow locked={page.locked} busy={saving} onLock={(locked) => void change({ locked }, () => lockDatingPage(locked))} /> : undefined,
    },
    { value: "you", label: "You", content: <DatingYouTab profile={data.profile} /> },
    { value: "rules", label: "Rules", content: <DatingRulesTab profile={data.profile} /> },
    { value: "widgets", label: "Widgets", content: widgetsTab },
  ]

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-card">
      <PageCover url={page?.coverUrl ?? null} />
      {/* Its own div, so the shell's table line under a header never matches it. */}
      <div className="relative shrink-0">
        <DashboardCardHeader className={cn("gap-1", page?.coverUrl && "border-b-transparent")}>
          <SidePanelCollapseButton side="left" label="Hide the page" />
          <div className="min-w-0 flex-1">
            <ProfileTitle data={data} />
          </div>
          <TabbedMenu
            label="Dating settings"
            align="start"
            width="25rem"
            open={menu.open}
            onOpenChange={menu.onOpenChange}
            tab={menu.tab}
            onTabChange={menu.onTabChange}
            tabs={tabs}
          />
        </DashboardCardHeader>
      </div>

      <ScrollArea className="relative min-h-0 flex-1">
        <div data-side-panel-body="" className={cn(PANEL_GUTTER, "grid grid-cols-[minmax(0,1fr)] pt-0")}>
          <DatingBlocksProvider value={blocks}>
            {page ? (
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
                      await saveDatingPage(body)
                    } catch (saveError) {
                      showErrorToast(datingErrorMessage(saveError))
                    }
                  }}
                />
              </LockedPageContext.Provider>
            ) : (
              <>
                {/* The sections stay reachable while the page is read, or when
                    it could not be: the Dashboards block is their only way in. */}
                <div className="mt-3.75 overflow-hidden rounded-[var(--shell-block-radius,1rem)] border">
                  <DatingSectionsBlock />
                </div>
                {error ? <ErrorRow message={error} onRetry={onRetry} /> : <LoadingRow label="Reading the page…" />}
              </>
            )}
          </DatingBlocksProvider>
        </div>
      </ScrollArea>
    </div>
  )
}
