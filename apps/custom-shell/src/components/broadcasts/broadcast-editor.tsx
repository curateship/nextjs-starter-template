import * as React from "react"
import { SendIcon } from "lucide-react"

import {
  EmailBlockEditor,
  type EmailEditableFields,
} from "@/components/broadcasts/email-block-editor"
import { BroadcastStatusPanel } from "@/components/broadcasts/broadcast-status-panel"
import { SendBroadcastDialog } from "@/components/broadcasts/send-broadcast-dialog"
import { InspectorCard } from "@/components/broadcasts/inspector-fields"
import { Button } from "@/components/ui/button"
import {
  getBroadcast,
  updateBroadcast,
  type BroadcastDetail,
} from "@/lib/api/email/broadcasts"
import {
  describeAudienceFilter,
  type BroadcastBlockDefaults,
} from "@/lib/broadcasts/blocks"

/** How often a send in flight refreshes its counts. */
const POLL_MS = 5000
/** How often to look while a paced send is waiting out its gap between batches. */
const SLEEPING_POLL_MS = 30_000

const EDITABLE_STATUSES = new Set(["draft", "scheduled", "paused"])

function fieldsFromDetail(detail: BroadcastDetail): EmailEditableFields {
  return {
    subject: detail.subject,
    preheader: detail.preheader,
    fromName: detail.fromName ?? "",
    blocks: detail.blocks,
  }
}

/**
 * The newsletter editor.
 *
 * The editing itself — blocks, canvas, options, auto-save — is
 * `EmailBlockEditor`, which the app's own emails use too. What is left here is
 * everything only a newsletter has: who it goes to, when it goes, and how far
 * along the send is.
 */
export function BroadcastEditor({
  initial,
  initialBlockDefaults,
}: {
  initial: BroadcastDetail
  initialBlockDefaults: BroadcastBlockDefaults
}) {
  const [broadcast, setBroadcast] = React.useState(initial)
  const [sendOpen, setSendOpen] = React.useState(false)
  const [fields, setFields] = React.useState<EmailEditableFields>(() =>
    fieldsFromDetail(initial)
  )
  // Bumped only when the boxes really must be refilled from the server — after
  // a send finishes, or after the dialog changes something. Never on an
  // ordinary save, which would fight whatever is being typed.
  const [fieldsVersion, setFieldsVersion] = React.useState(0)

  const editable = EDITABLE_STATUSES.has(broadcast.status)

  const save = React.useCallback(
    async (next: EmailEditableFields) => {
      const detail = await updateBroadcast({
        broadcastId: initial.id,
        subject: next.subject,
        preheader: next.preheader,
        fromName: next.fromName.trim() || null,
        blocks: next.blocks,
      })
      // Only the record, not the boxes: the server hands back cleaned-up
      // markup, and adopting that would move the cursor mid-sentence.
      setBroadcast(detail)
    },
    [initial.id]
  )

  /** Takes the server's copy as the truth, boxes and all. */
  const adoptDetail = React.useCallback((detail: BroadcastDetail) => {
    setBroadcast(detail)
    setFields(fieldsFromDetail(detail))
    setFieldsVersion((current) => current + 1)
  }, [])

  // While a send is running or waiting for its time, keep the bottom panel
  // honest. The boxes are only refilled once the status leaves the editable
  // set — otherwise this would clobber unsaved edits every five seconds.
  //
  // A paced send is a different rhythm: asleep until tomorrow morning, there is
  // nothing to see, and asking twelve times a minute all night is twelve
  // thousand pointless requests. Once the next batch is more than a minute
  // away, back off.
  const nextBatchAt = broadcast.next_batch_at
  React.useEffect(() => {
    if (broadcast.status !== "sending" && broadcast.status !== "scheduled") {
      return
    }
    const waiting =
      nextBatchAt !== null &&
      new Date(nextBatchAt).getTime() - Date.now() > 60_000
    const timer = setInterval(() => {
      getBroadcast(broadcast.id)
        .then((detail) => {
          if (EDITABLE_STATUSES.has(detail.status)) setBroadcast(detail)
          else adoptDetail(detail)
        })
        .catch(() => {
          // A blip; the next poll tries again.
        })
    }, waiting ? SLEEPING_POLL_MS : POLL_MS)
    return () => clearInterval(timer)
  }, [adoptDetail, broadcast.id, broadcast.status, nextBatchAt])

  return (
    <>
      <EmailBlockEditor
        title={broadcast.name}
        fields={fields}
        fieldsVersion={fieldsVersion}
        initialBlockDefaults={initialBlockDefaults}
        editable={editable}
        onSave={save}
        settingsExtra={
          <InspectorCard title="Who gets it">
            <p className="text-[15px]">
              {describeAudienceFilter(broadcast.audienceFilter)}
            </p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Change this on the way out, in Review and send.
            </p>
          </InspectorCard>
        }
        headerAction={(saveNow) =>
          broadcast.status === "draft" || broadcast.status === "scheduled" ? (
            <Button
              type="button"
              onClick={() => {
                void saveNow().then(() => setSendOpen(true))
              }}
            >
              <SendIcon className="size-4" />
              Review and send
            </Button>
          ) : null
        }
        bottomPanel={
          <BroadcastStatusPanel broadcast={broadcast} onUpdated={adoptDetail} />
        }
      />

      <SendBroadcastDialog
        open={sendOpen}
        onOpenChange={setSendOpen}
        broadcast={broadcast}
        onUpdated={adoptDetail}
      />
    </>
  )
}
