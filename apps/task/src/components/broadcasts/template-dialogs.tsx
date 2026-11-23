import * as React from "react"
import { toast } from "sonner"

import { NameDialog } from "@/components/shared/dashboard/name-dialog"
import {
  createBroadcastTemplate,
  getBroadcastErrorMessage,
} from "@/lib/api/email/broadcasts"
import type { BroadcastBlock } from "@/lib/broadcasts/blocks"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { plural } from "@/lib/format/plural"

export function SaveTemplateDialog({
  open,
  onOpenChange,
  blocks,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  blocks: BroadcastBlock[]
  /** Tells the Templates tab to go and fetch the list again. */
  onSaved: () => void
}) {
  const [name, setName] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  const [wasOpen, setWasOpen] = React.useState(false)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setName("")
    }
  }

  const submit = async () => {
    if (busy) return
    const trimmedName = name.trim()
    if (!trimmedName) {
      showErrorToast("Give the template a name first.")
      return
    }
    setBusy(true)
    dismissErrorToast()
    try {
      await createBroadcastTemplate(trimmedName, blocks)
      onSaved()
      onOpenChange(false)
      toast.success(`Saved “${trimmedName}”`)
    } catch (saveError) {
      showErrorToast(getBroadcastErrorMessage(saveError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <NameDialog
      open={open}
      title="Save this as a template"
      description={
        <>
          Keeps these {blocks.length} {plural(blocks.length, "block", "blocks")} so the
          next email can start from them.
        </>
      }
      cardTitle="Template details"
      inputId="template-name"
      value={name}
      onValueChange={setName}
      maxLength={120}
      placeholder="Weekly update"
      busy={busy}
      submitLabel="Save template"
      onSubmit={() => void submit()}
      onClose={() => onOpenChange(false)}
      className="sm:max-w-sm"
    />
  )
}
