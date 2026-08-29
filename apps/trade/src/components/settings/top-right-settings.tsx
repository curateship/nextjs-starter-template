import * as React from "react"
import {
  DndContext,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable"
import { GripVertical, PlusIcon, RotateCcwIcon, Trash2Icon } from "lucide-react"

import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import {
  createShellId,
  DRAG_HANDLE_CLASS,
  useCheckedAddress,
  useNavSensors,
  useSortableRow,
} from "@/components/settings/nav-editor-shared"
import { NavLinkDestinationCard } from "@/components/settings/nav-link-destination-card"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import type { AppHeaderAction } from "@/lib/app-options"
import {
  isShellEntryNamed,
  isShellTopRightLink,
  renderShellIcon,
  topRightBuiltInMeta,
  type ShellTopRightBuiltIn,
  type ShellTopRightAppAction,
  type ShellTopRightLink,
  type ShellTopRightNavigationItem,
} from "@/lib/custom-shell"

type TopRightSettingsProps = {
  /** The row being edited — the admin's own, or the one members get. */
  items: ShellTopRightNavigationItem[]
  onItemsChange: (items: ShellTopRightNavigationItem[]) => void
  onSaveConfig: () => Promise<boolean>
  /** The app-owned item this menu may contain, including its editor details. */
  appAction?: AppHeaderAction | null
  /** The card the chips sit in. Reset stays outside it. */
  card: { storageId: string; title: string; description: string }
  /** What the Reset button does, and what it warns it will do. */
  reset: { label: string; description: string; onReset: () => void }
}

/**
 * The chip shell every row item wears, built-in and link alike — the same tile
 * the directory app's Navigation Links editor draws, so the two editors read
 * as the same control.
 */
const CHIP_CLASS =
  "w-fit max-w-full rounded-lg border bg-background p-2 transition-colors hover:border-muted-foreground/50"

function SortableFixedChip({
  item,
  meta,
  onVisibleChange,
}: {
  item: ShellTopRightBuiltIn | ShellTopRightAppAction
  meta: { label: string; icon: AppHeaderAction["icon"] }
  onVisibleChange: (visible: boolean) => void
}) {
  const Icon = meta.icon
  const { attributes, listeners, setNodeRef, style } = useSortableRow(
    item.id,
    true
  )

  return (
    <div ref={setNodeRef} style={style} className={CHIP_CLASS}>
      <div className="flex max-w-full items-center gap-1">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className={DRAG_HANDLE_CLASS}
          aria-label={`Reorder ${meta.label}`}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <span className="flex h-8 max-w-56 items-center gap-2 px-3 text-sm font-medium">
          <Icon className="h-4 w-4 shrink-0" />
          <span className="truncate">{meta.label}</span>
          {/* A switched-off built-in stays right here wearing this pill — that
              is how it comes back. Deleting is a links-only thing. */}
          {!item.visible ? (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              Hidden
            </span>
          ) : null}
        </span>
        <label
          className="flex size-8 shrink-0 items-center justify-center rounded-md"
          title={item.visible ? "Visible" : "Hidden"}
        >
          <Checkbox
            checked={item.visible}
            onCheckedChange={(checked) => onVisibleChange(checked === true)}
          />
          <span className="sr-only">Show {meta.label}</span>
        </label>
      </div>
    </div>
  )
}

function SortableLinkChip({
  item,
  dialogOpen,
  onDialogOpenChange,
  onChange,
  onDelete,
  onSaveConfig,
}: {
  item: ShellTopRightLink
  dialogOpen: boolean
  onDialogOpenChange: (open: boolean) => void
  onChange: (patch: Partial<ShellTopRightLink>) => void
  onDelete: () => void
  onSaveConfig: () => Promise<boolean>
}) {
  const labelInputRef = React.useRef<HTMLInputElement>(null)
  const isNamed = isShellEntryNamed(item)
  const itemName = isNamed ? item.label : "menu link"
  const addressCheck = useCheckedAddress(item.href, isNamed)
  const { attributes, listeners, setNodeRef, style } = useSortableRow(
    item.id,
    true
  )

  return (
    <div ref={setNodeRef} style={style} className={CHIP_CLASS}>
      <div className="flex max-w-full items-center gap-1">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className={DRAG_HANDLE_CLASS}
          aria-label={`Reorder ${itemName}`}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => onDialogOpenChange(true)}
          className="max-w-56 justify-start gap-2 px-3 text-sm font-medium"
          aria-label={`Edit settings for ${itemName}`}
          title={isNamed ? `${item.label} settings` : "Menu link settings"}
        >
          <span className="shrink-0">{renderShellIcon(item.icon, "h-4 w-4")}</span>
          {/* An unnamed link reads as a placeholder, the same muted grey an
              empty input uses — never as normal text. */}
          <span
            className={cn(
              "truncate",
              !isNamed && "font-normal text-muted-foreground"
            )}
          >
            {isNamed ? item.label : "Name this link"}
          </span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0"
          onClick={onDelete}
          aria-label={`Delete ${itemName}`}
        >
          <Trash2Icon className="h-4 w-4" />
        </Button>
      </div>

      <Dialog open={dialogOpen} onOpenChange={onDialogOpenChange}>
        <DialogContent
          variant="admin"
          className="sm:max-w-lg"
          // Opening a link that has no name yet drops the cursor straight in
          // the Label box so you can type. A named link keeps the dialog's
          // normal focus, since landing in a filled field invites a stray edit.
          onOpenAutoFocus={(event) => {
            if (isNamed) return
            event.preventDefault()
            labelInputRef.current?.focus()
          }}
        >
          <DialogHeader>
            <DialogTitle>{isNamed ? item.label : "Menu link"}</DialogTitle>
            <DialogDescription>
              Edit this top-right menu link.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <NavLinkDestinationCard
              linkNoun="Menu link"
              icon={item.icon}
              label={item.label}
              href={item.href}
              onChange={onChange}
              labelInputRef={labelInputRef}
              addressCheck={addressCheck}
            />
          </DialogBody>
          {/* Edits here save themselves as you type, so there is nothing for a
              Cancel to undo — this window ends with a single Done, and the
              button that throws the link away sits hard left where it cannot
              be mistaken for it. */}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="mr-auto"
              onClick={() => {
                onDialogOpenChange(false)
                onDelete()
              }}
            >
              Delete link
            </Button>
            <Button
              type="button"
              onClick={async () => {
                // Flush any pending debounce, then close.
                await onSaveConfig()
                onDialogOpenChange(false)
              }}
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/**
 * One editor for both header rows — the admin's own and the members' — the same
 * way SidebarSettings serves both sidebars. The thing being edited is a
 * horizontal row of buttons, so the editor is a horizontal row of chips: drag
 * to reorder, a checkbox to switch a built-in off (it stays, wearing a "Hidden"
 * pill), a square + tile to add a link, and a trash can to delete one.
 */
export function TopRightSettings({
  items,
  onItemsChange,
  onSaveConfig,
  appAction,
  card,
  reset,
}: TopRightSettingsProps) {
  // Which link's editor is open. Held here rather than in the chips so the +
  // tile can open the editor of the link it has just made, ready to type in.
  const [openItemId, setOpenItemId] = React.useState<string | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = React.useState<string | null>(
    null
  )
  const [resetOpen, setResetOpen] = React.useState(false)
  const sensors = useNavSensors()

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = items.findIndex((item) => item.id === active.id)
    const newIndex = items.findIndex((item) => item.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    onItemsChange(arrayMove(items, oldIndex, newIndex))
  }

  const handleAddLink = () => {
    // Blank like a new sidebar link: it stays out of the header until it has a
    // name and an address, so nothing half-made ever ships to the row.
    const link: ShellTopRightLink = {
      type: "link",
      id: createShellId("top-right-link"),
      label: "",
      href: "",
      icon: "appWindow",
    }

    // The editor opens on the same click that makes the link.
    setOpenItemId(link.id)
    onItemsChange([...items, link])
  }

  const handleLinkChange = (
    linkId: string,
    patch: Partial<ShellTopRightLink>
  ) => {
    onItemsChange(
      items.map((item) =>
        isShellTopRightLink(item) && item.id === linkId
          ? { ...item, ...patch }
          : item
      )
    )
  }

  const handleVisibleChange = (builtInId: string, visible: boolean) => {
    onItemsChange(
      items.map((item) =>
        item.type !== "link" && item.id === builtInId
          ? { ...item, visible }
          : item
      )
    )
  }

  // Looked up live when the dialog renders, so it can never name a link that
  // has already been deleted.
  const pendingDeleteLink =
    items.find(
      (item): item is ShellTopRightLink =>
        isShellTopRightLink(item) && item.id === pendingDeleteId
    ) ?? null

  return (
    <>
      <CollapsibleSettingsCard
        storageId={card.storageId}
        title={card.title}
        description={card.description}
      >
        {/* A stable id keeps the server and browser renders in step, so the
            chips do not jump on the first paint the way an id mismatch makes
            dnd-kit re-mount them. */}
        <DndContext
          id={`custom-shell-top-right-${card.storageId}`}
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          {/* The horizontal strategy translates the neighbours out of the way
              without the scale transform the grid strategy applies — scaling
              is what squashed the chips mid-drag. */}
          <SortableContext
            items={items.map((item) => item.id)}
            strategy={horizontalListSortingStrategy}
          >
            <div className="flex flex-wrap items-center gap-2">
              {items.map((item) =>
                isShellTopRightLink(item) ? (
                  <SortableLinkChip
                    key={item.id}
                    item={item}
                    dialogOpen={openItemId === item.id}
                    onDialogOpenChange={(open) =>
                      setOpenItemId(open ? item.id : null)
                    }
                    onChange={(patch) => handleLinkChange(item.id, patch)}
                    onDelete={() => setPendingDeleteId(item.id)}
                    onSaveConfig={onSaveConfig}
                  />
                ) : item.type === "app" ? (
                  appAction && item.id === appAction.id ? (
                    <SortableFixedChip
                      key={item.id}
                      item={item}
                      meta={appAction}
                      onVisibleChange={(visible) =>
                        handleVisibleChange(item.id, visible)
                      }
                    />
                  ) : null
                ) : (
                  <SortableFixedChip
                    key={item.id}
                    item={item}
                    meta={topRightBuiltInMeta[item.id]}
                    onVisibleChange={(visible) =>
                      handleVisibleChange(item.id, visible)
                    }
                  />
                )
              )}
              {/* A square tile rather than a labelled button: it sits in the
                  row it adds to, drawn like an empty slot at chip height. */}
              <button
                type="button"
                onClick={handleAddLink}
                className="flex size-13 shrink-0 items-center justify-center rounded-lg border bg-background transition-colors hover:border-muted-foreground/50 hover:bg-accent"
                aria-label="Add link"
                title="Add link"
              >
                <PlusIcon className="h-4 w-4" />
              </button>
            </div>
          </SortableContext>
        </DndContext>
      </CollapsibleSettingsCard>

      {/* Outside the card on purpose, like the sidebar tab's actions: it acts
          on the whole row, not on anything inside the card. */}
      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
        <Button
          type="button"
          variant="destructive"
          onClick={() => setResetOpen(true)}
        >
          <RotateCcwIcon className="h-4 w-4" />
          {reset.label}
        </Button>
      </div>

      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Reset this menu?"
        description={reset.description}
        confirmLabel={reset.label}
        onConfirm={() => {
          setResetOpen(false)
          reset.onReset()
        }}
      />

      <ConfirmDialog
        open={Boolean(pendingDeleteLink)}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteId(null)
        }}
        title="Delete this link?"
        description={describeLinkDelete(pendingDeleteLink)}
        confirmLabel="Delete link"
        onConfirm={() => {
          if (!pendingDeleteLink) return
          setPendingDeleteId(null)
          onItemsChange(items.filter((item) => item.id !== pendingDeleteLink.id))
        }}
      />
    </>
  )
}

function describeLinkDelete(link: ShellTopRightLink | null) {
  // A link you never named has nothing to quote, so it is described rather
  // than shown as an empty pair of quotes.
  const name =
    link && isShellEntryNamed(link)
      ? `"${link.label.trim()}"`
      : "This unnamed link"

  return `${name} will be removed from the top right menu. This cannot be undone.`
}
