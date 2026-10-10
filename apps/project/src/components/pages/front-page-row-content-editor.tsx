import type { ReactNode } from "react"
import { PlusIcon, Trash2Icon } from "lucide-react"

import { InspectorCard } from "@/components/shared/inspector-card"
import { DocumentEditor } from "@/components/shared/rich-text-editor"
import { SettingsSliderRow } from "@/components/settings/settings-slider-row"
import { ImageUpload } from "@/components/shared/image-upload"
import { Button } from "@/components/ui/button"
import { DisabledReason } from "@/components/ui/disabled-reason"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { createShellId } from "@/components/settings/nav-editor-shared"
import type { WrittenPageNode } from "@/lib/pages/written-page-body"
import {
  DEFAULT_FRONT_PAGE_DIVIDER_SPACE,
  frontPageDividerColor,
  MAX_FRONT_PAGE_DIVIDER_SHADE,
  MAX_FRONT_PAGE_DIVIDER_SPACE,
  FRONT_PAGE_DIVIDER_STYLE_HINTS,
  FRONT_PAGE_DIVIDER_STYLE_LABELS,
  FRONT_PAGE_DIVIDER_STYLES,
  FRONT_PAGE_HERO_ACTION_HINTS,
  FRONT_PAGE_HERO_ACTION_LABELS,
  FRONT_PAGE_HERO_ACTIONS,
  MAX_FRONT_PAGE_FAQ_ANSWER_LENGTH,
  MAX_FRONT_PAGE_HERO_BUTTON_HREF_LENGTH,
  MAX_FRONT_PAGE_HERO_BUTTON_LABEL_LENGTH,
  MAX_FRONT_PAGE_HERO_NOTE_LENGTH,
  MAX_FRONT_PAGE_HERO_SPACING,
  DEFAULT_FRONT_PAGE_HERO_SPACING,
  FRONT_PAGE_HERO_SPACING_PHONE_SHARE,
  MAX_FRONT_PAGE_HERO_STARS,
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
  type FrontPageDividerStyle,
  type FrontPageFaqItem,
  type FrontPageHeroAction,
  type FrontPageLogo,
  type FrontPageRowKind,
  type FrontPageScreenshot,
  type FrontPageTestimonial,
} from "@/lib/pages/front-page"

type FrontPageRowContentEditorProps = {
  kind: FrontPageRowKind
  /** The words of a `words` block. Ignored by every other kind. */
  words: WrittenPageNode
  onWordsChange: (body: WrittenPageNode) => void
  heroAction: FrontPageHeroAction
  heroImage: string
  heroAlt: string
  heroButtonLabel: string
  heroButtonHref: string
  heroNote: string
  heroStars: number
  heroSpacing: number
  testimonials: FrontPageTestimonial[]
  faqItems: FrontPageFaqItem[]
  logos: FrontPageLogo[]
  screenshots: FrontPageScreenshot[]
  dividerStyle: FrontPageDividerStyle
  dividerShade: number
  dividerSpace: number
  /**
   * True while the block is being held off the page and an empty entry is
   * what is holding it. The fields that are empty mark themselves, which is
   * what the refused Save press used to do before a block saved itself.
   */
  heldBack: boolean
  onHeroActionChange: (action: FrontPageHeroAction) => void
  onHeroImageChange: (image: string) => void
  onHeroAltChange: (alt: string) => void
  onHeroButtonLabelChange: (label: string) => void
  onHeroButtonHrefChange: (href: string) => void
  onHeroNoteChange: (note: string) => void
  onHeroStarsChange: (stars: number) => void
  onHeroSpacingChange: (spacing: number) => void
  onTestimonialsChange: (items: FrontPageTestimonial[]) => void
  onFaqItemsChange: (items: FrontPageFaqItem[]) => void
  onLogosChange: (items: FrontPageLogo[]) => void
  onScreenshotsChange: (items: FrontPageScreenshot[]) => void
  onDividerStyleChange: (style: FrontPageDividerStyle) => void
  onDividerShadeChange: (shade: number) => void
  onDividerSpaceChange: (space: number) => void
}

