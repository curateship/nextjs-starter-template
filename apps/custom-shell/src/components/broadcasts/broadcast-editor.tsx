import * as React from "react"
import {
  MonitorIcon,
  SendIcon,
  SmartphoneIcon,
} from "lucide-react"
import type { PanelImperativeHandle } from "react-resizable-panels"

import { BlockInspector } from "@/components/broadcasts/block-inspector"
import { BlockPalette } from "@/components/broadcasts/block-palette"
import { BroadcastCanvas } from "@/components/broadcasts/broadcast-canvas"
import { BroadcastStatusPanel } from "@/components/broadcasts/broadcast-status-panel"
import { SendBroadcastDialog } from "@/components/broadcasts/send-broadcast-dialog"
import { SaveTemplateDialog } from "@/components/broadcasts/template-dialogs"
import { useShellRuntime } from "@/components/shell/shell-layout"
import { Button } from "@/components/ui/button"
import {
  BOTTOM_COLLAPSED_HEIGHT,
  PanelReopenTab,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  WorkspacePanel,
} from "@/components/ui/resizable"
import {
  getBroadcast,
  getBroadcastErrorMessage,
  saveBroadcastBlockDefault,
  updateBroadcast,
  type BroadcastDetail,
} from "@/lib/api/broadcasts"
import {
  createBroadcastBlock,
  type BroadcastAudienceFilter,
  type BroadcastBlock,
  type BroadcastBlockDefaults,
  type BroadcastBlockKind,
} from "@/lib/broadcasts/blocks"
import {
  PREVIEW_WIDTHS,
  type PreviewWidth,
} from "@/lib/broadcasts/preview-width"
import { dismissErrorToast, showErrorToast } from "@/lib/error-toast"
import {
  panelLayoutKey,
  useRememberedPanelLayout,
} from "@/lib/panel-layout"
import { cn } from "@/lib/utils"
import { useWideScreen } from "@/lib/wide-screen"
import type { SaveStatus } from "@/pages/dashboard/sticky-header/sticky-header"

/**
 * Draws the email at phone width or at the 600px every inbox gives it. A view
 * of the same email, nothing more — it changes no setting and what gets sent is
 * identical either way.
 */
function WidthToggle({
  value,
  onChange,
}: {
  value: PreviewWidth
  onChange: (value: PreviewWidth) => void
}) {
  const options = [
    { value: "desktop", label: "Desktop", icon: MonitorIcon },
    { value: "mobile", label: "Mobile", icon: SmartphoneIcon },
  ] as const

  return (
    <div className="flex items-center gap-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          title={`Show it ${PREVIEW_WIDTHS[option.value]} px wide`}
          onClick={() => onChange(option.value)}
          className={cn(
            "flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            value === option.value
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <option.icon className="size-3.5" />
          {option.label}
        </button>
      ))}
    </div>
  )
}

/** Same rhythm as every other auto-save in this app. */
const SAVE_DEBOUNCE_MS = 700
/** How often a send in flight refreshes its counts. */
const POLL_MS = 5000

const EDITABLE_STATUSES = new Set(["draft", "scheduled", "paused"])

type EditableFields = {
  subject: string
  preheader: string
  fromName: string
  blocks: BroadcastBlock[]
  audienceFilter: BroadcastAudienceFilter
}

function fieldsFromDetail(detail: BroadcastDetail): EditableFields {
  return {
    subject: detail.subject,
    preheader: detail.preheader,
    fromName: detail.fromName ?? "",
    blocks: detail.blocks,
    audienceFilter: detail.audienceFilter,
  }
}

/**
 * The newsletter editor: blocks on the left, the email in the middle, that
 * block's options on the right, and how the send is going along the bottom.
 *
 * The same arrangement as the automation builder, and for the same reason —
 * every divider can be dragged, the side panels can be shut away entirely when
 * you want the email full width, and where you left them is remembered.
 */
