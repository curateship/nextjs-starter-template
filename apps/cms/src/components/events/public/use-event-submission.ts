import * as React from "react"

import {
  getEventSubmissionErrorMessage,
  submitEvent,
  type EventSubmissionForm as FormInfo,
} from "@/lib/api/events/submissions"
import {
  emptyEventSubmission,
  eventSubmissionProblems,
  type EventSubmissionField,
} from "@/lib/events/event-submission-fields"
import { dayForPicker, dayFromPicker } from "@/lib/events/picker-day"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

/**
 * Everything the Suggest an event form holds and does, without any of its
 * markup: the answers, the picture, the problems, and sending them.
 *
 * A hook rather than one component because the form is drawn in two places
 * now. `EventSubmissionForm` below draws it as the /add-event page, and
 * `SuggestEventButton` draws the same boxes inside a window on the Events
 * page. Written twice, the two would disagree about what is required, and the
 * server would refuse one of them.
 *
 * The answers are checked by `eventSubmissionProblems`, the same check the
 * server runs, so the form and the server never disagree. A problem shows
 * under its box once the box is left, and all of them show when Send is
 * pressed, which stays enabled throughout.
 */
export function useEventSubmission(form: FormInfo) {
  const [values, setValues] = React.useState(emptyEventSubmission())
  const [photo, setPhoto] = React.useState<File | null>(null)
  const [trap, setTrap] = React.useState("")
  const [touched, setTouched] = React.useState<Set<EventSubmissionField>>(
    new Set()
  )
  const [sending, setSending] = React.useState(false)
  const [sent, setSent] = React.useState(false)

  const problems = eventSubmissionProblems(values, form.today)
  const problemFor = (field: EventSubmissionField) =>
    touched.has(field) ? (problems[field] ?? null) : null
  const touch = (field: EventSubmissionField) =>
    setTouched((was) => new Set(was).add(field))
  const set = (field: EventSubmissionField, value: string) =>
    setValues((was) => ({ ...was, [field]: value }))

  async function send() {
    dismissErrorToast()
    setTouched(new Set(Object.keys(values) as EventSubmissionField[]))
    const first = Object.values(problems)[0]
    if (first) {
      showErrorToast(first)
      return
    }
    setSending(true)
    try {
      const result = await submitEvent(values, photo, trap)
      if (result.sent) setSent(true)
      else showErrorToast(result.problem)
    } catch (error) {
      showErrorToast(getEventSubmissionErrorMessage(error))
    } finally {
      setSending(false)
    }
  }

  function startAgain() {
    setValues((was) => ({
      ...emptyEventSubmission(),
      // The same person is most likely sending the next one too.
      submitterName: was.submitterName,
      submitterEmail: was.submitterEmail,
    }))
    setPhoto(null)
    setTouched(new Set())
    setSent(false)
  }

  /** What is filled in, for the window that asks before throwing it away. */
  const dirty =
    Boolean(photo) || Object.values(values).some((value) => value.trim())

  return {
    values,
    photo,
    setPhoto,
    trap,
    setTrap,
    sending,
    sent,
    dirty,
    send,
    startAgain,
    /** Everything one box needs, ready to spread onto it. */
    field: (name: EventSubmissionField) => ({
      name,
      value: values[name],
      problem: problemFor(name),
      disabled: sending,
      onBlur: () => touch(name),
      onChange: (value: string) => set(name, value),
    }),
    /** The day box, which is a picker rather than a box of text. */
    day: {
      value: dayForPicker(values.startDate),
      disabled: sending,
      problem: problemFor("startDate"),
      onChange: (date: Date | undefined) => {
        set("startDate", dayFromPicker(date))
        touch("startDate")
      },
    },
  }
}

export type EventSubmissionBox = ReturnType<typeof useEventSubmission>
