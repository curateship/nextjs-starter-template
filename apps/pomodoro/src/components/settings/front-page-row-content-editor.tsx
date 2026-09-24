import type { ReactNode } from "react"
import { PlusIcon, Trash2Icon } from "lucide-react"

import { ImageUpload } from "@/components/shared/image-upload"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { DisabledReason } from "@/components/ui/disabled-reason"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { createShellId } from "@/components/settings/nav-editor-shared"
import {
  MAX_FRONT_PAGE_FAQ_ANSWER_LENGTH,
  MAX_FRONT_PAGE_FAQ_ITEMS,
  MAX_FRONT_PAGE_FAQ_QUESTION_LENGTH,
  MAX_FRONT_PAGE_IMAGE_ALT_LENGTH,
  MAX_FRONT_PAGE_ITEM_NAME_LENGTH,
  MAX_FRONT_PAGE_ITEM_ROLE_LENGTH,
  MAX_FRONT_PAGE_LOGOS,
  MAX_FRONT_PAGE_SCREENSHOT_CAPTION_LENGTH,
  MAX_FRONT_PAGE_SCREENSHOTS,
  MAX_FRONT_PAGE_TESTIMONIAL_QUOTE_LENGTH,
  MAX_FRONT_PAGE_TESTIMONIALS,
  type FrontPageFaqItem,
  type FrontPageLogo,
  type FrontPageRowKind,
  type FrontPageScreenshot,
  type FrontPageTestimonial,
} from "@/lib/pages/front-page"

type FrontPageRowContentEditorProps = {
  kind: FrontPageRowKind
  testimonials: FrontPageTestimonial[]
  faqItems: FrontPageFaqItem[]
  logos: FrontPageLogo[]
  screenshots: FrontPageScreenshot[]
  submitted: boolean
  onTestimonialsChange: (items: FrontPageTestimonial[]) => void
  onFaqItemsChange: (items: FrontPageFaqItem[]) => void
  onLogosChange: (items: FrontPageLogo[]) => void
  onScreenshotsChange: (items: FrontPageScreenshot[]) => void
}

export function FrontPageRowContentEditor(
  props: FrontPageRowContentEditorProps
) {
  if (props.kind === "testimonials") return <TestimonialsEditor {...props} />
  if (props.kind === "faq") return <FaqEditor {...props} />
  if (props.kind === "logos") return <LogosEditor {...props} />
  if (props.kind === "screenshots") return <ScreenshotsEditor {...props} />
  return null
}

function EditorCard({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">{children}</CardContent>
    </Card>
  )
}

function ItemEditor({
  label,
  onDelete,
  children,
}: {
  label: string
  onDelete: () => void
  children: ReactNode
}) {
  return (
    <div className="grid gap-4 rounded-md border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{label}</p>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Delete ${label.toLowerCase()}`}
          onClick={onDelete}
        >
          <Trash2Icon className="size-4" />
        </Button>
      </div>
      {children}
    </div>
  )
}

function AddItemButton({
  label,
  plural,
  count,
  maximum,
  onClick,
}: {
  label: string
  plural?: string
  count: number
  maximum: number
  onClick: () => void
}) {
  const full = count >= maximum
  const pluralLabel = plural ?? `${label}s`
  return (
    <div>
      <DisabledReason
        disabled={full}
        reason={`A row can have ${maximum} ${pluralLabel}. Delete one before adding another.`}
      >
        <Button
          type="button"
          variant="outline"
          disabled={full}
          onClick={onClick}
        >
          <PlusIcon className="size-4" />
          Add {label}
        </Button>
      </DisabledReason>
    </div>
  )
}

