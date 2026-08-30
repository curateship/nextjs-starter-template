import * as React from "react"
import { LayoutTemplateIcon, Trash2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DisabledReason } from "@/components/ui/disabled-reason"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
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

export function PanelLayoutsMenu({
  layouts,
  onCreate,
  onApply,
  onDelete,
}: {
  layouts: NamedPanelLayout[]
  onCreate: (name: string) => Promise<void>
  onApply: (id: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState("")
  const [invalid, setInvalid] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [deleting, setDeleting] = React.useState<NamedPanelLayout | null>(null)
  const full = layouts.length >= MAX_NAMED_PANEL_LAYOUTS

  async function create(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setInvalid(true)
      showErrorToast("Enter a name for this panel layout.")
      return
    }
    setBusy(true)
    try {
      await onCreate(trimmed)
      setName("")
      setInvalid(false)
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
      setOpen(false)
    } catch (error) {
      showErrorToast(getPanelLayoutErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!deleting) return
    setBusy(true)
    try {
      await onDelete(deleting.id)
      setDeleting(null)
    } catch (error) {
      showErrorToast(getPanelLayoutErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
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
        <PopoverContent align="end" className="w-72">
          <PopoverHeader>
            <PopoverTitle>Panel layouts</PopoverTitle>
          </PopoverHeader>

          {layouts.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No saved layouts yet.
            </p>
          ) : (
            <div className="grid gap-1">
              {layouts.map((layout) => (
                <div key={layout.id} className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    className="min-w-0 flex-1 justify-start"
                    disabled={busy}
                    onClick={() => void apply(layout.id)}
                  >
                    <span className="truncate">{layout.name}</span>
                  </Button>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        aria-label={`Delete ${layout.name}`}
                        disabled={busy}
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

          <form className="grid gap-2 border-t pt-2" onSubmit={create}>
            <Label htmlFor="panel-layout-name">Save current layout</Label>
            <div className="flex gap-2">
              <Input
                id="panel-layout-name"
                value={name}
                maxLength={32}
                disabled={busy || full}
                aria-invalid={invalid}
                onBlur={() => setInvalid(name.trim().length === 0)}
                onChange={(event) => {
                  setName(event.target.value)
                  if (event.target.value.trim()) setInvalid(false)
                }}
              />
              <DisabledReason
                disabled={full}
                reason="Delete a saved layout before adding another."
              >
                <Button type="submit" disabled={busy || full}>
                  Save
                </Button>
              </DisabledReason>
            </div>
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
