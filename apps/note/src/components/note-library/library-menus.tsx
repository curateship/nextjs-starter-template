import * as React from "react"
import { Loader2Icon, PinIcon, PinOffIcon, Trash2Icon } from "lucide-react"

import { LibraryDot } from "@/components/note-library/library-dot"
import { PickGroup, PickMenuRow, PickRow } from "@/components/shared/notes/pick-rows"
import { MenuFooterButton, TabbedMenu } from "@/components/shared/notes/tabbed-menu"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  deleteLibraryRow,
  deleteLibraryTemplate,
  getLibraryErrorMessage,
  makeLibrary,
  pinLibraryRow,
  saveLibrary,
} from "@/lib/api/note/library"
import { plural } from "@/lib/format/plural"
import { quoteOneLine } from "@/lib/format/quote-text"
import {
  LIBRARY_COLOUR_LABEL,
  LIBRARY_COLOURS,
  LIBRARY_NAME_MAX,
  type LibraryColour,
  type LibraryRow,
  type TemplateSummary,
} from "@/lib/note/library/notes"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

/**
 * The menus of the Libraries block on the left page (Tyler, 15 Nov 2026: "I
 * think the library should live as a left panel dashboard block"): New
 * library, opened from the block's ⋮, and each library row's ⋮, the
 * tabbed settings menu every settings window in the design became (the Admin
 * 3 panel design, "Every settings window on the screen becomes one of
 * these"). Every field saves itself; there is no Save button.
 */

