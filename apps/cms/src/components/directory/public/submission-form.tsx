import * as React from "react"
import { Link } from "@tanstack/react-router"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { CharacterCount } from "@/components/shared/character-count"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { SubmissionForm } from "@/lib/api/directory/submissions"
import {
  getSubmissionErrorMessage,
  resendSubmissionEmail,
  submitListing,
} from "@/lib/api/directory/submissions"
import {
  emptySubmissionValues,
  looksLikeEmail,
  SUBMISSION_FIELDS,
  type SubmissionFieldName,
} from "@/lib/directory/submission-fields"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

/**
 * The public "add your listing" form.
 *
 * Two states, and the second one is the whole point: filling it in does not add
 * anything, it sends an email. Nobody — not an admin, not a visitor — sees the
 * submission until the address is confirmed, which is what stops the queue
 * filling with addresses nobody owns.
 *
 * The fields come from `lib/directory/submission-fields.ts`, the same list the
 * server checks against, so the form and the check cannot drift.
 */
export function ListingSubmissionForm({ form }: { form: SubmissionForm }) {
  const [values, setValues] = React.useState(emptySubmissionValues())
  const [chosen, setChosen] = React.useState<string[]>([])
  const [sending, setSending] = React.useState(false)
  const [sent, setSent] = React.useState(false)
  /** Which fields have been left, so nothing is marked wrong while it is typed. */
  const [touched, setTouched] = React.useState<Set<SubmissionFieldName>>(
    new Set()
  )

  function problemWith(field: SubmissionFieldName): string | null {
    const value = values[field].trim()
    if (SUBMISSION_FIELDS.find((row) => row.name === field)?.required && !value) {
      return "This one is needed."
    }
    if (field === "contactEmail" && value && !looksLikeEmail(value)) {
      return "That does not look like an email address."
    }
    return null
  }

  async function send() {
    dismissErrorToast()

    // Checked on the way out as well as by the server: the person is standing
    // right here, and a round trip to be told "you left the name blank" is a
    // worse answer than saying so now.
    const everyField = new Set(SUBMISSION_FIELDS.map((field) => field.name))
    setTouched(everyField)
    const firstProblem = SUBMISSION_FIELDS.map((field) =>
      problemWith(field.name)
    ).find(Boolean)
    if (firstProblem) {
      showErrorToast(firstProblem)
      return
    }

    setSending(true)
    try {
      await submitListing({ ...values, categoryIds: chosen })
      setSent(true)
    } catch (error) {
      showErrorToast(getSubmissionErrorMessage(error))
    } finally {
      setSending(false)
    }
  }

  async function resend() {
    dismissErrorToast()
    setSending(true)
    try {
      await resendSubmissionEmail(values.contactEmail)
    } catch (error) {
      showErrorToast(getSubmissionErrorMessage(error))
    } finally {
      setSending(false)
    }
  }

  if (sent) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Check your email</CardTitle>
          <CardDescription>
            We sent a link to {values.contactEmail}. Click it and your listing
            goes to {form.siteName} to be looked at. Until then nobody sees it.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={sending}
            onClick={() => void resend()}
          >
            Send it again
          </Button>
          <Button asChild variant="ghost">
            <Link to="/directory">Back to the directory</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <form
      className="grid gap-2 md:gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        void send()
      }}
    >
      <Card>
        <CardHeader>
          <CardTitle>About the business</CardTitle>
          <CardDescription>
            Somebody reads every submission before it appears on {form.siteName}.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {SUBMISSION_FIELDS.map((field) => {
            const problem = touched.has(field.name)
              ? problemWith(field.name)
              : null
            const id = `submission-${field.name}`
            return (
              <div key={field.name} className="grid gap-2">
                <div className="flex items-center justify-between gap-2">
                  <FieldLabel htmlFor={id} hint={field.hint}>
                    {field.label}
                    {field.required ? "" : " (optional)"}
                  </FieldLabel>
                  <CharacterCount
                    value={values[field.name]}
                    max={field.maxLength}
                  />
                </div>
                {field.multiline ? (
                  <Textarea
                    id={id}
                    rows={1}
                    maxLength={field.maxLength}
                    value={values[field.name]}
                    disabled={sending}
                    aria-invalid={problem ? true : undefined}
                    aria-describedby={problem ? `${id}-problem` : undefined}
                    onBlur={() =>
                      setTouched((was) => new Set(was).add(field.name))
                    }
                    onChange={(event) =>
                      setValues((was) => ({
                        ...was,
                        [field.name]: event.target.value,
                      }))
                    }
                  />
                ) : (
                  <Input
                    id={id}
                    type={field.type ?? "text"}
                    maxLength={field.maxLength}
                    value={values[field.name]}
                    disabled={sending}
                    aria-invalid={problem ? true : undefined}
                    aria-describedby={problem ? `${id}-problem` : undefined}
                    onBlur={() =>
                      setTouched((was) => new Set(was).add(field.name))
                    }
                    onChange={(event) =>
                      setValues((was) => ({
                        ...was,
                        [field.name]: event.target.value,
                      }))
                    }
                  />
                )}
                {problem ? (
                  <p id={`${id}-problem`} className="text-xs text-destructive">
                    {problem}
                  </p>
                ) : null}
              </div>
            )
          })}
        </CardContent>
      </Card>

      {form.categories.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Where it belongs</CardTitle>
            <CardDescription>
              Pick as many as fit. Whoever reviews it can change these.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            {form.categories.map((category) => (
              <label
                key={category.id}
                className="flex items-center gap-2 text-sm"
              >
                <Checkbox
                  checked={chosen.includes(category.id)}
                  disabled={sending}
                  onCheckedChange={() =>
                    setChosen((was) =>
                      was.includes(category.id)
                        ? was.filter((id) => id !== category.id)
                        : [...was, category.id]
                    )
                  }
                />
                {category.name}
              </label>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <div className="flex items-center gap-2">
        {/* Stays enabled while empty: the fields say what is missing when it is
            pressed, which a greyed-out button never does. */}
        <Button type="submit" disabled={sending}>
          Send it in
        </Button>
        <Button asChild variant="ghost">
          <Link to="/directory">Cancel</Link>
        </Button>
      </div>
    </form>
  )
}
