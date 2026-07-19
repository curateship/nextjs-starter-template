import * as React from "react"
import {
  AlertCircleIcon,
  LayoutTemplateIcon,
  Loader2Icon,
  MoreHorizontalIcon,
  StarIcon,
  StarOffIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"

import { BroadcastsTabs } from "@/components/broadcasts/broadcasts-tabs"
import { DashboardTable } from "@/components/dashboard-table"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  deleteBroadcastTemplates,
  getBroadcastErrorMessage,
  listBroadcastTemplates,
  setDefaultBroadcastTemplate,
  type BroadcastTemplateItem,
} from "@/lib/api/broadcasts"

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
})

export function BroadcastTemplatesPage() {
  const [templates, setTemplates] = React.useState<BroadcastTemplateItem[]>([])
  const [error, setError] = React.useState<string | null>(null)
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] =
    React.useState<BroadcastTemplateItem | null>(null)
  const [refreshKey, setRefreshKey] = React.useState(0)

  React.useEffect(() => {
    let active = true
    listBroadcastTemplates()
      .then((data) => {
        if (!active) return
        setTemplates(data.templates)
        setError(null)
      })
      .catch((loadError) => {
        if (!active) return
        setError(getBroadcastErrorMessage(loadError))
      })
    return () => {
      active = false
    }
  }, [refreshKey])

  const runRowAction = async (
    template: BroadcastTemplateItem,
    action: () => Promise<unknown>,
    successMessage: string
  ) => {
    setBusyId(template.id)
    try {
      await action()
      toast.success(successMessage)
      setRefreshKey((key) => key + 1)
    } catch (actionError) {
      toast.error(getBroadcastErrorMessage(actionError))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="w-full space-y-[var(--shell-gutter,0.75rem)] pb-8">
      <BroadcastsTabs active="templates" />

      {error ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      <DashboardTable
        title="Templates"
        icon={
          <LayoutTemplateIcon className="size-4 text-muted-foreground sm:size-[18px]" />
        }
        count={templates.length}
        header={
          <TableHeader>
            <TableRow>
              <TableHead column="main">Name</TableHead>
              <TableHead column="meta">Blocks</TableHead>
              <TableHead column="meta" className="hidden md:table-cell">
                Updated
              </TableHead>
              <TableHead column="meta" aria-label="Actions" />
            </TableRow>
          </TableHeader>
        }
        isEmpty={templates.length === 0}
        emptyText="No templates yet. Open a broadcast and use Templates → Save as template."
        emptyColSpan={4}
        footer={{ type: "summary", count: templates.length }}
      >
        {templates.map((template) => (
          <TableRow key={template.id}>
            <TableCell column="main" className="font-medium">
              <span className="inline-flex items-center gap-2">
                {template.name}
                {template.isDefault ? (
                  <Badge variant="secondary">Default</Badge>
                ) : null}
              </span>
            </TableCell>
            <TableCell column="meta" className="text-muted-foreground">
              {template.blocks.length} block
              {template.blocks.length === 1 ? "" : "s"}
            </TableCell>
            <TableCell
              column="meta"
              className="hidden text-muted-foreground md:table-cell"
            >
              {dateFormatter.format(new Date(template.updated_at))}
            </TableCell>
            <TableCell column="meta">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Actions for ${template.name}`}
                    disabled={busyId === template.id}
                  >
                    {busyId === template.id ? (
                      <Loader2Icon className="size-4 animate-spin" />
                    ) : (
                      <MoreHorizontalIcon className="size-4" />
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {template.isDefault ? (
                    <DropdownMenuItem
                      onSelect={() =>
                        void runRowAction(
                          template,
                          () =>
                            setDefaultBroadcastTemplate(template.id, false),
                          "Removed default"
                        )
                      }
                    >
                      <StarOffIcon className="size-4" />
                      Remove default
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem
                      onSelect={() =>
                        void runRowAction(
                          template,
                          () => setDefaultBroadcastTemplate(template.id, true),
                          "Default template updated"
                        )
                      }
                    >
                      <StarIcon className="size-4" />
                      Make default
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => setDeleteTarget(template)}
                  >
                    <Trash2Icon className="size-4" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        ))}
      </DashboardTable>

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(next) => {
          if (!next) setDeleteTarget(null)
        }}
      >
        <DialogContent variant="admin" className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete template</DialogTitle>
            <DialogDescription>
              “{deleteTarget?.name}” will be removed permanently. Broadcasts
              built from it are not affected.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="py-0" />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteTarget(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                const target = deleteTarget
                if (!target) return
                setDeleteTarget(null)
                void runRowAction(
                  target,
                  () => deleteBroadcastTemplates([target.id]),
                  "Template deleted"
                )
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
