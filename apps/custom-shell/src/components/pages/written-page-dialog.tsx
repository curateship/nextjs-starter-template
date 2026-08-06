import * as React from "react"

import { DocumentEditor } from "@/components/shared/rich-text-editor"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FieldLabel } from "@/components/ui/field-label"
import { FormDialog } from "@/components/ui/form-dialog"
import { Input } from "@/components/ui/input"
import {
  getWrittenPageErrorMessage,
  saveNewWrittenPage,
  saveWrittenPage,
  type WrittenPage,
} from "@/lib/api/pages"
import { dismissErrorToast, showErrorToast } from "@/lib/error-toast"
import {
  emptyWrittenPageBody,
  type WrittenPageNode,
} from "@/lib/pages/written-page-body"

/**
 * Writing a page: a title, an address and the words.
 *
 * **Three fields, and it stays three fields.** This is the one deliberate step
 * past "public pages are code", and the moment it grows sections, layout
 * choices or components it has become the block builder the app decided
 * against. A page that needs more than this gets written as code instead.
 */
export function WrittenPageDialog({
  open,
  page,
  onClose,
  onSaved,
}: {
  open: boolean
  /** The page being edited, or null when writing a new one. */
  page: WrittenPage | null
  onClose: () => void
  onSaved: () => void
}) {
  const [title, setTitle] = React.useState("")
  const [path, setPath] = React.useState("")
  const [body, setBody] = React.useState<WrittenPageNode>(emptyWrittenPageBody())
  const [saving, setSaving] = React.useState(false)

  // Reset to whatever the window was opened on, so a second open never shows
  // the last one's words.
  const [openedFor, setOpenedFor] = React.useState<string | null>(null)
  const key = open ? (page?.id ?? "new") : null
  if (openedFor !== key) {
    setOpenedFor(key)
    setTitle(page?.title ?? "")
    setPath(page?.path ?? "")
    setBody(page?.body ?? emptyWrittenPageBody())
  }

  const dirty =
    title !== (page?.title ?? "") ||
    path !== (page?.path ?? "") ||
    JSON.stringify(body) !== JSON.stringify(page?.body ?? emptyWrittenPageBody())

  async function save() {
    dismissErrorToast()
    setSaving(true)
    try {
      if (page) {
        await saveWrittenPage({ id: page.id, title, path, body })
      } else {
        await saveNewWrittenPage({ title, path, body })
      }
      onSaved()
    } catch (error) {
      // The server's refusals are already sentences an admin can act on —
      // "Pricing already answers on /pricing" — so they are shown as-is.
      showErrorToast(getWrittenPageErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <FormDialog open={open} dirty={dirty} busy={saving} onClose={onClose}>
      {(requestClose) => (
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>{page ? "Edit page" : "Write a page"}</DialogTitle>
            <DialogDescription>
              A title, an address and the words. Anything more involved is
              better written as code.
            </DialogDescription>
          </DialogHeader>

          <DialogBody>
            <Card size="sm">
              <CardHeader>
                <CardTitle>The page</CardTitle>
                <CardDescription>
                  The address is what visitors type, and it has to be free.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-2">
                  <FieldLabel
                    htmlFor="written-page-title"
                    hint="Shown as the heading at the top of the page."
                  >
                    Title
                  </FieldLabel>
                  <Input
                    id="written-page-title"
                    value={title}
                    disabled={saving}
                    onChange={(event) => setTitle(event.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <FieldLabel
                    htmlFor="written-page-path"
                    hint="Letters, numbers and dashes, like /about-us. It cannot be an address a built-in page already uses."
                  >
                    Address
                  </FieldLabel>
                  <Input
                    id="written-page-path"
                    value={path}
                    placeholder="/about"
                    disabled={saving}
                    onChange={(event) => setPath(event.target.value)}
                  />
                </div>
              </CardContent>
            </Card>

            <Card size="sm">
              <CardHeader>
                <CardTitle>Words</CardTitle>
                <CardDescription>
                  Headings, lists, links and emphasis. No pictures and no
                  layout — those are what a coded page is for.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <DocumentEditor
                  value={body}
                  disabled={saving}
                  onChange={setBody}
                />
              </CardContent>
            </Card>
          </DialogBody>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={requestClose}
            >
              Cancel
            </Button>
            <Button type="button" disabled={saving} onClick={() => void save()}>
              {page ? "Save changes" : "Create page"}
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </FormDialog>
  )
}
