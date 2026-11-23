"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import CheckCircle2 from "lucide-react/dist/esm/icons/circle-check.js"
import Loader2 from "lucide-react/dist/esm/icons/loader-circle.js"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { BlockContainer } from "@/components/frontend/layout/block-container"
import {
  getListingSubmissionCategoriesAction,
  submitDirectoryListingSubmissionAction,
  type ListingSubmissionCategory,
} from "@/lib/actions/directories/directory-submission-actions"
import {
  resolveListingSubmissionFields,
  type ListingSubmissionFieldKey,
  type ResolvedListingSubmissionField,
} from "@/lib/utils/listing-submission-fields"

interface PageListingSubmissionBlockProps {
  content?: {
    title?: string
    subtitle?: string
    submitButtonText?: string
    successMessage?: string
    categoryLabel?: string
    fields?: Record<string, { label?: string; placeholder?: string; show?: boolean; required?: boolean }>
    visibility?: Record<string, boolean>
  }
  siteId: string
  siteWidth?: "full" | "custom"
  customWidth?: number
}

const DEFAULT_SUCCESS_MESSAGE = "Thanks! Check your inbox for a confirmation link. After you confirm, we'll review your listing before it goes live."

export function PageListingSubmissionBlock({
  content,
  siteId,
  siteWidth = "custom",
  customWidth,
}: PageListingSubmissionBlockProps) {
  const {
    title = "Add your listing",
    subtitle = "",
    submitButtonText = "Submit listing",
    successMessage = DEFAULT_SUCCESS_MESSAGE,
    categoryLabel = "Category",
    visibility = {},
  } = content || {}

  const fields = useMemo(() => resolveListingSubmissionFields(content?.fields), [content?.fields])
  const byKey = useMemo(
    () => Object.fromEntries(fields.map((field) => [field.key, field])) as Record<ListingSubmissionFieldKey, ResolvedListingSubmissionField>,
    [fields],
  )

  const [values, setValues] = useState<Record<ListingSubmissionFieldKey, string>>({
    businessName: "",
    address: "",
    contactEmail: "",
    description: "",
    imageUrl: "",
  })
  const [categoryId, setCategoryId] = useState("")
  const [categoryOptions, setCategoryOptions] = useState<ListingSubmissionCategory[]>([])
  const [honeypot, setHoneypot] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    let active = true
    getListingSubmissionCategoriesAction({ data: { siteId } })
      .then((result) => {
        if (active && !result.error) setCategoryOptions(result.data)
      })
      .catch(() => {
        // Category is optional; a load failure simply hides the selector.
      })
    return () => {
      active = false
    }
  }, [siteId])

  if (visibility.hideBlock === true) return null

  const showTitle = visibility.title !== false && Boolean(title)
  const showSubtitle = visibility.subtitle !== false && Boolean(subtitle)
  const showCategory = visibility.category !== false && categoryOptions.length > 0

  const setValue = (key: ListingSubmissionFieldKey, value: string) => setValues((current) => ({ ...current, [key]: value }))

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)

    startTransition(async () => {
      const result = await submitDirectoryListingSubmissionAction({ data: { input: {
        siteId,
        businessName: values.businessName,
        address: byKey.address.show ? values.address : "",
        description: byKey.description.show ? values.description : "",
        imageUrl: byKey.imageUrl.show ? values.imageUrl : "",
        contactEmail: values.contactEmail,
        categoryId: showCategory ? categoryId : "",
        honeypot,
      } } })

      if (!result.success) {
        setError(result.error || "Something went wrong. Please try again.")
        return
      }

      setSubmitted(true)
    })
  }

  const renderInput = (field: ResolvedListingSubmissionField) => {
    const id = `listing-submission-${field.key}`
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
            type={field.key === "contactEmail" ? "email" : field.key === "imageUrl" ? "url" : "text"}
            value={values[field.key]}
            onChange={(event) => setValue(field.key, event.target.value)}
            required={field.required}
            maxLength={field.key === "imageUrl" ? 2000 : 255}
            placeholder={field.placeholder}
          />
        )}
      </div>
    )
  }

  const renderCategory = () => (
    <div className="space-y-2">
      <Label htmlFor="listing-submission-category">
        {categoryLabel}
        <span className="ml-1 text-muted-foreground">(optional)</span>
      </Label>
      <Select value={categoryId} onValueChange={setCategoryId}>
        <SelectTrigger id="listing-submission-category" className="w-full">
          <SelectValue placeholder="Choose a category" />
        </SelectTrigger>
        <SelectContent>
          {categoryOptions.map((category) => (
            <SelectItem key={category.id} value={category.id}>
              {category.parent_title ? `${category.parent_title} · ${category.title}` : category.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )

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
              setValues({ businessName: "", address: "", contactEmail: "", description: "", imageUrl: "" })
              setCategoryId("")
            }}
          >
            Submit another listing
          </Button>
        </div>
      ) : (
        <form className="mx-auto max-w-2xl space-y-4" onSubmit={handleSubmit}>
          {renderInput(byKey.businessName)}

          {showCategory ? renderCategory() : null}

          {byKey.address.show && byKey.contactEmail.show ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {renderInput(byKey.address)}
              {renderInput(byKey.contactEmail)}
            </div>
          ) : (
            <>
              {byKey.address.show ? renderInput(byKey.address) : null}
              {renderInput(byKey.contactEmail)}
            </>
          )}

          {byKey.description.show ? renderInput(byKey.description) : null}

          {byKey.imageUrl.show ? renderInput(byKey.imageUrl) : null}

          {/* Honeypot: hidden from people, tempting to bots. A filled value is dropped server-side. */}
          <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", top: "-9999px" }}>
            <Label htmlFor="listing-submission-website">Website</Label>
            <Input
              id="listing-submission-website"
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
