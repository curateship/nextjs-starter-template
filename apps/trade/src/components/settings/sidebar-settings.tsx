import * as React from "react"
import {
  DndContext,
  closestCenter,
  pointerWithin,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  useDroppable,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  ChevronDownIcon,
  EyeIcon,
  EyeOffIcon,
  GripVertical,
  PlusIcon,
  RotateCcwIcon,
  Trash2Icon,
} from "lucide-react"

import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import {
  createShellId,
  DRAG_HANDLE_CLASS,
  reorderByDrag,
  useCheckedAddress,
  useNavSensors,
  useSortableRow,
} from "@/components/settings/nav-editor-shared"
import { NavLinkDestinationCard } from "@/components/settings/nav-link-destination-card"
import { EmptyRow } from "@/components/shared/feed-card"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Switch } from "@/components/ui/switch"
import { ShellIconPicker } from "@/components/settings/shell-icon-picker"
import {
  EditPopover,
  EditPopoverBody,
  EditPopoverFooter,
  EditPopoverHeader,
} from "@/components/ui/edit-popover"
import { Input } from "@/components/ui/input"
import {
  collapseStorageKey,
  useRememberedCollapse,
} from "@/lib/remembered-choice"
import { cn } from "@/lib/utils"
import {
  UNTITLED_SECTION_LABEL,
  isShellEntryNamed,
  isShellItem,
  renderShellIcon,
  type ShellChildItem,
  type ShellEntry,
  type ShellItem,
  type ShellSection,
} from "@/lib/custom-shell"
import { plural } from "@/lib/format/plural"

const sectionDropPrefix = "section-drop:"

function getSectionDropId(sectionId: string) {
  return `${sectionDropPrefix}${sectionId}`
}

function getSectionIdFromDropId(id: string) {
  return id.startsWith(sectionDropPrefix)
    ? id.slice(sectionDropPrefix.length)
    : null
}

/**
 * What the delete confirmation is about. Only the ids are held — the link and
 * child are looked up in the live sections when the dialog renders, so it can
 * never name something that has already moved or gone.
 */
type PendingDelete =
  | { kind: "link"; itemId: string }
  | { kind: "child"; itemId: string; childId: string }

type SidebarSettingsProps = {
  /** The list being edited — the admin's own, or the one members get. */
  sections: ShellSection[]
  topLeftNavigation?: React.ReactNode
  onSectionsChange: (sections: ShellSection[]) => void
  onSaveConfig: () => Promise<boolean>
  /** The card containing the sections and their actions. */
  card: { storageId: string; title: string; description: string }
  /** What the Reset button does, and what it warns it will do. */
  reset: { label: string; description: string; onReset: () => void }
}

type SortableItemProps = {
  sectionId: string
  item: ShellItem
  /** Which link's editor is open, and the new child link — see the parent. */
  openItemId: string | null
  onOpenItemChange: (itemId: string | null) => void
  newChildId: string | null
  onItemChange: (
    sectionId: string,
    itemId: string,
    patch: Partial<ShellItem>
  ) => void
  onItemDelete: (sectionId: string, itemId: string) => void
  onChildAdd: (sectionId: string, itemId: string) => void
  onChildChange: (
    sectionId: string,
    itemId: string,
    childId: string,
    patch: Partial<ShellChildItem>
  ) => void
  onChildDelete: (sectionId: string, itemId: string, childId: string) => void
  onChildDragEnd: (
    sectionId: string,
    itemId: string,
    event: DragEndEvent
  ) => void
  onSaveConfig: () => Promise<boolean>
}

type SortableChildProps = {
  child: ShellChildItem
  /** Where the row sits, which is what names a child that has no name yet. */
  position: number
  /** True for the child link "Add child" just made, which takes the cursor. */
  isNew: boolean
  onChange: (childId: string, patch: Partial<ShellChildItem>) => void
  onDelete: (childId: string) => void
}

