"use client"

import { useMemo, useState, useTransition } from "react"
import CheckCircle2 from "lucide-react/dist/esm/icons/circle-check.js"
import Loader2 from "lucide-react/dist/esm/icons/loader-circle.js"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { BlockContainer } from "@/components/frontend/layout/block-container"
import { submitEventSubmissionAction } from "@/lib/actions/events/event-submission-actions"
import {
  resolveEventSubmissionFields,
  type EventSubmissionFieldKey,
  type ResolvedEventSubmissionField,
} from "@/lib/utils/event-submission-fields"

interface PageEventSubmissionBlockProps {
  content?: {
    title?: string
    subtitle?: string
    submitButtonText?: string
    successMessage?: string
    fields?: Record<string, { label?: string; placeholder?: string; show?: boolean; required?: boolean }>
    visibility?: Record<string, boolean>
  }
  siteId: string
  siteWidth?: "full" | "custom"
  customWidth?: number
}

const DEFAULT_SUCCESS_MESSAGE = "Thanks! Your event has been submitted for review. We'll take a look soon."

export function PageEventSubmissionBlock({
  content,
  siteId,
  siteWidth = "custom",
  customWidth,
}: PageEventSubmissionBlockProps) {
  const {
    title = "Submit an Event",
    subtitle = "",
    submitButtonText = "Submit Event",
    successMessage = DEFAULT_SUCCESS_MESSAGE,
    visibility = {},
  } = content || {}

  const fields = useMemo(() => resolveEventSubmissionFields(content?.fields), [content?.fields])
  const byKey = useMemo(
    () => Object.fromEntries(fields.map((field) => [field.key, field])) as Record<EventSubmissionFieldKey, ResolvedEventSubmissionField>,
    [fields],
  )

  const [values, setValues] = useState<Record<EventSubmissionFieldKey, string>>({
    eventName: "",
    dateTimeText: "",
    location: "",
    submitterEmail: "",
    description: "",
  })
  const [honeypot, setHoneypot] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [isPending, startTransition] = useTransition()

  if (visibility.hideBlock === true) return null

  const showTitle = visibility.title !== false && Boolean(title)
  const showSubtitle = visibility.subtitle !== false && Boolean(subtitle)

  const setValue = (key: EventSubmissionFieldKey, value: string) => setValues((current) => ({ ...current, [key]: value }))

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)

    startTransition(async () => {
      const result = await submitEventSubmissionAction({ data: { input: {
        siteId,
        eventName: values.eventName,
        description: byKey.description.show ? values.description : "",
        dateTimeText: byKey.dateTimeText.show ? values.dateTimeText : "",
        location: byKey.location.show ? values.location : "",
        submitterEmail: values.submitterEmail,
        honeypot,
      } } })

      if (!result.success) {
        setError(result.error || "Something went wrong. Please try again.")
        return
      }

      setSubmitted(true)
    })
  }

  const renderInput = (field: ResolvedEventSubmissionField) => {
    const id = `event-submission-${field.key}`
    return (
      <div key={field.key} className="space-y-2">
        <Label htmlFor={id}>
          {field.label}
          {!field.required ? <span className="ml-1 text-muted-foreground">(optional)</span> : null}
        </Label>
        {field.multiline ? (
          <Textarea
            id={id}
            value={values[field.key]}
            onChange={(event) => setValue(field.key, event.target.value)}
            rows={4}
            maxLength={5000}
            required={field.required}
            placeholder={field.placeholder}
          />
        ) : (
          <Input
            id={id}
            type={field.key === "submitterEmail" ? "email" : "text"}
            value={values[field.key]}
            onChange={(event) => setValue(field.key, event.target.value)}
            required={field.required}
            maxLength={255}
            placeholder={field.placeholder}
          />
        )}
      </div>
    )
  }

  // The two short middle fields pair up on desktop; if the owner hides one, the
  // other fills the row (never a lone half-width field).
  const pairedFields = [byKey.dateTimeText, byKey.location].filter((field) => field.show)

  return (
    <BlockContainer
      header={showTitle || showSubtitle
        ? {
            title: showTitle ? title : "",
            subtitle: showSubtitle ? subtitle : "",
            align: "left",
          }
        : undefined}
      siteWidth={siteWidth}
      customWidth={customWidth}
    >
      {submitted ? (
        <div className="mx-auto max-w-2xl rounded-lg border bg-card p-8 text-center">
          <CheckCircle2 className="mx-auto mb-4 h-10 w-10 text-green-600" />
          <p className="text-base text-foreground">{successMessage}</p>
          <Button
            type="button"
            variant="outline"
            className="mt-6"
            onClick={() => {
              setSubmitted(false)
              setValues({ eventName: "", dateTimeText: "", location: "", submitterEmail: "", description: "" })
            }}
          >
            Submit another event
          </Button>
        </div>
      ) : (
        <form className="mx-auto max-w-2xl space-y-4" onSubmit={handleSubmit}>
          {renderInput(byKey.eventName)}

          {pairedFields.length > 0 && (
            <div className={pairedFields.length === 2 ? "grid gap-4 sm:grid-cols-2" : "space-y-4"}>
              {pairedFields.map((field) => renderInput(field))}
            </div>
          )}

          {renderInput(byKey.submitterEmail)}

          {byKey.description.show ? renderInput(byKey.description) : null}

          {/* Honeypot: hidden from people, tempting to bots. A filled value is dropped server-side. */}
          <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", top: "-9999px" }}>
            <Label htmlFor="event-submission-website">Website</Label>
            <Input
              id="event-submission-website"
              tabIndex={-1}
              autoComplete="off"
              value={honeypot}
              onChange={(event) => setHoneypot(event.target.value)}
            />
          </div>

          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}

          <div className="flex justify-end">
            <Button type="submit" disabled={isPending}>
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {submitButtonText}
            </Button>
          </div>
        </form>
      )}
    </BlockContainer>
  )
}
