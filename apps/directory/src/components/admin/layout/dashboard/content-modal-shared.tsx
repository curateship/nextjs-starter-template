"use client"

/**
 * Shared building blocks for the per-content-type Create/Settings modals
 * (pages, posts, products, events, categories, directories, account pages,
 * newsletters). These were previously copy-pasted into every modal:
 * - title→slug autogeneration with manual-edit tracking
 * - the draft/publish create-request handler (loading/error/fetch/post-create)
 * - the error banner, title+slug fields, meta description field, and the
 *   featured-image picker card
 *
 * Each modal keeps its own card layout and footer buttons so visuals are
 * unchanged; only the duplicated state logic and field markup live here.
 */

import { useState, type ReactNode } from "react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { MediaPicker } from "@/components/admin/media-library/MediaPicker"
import { DashboardModalCardTitle } from "@/components/admin/layout/dashboard/modals"
import ImageIcon from "lucide-react/dist/esm/icons/image.js"
import X from "lucide-react/dist/esm/icons/x.js"
import { generateSlug } from "@/lib/utils/slug"
import { dismissErrorToast, showErrorToast } from "@/lib/error-toast"

// ---- title/slug state ----

interface UseTitleSlugOptions {
  /** When the slug field is cleared: true → immediately regenerate from the title
   * (pages behavior); false → leave empty until the title next changes (posts/events). */
  regenerateOnClear?: boolean
}

/** Title + slug state with auto-generation and manual-edit tracking. */
export function useTitleSlug({ regenerateOnClear = false }: UseTitleSlugOptions = {}) {
  const [title, setTitle] = useState("")
  const [slug, setSlug] = useState("")
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false)

  const handleTitleChange = (nextTitle: string) => {
    setTitle(nextTitle)
    if (!slugManuallyEdited) {
      setSlug(generateSlug(nextTitle))
    }
  }

  const handleSlugChange = (nextSlug: string) => {
    if (nextSlug === "" && regenerateOnClear) {
      setSlugManuallyEdited(false)
      setSlug(generateSlug(title))
      return
    }
    setSlugManuallyEdited(nextSlug.length > 0)
    setSlug(nextSlug)
  }

  /** Settings modals: load existing values. By default a slug differing from the
   * auto-generated one counts as manually edited; pass detectManualEdit: false to
   * always start in auto mode (event settings behavior). */
  const reset = (initialTitle: string, initialSlug: string, options?: { detectManualEdit?: boolean }) => {
    setTitle(initialTitle)
    setSlug(initialSlug)
    setSlugManuallyEdited(
      options?.detectManualEdit === false ? false : initialSlug !== generateSlug(initialTitle)
    )
  }

  return { title, slug, slugManuallyEdited, handleTitleChange, handleSlugChange, setTitle, setSlug, reset }
}

// ---- create-request handler ----