type SortableSectionProps = {
  section: ShellSection
  isDraggingItem: boolean
  /** True for the section "Add section" just made, which takes the cursor. */
  isNew: boolean
  /** Which link's editor is open, and the new child link — see the parent. */
  openItemId: string | null
  onOpenItemChange: (itemId: string | null) => void
  newChildId: string | null
  onSectionTitleChange: (sectionId: string, title: string) => void
  onSectionDelete: (sectionId: string) => void
  onItemAdd: (sectionId: string) => void
  onItemChange: (
    sectionId: string,
    itemId: string,
    patch: Partial<ShellItem>
  ) => void
  onItemDelete: (sectionId: string, itemId: string) => void
  onChildAdd: (sectionId: string, itemId: string) => void
  onChildChange: (
    sectionId: string,
    itemId: string,
    childId: string,
    patch: Partial<ShellChildItem>
  ) => void
  onChildDelete: (sectionId: string, itemId: string, childId: string) => void
  onChildDragEnd: (
    sectionId: string,
    itemId: string,
    event: DragEndEvent
  ) => void
  onSaveConfig: () => Promise<boolean>
}

function updateSection(
  sections: ShellSection[],
  sectionId: string,
  update: (section: ShellSection) => ShellSection
) {
  return sections.map((section) =>
    section.id === sectionId ? update(section) : section
  )
}

function DividerPreview({ entry }: { entry: ShellEntry }) {
  if (isShellItem(entry)) {
    return null
  }

  return (
    <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      {entry.label || "Divider"}
    </div>
  )
}

function SortableChild({
  child,
  position,
  isNew,
  onChange,
  onDelete,
}: SortableChildProps) {
  const isNamed = isShellEntryNamed(child)
  // Six children with no names would otherwise be six rows called "child link",
  // and a screen reader could not tell which one it was in. Where the row sits
  // is the only thing that tells them apart until one is typed.
  const childName = isNamed ? child.label : `child link ${position}`
  const visible = child.visible !== false
  const addressCheck = useCheckedAddress(child.href, isNamed)
  const { attributes, listeners, setNodeRef, style } = useSortableRow(child.id)

  return (
    <div
      ref={setNodeRef}
      style={style}
      // Background and line from Styling → Cards inside modals (theme.css).
      data-slot="card-row"
      className="grid items-center gap-2 rounded-md p-2 sm:grid-cols-[auto_auto_minmax(0,1fr)_minmax(0,1fr)_auto_auto]"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className={DRAG_HANDLE_CLASS}
        aria-label={`Reorder ${childName}`}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <ShellIconPicker
        value={child.icon}
        allowEmpty
        compact
        ghost
        onValueChange={(icon) => onChange(child.id, { icon })}
      />
      {/* A child row has no editor of its own, so "ready to type" is the cursor
          landing here the moment "Add child" makes the row — which also scrolls
          it into view at the bottom of a long list. Mount-only, so an existing
          child never takes focus when the link's editor is reopened. */}
      <Input
        autoFocus={isNew}
        value={child.label}
        onChange={(event) => onChange(child.id, { label: event.target.value })}
        placeholder="Child label"
        aria-label={`${childName} label`}
        className="border-transparent bg-transparent shadow-none hover:bg-muted/40 focus-visible:bg-background"
      />
      <Input
        value={child.href}
        onChange={(event) => onChange(child.id, { href: event.target.value })}
        placeholder="/admin/example"
        aria-label={`${childName} URL`}
        className="border-transparent bg-transparent shadow-none hover:bg-muted/40 focus-visible:bg-background"
        {...addressCheck}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => onChange(child.id, { visible: !visible })}
        aria-label={`${visible ? "Hide" : "Show"} ${childName}`}
        title={visible ? "Visible" : "Hidden"}
      >
        {visible ? (
          <EyeIcon className="h-4 w-4" />
        ) : (
          <EyeOffIcon className="h-4 w-4" />
        )}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => onDelete(child.id)}
        aria-label={`Delete ${childName}`}
      >
        <Trash2Icon className="h-4 w-4" />
      </Button>
    </div>
  )
}

