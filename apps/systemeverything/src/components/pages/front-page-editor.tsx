import * as React from "react"
import { FileTextIcon, LayersIcon, LayoutGridIcon } from "lucide-react"

import { arrayMove } from "@dnd-kit/sortable"

import { FrontPageBlockInspector } from "@/components/pages/front-page-block-inspector"
import {
  APP_KIND_PREFIX,
  FrontPageBlockKinds,
} from "@/components/pages/front-page-block-kinds"
import { FrontPageBlockList } from "@/components/pages/front-page-block-list"
import { FrontPageSettingsPanel } from "@/components/pages/front-page-settings-panel"
import { createShellId } from "@/components/settings/nav-editor-shared"
import { appFrontPageRowKind } from "@/lib/app-options"
import { useReportedSaveStatus } from "@/components/settings/use-reported-save-status"
import {
  getPageBlockSaveErrorMessage,
  removePageBlock,
  savePageBlock,
  savePageBlockOrder,
} from "@/lib/api/content/page-blocks"
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
import type { PublicPageRow, WrittenPage } from "@/lib/api/content/pages"
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
  frontPageBlockProblem,
  FRONT_PAGE_ROW_KINDS,
  normalizeFrontPageRows,
  type FrontPageRow,
  type FrontPageRowDraft,
  type FrontPageRowKind,
} from "@/lib/pages/front-page"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

/**
 * What the right panel is editing.
 *
 * `baseline` is the draft as it was last written, so comparing the two is what
 * says whether there is anything to save. `id` is the id the block saves
 * under, and a block being made has one from the moment it is picked: the
 * write is an upsert on that id, so a second auto-save cannot make a second
 * block out of one that is still being typed.
 */
type Selection = {
  id: string
  draft: FrontPageRowDraft
  baseline: string
  /**
   * Counts up with every selection, and nothing else uses it. It is the
   * inspector's React key, so picking a second block of the same kind still
   * gets a fresh panel rather than the last one's state, and it is what an
   * auto-save checks before writing its result back into a panel that may
   * have moved on to another block.
   */
  token: number
}

let nextToken = 0

/**
 * How to make a block of the named kind, or null when there is no such kind.
 *
 * The name arrives from a click on a card, which can only ever be one of
 * these, and from a drop, which can be anything at all.
 */
function blockDraftFor(choice: string): (() => FrontPageRowDraft) | null {
  if (choice.startsWith(APP_KIND_PREFIX)) {
    const key = choice.slice(APP_KIND_PREFIX.length)
    const kind = appFrontPageRowKind(key)
    return kind ? () => createAppFrontPageRowDraft(key, kind.label) : null
  }
  return FRONT_PAGE_ROW_KINDS.includes(choice as FrontPageRowKind)
    ? () => createFrontPageRowDraft(choice as FrontPageRowKind)
    : null
}

/** The problem sentence read on from "it is not on the page yet: ". */
function lowerFirst(sentence: string) {
  return sentence ? sentence[0].toLowerCase() + sentence.slice(1) : sentence
}

function select(id: string, draft: FrontPageRowDraft): Selection {
  nextToken += 1
  return { id, draft, baseline: JSON.stringify(draft), token: nextToken }
}

/**
 * An edit saves itself this long after the last keystroke; leaving the block
 * saves it straight away. The same rhythm as every other auto-saving card in
 * the app.
 */
