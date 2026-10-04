import * as React from "react"
import { FileTextIcon, LayersIcon, LayoutGridIcon } from "lucide-react"

import { FrontPageBlockInspector } from "@/components/pages/front-page-block-inspector"
import {
  APP_KIND_PREFIX,
  FrontPageBlockKinds,
} from "@/components/pages/front-page-block-kinds"
import { FrontPageBlockList } from "@/components/pages/front-page-block-list"
import { FrontPageSettingsPanel } from "@/components/pages/front-page-settings-panel"
import { createShellId } from "@/components/settings/nav-editor-shared"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  PanelReopenTab,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  WorkspacePanel,
} from "@/components/ui/resizable"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { PanelImperativeHandle } from "react-resizable-panels"
import type { PublicPageRow } from "@/lib/api/content/pages"
import type { ShellConfig } from "@/lib/custom-shell"
import { pageGutter } from "@/lib/layout/shell-gutter"
import {
  useBlankSpaceDoubleClick,
  usePanelToggle,
} from "@/lib/layout/panel-collapse"
import { panelLayoutKey, useRememberedPanelLayout } from "@/lib/layout/panel-layout"
import { useWideScreen } from "@/lib/layout/wide-screen"
import {
  createAppFrontPageRowDraft,
  createFrontPageRowDraft,
  normalizeFrontPageRows,
  type FrontPageRow,
  type FrontPageRowDraft,
  type FrontPageRowKind,
} from "@/lib/pages/front-page"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * What the right panel is editing. `id` is null while a block is being made,
 * and `baseline` is the draft as it was when the panel opened — comparing the
 * two is what tells an unsaved edit from an untouched block.
 */
type Selection = {
  id: string | null
  draft: FrontPageRowDraft
  baseline: string
  /**
   * Counts up with every selection, and nothing else uses it. It is the
   * inspector's React key, so picking a second block of the same kind still
   * gets a fresh panel rather than the last one's "Save was already pressed"
   * state and the red heading that goes with it.
   */
  token: number
}

let nextToken = 0

function select(id: string | null, draft: FrontPageRowDraft): Selection {
  nextToken += 1
  return { id, draft, baseline: JSON.stringify(draft), token: nextToken }
}

/** A saved block as a draft: everything it holds except its id. */
function draftOf(row: FrontPageRow): FrontPageRowDraft {
  const { id: _id, ...draft } = row
  return draft
}

/**
 * The front page, built from blocks, on one screen.
 *
 * Three panels, and each has one job. The kinds a page may hold are on the
 * left, this page's blocks in the order a visitor reads them are in the
 * middle, and the fields of the one selected block are on the right. With
 * nothing selected the right panel talks about the page itself.
 *
 * There is no bottom panel. A bottom panel's job on the other workspace
 * screens is the detail for one row of the list above it, and a block has no
 * rows.
 */
