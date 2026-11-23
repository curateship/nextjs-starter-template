import * as React from "react"
import type { PanelImperativeHandle } from "react-resizable-panels"

import type { AdminFrame } from "@/components/admin-dashboard/admin-dashboard"
import { FrontPageEditor } from "@/components/pages/front-page-editor"
import { useShellConfigPatch } from "@/components/settings/use-shell-config-patch"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup, WorkspacePanel } from "@/components/ui/resizable"
import type { PageEditorData } from "@/lib/api/content/page-editor"
import { usePanelCollapsed } from "@/lib/layout/panel-collapse"
import {
  clampStepListWidth,
  DEFAULT_STEP_LIST_WIDTH,
  MIN_STEP_LIST_WIDTH,
} from "@/lib/layout/styling-values"
import { useWideScreen } from "@/lib/layout/wide-screen"

/**
 * A page being built, inside the Admin dashboard's Pages section (Tyler,
 * 9 Nov 2026: "Clicking on editing a page should not forward me to an
 * isolated page editor. Look at how automation does it ... copy its patter
 * (except the canvas middle is the pages drag and drop)").
 *
 * As an open automation: the left page stays; the middle, with no card of
 * its own, holds the block kinds you can add as a panel of their own, then
 * the page's blocks in the order a visitor reads them, dragged into order;
 * the right holds the picked block's fields, or the page's own settings
 * with none picked. The kinds panel opens at the automation step list's
 * width (Settings → Styling → Side panels), so the two screens line up.
 * Pressing Pages again in the Dashboards block goes back to the list.
 */
export function PageBuilder({ editor, frame }: { editor: PageEditorData; frame: AdminFrame }) {
  const { config, patch } = useShellConfigPatch()
  const wide = useWideScreen()
  const width = clampStepListWidth(config.styling.stepListWidth ?? DEFAULT_STEP_LIST_WIDTH)
  const kindsRef = React.useRef<PanelImperativeHandle | null>(null)
  const kindsState = usePanelCollapsed(kindsRef)

  return (
    <FrontPageEditor
      // A page of its own each time, so one page's half-typed block never
      // follows into the next.
      key={editor.page.path}
      page={editor.page}
      writtenPage={editor.writtenPage}
      initialBlocks={editor.blocks}
      pageChoices={editor.pageChoices}
      config={config}
      onConfigChange={(next) => patch(next)}
      frame={({ kinds, list, panel, panelLabel, selectedId, windows }) =>
        frame({
          header: null,
          bare: wide,
          middle: wide ? (
            <ResizablePanelGroup key={width} orientation="horizontal" className="min-h-0 flex-1">
              <ResizablePanel
                id="page-kinds"
                panelRef={kindsRef}
                collapsible
                collapsedSize="0px"
                defaultSize={`${width}px`}
                minSize={`${MIN_STEP_LIST_WIDTH}px`}
                maxSize="45%"
                groupResizeBehavior="preserve-pixel-size"
                onResize={kindsState.onResize}
              >
                <WorkspacePanel collapsed={kindsState.collapsed} className="flex flex-col">
                  {kinds}
                </WorkspacePanel>
              </ResizablePanel>
              <ResizableHandle gap collapsed={kindsState.collapsed} />
              <ResizablePanel id="page-blocks" minSize="40%">
                <WorkspacePanel className="flex flex-col">{list}</WorkspacePanel>
              </ResizablePanel>
            </ResizablePanelGroup>
          ) : (
            // A phone: the page's blocks, then the kinds under them.
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
              {list}
              {kinds}
            </div>
          ),
          right: { label: panelLabel, content: panel },
          ids: [],
          openId: selectedId ?? undefined,
          windows,
        })
      }
    />
  )
}