const SAVE_DELAY_MS = 1200

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
  writtenPage,
  initialBlocks,
  config,
  onConfigChange,
}: {
  page: PublicPageRow
  /** The row behind a page an admin added, or null for one the code declares. */
  writtenPage: WrittenPage | null
  /** This page's blocks as the loader read them, hidden ones included. */
  initialBlocks: FrontPageRow[]
  config: ShellConfig
  onConfigChange: (config: ShellConfig) => void
}) {
  // Known before the first render on both sides, so the editor opens in the
  // layout it is going to keep instead of painting the narrow version and
  // rebuilding itself.
  const desktop = useWideScreen()
  /**
   * The page's blocks, as the server last answered.
   *
   * Every write below sends one block and is handed the whole page back, so
   * this is the database's answer rather than the screen's guess about what
   * changed. That is what lets two admins work on two pages at once without
   * either one's list going stale.
   */
  const [rows, setRows] = React.useState(initialBlocks)
  // The block's own Saving…/Saved, in the sticky header, which is the one
  // place this app reports saving.
  const setSaveStatus = useReportedSaveStatus()
  const [busy, setBusy] = React.useState(false)
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
  /**
   * What the left panel is carrying, by name, so the list can name the space
   * it opens. It cannot ride on the drag itself: a browser hands
   * `dataTransfer.getData` back empty until the drop.
   */
  const [draggingKind, setDraggingKind] = React.useState<string | null>(null)
  const [kindsCollapsed, setKindsCollapsed] = React.useState(false)
  const [panelCollapsed, setPanelCollapsed] = React.useState(false)
  const kindsPanelRef = React.useRef<PanelImperativeHandle | null>(null)
  const panelRef = React.useRef<PanelImperativeHandle | null>(null)
  const layout = useRememberedPanelLayout(panelLayoutKey.frontPageEditor)
  const toggleKinds = usePanelToggle(kindsPanelRef)
  const togglePanel = usePanelToggle(panelRef)
  const kindsDoubleClick = useBlankSpaceDoubleClick(toggleKinds)
  const panelDoubleClick = useBlankSpaceDoubleClick(togglePanel)

  // The draft as one string, which is what the debounce below watches. A
  // string and not the selection object: `setSaveStatus` renders the editor
  // again mid-save, and an effect keyed on an object rebuilt every render
  // would clear its own timer every time that happened.
  const draftText = selection ? JSON.stringify(selection.draft) : null
  // A block nobody has typed into is still one that has to be written, because
  // picking a kind is how a block is added: it arrives named after its kind,
  // which is enough to draw, and waiting for an edit that may never come would
  // leave it in the panel and off the page.
  const unwritten =
    selection !== null && !rows.some((row) => row.id === selection.id)
  const dirty =
    selection !== null && (unwritten || draftText !== selection.baseline)
  /**
   * The block as the server would store it, or null when it is not yet enough
   * to draw.
   *
   * The very normaliser the server uses, so the answer here and the answer
   * there can never disagree. A block it drops — no heading, an FAQ with no
   * questions, a hero button with a link and no wording — must not be written
   * at all: the write would delete it, which is exactly what somebody still
   * typing into it does not want.
   */
  const savable = selection
    ? (normalizeFrontPageRows([{ ...selection.draft, id: selection.id }])[0] ??
      null)
    : null
  // The boolean, for the effect below: the row itself is a fresh object every
  // render and would never compare equal.
  const hasSavable = savable !== null

  /**
   * True while a block's write is in the air.
   *
   * A ref and not state, because nothing on screen reads it: it exists so a
   * slow answer cannot collect a second timer behind it and send the same
   * block twice. The write that lands puts the baseline back, which is what
   * arms the next one if anything was typed meanwhile.
   */
  const writing = React.useRef(false)
  /**
   * Where a block dropped between two others should land, once it exists.
   *
   * A block has to be written before it can be put in order, and the write
   * appends it. So the drop remembers the place here, the save that follows
   * moves it, and the note is torn up either way.
   */
  const landAt = React.useRef<{ id: string; at: number } | null>(null)
  /**
   * The same number, for drawing rather than for writing. The list draws the
   * block waiting for its write where it was dropped, so it does not appear at
   * the end and then move into place while somebody watches.
   */
  const [landingAt, setLandingAt] = React.useState<number | null>(null)
  // What the debounce needs, held where the timer can read the latest without
  // being rebuilt by it. An effect keyed on these values directly would
  // restart the timer on every render.
  const pending = React.useRef<{ selection: Selection; block: FrontPageRow } | null>(
    null
  )
  // Kept current after every render, the same shape the CRM's own refs use. A
  // ref written during render is the one thing React will not have.
  React.useEffect(() => {
    pending.current = selection && savable ? { selection, block: savable } : null
  })

  /**
   * Writes the open block.
   *
   * It is handed the selection it started from, so an answer that arrives
   * after the panel has moved to another block updates the list and leaves
   * that other block's panel alone. It deliberately does not go through
   * `write`: that one holds the screen's `busy` flag, and a save nobody asked
   * for must not grey out the buttons of somebody who is still typing.
   */
  async function saveNow(current: Selection, block: FrontPageRow) {
    if (writing.current) return
    writing.current = true
    const sent = JSON.stringify(current.draft)
    setSaveStatus("saving")
    dismissErrorToast()
    try {
      let saved = await savePageBlock({ path: page.path, block })
      const landing = landAt.current
      if (landing && landing.id === block.id) {
        // The note is torn up here so a second save cannot reorder again, but
        // the drawn position below is kept until the rows themselves land.
        landAt.current = null
        const from = saved.findIndex((row) => row.id === block.id)
        if (from !== -1 && from !== landing.at) {
          const ordered = arrayMove(saved, from, landing.at)
          saved = await savePageBlockOrder({
            path: page.path,
            ids: ordered.map((row) => row.id),
          })
        }
      }
      setRows(saved)
      // Only now. Cleared any earlier and the block waiting for its write
      // loses the place it was dropped in and falls to the end of the list,
      // which is the jump this was meant to stop.
      setLandingAt(null)
      setSelection((open) =>
        open && open.token === current.token
          ? // The baseline, not the draft: whatever has been typed since the
            // request left stays on screen and saves itself in turn.
            { ...open, baseline: sent }
          : open
      )
      setSaveStatus("saved")
    } catch (error) {
      setSaveStatus("idle")
      showErrorToast(getPageBlockSaveErrorMessage(error))
    } finally {
      writing.current = false
    }
  }

  // The debounce. A keystroke changes the draft's text, which clears the last
  // timer and starts a new one, so the write lands once the typing stops. A
  // block that cannot be drawn yet never arms it at all, because writing one
  // is what would delete it.
  React.useEffect(() => {
    if (!dirty || !hasSavable) return
    const timer = setTimeout(() => {
      const next = pending.current
      if (next) void saveNow(next.selection, next.block)
    }, SAVE_DELAY_MS)
    return () => clearTimeout(timer)
    // Only the two values that should restart the timer. `saveNow` and the
    // block itself are rebuilt every render and would restart it forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftText, dirty, hasSavable, unwritten])

  /**
   * Every way of leaving the open block goes through here.
   *
   * Edits that can be saved are saved on the way out rather than waiting for
   * the timer, so closing the panel never loses the last thing typed. Edits
   * that cannot be saved are the only ones worth a question, because those are
   * the ones leaving would throw away.
   */
  function leaveSelection(run: () => void) {
    if (dirty && !savable) {
      setDiscarding({ run })
      return
    }
    if (dirty && selection && savable) void saveNow(selection, savable)
    run()
  }

  /**
   * Runs one write and takes the page the server hands back. A failure says so
   * and changes nothing, so the list on screen is never a block ahead of the
   * database.
   */
  async function write(run: () => Promise<FrontPageRow[]>) {
    setBusy(true)
    dismissErrorToast()
    try {
      setRows(await run())
      return true
    } catch (error) {
      showErrorToast(getPageBlockSaveErrorMessage(error))
      return false
    } finally {
      setBusy(false)
    }
  }

  /**
   * Makes a block of one kind and opens it.
   *
   * `at` is where it should land, for a card dragged onto a particular block.
   * Left out, it joins the end, which is where a click puts it. The block
   * saves itself a moment later and the move to `at` follows that write,
   * because a block has to exist before it can be put in order.
   */
  function addBlock(choice: string, at?: number) {
    // Checked, not trusted. A drop carries whatever the thing being dragged
    // put on it, and a drag can come from another page entirely: one claiming
    // this app's own type with a kind that does not exist would make a draft
    // with no heading, and the panel would come apart on the first read of it.
    const draftFor = blockDraftFor(choice)
    if (!draftFor) return

    leaveSelection(() => {
      const draft = draftFor()
      // The id now rather than at the first write. Auto-save can fire twice
      // before the first answer lands, and an id made per attempt would put
      // the same half-typed block on the page twice.
      const id = createShellId("front-page-row")
      landAt.current = at === undefined ? null : { id, at }
      setLandingAt(at ?? null)
      setSelection(select(id, draft))
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

  async function deleteBlock(row: FrontPageRow) {
    setPendingDelete(null)
    // Straight out, with no question about unsaved edits: the block itself is
    // going, so there is nothing for the edits to belong to.
    if (selection?.id === row.id) setSelection(null)
    await write(() => removePageBlock({ path: page.path, id: row.id }))
  }

  async function reorder(nextRows: FrontPageRow[]) {
    // Drawn in the new order straight away, because a drag that snaps back
    // while a request flies reads as a drag that failed.
    setRows(nextRows)
    await write(() =>
      savePageBlockOrder({
        path: page.path,
        ids: nextRows.map((row) => row.id),
      })
    )
  }

  const kinds = (
    <FrontPageBlockKinds
      path={page.path}
      onPick={addBlock}
      onDragKind={setDraggingKind}
    />
  )

  const list = (
    <FrontPageBlockList
      rows={rows}
      selectedId={selection?.id ?? null}
      pending={unwritten && selection ? selection.draft : null}
      draggingKind={draggingKind}
      pendingAt={landingAt}
      onSelect={openBlock}
      onReorder={(next) => void reorder(next)}
      onAddKindAt={addBlock}
      onDelete={setPendingDelete}
    />
  )

  const panel = selection ? (
    <FrontPageBlockInspector
      // Keyed so the panel's own "has this been typed into yet" state belongs
      // to the block it is editing, rather than following the next one in.
      key={selection.token}
      draft={selection.draft}
      // A block being typed is not on the page yet, so it is the top block
      // only when there is nothing above it.
      first={rows.length === 0 || rows[0]?.id === selection.id}
      pageGap={config.publicTheme.frontPageRowGap}
      heldBack={!hasSavable}
      onChange={(draft) =>
        setSelection((current) => (current ? { ...current, draft } : current))
      }
      onClose={() => leaveSelection(() => setSelection(null))}
    />
  ) : (
    <FrontPageSettingsPanel
      page={page}
      writtenPage={writtenPage}
      config={config}
      onConfigChange={onConfigChange}
    />
  )

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      style={{ gap: pageGutter }}
      onKeyDown={(event) => {
        // Escape backs out of the open block, through the same guard the panel's
        // own way out uses rather than a second way out that could drift from it.
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
        title="Throw this block away?"
        // The only edits that can be lost now are the ones that cannot be
        // saved, because everything else saves itself. So the question is
        // about a block that is not finished rather than about unsaved work.
        description={
          selection
            ? `It is not on the page yet: ${lowerFirst(
                frontPageBlockProblem(selection.draft) ?? ""
              )} Leaving now throws away what has been typed into it.`
            : null
        }
        confirmLabel="Throw it away"
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
        loading={busy}
        onConfirm={() => {
          if (pendingDelete) void deleteBlock(pendingDelete)
        }}
      />
    </div>
  )
}