function SortableSidebarItem({
  sectionId,
  item,
  openItemId,
  onOpenItemChange,
  newChildId,
  onItemChange,
  onItemDelete,
  onChildAdd,
  onChildChange,
  onChildDelete,
  onChildDragEnd,
  onSaveConfig,
}: SortableItemProps) {
  const labelInputRef = React.useRef<HTMLInputElement>(null)
  const nameRef = React.useRef<HTMLButtonElement>(null)
  // Whether this row's editor is open is the parent's business, not the row's:
  // it is the only way "Add link" can open the editor of the link it has just
  // made. It also means a row remounting mid-drag cannot lose or reopen it.
  const dialogOpen = openItemId === item.id
  // One source of truth for "has this link been named yet" — it drives the row
  // text, the accessible names, the dialog title and where focus lands.
  const isNamed = isShellEntryNamed(item)
  const itemName = isNamed ? item.label : "sidebar link"
  const addressCheck = useCheckedAddress(item.href, isNamed)
  const { attributes, listeners, setNodeRef, style } = useSortableRow(item.id)
  const sensors = useNavSensors()

  const children = item.children ?? []

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group bg-background transition-colors hover:bg-muted/30"
    >
      <div className="flex items-center gap-1 py-1.5 pr-2 pl-1.5">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className={cn(DRAG_HANDLE_CLASS, "size-7 shrink-0 text-muted-foreground/60")}
          aria-label={`Reorder ${itemName}`}
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <button
          ref={nameRef}
          type="button"
          className="flex min-w-0 flex-1 items-center gap-3 rounded-md px-2 py-1.5 text-left"
          onClick={() => onOpenItemChange(item.id)}
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
            {renderShellIcon(item.icon, "h-4 w-4")}
          </span>
          <span className="min-w-0 flex-1">
            {/* An unnamed link reads as a placeholder, the same muted grey an
                empty input uses — never as normal text, which would look like
                the link had been named "Untitled link" for you. */}
            <span
              className={cn(
                "block truncate text-sm",
                isNamed ? "font-medium" : "font-normal text-muted-foreground"
              )}
            >
              {isNamed ? item.label : "Name this link"}
            </span>
          </span>
          {children.length ? (
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
              {children.length} {plural(children.length, "child", "children")}
              <ChevronDownIcon aria-hidden className="size-3" />
            </span>
          ) : null}
          {!item.visible ? (
            <span className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
              Hidden
            </span>
          ) : null}
        </button>

        {/* A switch rather than a tick box: it shows or hides the link. */}
        <Switch
          className="mx-2 shrink-0"
          checked={item.visible}
          onCheckedChange={(checked) =>
            onItemChange(sectionId, item.id, { visible: checked })
          }
          aria-label={`Show ${itemName}`}
        />

        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground hover:text-destructive"
          onClick={() => onItemDelete(sectionId, item.id)}
          aria-label={`Delete ${itemName}`}
        >
          <Trash2Icon className="h-4 w-4" />
        </Button>
      </div>

      <EditPopover
        open={dialogOpen}
        onOpenChange={(open) => {
          // Edits save as they are typed; closing flushes the last of them.
          if (!open) void onSaveConfig()
          onOpenItemChange(open ? item.id : null)
        }}
        anchorRef={nameRef}
        wide
        aria-label={isNamed ? item.label : "Sidebar link"}
        // Opening a link that has no name yet drops the cursor straight in
        // the Label box so you can type. A named link keeps the normal focus,
        // since landing in a filled field invites a stray edit.
        onOpenAutoFocus={(event) => {
          if (isNamed) return
          event.preventDefault()
          labelInputRef.current?.focus()
        }}
      >
        <EditPopoverHeader
          title={isNamed ? item.label : "Sidebar link"}
          description="Edit this sidebar destination and its child links."
        />
        <EditPopoverBody>
          <NavLinkDestinationCard
            linkNoun="Sidebar link"
            icon={item.icon}
            label={item.label}
            href={item.href}
            onChange={(patch) => onItemChange(sectionId, item.id, patch)}
            labelInputRef={labelInputRef}
            addressCheck={addressCheck}
          />

          <Card size="sm">
            <CardHeader>
              <CardTitle>Child links</CardTitle>
              <CardDescription>
                These become the nested links and sticky header shortcuts.
              </CardDescription>
              <CardAction>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onChildAdd(sectionId, item.id)}
                >
                  <PlusIcon className="h-4 w-4" />
                  Add child
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              {children.length ? (
                <DndContext
                  id={`custom-shell-sidebar-children-${item.id}`}
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={(event) =>
                    onChildDragEnd(sectionId, item.id, event)
                  }
                >
                  <SortableContext
                    items={children.map((child) => child.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-2">
                      {children.map((child, childIndex) => (
                        <SortableChild
                          key={child.id}
                          child={child}
                          position={childIndex + 1}
                          isNew={child.id === newChildId}
                          onChange={(childId, patch) =>
                            onChildChange(sectionId, item.id, childId, patch)
                          }
                          onDelete={(childId) =>
                            onChildDelete(sectionId, item.id, childId)
                          }
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              ) : (
                <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                  No child links.
                </div>
              )}
            </CardContent>
          </Card>
        </EditPopoverBody>
        {/* Edits here save themselves as you type, so there is nothing for a
            Cancel to undo. This popover ends with a single Done. */}
        <EditPopoverFooter>
          <Button
            type="button"
            onClick={async () => {
              // Flush any pending debounce, then close.
              await onSaveConfig()
              onOpenItemChange(null)
            }}
          >
            Done
          </Button>
        </EditPopoverFooter>
      </EditPopover>
    </div>
  )
}

function SortableSectionCard({
  section,
  isDraggingItem,
  isNew,
  openItemId,
  onOpenItemChange,
  newChildId,
  onSectionTitleChange,
  onSectionDelete,
  onItemAdd,
  onItemChange,
  onItemDelete,
  onChildAdd,
  onChildChange,
  onChildDelete,
  onChildDragEnd,
  onSaveConfig,
}: SortableSectionProps) {
  const sectionName = section.title?.trim() || UNTITLED_SECTION_LABEL
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.id })
  const { setNodeRef: setDropNodeRef, isOver } = useDroppable({
    id: getSectionDropId(section.id),
    disabled: !isDraggingItem,
  })
  const sortableItemIds = section.entries
    .filter(isShellItem)
    .map((entry) => entry.id)
  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : 1,
  }

  // Drawn as a bordered box with a grey heading row: the grip, the name in
  // small capitals, Add link and a bin, then one row per link (Tyler, 9 Nov
  // 2026, the Navigations redesign). Its lines are a light grey of their own,
  // as the drawing has them, not the Divider lines setting.
  return (
    <div ref={setNodeRef} style={style} className="overflow-hidden rounded-xl border bg-background border-zinc-200/40 dark:border-zinc-700/40">
      <div className="flex items-center gap-2 border-b bg-muted/40 py-1.5 pr-2 pl-1.5 border-zinc-200/40 dark:border-zinc-700/40">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className={cn(DRAG_HANDLE_CLASS, "size-7 shrink-0 text-muted-foreground/60")}
          aria-label={`Reorder ${sectionName}`}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          {/* "Add section" makes the box and the cursor lands here, which
              also scrolls it into view at the bottom of a long page.
              Mount-only, so an existing section never grabs focus later. */}
          <Input
            autoFocus={isNew}
            value={section.title}
            onChange={(event) =>
              onSectionTitleChange(section.id, event.target.value)
            }
            placeholder={UNTITLED_SECTION_LABEL}
            aria-label="Sidebar section label"
            className="h-8 max-w-xs border-transparent bg-transparent px-2 text-xs font-medium tracking-wider text-muted-foreground uppercase shadow-none placeholder:normal-case hover:bg-background/60 focus-visible:bg-background dark:bg-transparent"
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onItemAdd(section.id)}
        >
          <PlusIcon className="h-4 w-4" />
          Add link
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground hover:text-destructive"
          onClick={() => onSectionDelete(section.id)}
          aria-label={`Delete ${sectionName}`}
        >
          <Trash2Icon className="h-4 w-4" />
        </Button>
      </div>

      <SortableContext
        items={sortableItemIds}
        strategy={verticalListSortingStrategy}
      >
        <div
          ref={setDropNodeRef}
          className={cn(
            "min-h-11 divide-y divide-zinc-200/40 transition-colors dark:divide-zinc-700/40",
            isOver && "bg-primary/5"
          )}
        >
          {section.entries.map((entry) =>
            isShellItem(entry) ? (
              <SortableSidebarItem
                key={entry.id}
                sectionId={section.id}
                item={entry}
                openItemId={openItemId}
                onOpenItemChange={onOpenItemChange}
                newChildId={newChildId}
                onItemChange={onItemChange}
                onItemDelete={onItemDelete}
                onChildAdd={onChildAdd}
                onChildChange={onChildChange}
                onChildDelete={onChildDelete}
                onChildDragEnd={onChildDragEnd}
                onSaveConfig={onSaveConfig}
              />
            ) : (
              <DividerPreview key={entry.id} entry={entry} />
            )
          )}
          {!sortableItemIds.length ? (
            <div className="px-4 py-3 text-center text-sm text-muted-foreground">
              No links in this section yet.
            </div>
          ) : null}
        </div>
      </SortableContext>
    </div>
  )
}