/** Send a JSON body to an API route, returning the standard {data, error} shape */
async function requestJson<T>(method: string, endpoint: string, payload: Record<string, unknown>): Promise<{ data?: T | null; error?: string | null }> {
  const response = await fetch(endpoint, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  const result = await response.json()
  if (!response.ok) return { data: null, error: result.error || null }
  return result
}

/** POST a JSON body to an API route (create flows) */
export function postJson<T>(endpoint: string, payload: Record<string, unknown>) {
  return requestJson<T>("POST", endpoint, payload)
}

/** PUT a JSON body to an API route (settings/update flows) */
export function putJson<T>(endpoint: string, payload: Record<string, unknown>) {
  return requestJson<T>("PUT", endpoint, payload)
}

interface UseCreateContentOptions<TResult> {
  /** Lowercase entity label used in fallback error strings, e.g. "page" */
  entityLabel: string
  /** Current title — used for the required-field check before submitting */
  title: string
  /** Exact validation message shown for an empty title (kept per-modal) */
  titleRequiredMessage?: string
  /** Perform the create/save — either a server action or postJson/putJson to an API route */
  create: (publish: boolean) => Promise<{ data?: TResult | null; error?: string | null }>
  /** Optional post-create step (e.g. category assignment). Return an error string to abort. */
  afterCreate?: (created: TResult) => Promise<string | null>
  /** Per-action fallback copy for thrown/blank errors (settings modals use
   * "Failed to save X as draft" / "Failed to publish X"). Defaults to "Failed to create X". */
  failureMessage?: (action: string, publish: boolean) => string
}

/**
 * The shared submit skeleton behind every Create modal's draft/publish buttons:
 * validate title → create → surface error → run post-create step → hand off result.
 * `action` is only used to label which button shows its loading state.
 */
export function useCreateContent<TResult>({
  entityLabel,
  title,
  titleRequiredMessage,
  create,
  afterCreate,
  failureMessage,
}: UseCreateContentOptions<TResult>) {
  const [loading, setLoading] = useState(false)
  const [loadingAction, setLoadingAction] = useState<string | null>(null)
  const [titleMissing, setTitleMissing] = useState(false)

  // The red ring stays on the title box until there is something in it, so the
  // field is still marked after the toast has been dismissed and clears itself
  // the moment the user types — no separate "clear the error" wiring per modal.
  const titleInvalid = titleMissing && !title.trim()

  // Failures report through the one shared error toast, never inside the modal
  // body — see workspace/docs/admin-action-feedback.md. Passing null clears it,
  // which is what starting a new attempt does.
  const setError = (message: string | null) => {
    if (message) showErrorToast(message)
    else dismissErrorToast()
  }

  const submit = async (action: string, publish: boolean, onDone: (created: TResult) => void) => {
    if (!title.trim()) {
      setTitleMissing(true)
      setError(titleRequiredMessage ?? `${entityLabel.charAt(0).toUpperCase()}${entityLabel.slice(1)} title is required`)
      return
    }

    setTitleMissing(false)

    const fallback = failureMessage?.(action, publish) ?? `Failed to create ${entityLabel}`

    setLoading(true)
    setLoadingAction(action)
    setError(null)

    try {
      const result = await create(publish)

      if (result.error) {
        setError(result.error)
        return
      }

      if (!result.data) {
        setError(fallback)
        return
      }

      if (afterCreate) {
        const afterError = await afterCreate(result.data)
        if (afterError) {
          setError(afterError)
          return
        }
      }

      onDone(result.data)
    } catch {
      setError(fallback)
    } finally {
      setLoading(false)
      setLoadingAction(null)
    }
  }

  return { loading, loadingAction, setError, submit, titleInvalid }
}

// ---- presentational pieces ----

interface TitleSlugFieldsProps {
  titleLabel: string
  titlePlaceholder: string
  slugLabel: string
  slugPlaceholder: string
  title: string
  slug: string
  slugManuallyEdited: boolean
  onTitleChange: (title: string) => void
  onSlugChange: (slug: string) => void
  /** Per-modal URL preview line rendered under the slug description (markup varies) */
  urlPreview?: ReactNode
  /** Override for the auto-generated-slug helper copy; null hides it entirely (posts) */
  slugAutoDescription?: string | null
  /** DOM id prefix — settings modals use "modal-" to avoid clashing with create modals */
  idPrefix?: string
  /** Mark the title box after a submit found it empty (`useCreateContent`'s `titleInvalid`) */
  titleInvalid?: boolean
}

/** The title + URL slug field pair every Create modal starts with */
export function TitleSlugFields({
  titleLabel,
  titlePlaceholder,
  slugLabel,
  slugPlaceholder,
  title,
  slug,
  slugManuallyEdited,
  onTitleChange,
  onSlugChange,
  urlPreview,
  slugAutoDescription,
  idPrefix = "",
  titleInvalid = false,
}: TitleSlugFieldsProps) {
  return (
    <>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}title`}>{titleLabel}</FieldLabel>
        {/* No browser `required`: it refuses the submit with its own bubble, which
            never appears when the field sits on a tab panel that is switched away.
            The handler validates instead and answers with the error toast. */}
        <Input
          id={`${idPrefix}title`}
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder={titlePlaceholder}
          aria-invalid={titleInvalid || undefined}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor={`${idPrefix}slug`}>{slugLabel}</FieldLabel>
        <Input
          id={`${idPrefix}slug`}
          value={slug}
          onChange={(e) => onSlugChange(e.target.value)}
          placeholder={slugPlaceholder}
        />
        {slugManuallyEdited ? (
          <FieldDescription>Custom URL slug. Clear this field to auto-generate from title again.</FieldDescription>
        ) : slugAutoDescription === null ? null : (
          <FieldDescription>{slugAutoDescription ?? "Auto-generated from title. You can edit this to customize the URL."}</FieldDescription>
        )}
        {urlPreview}
      </Field>
    </>
  )
}

interface MetaDescriptionFieldProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  /** Per-modal helper copy under the field (some show a character counter) */
  description?: ReactNode
  /** DOM id prefix — settings modals use "modal-" */
  idPrefix?: string
}

/** The SEO meta description textarea shared by every modal */
export function MetaDescriptionField({ value, onChange, placeholder, description, idPrefix = "" }: MetaDescriptionFieldProps) {
  return (
    <Field>
      <FieldLabel htmlFor={`${idPrefix}meta_description`}>Meta Description</FieldLabel>
      <Textarea
        id={`${idPrefix}meta_description`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "A brief description for search engines"}
        rows={1}
        className="min-h-10 field-sizing-content"
      />
      {description ?? <FieldDescription>Recommended length: 150-160 characters</FieldDescription>}
    </Field>
  )
}

interface FeaturedImageFieldProps {
  imageUrl: string
  onChange: (imageUrl: string) => void
  emptyLabel?: string
}

/**
 * The featured-image picker (preview, remove button, hover-to-change,
 * MediaPicker dialog) previously duplicated in the post/product/event/category/
 * directory Create modals. Renders as a 12rem-wide field for embedding inside
 * an existing card.
 */
export function FeaturedImageField({
  imageUrl,
  onChange,
  emptyLabel = "Click to select featured image",
}: FeaturedImageFieldProps) {
  const [showImagePicker, setShowImagePicker] = useState(false)

  return (
    <Field className="w-48">
      {imageUrl ? (
        <div className="relative aspect-square w-full rounded-lg overflow-hidden bg-muted">
          <img
            src={imageUrl}
            alt="Featured image preview"
            className="h-full w-full object-contain"
          />
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute top-2 right-2 p-1 bg-destructive text-destructive-foreground rounded-full hover:bg-destructive/90 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
          <div
            className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity bg-black/50 cursor-pointer"
            onClick={() => setShowImagePicker(true)}
          >
            <div className="text-white text-center">
              <ImageIcon className="mx-auto h-8 w-8 mb-2" />
              <p className="text-sm font-medium">Click to change image</p>
            </div>
          </div>
        </div>
      ) : (
        <div
          className="flex aspect-square w-full cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/50 p-4 transition-all hover:border-muted-foreground/40 hover:bg-muted/70"
          onClick={() => setShowImagePicker(true)}
        >
          <div className="text-center">
            <ImageIcon className="mx-auto h-8 w-8 text-muted-foreground/50" />
            <p className="mt-2 text-sm text-muted-foreground">{emptyLabel}</p>
          </div>
        </div>
      )}
      <MediaPicker
        open={showImagePicker}
        onOpenChange={setShowImagePicker}
        onSelectMedia={(mediaUrl) => {
          onChange(mediaUrl)
          setShowImagePicker(false)
        }}
        currentMediaUrl={imageUrl || ""}
      />
    </Field>
  )
}

interface FeaturedImageCardProps {
  imageUrl: string
  onChange: (imageUrl: string) => void
  cardTitle?: string
  emptyLabel?: string
}

/** FeaturedImageField wrapped in its own card, for modals with a standalone Image section */
export function FeaturedImageCard({
  imageUrl,
  onChange,
  cardTitle = "Image",
  emptyLabel,
}: FeaturedImageCardProps) {
  return (
    <Card>
      <CardHeader>
        <DashboardModalCardTitle>{cardTitle}</DashboardModalCardTitle>
      </CardHeader>
      <CardContent>
        <FeaturedImageField imageUrl={imageUrl} onChange={onChange} emptyLabel={emptyLabel} />
      </CardContent>
    </Card>
  )
}
