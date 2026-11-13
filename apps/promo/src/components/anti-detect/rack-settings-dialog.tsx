import * as React from "react"

import { RackNotes } from "@/components/phones/rack-notes"
import { usePromoSaveStatus } from "@/components/social/guest/guest-mode"
import { DocumentEditor } from "@/components/shared/rich-text-editor"
import { Button } from "@/components/ui/button"
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getPhoneErrorMessage, saveRack, type RackView } from "@/lib/api/phones/phones"
import type { WrittenPageNode } from "@/lib/pages/written-page-body"
import { RACK_NAME_MAX } from "@/lib/phones/options"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

/** A typed field saves this long after the last letter, as every setting does. */
const SAVE_AFTER_MS = 700

/**
 * One rack's settings, opened from the Racks block's ⋮ for the rack picked
 * (Tyler, 12 Nov 2026: a rack has no page of its own any more): its name, its
 * description and its "/" notes, each saving itself as it is written, with
 * Saving… and Saved in the page header. Done closes it; there is no Save.
 */
export function RackSettingsDialog({
  rack,
  onClose,
  onChanged,
}: {
  rack: RackView
  onClose: () => void
  onChanged: () => Promise<void>
}) {
  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>{rack.name}</DialogTitle>
          <DialogDescription>Each field saves as it is written.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="grid gap-6">
            <div className="grid gap-2">
              <Label htmlFor="rack-name">Name</Label>
              <RackNameField rack={rack} onSaved={onChanged} />
            </div>
            <div className="grid gap-2">
              <Label>Description</Label>
              <RackDescription rackId={rack.id} description={rack.description} onSaved={onChanged} />
            </div>
            <div className="grid gap-2">
              <Label>Notes</Label>
              <div className="min-h-48 rounded-md border">
                <RackNotes rackId={rack.id} stored={rack.notes} />
              </div>
            </div>
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

/** The name, saving 700ms after the last key, on Enter, and at once when the box is left. */
function RackNameField({ rack, onSaved }: { rack: RackView; onSaved: () => Promise<void> }) {
  const [name, setName] = React.useState(rack.name)
  const [invalid, setInvalid] = React.useState(false)
  const setSaveStatus = usePromoSaveStatus()
  const saved = React.useRef(rack.name)
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const save = React.useCallback(
    async (next: string) => {
      if (timer.current) clearTimeout(timer.current)
      const clean = next.trim()
      if (clean === saved.current) return
      if (!clean) {
        setInvalid(true)
        showErrorToast("A rack needs a name. What was there before is kept until you type one.")
        return
      }
      setSaveStatus("saving")
      dismissErrorToast()
      try {
        await saveRack({ rackId: rack.id, name: clean })
        saved.current = clean
        setSaveStatus("saved")
        await onSaved()
      } catch (failure) {
        setInvalid(true)
        setSaveStatus("idle")
        showErrorToast(getPhoneErrorMessage(failure))
      }
    },
    [onSaved, rack.id, setSaveStatus]
  )

  return (
    <Input
      id="rack-name"
      value={name}
      maxLength={RACK_NAME_MAX}
      aria-invalid={invalid || undefined}
      onChange={(event) => {
        const next = event.target.value
        setName(next)
        setInvalid(false)
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => void save(next), SAVE_AFTER_MS)
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") void save(name)
      }}
      onBlur={() => void save(name)}
    />
  )
}

/**
 * The description, in the shared editor, saving 700ms after the last letter
 * and when it is left. While it is open it is never drawn again from what was
 * saved, so a late save can't take back what was just written.
 */
function RackDescription({
  rackId,
  description,
  onSaved,
}: {
  rackId: string
  description: WrittenPageNode
  onSaved: () => Promise<void>
}) {
  const [start] = React.useState(description)
  const setSaveStatus = usePromoSaveStatus()
  const draft = React.useRef<WrittenPageNode | null>(null)
  const timer = React.useRef(0)
  const savedRef = React.useRef(onSaved)
  React.useEffect(() => {
    savedRef.current = onSaved
  })

  const flush = React.useCallback(() => {
    window.clearTimeout(timer.current)
    const next = draft.current
    if (!next) return
    draft.current = null
    setSaveStatus("saving")
    saveRack({ rackId, description: next })
      .then(() => {
        setSaveStatus("saved")
        return savedRef.current()
      })
      .catch((failure: unknown) => {
        // Kept to try again with the next letter or when the box is left.
        draft.current ??= next
        setSaveStatus("idle")
        showErrorToast(getPhoneErrorMessage(failure))
      })
  }, [rackId, setSaveStatus])

  // Closing the window saves what was typed.
  React.useEffect(() => flush, [flush])

  return (
    <div
      onBlur={(event) => {
        const next = event.relatedTarget
        // The link box sits outside the writing area.
        if (next instanceof Element && (event.currentTarget.contains(next) || next.closest("[data-radix-popper-content-wrapper], [data-slot=popover-content]"))) {
          return
        }
        flush()
      }}
    >
      <DocumentEditor
        value={start}
        placeholder="Describe this rack: where it is, whose internet it uses, what it is for."
        onChange={(body) => {
          draft.current = body
          dismissErrorToast()
          window.clearTimeout(timer.current)
          timer.current = window.setTimeout(flush, SAVE_AFTER_MS)
        }}
      />
    </div>
  )
}