export function SidebarSettings({
  sections,
  topLeftNavigation,
  onSectionsChange,
  onSaveConfig,
  card,
  reset,
}: SidebarSettingsProps) {
  // Keep the remembered collapse state available when adding a section.
  const [cardOpen, setCardOpen, cardNoFlashKey] = useRememberedCollapse(
    collapseStorageKey.settingsCard(card.storageId)
  )
  const [activeDragId, setActiveDragId] = React.useState<string | null>(null)
  // Which link's editor is open, and which child link was just added. Both are
  // held here rather than in the rows because that is the only way "Add" can
  // hand the thing it has just made straight to the user, ready to type in.
  const [openItemId, setOpenItemId] = React.useState<string | null>(null)
  const [newChildId, setNewChildId] = React.useState<string | null>(null)
  const [newSectionId, setNewSectionId] = React.useState<string | null>(null)
  const [resetOpen, setResetOpen] = React.useState(false)
  const [pendingDeleteSectionId, setPendingDeleteSectionId] = React.useState<
    string | null
  >(null)
  const [pendingDelete, setPendingDelete] = React.useState<PendingDelete | null>(
    null
  )
  const sensors = useNavSensors()
  const sectionIds = React.useMemo(
    () => new Set(sections.map((section) => section.id)),
    [sections]
  )
  const emptySectionIds = React.useMemo(
    () =>
      new Set(
        sections
          .filter((section) => !section.entries.some(isShellItem))
          .map((section) => section.id)
      ),
    [sections]
  )
  const itemIds = React.useMemo(
    () =>
      new Set(
        sections.flatMap((section) =>
          section.entries.filter(isShellItem).map((entry) => entry.id)
        )
      ),
    [sections]
  )
  const collisionDetection = React.useCallback<CollisionDetection>(
    (args) => {
      if (sectionIds.has(String(args.active.id))) {
        return closestCenter({
          ...args,
          droppableContainers: args.droppableContainers.filter((container) =>
            sectionIds.has(String(container.id))
          ),
        })
      }

      const pointerCollisions = pointerWithin(args)
      const itemCollisions = pointerCollisions.filter((collision) =>
        itemIds.has(String(collision.id))
      )

      if (itemCollisions.length) return itemCollisions

      const sectionCollisions = pointerCollisions.filter((collision) => {
        const id = String(collision.id)
        const sectionId = getSectionIdFromDropId(id) ?? id
        return emptySectionIds.has(sectionId)
      })

      if (sectionCollisions.length) return sectionCollisions

      const centerCollisions = closestCenter({
        ...args,
        droppableContainers: args.droppableContainers.filter((container) => {
          const id = String(container.id)
          const sectionId = getSectionIdFromDropId(id) ?? id
          return itemIds.has(id) || emptySectionIds.has(sectionId)
        }),
      })
      const centerItemCollisions = centerCollisions.filter((collision) =>
        itemIds.has(String(collision.id))
      )

      return centerItemCollisions.length
        ? centerItemCollisions
        : centerCollisions
    },
    [emptySectionIds, itemIds, sectionIds]
  )

  const handleOpenItemChange = (itemId: string | null) => {
    setOpenItemId(itemId)
    // A new child link only claims the cursor for the editor session that made
    // it, so reopening a link later never pulls focus into an old child row.
    setNewChildId(null)
  }

  const handleAddItem = (sectionId: string) => {
    const item: ShellItem = {
      type: "item",
      id: createShellId("item"),
      label: "",
      href: "",
      icon: "appWindow",
      visible: true,
    }

    // The editor opens on the same click that makes the link, so a blank row
    // never has to be hunted down at the bottom of the section and clicked.
    handleOpenItemChange(item.id)
    onSectionsChange(
      updateSection(sections, sectionId, (section) => ({
        ...section,
        entries: [...section.entries, item],
      }))
    )
  }

  const handleAddSection = () => {
    // Blank, like a new link and a new child link. A starting title is text you
    // have to select and delete before you can type your own, and the
    // placeholder says what an unnamed section is called anyway.
    const section: ShellSection = {
      id: createShellId("section"),
      title: "",
      entries: [],
    }

    setNewSectionId(section.id)
    setCardOpen(true)
    onSectionsChange([...sections, section])
  }

  const handleSectionTitleChange = (sectionId: string, title: string) => {
    onSectionsChange(
      updateSection(sections, sectionId, (section) => ({
        ...section,
        title,
      }))
    )
  }

  const handleSectionDelete = (sectionId: string) => {
    onSectionsChange(sections.filter((section) => section.id !== sectionId))
  }

  const handleItemChange = (
    sectionId: string,
    itemId: string,
    patch: Partial<ShellItem>
  ) => {
    onSectionsChange(
      updateSection(sections, sectionId, (section) => ({
        ...section,
        entries: section.entries.map((entry) =>
          isShellItem(entry) && entry.id === itemId
            ? { ...entry, ...patch }
            : entry
        ),
      }))
    )
  }

  const handleItemDelete = (sectionId: string, itemId: string) => {
    onSectionsChange(
      updateSection(sections, sectionId, (section) => ({
        ...section,
        entries: section.entries.filter((entry) => entry.id !== itemId),
      }))
    )
  }

  const handleSectionDragEnd = (event: DragEndEvent) => {
    const moved = reorderByDrag(
      sections,
      sections.map((section) => section.id),
      event
    )
    if (moved) onSectionsChange(moved)
  }

  const findItemLocation = (itemId: string) => {
    for (const section of sections) {
      const itemIndex = section.entries.findIndex(
        (entry) => isShellItem(entry) && entry.id === itemId
      )

      if (itemIndex !== -1) return { section, itemIndex }
    }

    return null
  }

  const handleItemDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const activeId = String(active.id)
    const overId = String(over.id)
    const activeLocation = findItemLocation(activeId)
    const overLocation = findItemLocation(overId)
    const dropSectionId = getSectionIdFromDropId(overId)
    const overSection =
      overLocation?.section ??
      sections.find(
        (section) => section.id === (dropSectionId ?? overId)
      )

    if (!activeLocation || !overSection) return

    const activeItem = activeLocation.section.entries[activeLocation.itemIndex]
    if (!isShellItem(activeItem)) return

    if (activeLocation.section.id === overSection.id && overLocation) {
      onSectionsChange(
        updateSection(sections, activeLocation.section.id, (section) => ({
          ...section,
          entries: arrayMove(
            section.entries,
            activeLocation.itemIndex,
            overLocation.itemIndex
          ),
        }))
      )
      return
    }

    const nextSections = sections.map((section) => {
      const entries =
        section.id === activeLocation.section.id
          ? section.entries.filter((entry) => entry.id !== activeId)
          : section.entries

      if (section.id !== overSection.id) return { ...section, entries }

      const insertIndex = overLocation
        ? entries.findIndex((entry) => entry.id === overId)
        : entries.length

      return {
        ...section,
        entries: [
          ...entries.slice(0, insertIndex),
          activeItem,
          ...entries.slice(insertIndex),
        ],
      }
    })

    onSectionsChange(nextSections)
  }

  const handleItemDragOver = (event: DragOverEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const activeId = String(active.id)
    const overId = String(over.id)
    const activeLocation = findItemLocation(activeId)
    const overLocation = findItemLocation(overId)
    const dropSectionId = getSectionIdFromDropId(overId)
    const overSection =
      overLocation?.section ??
      sections.find(
        (section) => section.id === (dropSectionId ?? overId)
      )

    if (!overLocation) return

    if (
      !activeLocation ||
      !overSection ||
      activeLocation.section.id === overSection.id
    ) {
      return
    }

    const activeItem = activeLocation.section.entries[activeLocation.itemIndex]
    if (!isShellItem(activeItem)) return

    const nextSections = sections.map((section) => {
      const entries =
        section.id === activeLocation.section.id
          ? section.entries.filter((entry) => entry.id !== activeId)
          : section.entries

      if (section.id !== overSection.id) return { ...section, entries }

      const insertIndex = entries.findIndex((entry) => entry.id === overId)

      return {
        ...section,
        entries: [
          ...entries.slice(0, insertIndex),
          activeItem,
          ...entries.slice(insertIndex),
        ],
      }
    })

    onSectionsChange(nextSections)
  }

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(String(event.active.id))
  }

  const handleDragOver = (event: DragOverEvent) => {
    if (!itemIds.has(String(event.active.id))) return

    handleItemDragOver(event)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragId(null)

    if (sections.some((section) => section.id === event.active.id)) {
      handleSectionDragEnd(event)
      return
    }

    handleItemDragEnd(event)
  }

  const handleDragCancel = () => {
    setActiveDragId(null)
  }

  const handleChildAdd = (sectionId: string, itemId: string) => {
    // Blank like a new top-level link. Pre-filled values would ship a live
    // sidebar entry pointing at a route that doesn't exist.
    const child: ShellChildItem = {
      id: createShellId("child"),
      label: "",
      href: "",
      visible: true,
    }

    setNewChildId(child.id)
    onSectionsChange(
      updateSection(sections, sectionId, (section) => ({
        ...section,
        entries: section.entries.map((entry) =>
          isShellItem(entry) && entry.id === itemId
            ? { ...entry, children: [...(entry.children ?? []), child] }
            : entry
        ),
      }))
    )
  }

  const handleChildChange = (
    sectionId: string,
    itemId: string,
    childId: string,
    patch: Partial<ShellChildItem>
  ) => {
    onSectionsChange(
      updateSection(sections, sectionId, (section) => ({
        ...section,
        entries: section.entries.map((entry) =>
          isShellItem(entry) && entry.id === itemId
            ? {
                ...entry,
                children: (entry.children ?? []).map((child) =>
                  child.id === childId ? { ...child, ...patch } : child
                ),
              }
            : entry
        ),
      }))
    )
  }

  const handleChildDelete = (
    sectionId: string,
    itemId: string,
    childId: string
  ) => {
    onSectionsChange(
      updateSection(sections, sectionId, (section) => ({
        ...section,
        entries: section.entries.map((entry) =>
          isShellItem(entry) && entry.id === itemId
            ? {
                ...entry,
                children: (entry.children ?? []).filter(
                  (child) => child.id !== childId
                ),
              }
            : entry
        ),
      }))
    )
  }

  const handleChildDragEnd = (
    sectionId: string,
    itemId: string,
    event: DragEndEvent
  ) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    onSectionsChange(
      updateSection(sections, sectionId, (section) => ({
        ...section,
        entries: section.entries.map((entry) => {
          if (!isShellItem(entry) || entry.id !== itemId) return entry

          const children = entry.children ?? []
          const moved = reorderByDrag(
            children,
            children.map((child) => child.id),
            event
          )
          return moved ? { ...entry, children: moved } : entry
        }),
      }))
    )
  }

  const isDraggingItem = activeDragId ? itemIds.has(activeDragId) : false
  const pendingDeleteSection =
    sections.find((section) => section.id === pendingDeleteSectionId) ??
    null

  const pendingDeleteLocation = pendingDelete
    ? findItemLocation(pendingDelete.itemId)
    : null
  const pendingDeleteEntry = pendingDeleteLocation
    ? pendingDeleteLocation.section.entries[pendingDeleteLocation.itemIndex]
    : null
  const pendingDeleteItem =
    pendingDeleteEntry && isShellItem(pendingDeleteEntry)
      ? pendingDeleteEntry
      : null
  const pendingDeleteChild =
    pendingDelete?.kind === "child" && pendingDeleteItem
      ? ((pendingDeleteItem.children ?? []).find(
          (child) => child.id === pendingDelete.childId
        ) ?? null)
      : null
  const isDeletingChild = pendingDelete?.kind === "child"
  // The dialog opens off what was actually found, not off the pending ids, so
  // an entry that is already gone can never put an empty confirm on screen.
  const pendingDeleteTarget = isDeletingChild
    ? pendingDeleteChild
    : pendingDeleteItem

  const handleConfirmDelete = () => {
    if (!pendingDelete || !pendingDeleteLocation) return

    const sectionId = pendingDeleteLocation.section.id
    setPendingDelete(null)

    if (pendingDelete.kind === "child") {
      handleChildDelete(sectionId, pendingDelete.itemId, pendingDelete.childId)
      return
    }

    handleItemDelete(sectionId, pendingDelete.itemId)
  }

  return (
    <>
      <CollapsibleSettingsCard
        storageId={card.storageId}
        title={card.title}
        description={card.description}
        collapse={{
          open: cardOpen,
          onOpenChange: setCardOpen,
          noFlashKey: cardNoFlashKey,
        }}
        action={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => setResetOpen(true)}
          >
            <RotateCcwIcon className="h-4 w-4" />
            {reset.label}
          </Button>
        }
      >
        {topLeftNavigation ? (
          <div className="mb-4 max-w-2xl rounded-xl bg-muted/50 p-4">{topLeftNavigation}</div>
        ) : null}
        {sections.length === 0 ? (
          <EmptyRow>
            No sidebar sections yet. Use “Add Section” to create one.
          </EmptyRow>
        ) : (
          <DndContext
            id="custom-shell-sidebar-sections"
            sensors={sensors}
            collisionDetection={collisionDetection}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <SortableContext
              items={sections.map((section) => section.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="grid max-w-2xl gap-3">
                {sections.map((section) => (
                  <SortableSectionCard
                    key={section.id}
                    section={section}
                    isDraggingItem={isDraggingItem}
                    isNew={section.id === newSectionId}
                    openItemId={openItemId}
                    onOpenItemChange={handleOpenItemChange}
                    newChildId={newChildId}
                    onSectionTitleChange={handleSectionTitleChange}
                    onSectionDelete={(sectionId) =>
                      setPendingDeleteSectionId(sectionId)
                    }
                    onItemAdd={handleAddItem}
                    onItemChange={handleItemChange}
                    onItemDelete={(_sectionId, itemId) =>
                      setPendingDelete({ kind: "link", itemId })
                    }
                    onChildAdd={handleChildAdd}
                    onChildChange={handleChildChange}
                    onChildDelete={(_sectionId, itemId, childId) =>
                      setPendingDelete({ kind: "child", itemId, childId })
                    }
                    onChildDragEnd={handleChildDragEnd}
                    onSaveConfig={onSaveConfig}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
        {/* As wide as the sections, dashed, like an empty section waiting.
            The top-left box, the sections and this stop at 42rem rather than
            spanning a wide card (Tyler, 9 Nov 2026: "make the sidebar
            elements not full width"). */}
        <button
          type="button"
          onClick={handleAddSection}
          className="mt-3 flex h-11 w-full max-w-2xl items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-300 text-sm dark:border-zinc-600 text-muted-foreground transition-colors hover:border-muted-foreground/50 hover:text-foreground"
        >
          <PlusIcon className="h-4 w-4" />
          Add section
        </button>
      </CollapsibleSettingsCard>

      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Reset this sidebar?"
        description={reset.description}
        confirmLabel={reset.label}
        onConfirm={() => {
          setResetOpen(false)
          reset.onReset()
        }}
      />

      <ConfirmDialog
        open={Boolean(pendingDeleteSection)}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteSectionId(null)
        }}
        title="Delete this section?"
        description={describeSectionDelete(pendingDeleteSection)}
        confirmLabel="Delete section"
        onConfirm={() => {
          if (!pendingDeleteSection) return
          setPendingDeleteSectionId(null)
          handleSectionDelete(pendingDeleteSection.id)
        }}
      />

      {/* One dialog for both link and child deletes. It lives out here rather
          than inside the rows so a dragging or re-rendering row cannot take it
          down mid-question, and it stacks above the link's own edit modal the
          way the feedback comments modal's delete confirm does. */}
      <ConfirmDialog
        open={Boolean(pendingDeleteTarget)}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null)
        }}
        title={
          isDeletingChild ? "Delete this child link?" : "Delete this link?"
        }
        description={
          isDeletingChild
            ? describeChildDelete(pendingDeleteChild)
            : describeLinkDelete(pendingDeleteItem)
        }
        confirmLabel={isDeletingChild ? "Delete child link" : "Delete link"}
        onConfirm={handleConfirmDelete}
      />
    </>
  )
}