function TestimonialsEditor({
  testimonials,
  submitted,
  onTestimonialsChange,
}: FrontPageRowContentEditorProps) {
  return (
    <EditorCard
      title="Testimonials"
      description="Add customer quotes. A name and quote are required; the role and picture are optional."
    >
      {testimonials.map((item, index) => (
        <ItemEditor
          key={item.id}
          label={`Testimonial ${index + 1}`}
          onDelete={() =>
            onTestimonialsChange(
              testimonials.filter((candidate) => candidate.id !== item.id)
            )
          }
        >
          <div className="grid gap-4">
            <ImageUpload
              label="Picture"
              value={item.picture}
              aspect="square"
              fit="cover"
              inlinePicker
              emptyLabel="Add picture"
              className="max-w-24"
              onChange={(picture) =>
                onTestimonialsChange(
                  replaceItem(testimonials, item.id, { ...item, picture })
                )
              }
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <FieldLabel htmlFor={`testimonial-name-${item.id}`}>
                  Name
                </FieldLabel>
                <Input
                  id={`testimonial-name-${item.id}`}
                  value={item.name}
                  maxLength={MAX_FRONT_PAGE_ITEM_NAME_LENGTH}
                  aria-invalid={(submitted && !item.name.trim()) || undefined}
                  onChange={(event) =>
                    onTestimonialsChange(
                      replaceItem(testimonials, item.id, {
                        ...item,
                        name: event.target.value,
                      })
                    )
                  }
                />
              </div>
              <div className="grid gap-2">
                <FieldLabel htmlFor={`testimonial-role-${item.id}`}>
                  Role
                </FieldLabel>
                <Input
                  id={`testimonial-role-${item.id}`}
                  value={item.role}
                  maxLength={MAX_FRONT_PAGE_ITEM_ROLE_LENGTH}
                  placeholder="Founder at Acme"
                  onChange={(event) =>
                    onTestimonialsChange(
                      replaceItem(testimonials, item.id, {
                        ...item,
                        role: event.target.value,
                      })
                    )
                  }
                />
              </div>
            </div>
          </div>
          <div className="grid gap-2">
            <FieldLabel htmlFor={`testimonial-quote-${item.id}`}>
              Quote
            </FieldLabel>
            <Textarea
              id={`testimonial-quote-${item.id}`}
              rows={1}
              value={item.quote}
              maxLength={MAX_FRONT_PAGE_TESTIMONIAL_QUOTE_LENGTH}
              aria-invalid={(submitted && !item.quote.trim()) || undefined}
              onChange={(event) =>
                onTestimonialsChange(
                  replaceItem(testimonials, item.id, {
                    ...item,
                    quote: event.target.value,
                  })
                )
              }
            />
          </div>
        </ItemEditor>
      ))}
      {!testimonials.length ? (
        <p className="text-sm text-muted-foreground">No testimonials yet.</p>
      ) : null}
      <AddItemButton
        label="testimonial"
        count={testimonials.length}
        maximum={MAX_FRONT_PAGE_TESTIMONIALS}
        onClick={() =>
          onTestimonialsChange([
            ...testimonials,
            {
              id: createShellId("front-page-testimonial"),
              quote: "",
              name: "",
              role: "",
              picture: "",
            },
          ])
        }
      />
    </EditorCard>
  )
}

function FaqEditor({
  faqItems,
  submitted,
  onFaqItemsChange,
}: FrontPageRowContentEditorProps) {
  return (
    <EditorCard
      title="FAQ entries"
      description="Each entry needs both a question and its answer."
    >
      {faqItems.map((item, index) => (
        <ItemEditor
          key={item.id}
          label={`FAQ entry ${index + 1}`}
          onDelete={() =>
            onFaqItemsChange(
              faqItems.filter((candidate) => candidate.id !== item.id)
            )
          }
        >
          <div className="grid gap-2">
            <FieldLabel htmlFor={`faq-question-${item.id}`}>
              Question
            </FieldLabel>
            <Input
              id={`faq-question-${item.id}`}
              value={item.question}
              maxLength={MAX_FRONT_PAGE_FAQ_QUESTION_LENGTH}
              aria-invalid={(submitted && !item.question.trim()) || undefined}
              onChange={(event) =>
                onFaqItemsChange(
                  replaceItem(faqItems, item.id, {
                    ...item,
                    question: event.target.value,
                  })
                )
              }
            />
          </div>
          <div className="grid gap-2">
            <FieldLabel htmlFor={`faq-answer-${item.id}`}>Answer</FieldLabel>
            <Textarea
              id={`faq-answer-${item.id}`}
              rows={1}
              value={item.answer}
              maxLength={MAX_FRONT_PAGE_FAQ_ANSWER_LENGTH}
              aria-invalid={(submitted && !item.answer.trim()) || undefined}
              onChange={(event) =>
                onFaqItemsChange(
                  replaceItem(faqItems, item.id, {
                    ...item,
                    answer: event.target.value,
                  })
                )
              }
            />
          </div>
        </ItemEditor>
      ))}
      {!faqItems.length ? (
        <p className="text-sm text-muted-foreground">No FAQ entries yet.</p>
      ) : null}
      <AddItemButton
        label="FAQ entry"
        plural="FAQ entries"
        count={faqItems.length}
        maximum={MAX_FRONT_PAGE_FAQ_ITEMS}
        onClick={() =>
          onFaqItemsChange([
            ...faqItems,
            {
              id: createShellId("front-page-faq"),
              question: "",
              answer: "",
            },
          ])
        }
      />
    </EditorCard>
  )
}

