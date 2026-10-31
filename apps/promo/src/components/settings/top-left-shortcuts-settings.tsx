import * as React from "react"
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable"
import { PlusIcon } from "lucide-react"

import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import {
  createShellId,
  useNavSensors,
} from "@/components/settings/nav-editor-shared"
import { SortableLinkChip } from "@/components/settings/top-right-settings"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  isShellEntryNamed,
  type ShellTopLeftShortcut,
} from "@/lib/custom-shell"

/**
 * The one shortcuts row for Top left shows → Shortcuts. Drawn like the top
 * right menu editor: drag a chip to reorder, the checkbox switches a link off
 * (it stays here with a "Hidden" pill), the trash can deletes it, and the
 * + tile adds a new one and opens its editor.
 */
export function TopLeftShortcutsSettings({
  shortcuts,
  onShortcutsChange,
  onSaveConfig,
}: {
  shortcuts: ShellTopLeftShortcut[]
  onShortcutsChange: (shortcuts: ShellTopLeftShortcut[]) => void
  onSaveConfig: () => Promise<boolean>
}) {
  const [openId, setOpenId] = React.useState<string | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = React.useState<string | null>(
    null
  )
  const sensors = useNavSensors()

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const oldIndex = shortcuts.findIndex((item) => item.id === active.id)
    const newIndex = shortcuts.findIndex((item) => item.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    onShortcutsChange(arrayMove(shortcuts, oldIndex, newIndex))
  }

  const handleAdd = () => {
    // Blank, so it stays out of the header until it has a name and a page.
    const shortcut: ShellTopLeftShortcut = {
      id: createShellId("top-left-shortcut"),
      label: "",
      href: "",
      icon: "appWindow",
      visible: true,
    }
    setOpenId(shortcut.id)
    onShortcutsChange([...shortcuts, shortcut])
  }

  const update = (id: string, patch: Partial<ShellTopLeftShortcut>) =>
    onShortcutsChange(
      shortcuts.map((item) => (item.id === id ? { ...item, ...patch } : item))
    )

  const pendingDelete =
    shortcuts.find((item) => item.id === pendingDeleteId) ?? null

  return (
    <>
      <CollapsibleSettingsCard
        storageId="top-left-shortcuts"
        title="Top left shortcuts"
        description="The links the top left shows, in this order on every page, when Top left shows is set to Shortcuts. Members see the same list, minus any admin page. With nothing to show, the top left falls back to Sidebar links."
      >
        <DndContext
          id="custom-shell-top-left-shortcuts"
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={shortcuts.map((item) => item.id)}
            strategy={horizontalListSortingStrategy}
          >
            <div className="flex flex-wrap items-center gap-2">
              {shortcuts.map((item) => (
                <SortableLinkChip
                  key={item.id}
                  item={item}
                  linkNoun="Shortcut"
                  dialogDescription="Edit this top left shortcut."
                  dialogOpen={openId === item.id}
                  onDialogOpenChange={(open) => setOpenId(open ? item.id : null)}
                  onChange={(patch) => update(item.id, patch)}
                  onDelete={() => setPendingDeleteId(item.id)}
                  onSaveConfig={onSaveConfig}
                  visibility={{
                    visible: item.visible,
                    onVisibleChange: (visible) => update(item.id, { visible }),
                  }}
                />
              ))}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={handleAdd}
                    className="flex size-13 shrink-0 items-center justify-center rounded-lg border bg-background transition-colors hover:border-muted-foreground/50 hover:bg-accent"
                    aria-label="Add shortcut"
                  >
                    <PlusIcon className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Add shortcut</TooltipContent>
              </Tooltip>
            </div>
          </SortableContext>
        </DndContext>
      </CollapsibleSettingsCard>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteId(null)
        }}
        title="Delete this shortcut?"
        description={`${
          pendingDelete && isShellEntryNamed(pendingDelete)
            ? `"${pendingDelete.label.trim()}"`
            : "This unnamed shortcut"
        } will be removed from the top left shortcuts. This cannot be undone.`}
        confirmLabel="Delete shortcut"
        onConfirm={() => {
          if (!pendingDelete) return
          setPendingDeleteId(null)
          onShortcutsChange(
            shortcuts.filter((item) => item.id !== pendingDelete.id)
          )
        }}
      />
    </>
  )
}
