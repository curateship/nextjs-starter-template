import * as React from "react"

import { ImageUpload } from "@/components/shared/image-upload"
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
import { Textarea } from "@/components/ui/textarea"
import {
  getWrittenPageErrorMessage,
  saveNewWrittenPage,
  type WrittenPage,
} from "@/lib/api/content/pages"
import { MAX_WRITTEN_PAGE_DESCRIPTION } from "@/lib/pages/front-page"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

/**
 * Adding a page: a name, an address, and a picture if the page wants one.
 *
 * **What the page holds is not asked here.** Every page an admin adds is built
 * from blocks, like the front page, so creating one drops them into the editor
 * with an empty block of words waiting. Tyler's call on 4 Oct 2026, after
 * finding that a page he had written could not be given a hero.
 *
 * **The picture is the exception, and it is optional.** It belongs to the page
 * rather than to anything on it, like the name and the address beside it, and
 * the same field is in the editor's Page settings panel afterwards. Choosing
 * it here only saves opening that panel straight away.
 *
 * The page's own settings — its name, its address, and what search engines are
 * told about it — are edited in that editor's right-hand panel, which is where
 * every page's settings live. Keeping a second copy of them here would be two
 * screens that can disagree about one page.
 */
export function WrittenPageDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  /** Handed the new page, so the caller can open it in the editor. */
  onCreated: (page: WrittenPage) => void
}) {
  const [title, setTitle] = React.useState("")
  const [path, setPath] = React.useState("")
  const [image, setImage] = React.useState("")
  const [imageAlt, setImageAlt] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [saving, setSaving] = React.useState(false)

  // Reset on every open, so a second open never shows the last one's words.
  const [wasOpen, setWasOpen] = React.useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    setTitle("")
    setPath("")
    setImage("")
    setImageAlt("")
    setDescription("")
  }

  const dirty =
    title.trim() !== "" ||
    path.trim() !== "" ||
    image !== "" ||
    description.trim() !== ""

  async function create() {
    dismissErrorToast()
    setSaving(true)
    try {
      onCreated(
        await saveNewWrittenPage({ title, path, image, imageAlt, description })
      )
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
            <DialogTitle>Add a page</DialogTitle>
            <DialogDescription>
              A name, an address, and a picture if you want one. What goes on
              the page comes next, in the editor.
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
                    hint="What the page is called in this list and in the browser tab."
                  >
                    Name
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
                <div className="grid gap-2">
                  <FieldLabel
                    htmlFor="written-page-description"
                    hint="Optional. A line or two about the page. It is shown under the page's name on any Pages list that lists it, and search engines are told it too."
                  >
                    Description
                  </FieldLabel>
                  <Textarea
                    id="written-page-description"
                    rows={2}
                    value={description}
                    maxLength={MAX_WRITTEN_PAGE_DESCRIPTION}
                    disabled={saving}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </div>
                <ImageUpload
                  label="Picture"
                  hint="Optional. It is drawn at the top of the page, above everything on it, and Page settings can change it or take it off later."
                  value={image}
                  aspect="square"
                  fit="cover"
                  emptyLabel="Add picture"
                  className="max-w-24"
                  disabled={saving}
                  onChange={(picked, altText) => {
                    setImage(picked)
                    // The library's own name for the file is what a screen
                    // reader says, so nobody is asked to type one here.
                    setImageAlt(altText ?? "")
                  }}
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
            <Button
              type="button"
              disabled={saving}
              onClick={() => void create()}
            >
              Create page
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </FormDialog>
  )
}
