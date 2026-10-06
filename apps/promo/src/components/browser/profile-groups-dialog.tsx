import * as React from "react"
import { Loader2Icon, PlusIcon, Trash2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
  changeGroup,
  getProfileErrorMessage,
  type FolderView,
  type LabelView,
} from "@/lib/api/browser/profiles"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * Folders and labels, named, renamed and removed. Each change is saved as it
 * is made, so the window ends with Done. Removing one leaves its profiles
 * where they are, without it.
 */
export function ProfileGroupsDialog({
  open,
  folders,
  labels,
  onClose,
  onChanged,
}: {
  open: boolean
  folders: FolderView[]
  labels: LabelView[]
  onClose: () => void
  onChanged: () => Promise<void>
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : onClose())}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Folders and labels</DialogTitle>
          <DialogDescription>
            A folder groups profiles. A label says where a profile has got to:
            Ready, Warming, Banned, or a word of your own.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="grid gap-6">
            <GroupCard what="folder" title="Folders" items={folders} onChanged={onChanged} />
            <GroupCard what="label" title="Labels" items={labels} onChanged={onChanged} />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button type="button" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function GroupCard({
  what,
  title,
  items,
  onChanged,
}: {
  what: "folder" | "label"
  title: string
  items: Array<{ id: string; name: string }>
  onChanged: () => Promise<void>
}) {
  const [name, setName] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const addId = `new-${what}`

  async function run(input: Parameters<typeof changeGroup>[0]) {
    setBusy(true)
    try {
      await changeGroup(input)
      await onChanged()
      return true
    } catch (error) {
      showErrorToast(getProfileErrorMessage(error))
      return false
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {items.length ? (
          <div className="grid gap-2">
            {items.map((item) => (
              <GroupRow
                key={`${item.id}:${item.name}`}
                what={what}
                item={item}
                busy={busy}
                onRename={(next) => run({ what, action: "rename", id: item.id, name: next })}
                onDelete={() => run({ what, action: "delete", id: item.id })}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">None yet.</p>
        )}
        <form
          className="flex items-end gap-2"
          onSubmit={async (event) => {
            event.preventDefault()
            if (await run({ what, action: "create", id: null, name })) setName("")
          }}
        >
          <div className="grid min-w-0 flex-1 gap-2">
            <Label htmlFor={addId}>New {what}</Label>
            <Input id={addId} value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <Button type="submit" variant="outline" disabled={busy}>
            {busy ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
            Add
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

/** One folder or label: rename it by editing and leaving the box. */
function GroupRow({
  what,
  item,
  busy,
  onRename,
  onDelete,
}: {
  what: "folder" | "label"
  item: { id: string; name: string }
  busy: boolean
  onRename: (name: string) => Promise<boolean>
  onDelete: () => Promise<boolean>
}) {
  const [name, setName] = React.useState(item.name)
  return (
    <div className="flex items-center gap-2">
      <Input
        aria-label={`Rename the ${what} ${item.name}`}
        value={name}
        onChange={(event) => setName(event.target.value)}
        onBlur={async () => {
          if (name.trim() === item.name) return
          if (!(await onRename(name))) setName(item.name)
        }}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        disabled={busy}
        onClick={() => void onDelete()}
        title={`Delete ${what}`}
        aria-label={`Delete the ${what} ${item.name}`}
      >
        <Trash2Icon className="size-4" />
      </Button>
    </div>
  )
}
