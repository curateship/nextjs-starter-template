import * as React from "react"
import { Loader2Icon, PlusIcon } from "lucide-react"

import { EventSubmissionFields } from "@/components/events/public/event-submission-form"
import { useEventSubmission } from "@/components/events/public/use-event-submission"
import { Button } from "@/components/ui/button"
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FormDialog } from "@/components/ui/form-dialog"
import {
  getEventSubmissionErrorMessage,
  loadEventSubmissionForm,
  type EventSubmissionForm as FormInfo,
} from "@/lib/api/events/submissions"
import { LoadingRow } from "@/components/ui/loading-row"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * "Suggest an event" on the Events page, and the window behind it.
 *
 * A window rather than a page, because somebody who has just read what is on
 * and found their own event missing should not lose the list to fill in a
 * form. Closing the window puts them back where they were, with the same
 * filters still on. Tyler asked for this on 25 Sep 2026.
 *
 * `/add-event` is still a page of its own, with its own switch in Settings →
 * Pages and its own address to link to or share. The window draws the same
 * boxes from `EventSubmissionFields`, so the two can never ask for different
 * things.
 *
 * What the form needs to draw — the site's name, its time zone, its today and
 * whether photos can be sent — is asked for when the button is pressed rather
 * than with the Events page, so a visitor who never suggests anything never
 * pays for it.
 */
/** Names the form so the footer's Send button can submit it from outside. */
const SUGGEST_FORM_ID = "suggest-event-form"

export function SuggestEventButton() {
  const [open, setOpen] = React.useState(false)
  const [form, setForm] = React.useState<FormInfo | null>(null)
  const [loading, setLoading] = React.useState(false)

  async function openIt() {
    setOpen(true)
    if (form || loading) return
    setLoading(true)
    try {
      const answer = await loadEventSubmissionForm()
      // Null means the page was switched off between drawing the button and
      // pressing it. The form is no use then, so the window goes.
      if (!answer) {
        setOpen(false)
        showErrorToast("Suggesting an event is switched off on this site.")
        return
      }
      setForm(answer)
    } catch (error) {
      setOpen(false)
      showErrorToast(getEventSubmissionErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button type="button" variant="outline" onClick={() => void openIt()}>
        <PlusIcon aria-hidden="true" />
        Suggest an event
      </Button>
      {form ? (
        <SuggestEventDialog
          open={open}
          form={form}
          onClose={() => setOpen(false)}
        />
      ) : (
        <LoadingDialog open={open} onClose={() => setOpen(false)} />
      )}
    </>
  )
}

/** The window while the form's own words are still on their way. */
function LoadingDialog({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  return (
    <FormDialog open={open} dirty={false} onClose={onClose}>
      {() => (
        <DialogContent variant="admin" className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Suggest an event</DialogTitle>
            <DialogDescription>
              Somebody reads every suggestion before it appears.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <LoadingRow label="Opening the form…" />
          </DialogBody>
        </DialogContent>
      )}
    </FormDialog>
  )
}

function SuggestEventDialog({
  open,
  form,
  onClose,
}: {
  open: boolean
  form: FormInfo
  onClose: () => void
}) {
  const box = useEventSubmission(form)
  const { values, sending, sent } = box

  return (
    <FormDialog
      open={open}
      // Only while there is something to lose. A window opened and shut
      // without a word typed in it closes on the first press.
      dirty={box.dirty && !sent}
      busy={sending}
      onClose={onClose}
    >
      {(requestClose) => (
        <DialogContent variant="admin" className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{sent ? "Thank you" : "Suggest an event"}</DialogTitle>
            <DialogDescription>
              {sent
                ? `${values.title.trim()} went to ${form.siteName}.`
                : `Somebody reads every suggestion before it appears on ${form.siteName}.`}
            </DialogDescription>
          </DialogHeader>

          <DialogBody>
            {sent ? (
              <p className="text-sm text-muted-foreground">
                You will get an email at {values.submitterEmail.trim()} once it
                has been looked at. Nothing shows on the site until somebody
                there has read it.
              </p>
            ) : (
              /* The window's own form, so Enter sends it from whichever box
                 the visitor is in. The cards take the window's own spacing,
                 the same as every other form window in the app. */
              <form
                id={SUGGEST_FORM_ID}
                noValidate
                // `relative` pins the form's hidden bot box to this form rather than to
                // the window, which keeps it off-screen and out of the way either way.
                className="relative grid gap-[var(--shell-modal-padding,1.5rem)]"
                onSubmit={(event) => {
                  event.preventDefault()
                  void box.send()
                }}
              >
                <EventSubmissionFields
                  box={box}
                  form={form}
                  size="sm"
                  showIntro={false}
                />
              </form>
            )}
          </DialogBody>

          <DialogFooter>
            {sent ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={box.startAgain}
                >
                  Suggest another event
                </Button>
                <Button type="button" onClick={onClose}>
                  Done
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  disabled={sending}
                  onClick={requestClose}
                >
                  Cancel
                </Button>
                {/* Stays enabled while empty: the boxes say what is missing
                    when it is pressed, which a greyed-out button never does. */}
                <Button type="submit" form={SUGGEST_FORM_ID} disabled={sending}>
                  {sending ? (
                    <Loader2Icon className="animate-spin" aria-hidden="true" />
                  ) : null}
                  Send suggestion
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      )}
    </FormDialog>
  )
}
