"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import CheckCircle2 from "lucide-react/dist/esm/icons/circle-check.js"
import Link from "@/components/app-link"
import { BlockContainer } from "@/components/frontend/layout/block-container"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  getPublicGuidedFormBySlug,
  submitGuidedFormAction,
  type GuidedFormOutcome,
  type GuidedFormRule,
  type GuidedFormStep,
  type PublicGuidedForm,
} from "@/lib/actions/guided-forms/guided-form-actions"

interface GuidedFormBlockProps {
  siteId: string
  content?: {
    formSlug?: string
    title?: string
    subtitle?: string
    visibility?: Record<string, boolean>
  }
  preloadedForm?: PublicGuidedForm | null
  contactEmail?: string
  contactProof?: string
  embedded?: boolean
  siteWidth?: "full" | "custom"
  customWidth?: number
}

function rulesMatch(rules: GuidedFormRule[] | undefined, answers: Record<string, any>) {
  if (!rules?.length) return true
  return rules.every((rule) => {
    const answer = answers[rule.fieldId]
    return Array.isArray(answer) ? answer.includes(rule.equals) : String(answer ?? "") === rule.equals
  })
}

function getVisibleSteps(steps: GuidedFormStep[], answers: Record<string, any>) {
  return steps.filter((step) => rulesMatch(step.rules, answers))
}

function getInitialAnswers(form: PublicGuidedForm | null) {
  if (!form || typeof window === "undefined") return {}

  const params = new URLSearchParams(window.location.search)
  const answers: Record<string, any> = {}
  form.version.steps.flatMap((step) => step.fields).forEach((field) => {
    const value = params.get(field.prefillKey || field.id)
    if (value) answers[field.id] = value
  })
  return answers
}

