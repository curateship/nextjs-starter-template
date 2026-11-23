import * as React from "react"
import { Loader2Icon } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  createBroadcastTemplate,
  getBroadcastErrorMessage,
  listBroadcastTemplates,
  type BroadcastTemplateItem,
} from "@/lib/api/broadcasts"
import type { BroadcastBlock } from "@/lib/broadcasts/blocks"
import { cn } from "@/lib/utils"

export function ApplyTemplateDialog({
  open,
  onOpenChange,
  onApply,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onApply: (blocks: BroadcastBlock[]) => void
}) {
  const [templates, setTemplates] = React.useState<
    BroadcastTemplateItem[] | null
  >(null)
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  // Reset selection whenever the dialog opens (render-time state adjustment
  // instead of a setState-in-effect).
  const [wasOpen, setWasOpen] = React.useState(false)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setTemplates(null)
      setSelectedId(null)
      setError(null)
    }
  }

  React.useEffect(() => {
    if (!open) return
    let active = true
    listBroadcastTemplates()
      .then((data) => {
        if (active) setTemplates(data.templates)
      })
      .catch((loadError) => {
        if (active) setError(getBroadcastErrorMessage(loadError))
      })
    return () => {
      active = false
    }
  }, [open])

  const apply = () => {
    const template = templates?.find((item) => item.id === selectedId)
    if (!template) return
    // Fresh ids so applying the same template twice can't collide.
    onApply(
      template.blocks.map((block) => ({
        ...block,
        id: `${block.kind}-${crypto.randomUUID()}`,
      }))
    )
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="admin" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Apply template</DialogTitle>
          <DialogDescription>
            Replaces the current blocks with the template's blocks. Subject
            and settings stay as they are.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : templates === null ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2Icon className="size-4 animate-spin" />
              Loading templates…
            </div>
          ) : templates.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No templates yet. Use “Save as template” to create one from a
              broadcast.
            </p>
          ) : (
            <div className="grid gap-2" role="radiogroup">
              {templates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  role="radio"
                  aria-checked={selectedId === template.id}
                  onClick={() => setSelectedId(template.id)}
                  className={cn(
                    "flex items-center justify-between rounded-md border bg-background px-3 py-2 text-left text-sm hover:bg-muted",
                    selectedId === template.id &&
                      "border-primary/50 bg-primary/5"
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-medium">
                      {template.name}
                    </span>
                    {template.isDefault ? (
                      <Badge variant="secondary">Default</Badge>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {template.blocks.length} block
                    {template.blocks.length === 1 ? "" : "s"}
                  </span>
                </button>
              ))}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" disabled={!selectedId} onClick={apply}>
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function SaveTemplateDialog({
  open,
  onOpenChange,
  blocks,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  blocks: BroadcastBlock[]
}) {
  const [name, setName] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  // Reset the form whenever the dialog opens (render-time state adjustment
  // instead of a setState-in-effect).
  const [wasOpen, setWasOpen] = React.useState(false)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setName("")
      setError(null)
    }
  }

  const submit = async () => {
    const trimmedName = name.trim()
    if (!trimmedName) {
      setError("Give the template a name.")
      return
    }
    setBusy(true)
    setError(null)
    try {
      await createBroadcastTemplate(trimmedName, blocks)
      onOpenChange(false)
      toast.success(`Template “${trimmedName}” saved`)
    } catch (saveError) {
      setError(getBroadcastErrorMessage(saveError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next)
      }}
    >
      <DialogContent variant="admin" className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Save as template</DialogTitle>
          <DialogDescription>
            Stores the current {blocks.length} block
            {blocks.length === 1 ? "" : "s"} as a reusable template.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="grid gap-2">
            <Label htmlFor="template-name">Template name</Label>
            <Input
              id="template-name"
              autoFocus
              maxLength={120}
              value={name}
              placeholder="Weekly update layout"
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void submit()
              }}
            />
          </div>
          {error ? (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" disabled={busy} onClick={() => void submit()}>
            {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
            Save template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
