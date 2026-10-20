import * as React from "react"
import { ExternalLinkIcon, Loader2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { openProjectTaskLink } from "@/lib/api/project/linked-records"
import type { TaskDetail } from "@/lib/api/project/tasks"
import { useSyncedDraft } from "@/lib/hooks/use-synced-draft"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { LINKED_ADDRESS_MAX, LINKED_APP_INFO } from "@/lib/project/linked-records"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * The task's Video or Promo record: a button, never the address
 * (`workspace/docs/connected-apps.md`). Pressing it asks Project's server for
 * a note that works once within 60 seconds, and opens the record with it in
 * a new tab. Everyone else on the task reads who can open it.
 */
export function TaskLinkButton({ detail }: { detail: TaskDetail }) {
  const [opening, setOpening] = React.useState(false)
  const { link } = detail
  if (!link) return null
  const info = LINKED_APP_INFO[link.app]

  if (!link.canOpen || !link.connected) {
    return (
      <p className="text-sm text-muted-foreground">
        {link.canOpen
          ? `This task points at a ${info.record}, but ${info.name} isn't connected to Project on this server yet.`
          : `This task points at a ${info.record}. Only the person assigned and the site admin can open it.`}
      </p>
    )
  }

  async function open() {
    // The tab opens on the press itself, so the browser doesn't take it for a
    // pop-up; it is pointed at the record once the note is made.
    const tab = window.open("", "_blank")
    if (tab) tab.opener = null
    setOpening(true)
    try {
      const { url } = await openProjectTaskLink(detail.task.id)
      if (tab) tab.location.href = url
      else window.location.assign(url)
    } catch (error) {
      tab?.close()
      showErrorToast(getProjectErrorMessage(error))
    } finally {
      setOpening(false)
    }
  }

  return (
    <div>
      <Button type="button" onClick={() => void open()} disabled={opening}>
        {opening ? <Loader2Icon className="size-4 animate-spin" /> : <ExternalLinkIcon className="size-4" />}
        {info.button}
      </Button>
    </div>
  )
}

/**
 * Where the site admin pastes the record's address. It saves when the box is
 * left or Enter is pressed; an empty box takes the record off the task.
 */
export function TaskLinkField({
  detail,
  onSave,
}: {
  detail: TaskDetail
  /** Saves the address and says whether it was taken. */
  onSave: (address: string) => Promise<boolean>
}) {
  const saved = detail.link?.address ?? ""
  const [draft, setDraft] = useSyncedDraft(saved)
  const [invalid, setInvalid] = React.useState(false)
  const id = `task-link-${detail.task.id}`

  async function commit() {
    const next = draft.trim()
    if (next === saved) return
    setInvalid(!(await onSave(next)))
  }

  return (
    <div className="grid gap-2">
      <FieldLabel
        htmlFor={id}
        hint="Paste the address from the browser while the video is open in Video's editor, or while the project is open in Promo. The person assigned then gets a button that opens it, signed in, without an account there."
      >
        Address
      </FieldLabel>
      <Input
        id={id}
        type="url"
        inputMode="url"
        placeholder="https://"
        value={draft}
        maxLength={LINKED_ADDRESS_MAX}
        aria-invalid={invalid || undefined}
        onChange={(event) => {
          setDraft(event.target.value)
          setInvalid(false)
        }}
        onBlur={() => void commit()}
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