export function FrontPageRowContentEditor(
  props: FrontPageRowContentEditorProps
) {
  if (props.kind === "words") return <WordsEditor {...props} />
  if (props.kind === "hero") return <HeroEditor {...props} />
  if (props.kind === "testimonials") return <TestimonialsEditor {...props} />
  if (props.kind === "faq") return <FaqEditor {...props} />
  if (props.kind === "logos") return <LogosEditor {...props} />
  if (props.kind === "screenshots") return <ScreenshotsEditor {...props} />
  if (props.kind === "divider") return <DividerEditor {...props} />
  return null
}

/**
 * The writing in a rich text block, in the same editor a written page used.
 *
 * It is the one block whose content has no shape of its own: headings, lists,
 * links and emphasis, as long as the page needs. Everything it may hold is
 * named in `lib/pages/written-page-body.ts`, and anything else is dropped on
 * the way in — which is what keeps a block an admin typed off the list of
 * things a public page has to sanitise.
 */
function WordsEditor({ words, onWordsChange }: FrontPageRowContentEditorProps) {
  return (
    <EditorCard
      storageId="front-page-row-words"
      title="Rich text"
      description="Headings, lists, links and emphasis. Pictures and layout are what the other kinds of block are for."
    >
      <DocumentEditor value={words} onChange={onWordsChange} />
    </EditorCard>
  )
}