export function BroadcastEditor({
  initial,
  initialBlockDefaults,
}: {
  initial: BroadcastDetail
  initialBlockDefaults: BroadcastBlockDefaults
}) {
  const { reportSaveStatus } = useShellRuntime()
  const [broadcast, setBroadcast] = React.useState(initial)
  const [fields, setFields] = React.useState<EditableFields>(() =>
    fieldsFromDetail(initial)
  )
  const [selectedBlockId, setSelectedBlockId] = React.useState<string | null>(
    null
  )
  /**
   * A block picked from the left panel that is in no email yet.
   *
   * It fills the options panel exactly as a real block does, but editing it is
   * editing how *new* blocks of that kind start out — so those edits go to the
   * workspace's settings, never into this email. Adding one is a separate click
   * on the plus.
   */
  const [previewBlock, setPreviewBlock] = React.useState<BroadcastBlock | null>(
    null
  )
  const [blockDefaults, setBlockDefaults] = React.useState(initialBlockDefaults)
  const [saveStatus, setSaveStatus] = React.useState<SaveStatus>("idle")
  const [sendOpen, setSendOpen] = React.useState(false)
  const [saveTemplateOpen, setSaveTemplateOpen] = React.useState(false)
  // Bumped after a template is saved, which is what sends the Templates tab
  // back for a fresh list rather than showing one without the new entry.
  const [templatesVersion, setTemplatesVersion] = React.useState(0)
  // Which width the sheet is drawn at. A view of the same email, not a setting
  // on it, so it is not saved and not part of what gets sent.
  const [previewWidth, setPreviewWidth] = React.useState<PreviewWidth>("desktop")

  // Known before the first render on the server too, so the editor opens in the
  // layout it is going to keep rather than painting the narrow one and
  // rebuilding itself a beat later.
  const desktop = useWideScreen()
  const [paletteCollapsed, setPaletteCollapsed] = React.useState(false)
  const [inspectorCollapsed, setInspectorCollapsed] = React.useState(false)
  const palettePanelRef = React.useRef<PanelImperativeHandle | null>(null)
  const inspectorPanelRef = React.useRef<PanelImperativeHandle | null>(null)
  const horizontalLayout = useRememberedPanelLayout(
    panelLayoutKey.broadcastEditorHorizontal
  )
  const verticalLayout = useRememberedPanelLayout(
    panelLayoutKey.broadcastEditorVertical
  )

  const editable = EDITABLE_STATUSES.has(broadcast.status)

  const togglePalette = React.useCallback(() => {
    const panel = palettePanelRef.current
    if (!panel) return
    if (panel.isCollapsed()) panel.expand()
    else panel.collapse()
  }, [])
  const toggleInspector = React.useCallback(() => {
    const panel = inspectorPanelRef.current
    if (!panel) return
    if (panel.isCollapsed()) panel.expand()
    else panel.collapse()
  }, [])

  // ----- Auto-save: 700ms debounce, one queue, newest answer wins -----
  const serialize = React.useCallback(
    (next: EditableFields) => JSON.stringify(next),
    []
  )
  const lastSavedRef = React.useRef(serialize(fieldsFromDetail(initial)))
  const latestRef = React.useRef(fields)
  const saveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveQueueRef = React.useRef(Promise.resolve())
  const saveVersionRef = React.useRef(0)

  const savePayload = React.useCallback(
    (snapshot: EditableFields) => ({
      broadcastId: initial.id,
      subject: snapshot.subject,
      preheader: snapshot.preheader,
      fromName: snapshot.fromName.trim() || null,
      blocks: snapshot.blocks,
      audienceFilter: snapshot.audienceFilter,
    }),
    [initial.id]
  )

  const saveNow = React.useCallback(async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    const snapshot = latestRef.current
    const serialized = serialize(snapshot)
    if (serialized === lastSavedRef.current) return

    const version = saveVersionRef.current + 1
    saveVersionRef.current = version
    setSaveStatus("saving")

    const save = saveQueueRef.current
      .catch(() => undefined)
      .then(() => updateBroadcast(savePayload(snapshot)))
    saveQueueRef.current = save.then(
      () => undefined,
      () => undefined
    )

    try {
      const detail = await save
      lastSavedRef.current = serialized
      // Only the record, not the form: the server hands back cleaned-up markup,
      // and adopting it wholesale would move the cursor mid-sentence.
      setBroadcast(detail)
      if (version === saveVersionRef.current) setSaveStatus("saved")
    } catch (error) {
      if (version === saveVersionRef.current) {
        setSaveStatus("idle")
        showErrorToast(getBroadcastErrorMessage(error))
      }
    }
  }, [savePayload, serialize])

  const scheduleSave = React.useCallback(() => {
    dismissErrorToast()
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null
      void saveNow()
    }, SAVE_DEBOUNCE_MS)
  }, [saveNow])

  const changeFields = React.useCallback(
    (updater: (current: EditableFields) => EditableFields) => {
      // Worked out eagerly from the ref rather than inside a functional
      // setState: the ref has to move synchronously, because the save snapshot
      // reads it, and a setState updater must stay pure — React may run it
      // twice.
      const next = updater(latestRef.current)
      latestRef.current = next
      setFields(next)
      scheduleSave()
    },
    [scheduleSave]
  )

  // Flush a pending edit if the editor goes away mid-debounce, so navigating
  // off cannot drop the last thing that was typed.
  React.useEffect(() => {
    return () => {
      if (!saveTimerRef.current) return
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
      const snapshot = latestRef.current
      if (serialize(snapshot) === lastSavedRef.current) return
      void updateBroadcast(savePayload(snapshot)).catch(() => undefined)
    }
  }, [savePayload, serialize])

  React.useEffect(() => {
    if (saveStatus !== "saved") return
    const timer = setTimeout(() => setSaveStatus("idle"), 2000)
    return () => clearTimeout(timer)
  }, [saveStatus])

  // This editor has no bar of its own, so its saving shows in the sticky header
  // alongside every other auto-save. Clearing on the way out matters, or
  // "Saved" would still be sitting there on the next page.
  React.useEffect(() => {
    reportSaveStatus(saveStatus)
  }, [reportSaveStatus, saveStatus])
  React.useEffect(() => {
    return () => reportSaveStatus(null)
  }, [reportSaveStatus])

  // While a send is running or waiting for its time, keep the bottom panel
  // honest. The form is only reset once the status leaves the editable set —
  // otherwise this would clobber unsaved edits every five seconds.
  React.useEffect(() => {
    if (broadcast.status !== "sending" && broadcast.status !== "scheduled") {
      return
    }
    const timer = setInterval(() => {
      getBroadcast(broadcast.id)
        .then((detail) => {
          setBroadcast(detail)
          if (!EDITABLE_STATUSES.has(detail.status)) {
            const next = fieldsFromDetail(detail)
            latestRef.current = next
            lastSavedRef.current = serialize(next)
            setFields(next)
          }
        })
        .catch(() => {
          // A blip; the next poll tries again.
        })
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [broadcast.id, broadcast.status, serialize])

  const adoptDetail = React.useCallback(
    (detail: BroadcastDetail) => {
      const next = fieldsFromDetail(detail)
      latestRef.current = next
      lastSavedRef.current = serialize(next)
      setBroadcast(detail)
      setFields(next)
    },
    [serialize]
  )

  // The previewed block wins while it is up: picking one from the left panel
  // clears the canvas selection, and picking a block on the canvas clears this.
  const selectedBlock =
    previewBlock ??
    (fields.blocks.find((block) => block.id === selectedBlockId) ?? null)

  /** Puts the canvas selection somewhere, and drops any preview on the way. */
  const selectBlock = React.useCallback((blockId: string | null) => {
    setPreviewBlock(null)
    setSelectedBlockId(blockId)
  }, [])

  /** Opens a kind's own setup in the options panel without touching the email. */
  const previewBlockKind = (kind: BroadcastBlockKind) => {
    setPreviewBlock(createBroadcastBlock(kind, blockDefaults))
    setSelectedBlockId(null)
    inspectorPanelRef.current?.expand()
  }

  /**
   * Saves how this kind of block starts out, 700ms after the last keystroke —
   * the same rhythm the email itself saves on, so the two never feel different.
   * A failure says so and leaves the panel's values alone; the next edit tries
   * again.
   */
  const defaultTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null
  )
  const saveDefault = React.useCallback((block: BroadcastBlock) => {
    if (defaultTimerRef.current) clearTimeout(defaultTimerRef.current)
    defaultTimerRef.current = setTimeout(() => {
      defaultTimerRef.current = null
      saveBroadcastBlockDefault(block)
        .then((saved) => setBlockDefaults(saved.defaults))
        .catch((error) => showErrorToast(getBroadcastErrorMessage(error)))
    }, SAVE_DEBOUNCE_MS)
  }, [])

  React.useEffect(() => {
    return () => {
      if (defaultTimerRef.current) clearTimeout(defaultTimerRef.current)
    }
  }, [])

  /** Puts a new block at a given spot; the palette adds to the end. */
  const insertBlock = (kind: BroadcastBlockKind, index: number) => {
    const block = createBroadcastBlock(kind, blockDefaults)
    changeFields((current) => ({
      ...current,
      blocks: [
        ...current.blocks.slice(0, index),
        block,
        ...current.blocks.slice(index),
      ],
    }))
    selectBlock(block.id)
  }

  const addBlock = (kind: BroadcastBlockKind) =>
    insertBlock(kind, fields.blocks.length)

  const applyTemplate = (blocks: BroadcastBlock[]) => {
    changeFields((current) => ({ ...current, blocks }))
    selectBlock(null)
  }

  const updateBlockContent = (field: string, value: unknown) => {
    if (!selectedBlock) return

    // Editing the previewed block is editing the default for its kind, so it
    // goes to the workspace settings and nowhere near this email's blocks.
    if (previewBlock) {
      const next = {
        ...previewBlock,
        content: { ...previewBlock.content, [field]: value },
      } as BroadcastBlock
      setPreviewBlock(next)
      saveDefault(next)
      return
    }

    changeFields((current) => ({
      ...current,
      blocks: current.blocks.map((block) =>
        block.id === selectedBlock.id
          ? ({
              ...block,
              content: { ...block.content, [field]: value },
            } as BroadcastBlock)
          : block
      ),
    }))
  }

  const removeBlock = (blockId: string) => {
    // A previewed block is in no email, so there is nothing to remove — backing
    // out of it only closes the preview.
    if (blockId === previewBlock?.id) {
      setPreviewBlock(null)
      return
    }
    changeFields((current) => ({
      ...current,
      blocks: current.blocks.filter((block) => block.id !== blockId),
    }))
    setSelectedBlockId((current) => (current === blockId ? null : current))
  }

  /** Drops the copy straight under the one it came from, not at the bottom. */
  const duplicateBlock = (blockId: string) => {
    const index = fields.blocks.findIndex((block) => block.id === blockId)
    if (index === -1) return
    const copy = {
      ...fields.blocks[index],
      id: `${fields.blocks[index].kind}-${crypto.randomUUID()}`,
    }
    changeFields((current) => ({
      ...current,
      blocks: [
        ...current.blocks.slice(0, index + 1),
        copy,
        ...current.blocks.slice(index + 1),
      ],
    }))
    selectBlock(copy.id)
  }

  const canvas = (
    <BroadcastCanvas
      blocks={fields.blocks}
      subject={fields.subject}
      preheader={fields.preheader}
      width={previewWidth}
      selectedBlockId={previewBlock ? null : selectedBlockId}
      disabled={!editable}
      onSelect={selectBlock}
      onOpenSettings={() => selectBlock(null)}
      onReorder={(blocks) => changeFields((current) => ({ ...current, blocks }))}
      onInsert={insertBlock}
      onDuplicate={duplicateBlock}
      onDelete={removeBlock}
    />
  )

  /**
   * The email panel's own header: how it is being viewed on the left, what can
   * be done with it on the right. It belongs to this panel rather than to a bar
   * across the whole editor, because every control on it acts on the email in
   * the panel underneath — and it lines up with the 44px headers the blocks and
   * options panels already have.
   */
  const canvasHeader = (
    // Three columns with equal give either side, so the name sits in the middle
    // of the panel rather than in the middle of whatever is left over — the two
    // sides are different widths and always will be.
    <div className="grid h-11 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-foreground/10 px-3">
      <div className="flex items-center gap-2">
        <WidthToggle value={previewWidth} onChange={setPreviewWidth} />
        <span className="text-xs whitespace-nowrap text-muted-foreground">
          {PREVIEW_WIDTHS[previewWidth]} px wide
        </span>
      </div>
      <span
        className="truncate text-sm font-semibold"
        title={broadcast.name}
      >
        {broadcast.name}
      </span>
      <div className="flex items-center justify-end">
        {broadcast.status === "draft" || broadcast.status === "scheduled" ? (
          <Button
            type="button"
            size="sm"
            className="h-8"
            onClick={() => {
              void saveNow().then(() => setSendOpen(true))
            }}
          >
            <SendIcon className="size-3.5" />
            Review and send
          </Button>
        ) : null}
      </div>
    </div>
  )

  const inspector = (
    <BlockInspector
      // Remounting on the selected block keeps each block's fields honest —
      // the number boxes hold a draft, and carrying one block's draft over to
      // the next would show the wrong number.
      key={selectedBlock?.id ?? "email-settings"}
      block={selectedBlock}
      editingDefault={previewBlock !== null}
      fields={fields}
      disabled={!editable}
      onContentChange={updateBlockContent}
      onFieldChange={(field, value) =>
        changeFields((current) => ({ ...current, [field]: value }))
      }
      onDelete={() => selectedBlock && removeBlock(selectedBlock.id)}
    />
  )

  const workspace = desktop ? (
    <ResizablePanelGroup
      key={horizontalLayout.layoutKey}
      orientation="horizontal"
      className="min-h-0 flex-1"
      defaultLayout={horizontalLayout.defaultLayout}
      onLayoutChanged={horizontalLayout.onLayoutChanged}
    >
      <ResizablePanel
        id="palette"
        panelRef={palettePanelRef}
        collapsible
        collapsedSize="0%"
        defaultSize="18%"
        minSize="14%"
        maxSize="26%"
        onResize={(size) => setPaletteCollapsed(size.asPercentage < 0.5)}
      >
        <WorkspacePanel collapsed={paletteCollapsed}>
          <BlockPalette
            disabled={!editable}
            hasBlocks={fields.blocks.length > 0}
            templatesVersion={templatesVersion}
            selectedKind={previewBlock?.kind ?? null}
            onSelect={previewBlockKind}
            onAdd={addBlock}
            onApplyTemplate={applyTemplate}
            onSaveAsTemplate={() => setSaveTemplateOpen(true)}
          />
        </WorkspacePanel>
      </ResizablePanel>
      <ResizableHandle gap collapsed={paletteCollapsed} />
      <ResizablePanel id="canvas" defaultSize="58%" minSize="30%">
        <WorkspacePanel className="relative flex flex-col">
          {canvasHeader}
          {canvas}
          {paletteCollapsed ? (
            <PanelReopenTab
              side="left"
              label="Show the blocks"
              onClick={togglePalette}
            />
          ) : null}
          {inspectorCollapsed ? (
            <PanelReopenTab
              side="right"
              label="Show the options"
              onClick={toggleInspector}
            />
          ) : null}
        </WorkspacePanel>
      </ResizablePanel>
      <ResizableHandle gap collapsed={inspectorCollapsed} />
      <ResizablePanel
        id="inspector"
        panelRef={inspectorPanelRef}
        collapsible
        collapsedSize="0%"
        defaultSize="24%"
        minSize="18%"
        maxSize="34%"
        onResize={(size) => setInspectorCollapsed(size.asPercentage < 0.5)}
      >
        <WorkspacePanel collapsed={inspectorCollapsed}>
          {inspector}
        </WorkspacePanel>
      </ResizablePanel>
    </ResizablePanelGroup>
  ) : (
    // flex-1 and min-w-0 are load-bearing: this sits in a flex row, and with no
    // width to fill it would shrink to its content and read as a stray line.
    <WorkspacePanel className="flex min-w-0 flex-1 flex-col">
      {canvasHeader}
      {canvas}
    </WorkspacePanel>
  )

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      style={{ gap: "var(--shell-gutter, 0.75rem)" }}
    >
      {/* No bar of its own. The three panels and the sending bar are the whole
          screen — the way back out is the sidebar, and the name of this one is
          already in the strip along the top of the page. */}
      <div className="flex min-h-0 flex-1 flex-col">
        <ResizablePanelGroup
          key={verticalLayout.layoutKey}
          orientation="vertical"
          className="min-h-0 flex-1"
          defaultLayout={verticalLayout.defaultLayout}
          onLayoutChanged={verticalLayout.onLayoutChanged}
        >
          <ResizablePanel id="workspace" defaultSize="74%" minSize="40%">
            <div className="flex h-full min-h-0">{workspace}</div>
          </ResizablePanel>
          {/* Keeps its gap even while the panel below is shut — that collapsed
              strip is still a panel on screen, and this handle is what drags it
              back open. Never pass `collapsed` here. */}
          <ResizableHandle gap />
          <ResizablePanel
            id="status"
            defaultSize="26%"
            minSize="12%"
            maxSize="60%"
            collapsible
            collapsedSize={BOTTOM_COLLAPSED_HEIGHT}
          >
            <WorkspacePanel>
              <BroadcastStatusPanel
                broadcast={broadcast}
                onUpdated={adoptDetail}
              />
            </WorkspacePanel>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      <SendBroadcastDialog
        open={sendOpen}
        onOpenChange={setSendOpen}
        broadcast={broadcast}
        onUpdated={adoptDetail}
      />
      <SaveTemplateDialog
        open={saveTemplateOpen}
        onOpenChange={setSaveTemplateOpen}
        blocks={fields.blocks}
        onSaved={() => setTemplatesVersion((current) => current + 1)}
      />
    </div>
  )
}
