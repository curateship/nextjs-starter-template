import * as React from "react"
import {
  CheckIcon,
  Loader2Icon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ErrorAlert } from "@/components/error-alert"
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  addContactsToList,
  createContactList,
  deleteContactList,
  getContactListErrorMessage,
  renameContactList,
  type ContactListItem,
} from "@/lib/api/contact-lists"

// Create / rename / delete lists. Deleting a list never deletes contacts.
export function ManageListsDialog({
  open,
  onOpenChange,
  lists,
  onListsChanged,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  lists: ContactListItem[]
  onListsChanged: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Contact Lists</DialogTitle>
          <DialogDescription>Lists group contacts so campaigns can call them together.</DialogDescription>
        </DialogHeader>
        {open ? (
          <ManageListsContent lists={lists} onListsChanged={onListsChanged} />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function ManageListsContent({
  lists,
  onListsChanged,
}: {
  lists: ContactListItem[]
  onListsChanged: () => void
}) {
  const [error, setError] = React.useState<string | null>(null)
  const [newName, setNewName] = React.useState("")
  const [creating, setCreating] = React.useState(false)
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [editingName, setEditingName] = React.useState("")
  const [busyId, setBusyId] = React.useState<string | null>(null)

  async function handleCreate() {
    if (!newName || creating) return
    setCreating(true)
    setError(null)
    try {
      await createContactList(newName)
      setNewName("")
      onListsChanged()
    } catch (createError) {
      setError(getContactListErrorMessage(createError))
    } finally {
      setCreating(false)
    }
  }

  async function handleRename(listId: string) {
    if (!editingName) return
    setBusyId(listId)
    setError(null)
    try {
      await renameContactList(listId, editingName)
      setEditingId(null)
      onListsChanged()
    } catch (renameError) {
      setError(getContactListErrorMessage(renameError))
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelete(listId: string) {
    setBusyId(listId)
    setError(null)
    try {
      await deleteContactList(listId)
      onListsChanged()
    } catch (deleteError) {
      setError(getContactListErrorMessage(deleteError))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <DialogBody>
      <div className="space-y-4">
        {error ? (
          <ErrorAlert message={error} />
        ) : null}

        <div className="flex items-center gap-2">
          <Input
            value={newName}
            placeholder="New list name"
            aria-label="New list name"
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") handleCreate()
            }}
          />
          <Button type="button" disabled={!newName || creating} onClick={handleCreate}>
            {creating ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <PlusIcon className="size-4" />
            )}
            Add
          </Button>
        </div>

        {lists.length === 0 ? (
          <p className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
            No lists yet. Lists group contacts so campaigns can call them together.
          </p>
        ) : (
          <ul className="divide-y rounded-md border">
            {lists.map((list) => (
              <li key={list.id} className="flex items-center gap-2 px-3 py-2">
                {editingId === list.id ? (
                  <>
                    <Input
                      value={editingName}
                      aria-label={`Rename ${list.name}`}
                      className="h-8"
                      autoFocus
                      onChange={(event) => setEditingName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") handleRename(list.id)
                        if (event.key === "Escape") setEditingId(null)
                      }}
                    />
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Save list name"
                      disabled={busyId === list.id || !editingName}
                      onClick={() => handleRename(list.id)}
                    >
                      {busyId === list.id ? (
                        <Loader2Icon className="size-4 animate-spin" />
                      ) : (
                        <CheckIcon className="size-4" />
                      )}
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {list.name}
                    </span>
                    <Badge variant="secondary">
                      {list.member_count}{" "}
                      {list.member_count === 1 ? "contact" : "contacts"}
                    </Badge>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Rename ${list.name}`}
                      onClick={() => {
                        setEditingId(list.id)
                        setEditingName(list.name)
                      }}
                    >
                      <PencilIcon className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Delete ${list.name}`}
                      disabled={busyId === list.id}
                      onClick={() => handleDelete(list.id)}
                    >
                      {busyId === list.id ? (
                        <Loader2Icon className="size-4 animate-spin" />
                      ) : (
                        <Trash2Icon className="size-4" />
                      )}
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          Deleting a list never deletes its contacts.
        </p>
      </div>
    </DialogBody>
  )
}

// Adds the current selection to an existing or new list.
export function AddToListDialog({
  open,
  onOpenChange,
  lists,
  contactIds,
  onAdded,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  lists: ContactListItem[]
  contactIds: string[]
  onAdded: (listName: string, addedCount: number) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>
            Add {contactIds.length}{" "}
            {contactIds.length === 1 ? "Contact" : "Contacts"} to List
          </DialogTitle>
          <DialogDescription>
            Pick an existing list or create a new one.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <AddToListContent
            lists={lists}
            contactIds={contactIds}
            onAdded={onAdded}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function AddToListContent({
  lists,
  contactIds,
  onAdded,
  onClose,
}: {
  lists: ContactListItem[]
  contactIds: string[]
  onAdded: (listName: string, addedCount: number) => void
  onClose: () => void
}) {
  const [choice, setChoice] = React.useState<string>(lists[0]?.id ?? "new")
  const [newListName, setNewListName] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const canSave = !saving && (choice !== "new" || Boolean(newListName))

  async function handleAdd() {
    if (!canSave) return
    setSaving(true)
    setError(null)
    try {
      let listId = choice
      let listName = lists.find((list) => list.id === choice)?.name ?? ""
      if (choice === "new") {
        const created = await createContactList(newListName)
        listId = created.id
        listName = created.name
      }
      const { addedCount } = await addContactsToList(listId, contactIds)
      onAdded(listName, addedCount)
      onClose()
    } catch (addError) {
      setError(getContactListErrorMessage(addError))
      setSaving(false)
    }
  }

  return (
    <>
      <DialogBody>
        <div className="space-y-4">
          {error ? (
            <ErrorAlert message={error} />
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="add-to-list">List</Label>
            <Select value={choice} onValueChange={setChoice}>
              <SelectTrigger id="add-to-list" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {lists.map((list) => (
                  <SelectItem key={list.id} value={list.id}>
                    {list.name}
                  </SelectItem>
                ))}
                <SelectItem value="new">+ New list…</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {choice === "new" ? (
            <div className="space-y-2">
              <Label htmlFor="add-to-list-name">List name</Label>
              <Input
                id="add-to-list-name"
                value={newListName}
                autoFocus
                onChange={(event) => setNewListName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") handleAdd()
                }}
              />
            </div>
          ) : null}
        </div>
      </DialogBody>
      <DialogFooter variant="plain">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" disabled={!canSave} onClick={handleAdd}>
          {saving ? <Loader2Icon className="size-4 animate-spin" /> : null}
          {saving ? "Adding" : "Add to List"}
        </Button>
      </DialogFooter>
    </>
  )
}