export function ColourSelect({
  id,
  value,
  onChange,
}: {
  id: string
  value: LibraryColour
  onChange: (colour: LibraryColour) => void
}) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as LibraryColour)}>
      <SelectTrigger id={id}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {LIBRARY_COLOURS.map((each) => (
          <SelectItem key={each} value={each}>
            <span className="flex items-center gap-2">
              <LibraryDot colour={each} />
              {LIBRARY_COLOUR_LABEL[each]}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/**
 * New library, from the Libraries block's ⋮ (Tyler, 15 Nov 2026: "all the +
 * icon must move into the dotted icon dropdown"), as the shell's Plans
 * block's New plan opens its window. The name, then the colour, and Create
 * library, which opens it. Closing keeps what was typed for next time.
 */
export function NewLibraryDialog({
  open,
  onClose,
  onMade,
}: {
  open: boolean
  onClose: () => void
  onMade: (row: LibraryRow) => void
}) {
  const [name, setName] = React.useState("")
  const [colour, setColour] = React.useState<LibraryColour>("blue")
  const [invalid, setInvalid] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  async function submit() {
    if (!name.trim()) {
      setInvalid(true)
      showErrorToast("Give the library a name")
      return
    }
    setBusy(true)
    try {
      const made = await makeLibrary({ name, colour })
      setName("")
      onClose()
      onMade(made)
    } catch (error) {
      setInvalid(true)
      showErrorToast(getLibraryErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onClose()
      }}
    >
      <DialogContent variant="admin">
        <form
          className="contents"
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <DialogHeader>
            <DialogTitle>New library</DialogTitle>
          </DialogHeader>
          <DialogBody className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="new-library-name">Name</Label>
              <Input
                id="new-library-name"
                autoFocus
                value={name}
                maxLength={LIBRARY_NAME_MAX}
                aria-invalid={invalid || undefined}
                placeholder="Content ideas"
                onChange={(event) => {
                  setName(event.target.value)
                  setInvalid(false)
                }}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="new-library-colour">Colour</Label>
              <ColourSelect id="new-library-colour" value={colour} onChange={setColour} />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" size="lg" disabled={busy} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="lg" disabled={busy}>
              {busy ? <Loader2Icon className="animate-spin" /> : null}
              Create library
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** A typed value that saves when the box is left or Enter is pressed, never on every key. */
function SavedField({
  id,
  label,
  value,
  max,
  onSave,
}: {
  id: string
  label: string
  value: string
  max: number
  onSave: (value: string) => Promise<boolean>
}) {
  const [text, setText] = React.useState(value)
  const [invalid, setInvalid] = React.useState(false)
  const [was, setWas] = React.useState(value)
  if (value !== was) {
    setWas(value)
    setText(value)
  }
  const save = async () => {
    if (text === value) return
    const ok = await onSave(text)
    setInvalid(!ok)
    if (!ok) setText(value)
  }
  const props = {
    id,
    value: text,
    maxLength: max,
    "aria-invalid": invalid || undefined,
    onBlur: () => void save(),
  }
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        {...props}
        autoFocus
        onChange={(event) => {
          setText(event.target.value)
          setInvalid(false)
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            event.currentTarget.blur()
          }
        }}
      />
    </div>
  )
}

/**
 * A library row's ⋮ in the Libraries block: General (its name and colour, the
 * two things the block shows) and Templates (the ones saved from its notes,
 * each with a bin), with Pin and Delete library under them. A description
 * and a picture showed only on the `/library` table, so they went with it
 * (Tyler, 15 Nov 2026: "most of the options here do not apply anymore since
 * we merge the library as one dashboard"); both stay stored. Deleting asks first,
 * says how many notes go with it, and deletes them for good.
 */
export function LibraryRowMenu({
  library,
  templates,
  onChanged,
  onDeleted,
}: {
  library: LibraryRow
  /** The templates of the library picked, or null for a library not picked, whose templates are not read. */
  templates: TemplateSummary[] | null
  onChanged: () => Promise<void> | void
  onDeleted: () => Promise<void> | void
}) {
  const [busy, setBusy] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)

  async function act(work: () => Promise<unknown>) {
    setBusy(true)
    dismissErrorToast()
    try {
      await work()
      return true
    } catch (error) {
      showErrorToast(getLibraryErrorMessage(error))
      return false
    } finally {
      setBusy(false)
    }
  }
  const change = (changes: Parameters<typeof saveLibrary>[1]) =>
    act(async () => {
      await saveLibrary(library.id, changes)
      await onChanged()
    })

  return (
    <>
      <TabbedMenu
        label={`Settings for ${library.name}`}
        align="start"
        width="20.4rem"
        tabs={[
          {
            value: "general",
            label: "General",
            content: (
              <div className="grid gap-3 p-3">
                <PickGroup title="Library">
                  <PickRow label="Name" value={library.name}>
                    <SavedField
                      id={`library-name-${library.id}`}
                      label="Name"
                      value={library.name}
                      max={LIBRARY_NAME_MAX}
                      onSave={(name) => {
                        if (!name.trim()) {
                          showErrorToast("Give the library a name")
                          return Promise.resolve(false)
                        }
                        return change({ name })
                      }}
                    />
                  </PickRow>
                  <PickMenuRow
                    label="Colour"
                    value={
                      <span className="flex items-center gap-2">
                        <LibraryDot colour={library.colour} />
                        {LIBRARY_COLOUR_LABEL[library.colour]}
                      </span>
                    }
                    selected={library.colour}
                    options={LIBRARY_COLOURS.map((each) => ({
                      value: each,
                      label: (
                        <span className="flex items-center gap-2">
                          <LibraryDot colour={each} />
                          {LIBRARY_COLOUR_LABEL[each]}
                        </span>
                      ),
                    }))}
                    onPick={(colour) => void change({ colour: colour as LibraryColour })}
                  />
                </PickGroup>
              </div>
            ),
            footer: (
              <div className="grid">
                <MenuFooterButton
                  icon={library.pinned ? <PinOffIcon /> : <PinIcon />}
                  disabled={busy}
                  onClick={() =>
                    void act(async () => {
                      await pinLibraryRow(library.id, !library.pinned)
                      await onChanged()
                    })
                  }
                >
                  {library.pinned ? "Unpin from the top" : "Pin to the top"}
                </MenuFooterButton>
                <MenuFooterButton icon={<Trash2Icon className="text-destructive" />} disabled={busy} onClick={() => setDeleting(true)}>
                  <span className="text-destructive">Delete library</span>
                </MenuFooterButton>
              </div>
            ),
          },
          {
            value: "templates",
            label: "Templates",
            content: (
              <div className="grid gap-3 p-3">
                {templates === null ? (
                  <p className="px-0.5 text-sm text-muted-foreground">Open this library to see its templates.</p>
                ) : templates.length ? (
                  <PickGroup title="Templates">
                    {templates.map((template) => (
                      <div key={template.id} className="flex min-h-11 items-center gap-2 px-3 text-sm">
                        <span className="min-w-0 flex-1 truncate">{template.name}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Delete the template ${template.name}`}
                          disabled={busy}
                          onClick={() =>
                            void act(async () => {
                              await deleteLibraryTemplate(template.id)
                              await onChanged()
                            })
                          }
                        >
                          <Trash2Icon className="size-4" />
                        </Button>
                      </div>
                    ))}
                  </PickGroup>
                ) : (
                  <p className="px-0.5 text-sm text-muted-foreground">No templates yet. A note's ⋮ has Save as template.</p>
                )}
              </div>
            ),
          },
        ]}
      />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete ${quoteOneLine(library.name)}?`}
        description={
          library.noteCount
            ? `Its ${library.noteCount.toLocaleString()} ${plural(library.noteCount, "note")} go with it, for good, with their saved videos.`
            : "It holds no notes, so nothing else goes."
        }
        confirmLabel="Delete library"
        loading={busy}
        onConfirm={() =>
          void act(async () => {
            await deleteLibraryRow(library.id)
            setDeleting(false)
            await onDeleted()
          })
        }
      />
    </>
  )
}