function LogosEditor({
  logos,
  submitted,
  onLogosChange,
}: FrontPageRowContentEditorProps) {
  return (
    <EditorCard
      title="Logos"
      description="Choose each logo from the media library and give it a name for screen readers."
    >
      {logos.map((item, index) => (
        <ItemEditor
          key={item.id}
          label={`Logo ${index + 1}`}
          onDelete={() =>
            onLogosChange(logos.filter((candidate) => candidate.id !== item.id))
          }
        >
          <div className="grid gap-4">
            <ImageUpload
              label="Logo image"
              value={item.image}
              fit="contain"
              inlinePicker
              invalid={submitted && !item.image}
              emptyLabel="Choose logo"
              className="max-w-40"
              onChange={(image, altText) =>
                onLogosChange(
                  replaceItem(logos, item.id, {
                    ...item,
                    image,
                    alt: item.alt || altText || "",
                  })
                )
              }
            />
            <div className="grid gap-2">
              <FieldLabel
                htmlFor={`logo-alt-${item.id}`}
                hint="The company or product name shown by a screen reader."
              >
                Name
              </FieldLabel>
              <Input
                id={`logo-alt-${item.id}`}
                value={item.alt}
                maxLength={MAX_FRONT_PAGE_IMAGE_ALT_LENGTH}
                aria-invalid={(submitted && !item.alt.trim()) || undefined}
                onChange={(event) =>
                  onLogosChange(
                    replaceItem(logos, item.id, {
                      ...item,
                      alt: event.target.value,
                    })
                  )
                }
              />
            </div>
          </div>
        </ItemEditor>
      ))}
      {!logos.length ? (
        <p className="text-sm text-muted-foreground">No logos yet.</p>
      ) : null}
      <AddItemButton
        label="logo"
        count={logos.length}
        maximum={MAX_FRONT_PAGE_LOGOS}
        onClick={() =>
          onLogosChange([
            ...logos,
            {
              id: createShellId("front-page-logo"),
              image: "",
              alt: "",
            },
          ])
        }
      />
    </EditorCard>
  )
}

function ScreenshotsEditor({
  screenshots,
  submitted,
  onScreenshotsChange,
}: FrontPageRowContentEditorProps) {
  return (
    <EditorCard
      title="Screenshots"
      description="Choose product images from the media library and explain each one with a caption."
    >
      {screenshots.map((item, index) => (
        <ItemEditor
          key={item.id}
          label={`Screenshot ${index + 1}`}
          onDelete={() =>
            onScreenshotsChange(
              screenshots.filter((candidate) => candidate.id !== item.id)
            )
          }
        >
          <ImageUpload
            label="Screenshot image"
            value={item.image}
            fit="contain"
            inlinePicker
            invalid={submitted && !item.image}
            emptyLabel="Choose screenshot"
            onChange={(image, altText) =>
              onScreenshotsChange(
                replaceItem(screenshots, item.id, {
                  ...item,
                  image,
                  caption: item.caption || altText || "",
                })
              )
            }
          />
          <div className="grid gap-2">
            <FieldLabel htmlFor={`screenshot-caption-${item.id}`}>
              Caption
            </FieldLabel>
            <Input
              id={`screenshot-caption-${item.id}`}
              value={item.caption}
              maxLength={MAX_FRONT_PAGE_SCREENSHOT_CAPTION_LENGTH}
              aria-invalid={(submitted && !item.caption.trim()) || undefined}
              onChange={(event) =>
                onScreenshotsChange(
                  replaceItem(screenshots, item.id, {
                    ...item,
                    caption: event.target.value,
                  })
                )
              }
            />
          </div>
        </ItemEditor>
      ))}
      {!screenshots.length ? (
        <p className="text-sm text-muted-foreground">No screenshots yet.</p>
      ) : null}
      <AddItemButton
        label="screenshot"
        count={screenshots.length}
        maximum={MAX_FRONT_PAGE_SCREENSHOTS}
        onClick={() =>
          onScreenshotsChange([
            ...screenshots,
            {
              id: createShellId("front-page-screenshot"),
              image: "",
              caption: "",
            },
          ])
        }
      />
    </EditorCard>
  )
}

function replaceItem<T extends { id: string }>(
  items: T[],
  id: string,
  replacement: T
) {
  return items.map((item) => (item.id === id ? replacement : item))
}