export function GuidedFormBlock({ siteId, content = {}, preloadedForm = null, contactEmail, contactProof, embedded = false, siteWidth = "custom", customWidth }: GuidedFormBlockProps) {
  const [form, setForm] = useState<PublicGuidedForm | null>(preloadedForm)
  const [loading, setLoading] = useState(!preloadedForm && !!content.formSlug)
  const [answers, setAnswers] = useState<Record<string, any>>({})
  const [stepIndex, setStepIndex] = useState(0)
  const [error, setError] = useState("")
  const [outcome, setOutcome] = useState<GuidedFormOutcome | null>(null)
  const [startedAt] = useState(() => Date.now())
  const [honeypot, setHoneypot] = useState("")
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (preloadedForm) {
      setAnswers(getInitialAnswers(preloadedForm))
      return
    }
    if (!content.formSlug) return

    let cancelled = false
    setLoading(true)
    getPublicGuidedFormBySlug(siteId, content.formSlug).then((result) => {
      if (cancelled) return
      setForm(result.data)
      setAnswers(getInitialAnswers(result.data))
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [content.formSlug, preloadedForm, siteId])

  const visibleSteps = useMemo(() => getVisibleSteps(form?.version.steps ?? [], answers), [answers, form])
  const currentStep = visibleSteps[Math.min(stepIndex, Math.max(visibleSteps.length - 1, 0))]

  if (content.visibility?.form === false) return null

  function updateAnswer(fieldId: string, value: any) {
    setAnswers((current) => ({ ...current, [fieldId]: value }))
    setError("")
  }

  function validateStep() {
    if (!currentStep) return true
    for (const field of currentStep.fields) {
      const value = answers[field.id]
      if (!field.required) continue
      if (field.type === "checkbox" || field.type === "consent") {
        if (value !== true) {
          setError(`${field.label} is required`)
          return false
        }
      } else if (field.type === "multi_choice") {
        if (!Array.isArray(value) || value.length === 0) {
          setError(`${field.label} is required`)
          return false
        }
      } else if (!String(value ?? "").trim()) {
        setError(`${field.label} is required`)
        return false
      }
    }
    return true
  }

  function handleNext() {
    if (!validateStep()) return
    if (stepIndex < visibleSteps.length - 1) {
      setStepIndex((current) => current + 1)
      return
    }
    if (!form) return

    startTransition(async () => {
      const params = new URLSearchParams(window.location.search)
      const result = await submitGuidedFormAction({
        formId: form.id,
        versionId: form.version.id,
        answers,
        contactEmail,
        contactProof,
        startedAt,
        honeypot,
        metadata: {
          page_url: window.location.href,
          referrer: document.referrer,
          utm_source: params.get("utm_source") || "",
          utm_medium: params.get("utm_medium") || "",
          utm_campaign: params.get("utm_campaign") || "",
        },
      })
      if (!result.success) {
        setError(result.error || "Failed to submit form")
        return
      }
      setOutcome(result.outcome ?? {
        id: "success",
        title: "Thanks for reaching out",
        description: "Your response has been saved.",
      })
    })
  }

  function renderField(field: GuidedFormStep["fields"][number]) {
    const value = answers[field.id]
    if (field.type === "hidden") {
      return null
    }

    if (field.type === "long_text") {
      return (
        <Textarea
          id={field.id}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => updateAnswer(field.id, event.target.value)}
          placeholder={field.placeholder}
          className="min-h-28"
          required={field.required}
        />
      )
    }

    if (field.type === "single_choice") {
      return (
        <div className="grid gap-2 sm:grid-cols-2">
          {(field.options || []).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => updateAnswer(field.id, option)}
              className={`rounded-md border px-3 py-2 text-left text-sm transition hover:bg-muted ${value === option ? "border-primary bg-primary/5" : ""}`}
            >
              {option}
            </button>
          ))}
        </div>
      )
    }

    if (field.type === "multi_choice") {
      const selected = Array.isArray(value) ? value : []
      return (
        <div className="grid gap-2 sm:grid-cols-2">
          {(field.options || []).map((option) => (
            <label key={option} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
              <Checkbox
                checked={selected.includes(option)}
                onCheckedChange={(checked) => {
                  updateAnswer(field.id, checked === true
                    ? [...selected, option]
                    : selected.filter((item) => item !== option))
                }}
              />
              {option}
            </label>
          ))}
        </div>
      )
    }

    if (field.type === "checkbox" || field.type === "consent") {
      return (
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={value === true} onCheckedChange={(checked) => updateAnswer(field.id, checked === true)} />
          {field.label}
        </label>
      )
    }

    return (
      <Input
        id={field.id}
        type={field.type === "email" ? "email" : field.type === "phone" ? "tel" : "text"}
        value={typeof value === "string" ? value : ""}
        onChange={(event) => updateAnswer(field.id, event.target.value)}
        placeholder={field.placeholder}
        required={field.required}
      />
    )
  }

  const formContent = (
      <div className={`mx-auto max-w-2xl ${embedded ? "py-0" : "py-10"}`}>
        {loading ? (
          <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">Loading...</div>
        ) : !form ? (
          <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">Form unavailable.</div>
        ) : outcome ? (
          <div className="rounded-lg border bg-card p-8 text-center">
            <CheckCircle2 className="mx-auto mb-4 h-10 w-10 text-primary" />
            <h2 className="text-2xl font-semibold">{outcome.title}</h2>
            {outcome.description ? <p className="mt-2 text-muted-foreground">{outcome.description}</p> : null}
            {outcome.ctaLabel && outcome.ctaUrl ? (
              <Button asChild className="mt-6">
                <Link href={outcome.ctaUrl}>{outcome.ctaLabel}</Link>
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="rounded-lg border bg-card p-6 shadow-sm">
            <div className="mb-6">
              <p className="text-sm text-muted-foreground">{stepIndex + 1} of {visibleSteps.length}</p>
              <h2 className="mt-2 text-2xl font-semibold">{content.title || form.headline}</h2>
              {(content.subtitle || form.subhead) ? (
                <p className="mt-2 text-muted-foreground">{content.subtitle || form.subhead}</p>
              ) : null}
            </div>

            {currentStep ? (
              <div className="space-y-5">
                <div>
                  <h3 className="text-lg font-medium">{currentStep.title}</h3>
                  {currentStep.description ? <p className="mt-1 text-sm text-muted-foreground">{currentStep.description}</p> : null}
                </div>

                <input type="text" value={honeypot} onChange={(event) => setHoneypot(event.target.value)} className="hidden" tabIndex={-1} autoComplete="off" />

                {currentStep.fields.map((field) => (
                  <div key={field.id} className="space-y-2">
                    {field.type !== "checkbox" && field.type !== "consent" && field.type !== "hidden" ? (
                      <Label htmlFor={field.id}>{field.label}</Label>
                    ) : null}
                    {renderField(field)}
                  </div>
                ))}

                {error ? <p className="text-sm text-destructive">{error}</p> : null}

                <div className="flex justify-between gap-3 pt-2">
                  <Button type="button" variant="outline" onClick={() => setStepIndex((current) => Math.max(0, current - 1))} disabled={stepIndex === 0 || isPending}>
                    Back
                  </Button>
                  <Button type="button" onClick={handleNext} disabled={isPending}>
                    {stepIndex < visibleSteps.length - 1 ? "Continue" : isPending ? "Submitting..." : "Submit"}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
  )

  if (embedded) return formContent

  return (
    <BlockContainer siteWidth={siteWidth} customWidth={customWidth}>
      {formContent}
    </BlockContainer>
  )
}