function DividerEditor({
  dividerStyle,
  dividerShade,
  dividerSpace,
  onDividerStyleChange,
  onDividerShadeChange,
  onDividerSpaceChange,
}: FrontPageRowContentEditorProps) {
  return (
    <EditorCard
      storageId="front-page-row-divider"
      title="Divider"
      description="A divider shows no words. It marks the break between the rows above and below it."
    >
      <div className="grid gap-2">
        <FieldLabel
          htmlFor="front-page-divider-style"
          hint={FRONT_PAGE_DIVIDER_STYLE_HINTS[dividerStyle]}
        >
          What it draws
        </FieldLabel>
        <Select
          value={dividerStyle}
          onValueChange={(value) =>
            onDividerStyleChange(value as FrontPageDividerStyle)
          }
        >
          <SelectTrigger
            id="front-page-divider-style"
            className="w-full sm:w-fit"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FRONT_PAGE_DIVIDER_STYLES.map((value) => (
              <SelectItem key={value} value={value}>
                {FRONT_PAGE_DIVIDER_STYLE_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* A space draws nothing to shade, and a line or dots have no height of
          their own, so the two rows below never both apply. */}
      {dividerStyle === "space" ? (
        <>
          <SettingsSliderRow
            label="Space"
            value={dividerSpace}
            min={0}
            max={MAX_FRONT_PAGE_DIVIDER_SPACE}
            step={4}
            valueLabel={
              dividerSpace === DEFAULT_FRONT_PAGE_DIVIDER_SPACE
                ? `${dividerSpace}px · Default`
                : `${dividerSpace}px`
            }
            onChange={onDividerSpaceChange}
            help="How tall this row is on a desktop, on top of the gap the page already puts between two rows. A phone draws 70% of it, the same share as Settings > Styling > Space between rows."
          />
          <div className="grid max-w-sm gap-2">
            <p className="text-sm font-medium">Preview</p>
            <div className="rounded-md border p-2">
              <div className="rounded-sm bg-muted" style={{ height: dividerSpace }} />
            </div>
            <p className="text-xs text-muted-foreground">
              {dividerSpace === 0
                ? "Nothing extra. The row adds only the page's own gap."
                : `${dividerSpace}px here, ${Math.round(dividerSpace * 0.7)}px on a phone.`}
            </p>
          </div>
        </>
      ) : (
        <>
          <SettingsSliderRow
            label="Shade"
            value={dividerShade}
            min={0}
            max={MAX_FRONT_PAGE_DIVIDER_SHADE}
            valueLabel={`${dividerShade}%`}
            onChange={onDividerShadeChange}
            help="How dark this divider is. It is this row's own number, not Settings > Styling > Divider lines, so one break can be stronger than the lines inside a card. 10% matches them."
          />
          <div className="grid max-w-sm gap-2">
            <p className="text-sm font-medium">Preview</p>
            <div className="rounded-md border p-4">
              {dividerStyle === "dots" ? (
                <div className="flex items-center gap-3">
                  {[0, 1, 2].map((dot) => (
                    <span
                      key={dot}
                      className="size-2 rounded-full"
                      style={{
                        backgroundColor: frontPageDividerColor(dividerShade),
                      }}
                    />
                  ))}
                </div>
              ) : (
                <hr
                  className="border-t"
                  style={{
                    borderTopColor: frontPageDividerColor(dividerShade),
                  }}
                />
              )}
            </div>
          </div>
        </>
      )}
    </EditorCard>
  )
}

/**
 * Every card in the row window collapses, so a row with a long list of
 * testimonials or FAQ entries can be folded away while its settings above are
 * edited. The open or closed choice is remembered per card in this browser.
 */
function EditorCard({
  storageId,
  title,
  description,
  children,
}: {
  storageId: string
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <InspectorCard
      storageId={storageId}
      title={title}
      description={description}
    >
      {children}
    </InspectorCard>
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
    // `bg-background`, like the fields beside it: on the card's grey this box
    // would otherwise be grey on grey with only its border to say it is a box.
    <div className="grid gap-4 rounded-md border bg-background p-3">
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

function HeroEditor({
  heroAction,
  heroImage,
  heroAlt,
  heroButtonLabel,
  heroButtonHref,
  heroNote,
  heroStars,
  heroSpacing,
  onHeroActionChange,
  onHeroImageChange,
  onHeroAltChange,
  onHeroButtonLabelChange,
  onHeroButtonHrefChange,
  onHeroNoteChange,
  onHeroStarsChange,
  onHeroSpacingChange,
}: FrontPageRowContentEditorProps) {
  return (
    <EditorCard
      storageId="front-page-row-hero"
      title="Hero"
      description="The heading and introduction above are the hero's words. Everything here sits under them."
    >
      <div className="grid gap-2">
        <FieldLabel
          htmlFor="front-page-hero-action"
          hint={FRONT_PAGE_HERO_ACTION_HINTS[heroAction]}
        >
          What it asks for
        </FieldLabel>
        <Select
          value={heroAction}
          onValueChange={(value) =>
            onHeroActionChange(value as FrontPageHeroAction)
          }
        >
          <SelectTrigger id="front-page-hero-action" className="w-full sm:w-fit">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FRONT_PAGE_HERO_ACTIONS.map((value) => (
              <SelectItem key={value} value={value}>
                {FRONT_PAGE_HERO_ACTION_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <FieldLabel
            htmlFor="front-page-hero-button-label"
            hint={
              heroAction === "email"
                ? "The wording on the button beside the address box."
                : "Leave both button fields empty to draw no button."
            }
          >
            Button wording
          </FieldLabel>
          <Input
            id="front-page-hero-button-label"
            value={heroButtonLabel}
            maxLength={MAX_FRONT_PAGE_HERO_BUTTON_LABEL_LENGTH}
            placeholder={heroAction === "email" ? "Subscribe" : "Get started"}
            onChange={(event) => onHeroButtonLabelChange(event.target.value)}
          />
        </div>
        {heroAction === "button" ? (
          <div className="grid gap-2">
            <FieldLabel
              htmlFor="front-page-hero-button-href"
              hint="A page on this site starts with /. Another site starts with https://."
            >
              Button link
            </FieldLabel>
            <Input
              id="front-page-hero-button-href"
              value={heroButtonHref}
              maxLength={MAX_FRONT_PAGE_HERO_BUTTON_HREF_LENGTH}
              placeholder="/register"
              onChange={(event) => onHeroButtonHrefChange(event.target.value)}
            />
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <FieldLabel
            htmlFor="front-page-hero-note"
            hint="One short line under the button, such as how many customers there are."
          >
            Line under the button
          </FieldLabel>
          <Input
            id="front-page-hero-note"
            value={heroNote}
            maxLength={MAX_FRONT_PAGE_HERO_NOTE_LENGTH}
            placeholder="Trusted by 850 customers"
            onChange={(event) => onHeroNoteChange(event.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <FieldLabel
            htmlFor="front-page-hero-stars"
            hint="Stars drawn before that line. None draws no stars."
          >
            Stars
          </FieldLabel>
          <Select
            value={String(heroStars)}
            onValueChange={(value) => onHeroStarsChange(Number(value))}
          >
            <SelectTrigger
              id="front-page-hero-stars"
              className="w-full sm:w-fit"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from(
                { length: MAX_FRONT_PAGE_HERO_STARS + 1 },
                (_, count) => (
                  <SelectItem key={count} value={String(count)}>
                    {count === 0 ? "None" : String(count)}
                  </SelectItem>
                )
              )}
            </SelectContent>
          </Select>
        </div>
      </div>

      <ImageUpload
        label="Picture"
        hint="Optional. With a picture the hero is two columns; without one the words run across the page."
        value={heroImage}
        aspect="square"
        fit="cover"
        emptyLabel="Add picture"
        className="max-w-24"
        onChange={(image, altText) => {
          onHeroImageChange(image)
          // The library's own name for the picture becomes what a screen
          // reader says, so there is no field here to fill in by hand.
          if (!heroAlt && altText) onHeroAltChange(altText)
        }}
      />

      <SettingsSliderRow
        label="Space above and below"
        value={heroSpacing}
        min={0}
        max={MAX_FRONT_PAGE_HERO_SPACING}
        step={4}
        valueLabel={
          heroSpacing === DEFAULT_FRONT_PAGE_HERO_SPACING
            ? `${heroSpacing}px · Default`
            : `${heroSpacing}px`
        }
        onChange={onHeroSpacingChange}
        help={`The hero's own air, inside its background colour. A phone draws ${Math.round(
          FRONT_PAGE_HERO_SPACING_PHONE_SHARE * 100
        )}% of it, because the room that separates a hero from the menu on a desktop is most of a phone screen. Settings > Styling > Main spacing does not touch the front page, so this is the number.`}
      />

    </EditorCard>
  )
}

function TestimonialsEditor({
  testimonials,
  heldBack,
  onTestimonialsChange,
}: FrontPageRowContentEditorProps) {
  return (
    <EditorCard
      storageId="front-page-row-testimonials"
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
                  aria-invalid={(heldBack && !item.name.trim()) || undefined}
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
              aria-invalid={(heldBack && !item.quote.trim()) || undefined}
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
  heldBack,
  onFaqItemsChange,
}: FrontPageRowContentEditorProps) {
  return (
    <EditorCard
      storageId="front-page-row-faq-entries"
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
              aria-invalid={(heldBack && !item.question.trim()) || undefined}
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
              aria-invalid={(heldBack && !item.answer.trim()) || undefined}
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
  heldBack,
  onLogosChange,
}: FrontPageRowContentEditorProps) {
  return (
    <EditorCard
      storageId="front-page-row-logos"
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
              invalid={heldBack && !item.image}
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
                aria-invalid={(heldBack && !item.alt.trim()) || undefined}
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
  heldBack,
  onScreenshotsChange,
}: FrontPageRowContentEditorProps) {
  return (
    <EditorCard
      storageId="front-page-row-screenshots"
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
            invalid={heldBack && !item.image}
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
              aria-invalid={(heldBack && !item.caption.trim()) || undefined}
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