export function FrontPageEditor({
  page,
  config,
  onConfigChange,
}: {
  page: PublicPageRow
  config: ShellConfig
  onConfigChange: (config: ShellConfig) => void
}) {
  // Known before the first render on both sides, so the editor opens in the
  // layout it is going to keep instead of painting the narrow version and
  // rebuilding itself.
  const desktop = useWideScreen()
  const [selection, setSelection] = React.useState<Selection | null>(null)
  const [pendingDelete, setPendingDelete] = React.useState<FrontPageRow | null>(
    null
  )
  /**
   * What to do once the admin says the unsaved edits may go. Held as an object
   * rather than a bare function: `setState(fn)` would run the function as an
   * updater instead of storing it.
   */
  const [discarding, setDiscarding] = React.useState<{
    run: () => void
  } | null>(null)
  const [tab, setTab] = React.useState<"kinds" | "blocks" | "panel">("blocks")
  const [kindsCollapsed, setKindsCollapsed] = React.useState(false)
  const [panelCollapsed, setPanelCollapsed] = React.useState(false)
  const kindsPanelRef = React.useRef<PanelImperativeHandle | null>(null)
  const panelRef = React.useRef<PanelImperativeHandle | null>(null)
  const layout = useRememberedPanelLayout(panelLayoutKey.frontPageEditor)
  const toggleKinds = usePanelToggle(kindsPanelRef)
  const togglePanel = usePanelToggle(panelRef)
  const kindsDoubleClick = useBlankSpaceDoubleClick(toggleKinds)
  const panelDoubleClick = useBlankSpaceDoubleClick(togglePanel)

  const rows = config.frontPageRows
  const dirty = selection
    ? JSON.stringify(selection.draft) !== selection.baseline
    : false

  /**
   * Every way of leaving the open block goes through here, so one stray click
   * in the list cannot empty a half-filled panel. A clean panel changes
   * straight away.
   */
  function leaveSelection(run: () => void) {
    if (dirty) {
      setDiscarding({ run })
      return
    }
    run()
  }

  function commit(nextRows: FrontPageRow[]) {
    onConfigChange({ ...config, frontPageRows: nextRows })
  }

  function addBlock(choice: string) {
    leaveSelection(() => {
      const draft = choice.startsWith(APP_KIND_PREFIX)
        ? createAppFrontPageRowDraft(choice.slice(APP_KIND_PREFIX.length))
        : createFrontPageRowDraft(choice as FrontPageRowKind)
      setSelection(select(null, draft))
      setTab("panel")
    })
  }

  function openBlock(id: string) {
    const row = rows.find((candidate) => candidate.id === id)
    if (!row) return
    leaveSelection(() => {
      setSelection(select(row.id, draftOf(row)))
      setTab("panel")
    })
  }

  function saveSelection() {
    if (!selection) return
    const id = selection.id ?? createShellId("front-page-row")
    // Stored through the very normaliser the save uses, so the list shows what
    // the database will hold rather than what was typed. A block the normaliser
    // will not keep is refused here instead of vanishing on its own.
    const [row] = normalizeFrontPageRows([{ ...selection.draft, id }])
    if (!row) {
      showErrorToast(
        "That block is missing something it needs before it can go on the page."
      )
      return
    }
    commit(
      selection.id
        ? rows.map((candidate) => (candidate.id === row.id ? row : candidate))
        : [...rows, row]
    )
    setSelection(select(row.id, draftOf(row)))
  }

  function deleteBlock(row: FrontPageRow) {
    commit(rows.filter((candidate) => candidate.id !== row.id))
    if (selection?.id === row.id) setSelection(null)
    setPendingDelete(null)
  }

  const kinds = <FrontPageBlockKinds onPick={addBlock} />

  const list = (
    <FrontPageBlockList
      rows={rows}
      selectedId={selection?.id ?? null}
      pending={selection && selection.id === null ? selection.draft : null}
      onSelect={openBlock}
      onReorder={commit}
      onDelete={setPendingDelete}
    />
  )

  const panel = selection ? (
    <FrontPageBlockInspector
      // Keyed so the panel's own "has this been submitted yet" state belongs to
      // the block it is editing, rather than following the next one in.
      key={selection.token}
      draft={selection.draft}
      isNew={selection.id === null}
      // A new block joins the end of the list, so it is the top block only
      // when there is nothing above it yet.
      first={selection.id ? rows[0]?.id === selection.id : rows.length === 0}
      onChange={(draft) =>
        setSelection((current) => (current ? { ...current, draft } : current))
      }
      onSave={saveSelection}
      onCancel={() => leaveSelection(() => setSelection(null))}
    />
  ) : (
    <FrontPageSettingsPanel
      page={page}
      config={config}
      onConfigChange={onConfigChange}
    />
  )

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      style={{ gap: pageGutter }}
      onKeyDown={(event) => {
        // Escape backs out of the open block, through the same guard its Cancel
        // button uses rather than a second way out that could drift from it.
        if (event.key !== "Escape" || !selection) return
        leaveSelection(() => setSelection(null))
      }}
    >
      {desktop ? (
        <ResizablePanelGroup
          key={layout.layoutKey}
          orientation="horizontal"
          className="min-h-0 flex-1"
          defaultLayout={layout.defaultLayout}
          onLayoutChanged={layout.onLayoutChanged}
        >
          <ResizablePanel
            id="kinds"
            panelRef={kindsPanelRef}
            collapsible
            collapsedSize="0%"
            defaultSize="20%"
            minSize="16%"
            maxSize="30%"
            onResize={(size) => setKindsCollapsed(size.asPercentage < 0.5)}
          >
            <WorkspacePanel
              collapsed={kindsCollapsed}
              onDoubleClick={kindsDoubleClick}
            >
              {kinds}
            </WorkspacePanel>
          </ResizablePanel>
          <ResizableHandle gap collapsed={kindsCollapsed} />
          <ResizablePanel id="blocks" defaultSize="42%" minSize="25%">
            <WorkspacePanel className="relative flex flex-col">
              {list}
              {kindsCollapsed ? (
                <PanelReopenTab
                  side="left"
                  label="Show the blocks you can add"
                  onClick={toggleKinds}
                />
              ) : null}
              {panelCollapsed ? (
                <PanelReopenTab
                  side="right"
                  label="Show the block's settings"
                  onClick={togglePanel}
                />
              ) : null}
            </WorkspacePanel>
          </ResizablePanel>
          <ResizableHandle gap collapsed={panelCollapsed} />
          <ResizablePanel
            id="panel"
            panelRef={panelRef}
            collapsible
            collapsedSize="0%"
            defaultSize="38%"
            minSize="26%"
            maxSize="50%"
            onResize={(size) => setPanelCollapsed(size.asPercentage < 0.5)}
          >
            <WorkspacePanel
              collapsed={panelCollapsed}
              onDoubleClick={panelDoubleClick}
            >
              {panel}
            </WorkspacePanel>
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        // A narrow window gets one panel at a time rather than three stacked
        // panels it would have to scroll past each other. Tabs, not arbitrary
        // heights: each panel still fills the screen it is given.
        <Tabs
          value={tab}
          onValueChange={(value) => setTab(value as typeof tab)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <TabsList className="w-full">
            <TabsTrigger value="blocks">
              <LayersIcon className="size-4" />
              Blocks
            </TabsTrigger>
            <TabsTrigger value="kinds">
              <LayoutGridIcon className="size-4" />
              Add
            </TabsTrigger>
            <TabsTrigger value="panel">
              <FileTextIcon className="size-4" />
              {selection ? "Block" : "Page"}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="blocks" className="min-h-0 flex-1">
            <WorkspacePanel className="flex min-w-0 flex-1 flex-col">
              {list}
            </WorkspacePanel>
          </TabsContent>
          <TabsContent value="kinds" className="min-h-0 flex-1">
            <WorkspacePanel className="flex min-w-0 flex-1 flex-col">
              {kinds}
            </WorkspacePanel>
          </TabsContent>
          <TabsContent value="panel" className="min-h-0 flex-1">
            <WorkspacePanel className="flex min-w-0 flex-1 flex-col">
              {panel}
            </WorkspacePanel>
          </TabsContent>
        </Tabs>
      )}

      <ConfirmDialog
        open={discarding !== null}
        onOpenChange={(open) => {
          if (!open) setDiscarding(null)
        }}
        title="Discard changes?"
        description="This block has edits that have not been saved. Leaving it now throws them away."
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
        onConfirm={() => {
          const run = discarding?.run
          setDiscarding(null)
          run?.()
        }}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null)
        }}
        title="Delete this block?"
        description={
          pendingDelete
            ? `${pendingDelete.heading} will come off the public front page.`
            : null
        }
        confirmLabel="Delete block"
        onConfirm={() => {
          if (pendingDelete) deleteBlock(pendingDelete)
        }}
      />
    </div>
  )
}
