import * as React from "react"
import { LayoutTemplateIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DisabledReason } from "@/components/ui/disabled-reason"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { getPanelLayoutErrorMessage } from "@/lib/api/trade/panel-layouts"
import {
  MAX_NAMED_PANEL_LAYOUTS,
  type NamedPanelLayout,
} from "@/lib/trade/panel-layout"
import { showErrorToast } from "@/lib/toast/error-toast"
import { focusRing } from "@/lib/layout/focus-ring"
import { cn } from "@/lib/utils"

export function PanelLayoutsMenu({
  layouts,
  activeId,
  onCreate,
  onApply,
  onDelete,
  trigger,
  nested = false,
}: {
  layouts: NamedPanelLayout[]
  activeId: string | null
  onCreate: (name: string) => Promise<void>
  onApply: (id: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  trigger?: React.ReactElement
  /** Places the dropdown beside a trigger inside another chart menu. */
  nested?: boolean
}) {
  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState("")
  const [attempted, setAttempted] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [deleting, setDeleting] = React.useState<NamedPanelLayout | null>(null)
  const full = layouts.length >= MAX_NAMED_PANEL_LAYOUTS

  async function create(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    setAttempted(true)
    if (!trimmed) {
      showErrorToast("Enter a name for this panel layout.")
      return
    }
    setBusy(true)
    try {
      await onCreate(trimmed)
      setName("")
      setAttempted(false)
      toast.success(`Created "${trimmed}".`)
    } catch (error) {
      showErrorToast(getPanelLayoutErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function apply(id: string) {
    setBusy(true)
    try {
      await onApply(id)
    } catch (error) {
      showErrorToast(getPanelLayoutErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!deleting) return
    const removed = deleting
    setBusy(true)
    try {
      await onDelete(deleting.id)
      setDeleting(null)
      toast.success(`Deleted "${removed.name}".`)
    } catch (error) {
      showErrorToast(getPanelLayoutErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        {trigger ? (
          <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Saved panel layouts"
                  className="bg-muted/60 dark:bg-muted/60"
                >
                  <LayoutTemplateIcon />
                </Button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent>Saved panel layouts</TooltipContent>
          </Tooltip>
        )}
        <PopoverContent
          side={nested ? "right" : "bottom"}
          align={nested ? "start" : "end"}
          sideOffset={nested ? 8 : 4}
          className="w-56 p-1.5"
        >
          <p className="px-2 py-1.5 text-xs font-medium">Saved layouts</p>

          {layouts.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">
              No saved layouts yet.
            </p>
          ) : (
            <div className="grid gap-0.5" role="radiogroup" aria-label="Saved layouts">
              {layouts.map((layout) => (
                <div
                  key={layout.id}
                  className="group flex h-8 items-center rounded-md focus-within:bg-muted hover:bg-muted"
                >
                  <button
                    type="button"
                    id={`panel-layout-${layout.id}`}
                    name="panel-layout"
                    role="radio"
                    aria-checked={layout.id === activeId}
                    data-state={layout.id === activeId ? "checked" : "unchecked"}
                    className={cn("ml-2 size-4 rounded-full border border-foreground/50 p-0.5", focusRing)}
                    disabled={busy}
                    aria-label={`Use ${layout.name}`}
                    onClick={() => void apply(layout.id)}
                    onKeyDown={(event) => {
                      if (event.key === "ArrowDown" || event.key === "ArrowRight") {
                        event.preventDefault()
                        const next = layouts[(layouts.indexOf(layout) + 1) % layouts.length]
                        void apply(next.id)
                        document.getElementById(`panel-layout-${next.id}`)?.focus()
                      }
                      if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
                        event.preventDefault()
                        const next = layouts[(layouts.indexOf(layout) - 1 + layouts.length) % layouts.length]
                        void apply(next.id)
                        document.getElementById(`panel-layout-${next.id}`)?.focus()
                      }
                    }}
                  >
                    <span className="sr-only">{layout.name}</span>
                  </button>
                  <span className="flex h-full min-w-0 flex-1 items-center truncate px-2 text-sm">
                    {layout.name}
                  </span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Delete ${layout.name}`}
                        disabled={busy}
                        className="mr-0.5 text-muted-foreground opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 hover:text-destructive"
                        onClick={() => {
                          setOpen(false)
                          setDeleting(layout)
                        }}
                      >
                        <Trash2Icon />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Delete {layout.name}</TooltipContent>
                  </Tooltip>
                </div>
              ))}
            </div>
          )}

          <form className="mt-1 flex gap-2 px-1 pb-1" onSubmit={create}>
            <Input
              aria-label="Layout name"
              placeholder="Layout name"
              value={name}
              maxLength={32}
              disabled={busy || full}
              aria-invalid={attempted && !name.trim()}
              onChange={(event) => setName(event.target.value)}
            />
            <DisabledReason
              disabled={full}
              reason="Delete a saved layout before adding another."
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="submit"
                    variant="outline"
                    size="icon"
                    disabled={busy || full}
                    aria-disabled={busy || full || !name.trim()}
                    aria-label="Create layout"
                  >
                    <PlusIcon />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Create layout</TooltipContent>
              </Tooltip>
            </DisabledReason>
          </form>
        </PopoverContent>
      </Popover>
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(next) => {
          if (!next) setDeleting(null)
        }}
        title="Delete saved layout?"
        description={
          deleting
            ? `Delete "${deleting.name}"? The current panel positions will not move.`
            : "The current panel positions will not move."
        }
        confirmLabel="Delete layout"
        loading={busy}
        onConfirm={() => void remove()}
      />
    </>
  )
}
