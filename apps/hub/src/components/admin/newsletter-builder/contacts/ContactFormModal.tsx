"use client"

import { useEffect, useState, type FormEvent } from "react"

import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  AdminModalBody,
  AdminModalContent,
  AdminModalDescription,
  AdminModalFooter,
  AdminModalHeader,
  AdminModalTitle,
} from "@/components/admin/layout/builder/AdminModalLayout"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  createOrUpsertContact,
  updateContact,
  type CrmContact,
} from "@/lib/actions/newsletters/contact-actions"

type ContactFormModalProps = {
  addOpen: boolean
  editContact: CrmContact | null
  onAddOpenChange: (open: boolean) => void
  onCreated: (contact: CrmContact) => void
  onEditClose: () => void
  onError: (message: string) => void
  onUpdated: (contact: CrmContact) => void
  siteId?: string | null
}

export function ContactFormModal({
  addOpen,
  editContact,
  onAddOpenChange,
  onCreated,
  onEditClose,
  onError,
  onUpdated,
  siteId,
}: ContactFormModalProps) {
  const [addForm, setAddForm] = useState({ email: "", first_name: "", last_name: "", tags: "" })
  const [adding, setAdding] = useState(false)
  const [editForm, setEditForm] = useState({ first_name: "", last_name: "", tags: "", status: "active" })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!editContact) return
    setEditForm({
      first_name: editContact.metadata?.first_name || "",
      last_name: editContact.metadata?.last_name || "",
      tags: editContact.metadata?.tags?.join(", ") || "",
      status: editContact.status,
    })
  }, [editContact])

  const handleAddContact = async (event: FormEvent) => {
    event.preventDefault()
    if (!siteId || !addForm.email) return
    setAdding(true)

    try {
      const tags = addForm.tags ? addForm.tags.split(",").map((tag) => tag.trim()).filter(Boolean) : []
      const { data, error } = await createOrUpsertContact({
        siteId,
        email: addForm.email,
        firstName: addForm.first_name || undefined,
        lastName: addForm.last_name || undefined,
        source: "manual",
        tags,
      })

      if (error) {
        onError(error)
        return
      }

      if (data) {
        onCreated(data)
      }
      onAddOpenChange(false)
      setAddForm({ email: "", first_name: "", last_name: "", tags: "" })
    } catch {
      onError("Failed to add contact")
    } finally {
      setAdding(false)
    }
  }

  const handleEditContact = async (event: FormEvent) => {
    event.preventDefault()
    if (!editContact) return
    setSaving(true)

    try {
      const tags = editForm.tags ? editForm.tags.split(",").map((tag) => tag.trim()).filter(Boolean) : []
      const { data, error } = await updateContact(editContact.id, {
        metadata: {
          first_name: editForm.first_name || undefined,
          last_name: editForm.last_name || undefined,
          tags,
        },
        status: editForm.status as CrmContact["status"],
      })

      if (error) {
        onError(error)
        return
      }

      if (data) {
        onUpdated(data)
      }
      onEditClose()
    } catch {
      onError("Failed to update contact")
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Dialog open={addOpen} onOpenChange={onAddOpenChange}>
        <AdminModalContent>
          <AdminModalHeader>
            <AdminModalTitle>Add Contact</AdminModalTitle>
            <AdminModalDescription>
              Add a single contact to this site and optionally tag them.
            </AdminModalDescription>
          </AdminModalHeader>

          <form onSubmit={handleAddContact} className="flex min-h-0 flex-1 flex-col">
            <AdminModalBody className="space-y-6 [&_label+input]:mt-2">
              <div>
                <Label htmlFor="add-email">Email *</Label>
                <Input
                  id="add-email"
                  type="email"
                  required
                  placeholder="email@example.com"
                  value={addForm.email}
                  onChange={(event) => setAddForm((prev) => ({ ...prev, email: event.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <Label htmlFor="add-first">First Name</Label>
                  <Input
                    id="add-first"
                    placeholder="Jane"
                    value={addForm.first_name}
                    onChange={(event) => setAddForm((prev) => ({ ...prev, first_name: event.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="add-last">Last Name</Label>
                  <Input
                    id="add-last"
                    placeholder="Doe"
                    value={addForm.last_name}
                    onChange={(event) => setAddForm((prev) => ({ ...prev, last_name: event.target.value }))}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="add-tags">Tags</Label>
                <Input
                  id="add-tags"
                  placeholder="austin, fitness (comma-separated)"
                  value={addForm.tags}
                  onChange={(event) => setAddForm((prev) => ({ ...prev, tags: event.target.value }))}
                />
              </div>
            </AdminModalBody>
            <AdminModalFooter className="sm:justify-end">
              <Button type="button" variant="outline" onClick={() => onAddOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={adding || !addForm.email}>
                {adding ? "Adding..." : "Add Contact"}
              </Button>
            </AdminModalFooter>
          </form>
        </AdminModalContent>
      </Dialog>

      <Dialog open={editContact !== null} onOpenChange={(open) => { if (!open) onEditClose() }}>
        <AdminModalContent>
          <AdminModalHeader>
            <AdminModalTitle>Edit Contact</AdminModalTitle>
            <AdminModalDescription>
              Update this contact&apos;s details, tags, and subscription status.
            </AdminModalDescription>
            {editContact && (
              <p className="text-sm text-muted-foreground">{editContact.email}</p>
            )}
          </AdminModalHeader>

          <form onSubmit={handleEditContact} className="flex min-h-0 flex-1 flex-col">
            <AdminModalBody className="space-y-6 [&_label+button]:mt-2 [&_label+input]:mt-2">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <Label htmlFor="edit-first">First Name</Label>
                  <Input
                    id="edit-first"
                    value={editForm.first_name}
                    onChange={(event) => setEditForm((prev) => ({ ...prev, first_name: event.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="edit-last">Last Name</Label>
                  <Input
                    id="edit-last"
                    value={editForm.last_name}
                    onChange={(event) => setEditForm((prev) => ({ ...prev, last_name: event.target.value }))}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="edit-tags">Tags</Label>
                <Input
                  id="edit-tags"
                  placeholder="austin, fitness (comma-separated)"
                  value={editForm.tags}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, tags: event.target.value }))}
                />
              </div>
              <div>
                <Label>Status</Label>
                <Select
                  value={editForm.status}
                  onValueChange={(value) => setEditForm((prev) => ({ ...prev, status: value }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="unsubscribed">Unsubscribed</SelectItem>
                    <SelectItem value="bounced">Bounced</SelectItem>
                    <SelectItem value="complained">Complained</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </AdminModalBody>
            <AdminModalFooter className="sm:justify-end">
              <Button type="button" variant="outline" onClick={onEditClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </Button>
            </AdminModalFooter>
          </form>
        </AdminModalContent>
      </Dialog>
    </>
  )
}
