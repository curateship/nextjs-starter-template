import * as React from "react"
import { Loader2Icon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { ColourSelect } from "@/components/note-library/libraries-page"
import { ImageUpload } from "@/components/shared/image-upload"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FormDialog } from "@/components/ui/form-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { deleteLibraryTemplate, getLibraryErrorMessage, saveLibrary } from "@/lib/api/note/library"
import { quoteOneLine } from "@/lib/format/quote-text"
import {
  LIBRARY_DESCRIPTION_MAX,
  LIBRARY_NAME_MAX,
  type LibraryColour,
  type LibraryRow,
  type TemplateSummary,
} from "@/lib/note/library/notes"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

/**
 * A library's settings, from the cog on its row or in its dashboard's header:
 * its name, description and colour, its picture and banner (drawn as a
 * Project's are, UI standard), and, from the dashboard, its templates.
 */
export function LibrarySettingsDialog({
  library,
  templates,
  open,
  onClose,
  onSaved,
}: {
  library: LibraryRow
  /** The library's templates, or null where they are not loaded (the list screen). */
  templates: TemplateSummary[] | null
  open: boolean
  onClose: () => void
  onSaved: () => Promise<void> | void
}) {
  const [name, setName] = React.useState(library.name)
  const [description, setDescription] = React.useState(library.description)
  const [colour, setColour] = React.useState<LibraryColour>(library.colour)
  const [avatarUrl, setAvatarUrl] = React.useState(library.avatarUrl ?? "")
  const [bannerUrl, setBannerUrl] = React.useState(library.bannerUrl ?? "")
  const [invalid, setInvalid] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [removing, setRemoving] = React.useState<string | null>(null)

  const dirty =
    name !== library.name ||
    description !== library.description ||
    colour !== library.colour ||
    avatarUrl !== (library.avatarUrl ?? "") ||
    bannerUrl !== (library.bannerUrl ?? "")

  async function save() {
    if (!name.trim()) {
      setInvalid(true)
      showErrorToast("Give the library a name")
      return
    }
    setSaving(true)
    dismissErrorToast()
    try {
      await saveLibrary(library.id, {
        name,
        description,
        colour,
        avatarUrl: avatarUrl || null,
        bannerUrl: bannerUrl || null,
      })
      await onSaved()
      toast.success("Saved.")
      setSaving(false)
      // Saved, so nothing is left to ask about: the window shuts straight away.
      onClose()
    } catch (error) {
      setSaving(false)
      setInvalid(true)
      showErrorToast(getLibraryErrorMessage(error))
    }
  }

  async function removeTemplate(template: TemplateSummary) {
    setRemoving(template.id)
    dismissErrorToast()
    try {
      await deleteLibraryTemplate(template.id)
      await onSaved()
      toast.success(`Deleted the template ${quoteOneLine(template.name)}.`)
    } catch (error) {
      showErrorToast(getLibraryErrorMessage(error))
    } finally {
      setRemoving(null)
    }
  }

  return (
    <FormDialog open={open} dirty={dirty} busy={saving} onClose={onClose}>
      {(requestClose) => (
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>Library settings</DialogTitle>
            <DialogDescription>Only you see this library and the notes in it.</DialogDescription>
          </DialogHeader>
          <DialogBody className="grid gap-6">
            <Card size="sm">
              <CardHeader>
                <CardTitle>Details</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="library-settings-name">Name</Label>
                  <Input
                    id="library-settings-name"
                    value={name}
                    maxLength={LIBRARY_NAME_MAX}
                    aria-invalid={invalid || undefined}
                    onChange={(event) => {
                      setName(event.target.value)
                      setInvalid(false)
                    }}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="library-settings-description">Description</Label>
                  <Textarea
                    id="library-settings-description"
                    rows={1}
                    value={description}
                    maxLength={LIBRARY_DESCRIPTION_MAX}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="library-settings-colour">Colour</Label>
                  <ColourSelect id="library-settings-colour" value={colour} onChange={setColour} />
                </div>
              </CardContent>
            </Card>
            <Card size="sm">
              <CardHeader>
                <CardTitle>Pictures</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-[8rem_minmax(0,1fr)]">
                <ImageUpload label="Picture" aspect="square" value={avatarUrl} onChange={setAvatarUrl} />
                <ImageUpload label="Banner" value={bannerUrl} onChange={setBannerUrl} />
              </CardContent>
            </Card>
            {templates ? (
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Templates</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-2">
                  {templates.length ? (
                    <ul className="grid gap-1">
                      {templates.map((template) => (
                        <li key={template.id} className="flex items-center gap-2 text-sm">
                          <span className="min-w-0 flex-1 truncate">{template.name}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Delete the template ${template.name}`}
                            disabled={removing !== null}
                            onClick={() => void removeTemplate(template)}
                          >
                            {removing === template.id ? <Loader2Icon className="animate-spin" /> : <Trash2Icon />}
                          </Button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No templates yet. A note's menu has Save as template.
                    </p>
                  )}
                </CardContent>
              </Card>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" size="lg" disabled={saving} onClick={requestClose}>
              Cancel
            </Button>
            <Button type="button" size="lg" disabled={saving} onClick={() => void save()}>
              {saving ? <Loader2Icon className="animate-spin" /> : null}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </FormDialog>
  )
}