function describeSectionDelete(section: ShellSection | null) {
  // Unlike a link, a section with no name still shows in the sidebar — under
  // this name — so the confirmation quotes what is actually on screen.
  const name = section?.title?.trim() || UNTITLED_SECTION_LABEL
  const linkCount = section?.entries.filter(isShellItem).length ?? 0
  const links =
    linkCount === 0
      ? ""
      : linkCount === 1
        ? " and its link"
        : ` and its ${linkCount} links`

  return `"${name}"${links} will be removed from the sidebar. This cannot be undone.`
}

function describeLinkDelete(item: ShellItem | null) {
  // A link you never named has nothing to quote, so it is described rather than
  // shown as an empty pair of quotes.
  const name =
    item && isShellEntryNamed(item)
      ? `"${item.label.trim()}"`
      : "This unnamed link"
  const childCount = item?.children?.length ?? 0
  const children =
    childCount === 0
      ? ""
      : childCount === 1
        ? " and its child link"
        : ` and its ${childCount} child links`

  return `${name}${children} will be removed from the sidebar. This cannot be undone.`
}

function describeChildDelete(child: ShellChildItem | null) {
  const name =
    child && isShellEntryNamed(child)
      ? `"${child.label.trim()}"`
      : "This unnamed child link"

  return `${name} will be removed from the sidebar. This cannot be undone.`
}
