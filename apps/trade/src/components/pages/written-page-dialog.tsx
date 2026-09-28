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
import { Switch } from "@/components/ui/switch"
import {
  getWrittenPageErrorMessage,
  saveNewWrittenPage,
  saveWrittenPage,
  type WrittenPage,
} from "@/lib/api/content/pages"
import {
  canonicalUrlProblem,
  MAX_CANONICAL_URL_LENGTH,
} from "@/lib/pages/page-indexing"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import {
  emptyWrittenPageBody,
  type WrittenPageNode,
} from "@/lib/pages/written-page-body"

/**
 * Writing a page: a title, an address, the words, and how search engines
 * should treat it.
 *
 * **The words stay one plain body, and that is the line.** This is the one
 * deliberate step past "public pages are code", and the moment the body grows
 * sections, layout choices or components it has become the block builder the
 * app decided against. A page that needs more than this gets written as code
 * instead.
 *
 * The search-engine card is not that. It says nothing about what the page
 * looks like. It is two instructions handed to Google about one address, and
 * both are tags in the page head rather than anything a visitor sees.
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
  const [hiddenFromSearch, setHiddenFromSearch] = React.useState(false)
  const [canonicalUrl, setCanonicalUrl] = React.useState("")
  const [canonicalInvalid, setCanonicalInvalid] = React.useState(false)
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
    setHiddenFromSearch(page?.hiddenFromSearch ?? false)
    setCanonicalUrl(page?.canonicalUrl ?? "")
    setCanonicalInvalid(false)
  }

  const dirty =
    title !== (page?.title ?? "") ||
    path !== (page?.path ?? "") ||
    hiddenFromSearch !== (page?.hiddenFromSearch ?? false) ||
    canonicalUrl !== (page?.canonicalUrl ?? "") ||
    JSON.stringify(body) !== JSON.stringify(page?.body ?? emptyWrittenPageBody())

  function checkCanonical() {
    const problem = canonicalUrlProblem(canonicalUrl)
    setCanonicalInvalid(Boolean(problem))
    return problem
  }

  async function save() {
    dismissErrorToast()

    // Checked here rather than dropped on the server, which would store empty
    // and leave the admin thinking the address they typed had been saved.
    const problem = checkCanonical()
    if (problem) {
      showErrorToast(problem)
      return
    }

    setSaving(true)
    try {
      if (page) {
        await saveWrittenPage({
          id: page.id,
          title,
          path,
          body,
          hiddenFromSearch,
          canonicalUrl,
        })
      } else {
        await saveNewWrittenPage({
          title,
          path,
          body,
          hiddenFromSearch,
          canonicalUrl,
        })
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
              A title, an address, the words, and what search engines are told
              about it. Anything more involved is better written as code.
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

            <Card size="sm">
              <CardHeader>
                <CardTitle>Search engines</CardTitle>
                <CardDescription>
                  What Google is told about this address. Neither setting
                  locks the page. Anyone with the link can still open it.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="flex items-center justify-between gap-4">
                  <FieldLabel
                    htmlFor="written-page-hidden-from-search"
                    hint="The page drops out of the sitemap and asks search engines not to list it. It stays open to anyone who has the link, which is what a thank-you page wants."
                  >
                    Hide from search engines
                  </FieldLabel>
                  <Switch
                    id="written-page-hidden-from-search"
                    checked={hiddenFromSearch}
                    disabled={saving}
                    onCheckedChange={setHiddenFromSearch}
                  />
                </div>
                <div className="grid gap-2">
                  <FieldLabel
                    htmlFor="written-page-canonical"
                    hint="Only needed when the same words answer on two addresses. Name the one that counts and search engines credit it instead of splitting between them. Leave it empty and this page counts as itself."
                  >
                    Canonical address
                  </FieldLabel>
                  <Input
                    id="written-page-canonical"
                    value={canonicalUrl}
                    placeholder={path || "/about"}
                    maxLength={MAX_CANONICAL_URL_LENGTH}
                    disabled={saving}
                    aria-invalid={canonicalInvalid}
                    onChange={(event) => {
                      setCanonicalUrl(event.target.value)
                      setCanonicalInvalid(false)
                    }}
                    onBlur={checkCanonical}
                  />
                </div>
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
