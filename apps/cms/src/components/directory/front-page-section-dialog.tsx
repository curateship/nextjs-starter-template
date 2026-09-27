import * as React from "react"
import { Loader2Icon } from "lucide-react"

import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import { Button } from "@/components/ui/button"
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FieldLabel } from "@/components/ui/field-label"
import { FormDialog } from "@/components/ui/form-dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { ImageUpload } from "@/components/shared/image-upload"
import { CategoryPicker } from "@/components/directory/category-picker"
import {
  cleanPickedCategoryIds,
  DIRECTORY_CATEGORY_PICK_MESSAGE,
  type DirectoryCategorySource,
} from "@/lib/directory/category-cards"
import {
  cleanDirectoryFrontPageHero,
  directoryFrontPageHeroProblem,
  DIRECTORY_FRONT_PAGE_COUNT_DEFAULT,
  DIRECTORY_FRONT_PAGE_COUNT_MAX,
  DIRECTORY_FRONT_PAGE_COUNT_MESSAGE,
  DIRECTORY_FRONT_PAGE_COUNT_MIN,
  DIRECTORY_FRONT_PAGE_HEADING_MAX,
  DIRECTORY_FRONT_PAGE_HEADING_MESSAGE,
  DIRECTORY_FRONT_PAGE_INTRO_MAX,
  DIRECTORY_FRONT_PAGE_KINDS,
  DIRECTORY_FRONT_PAGE_KIND_HINTS,
  DIRECTORY_FRONT_PAGE_KIND_LABELS,
  DIRECTORY_FRONT_PAGE_LAYOUTS,
  DIRECTORY_FRONT_PAGE_LAYOUT_LABELS,
  DIRECTORY_FRONT_PAGE_SORTS,
  DIRECTORY_FRONT_PAGE_SORT_HINTS,
  DIRECTORY_FRONT_PAGE_SORT_LABELS,
  EMPTY_DIRECTORY_FRONT_PAGE_HERO,
  type DirectoryFrontPageHero,
  type DirectoryFrontPageKind,
  type DirectoryFrontPageLayout,
  type DirectoryFrontPageSection,
  type DirectoryFrontPageSort,
} from "@/lib/directory/front-page"
import {
  FRONT_PAGE_HERO_ACTION_HINTS,
  FRONT_PAGE_HERO_ACTION_LABELS,
  FRONT_PAGE_HERO_ACTIONS,
  MAX_FRONT_PAGE_HERO_BUTTON_HREF_LENGTH,
  MAX_FRONT_PAGE_HERO_BUTTON_LABEL_LENGTH,
  MAX_FRONT_PAGE_HERO_NOTE_LENGTH,
  MAX_FRONT_PAGE_HERO_STARS,
  type FrontPageHeroAction,
} from "@/lib/pages/front-page"
import type { Category } from "@/lib/api/directory/categories"
import {
  getFrontPageSectionErrorMessage,
  saveFrontPageSection,
  saveNewFrontPageSection,
} from "@/lib/api/directory/front-page-sections"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

/**
 * One row of the home page, edited in a single window: what it is called, which
 * listings it holds, how many, and how they draw.
 *
 * The map choice is only in the list when this site can actually draw one — it
 * needs the map switched on and a browser map key saved. Offering a choice that
 * quietly turns into a grid would be worse than not offering it, so the reason
 * is said under the field instead.
 */

/** Every category is the empty filter, and a select cannot hold an empty value. */
const EVERY_CATEGORY = "all"

/**
 * The wording for the three kinds of row that are a category and a count:
 * events, deals and posts. One table rather than a ternary per sentence, which
 * is what two kinds already cost and three would have made unreadable.
 */
const PICKED_ROW_WORDS = {
  events: {
    title: "Which events",
    description:
      "Published, public events that are not over yet, soonest first. The row is left off the page while nothing is coming up.",
    categoryHint:
      "Only events filed under this category, not its subcategories.",
    everyLabel: "Every event",
    plural: "events",
  },
  deals: {
    title: "Which deals",
    description:
      "Published deals that are not over yet, newest first, from Admin → Promotions. The row is left off the page while there are none.",
    categoryHint:
      "Only deals at listings filed under this category, not its subcategories.",
    everyLabel: "Every deal",
    plural: "deals",
  },
  posts: {
    title: "Which posts",
    description:
      "Published posts, newest first, from Admin → Posts. The row is left off the page while there are none, and while the Posts page is shut.",
    categoryHint:
      "Only posts filed under this category, not its subcategories.",
    everyLabel: "Every post",
    plural: "posts",
  },
} as const

/**
 * Every field of the hero in one string, for telling a changed window from an
 * untouched one. Seven comparisons written out would be seven chances to forget
 * one, and a forgotten one means the Cancel button closes without asking.
 */
function heroFingerprint(hero: DirectoryFrontPageHero) {
  return [
    hero.action,
    hero.image,
    hero.alt,
    hero.buttonLabel,
    hero.buttonHref,
    hero.note,
    String(hero.stars),
  ].join("\u0000")
}

/**
 * The hero's own fields. The heading and the introduction above are its words,
 * so they are not repeated here.
 */
function HeroCard({
  hero,
  disabled,
  onChange,
}: {
  hero: DirectoryFrontPageHero
  disabled: boolean
  onChange: (change: Partial<DirectoryFrontPageHero>) => void
}) {
  return (
    <CollapsibleSettingsCard
      size="sm"
      storageId="front-page-section-hero"
      title="The hero"
      description={
        <>
          The heading and introduction above are the hero&apos;s words.
          Everything here sits under them.
        </>
      }
      contentClassName="grid gap-4"
    >
      <div className="grid gap-2">
        <FieldLabel
          htmlFor="front-page-section-hero-action"
          hint={FRONT_PAGE_HERO_ACTION_HINTS[hero.action]}
        >
          What it asks for
        </FieldLabel>
        <Select
          value={hero.action}
          disabled={disabled}
          onValueChange={(value) =>
            onChange({ action: value as FrontPageHeroAction })
          }
        >
          <SelectTrigger
            id="front-page-section-hero-action"
            className="w-full sm:w-fit"
          >
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
            htmlFor="front-page-section-hero-button-label"
            hint={
              hero.action === "email"
                ? "The wording on the button beside the address box."
                : "Leave both button fields empty to draw no button."
            }
          >
            Button wording
          </FieldLabel>
          <Input
            id="front-page-section-hero-button-label"
            value={hero.buttonLabel}
            maxLength={MAX_FRONT_PAGE_HERO_BUTTON_LABEL_LENGTH}
            placeholder={
              hero.action === "email" ? "Subscribe" : "Browse the directory"
            }
            disabled={disabled}
            onChange={(event) => onChange({ buttonLabel: event.target.value })}
          />
        </div>
        {hero.action === "button" ? (
          <div className="grid gap-2">
            <FieldLabel
              htmlFor="front-page-section-hero-button-href"
              hint="A page on this site starts with /. Another site starts with https://."
            >
              Button link
            </FieldLabel>
            <Input
              id="front-page-section-hero-button-href"
              value={hero.buttonHref}
              maxLength={MAX_FRONT_PAGE_HERO_BUTTON_HREF_LENGTH}
              placeholder="/directory"
              disabled={disabled}
              onChange={(event) => onChange({ buttonHref: event.target.value })}
            />
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <FieldLabel
            htmlFor="front-page-section-hero-note"
            hint="One short line under the button, such as how many places are listed."
          >
            Line under the button
          </FieldLabel>
          <Input
            id="front-page-section-hero-note"
            value={hero.note}
            maxLength={MAX_FRONT_PAGE_HERO_NOTE_LENGTH}
            placeholder="850 places, all reviewed"
            disabled={disabled}
            onChange={(event) => onChange({ note: event.target.value })}
          />
        </div>
        <div className="grid gap-2">
          <FieldLabel
            htmlFor="front-page-section-hero-stars"
            hint="Stars drawn before that line. None draws no stars."
          >
            Stars
          </FieldLabel>
          <Select
            value={String(hero.stars)}
            disabled={disabled}
            onValueChange={(value) => onChange({ stars: Number(value) })}
          >
            <SelectTrigger
              id="front-page-section-hero-stars"
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
        value={hero.image}
        aspect="square"
        fit="cover"
        // No `inlinePicker` here on purpose. Inside a window that scrolls its
        // own body, the library opens below the fold and nothing scrolls down
        // to it, so the click looks like it did nothing. See
        // `workspace/docs/image-fields.md`.
        emptyLabel="Add picture"
        className="max-w-24"
        disabled={disabled}
        onChange={(image, altText) =>
          // The library's own name for the picture becomes what a screen
          // reader says, so there is no field here to fill in by hand.
          onChange({
            image,
            ...(hero.alt || !altText ? {} : { alt: altText }),
          })
        }
      />
    </CollapsibleSettingsCard>
  )
}

export function FrontPageSectionDialog({
  open,
  section,
  categories,
  mapAvailable,
  onClose,
  onSaved,
}: {
  open: boolean
  /** The row being edited, or null when adding one. */
  section: DirectoryFrontPageSection | null
  categories: Category[]
  /** This site has the map switched on and a browser map key saved. */
  mapAvailable: boolean
  onClose: () => void
  onSaved: (saved: DirectoryFrontPageSection, wasNew: boolean) => void
}) {
  const [heading, setHeading] = React.useState("")
  const [intro, setIntro] = React.useState("")
  const [kind, setKind] = React.useState<DirectoryFrontPageKind>("listings")
  const [categorySource, setCategorySource] =
    React.useState<DirectoryCategorySource>("top-level")
  const [pickedIds, setPickedIds] = React.useState<string[]>([])
  const [categoryId, setCategoryId] = React.useState(EVERY_CATEGORY)
  const [sort, setSort] = React.useState<DirectoryFrontPageSort>("newest")
  const [count, setCount] = React.useState(
    String(DIRECTORY_FRONT_PAGE_COUNT_DEFAULT)
  )
  const [layout, setLayout] = React.useState<DirectoryFrontPageLayout>("grid")
  const [hero, setHero] = React.useState<DirectoryFrontPageHero>(
    EMPTY_DIRECTORY_FRONT_PAGE_HERO
  )
  const [centred, setCentred] = React.useState(false)
  const [saving, setSaving] = React.useState(false)

  // Filled from the row every time the window opens, so a window reopened on a
  // different row never shows the last one's words.
  const [loadedFor, setLoadedFor] = React.useState<string | null>(null)
  const key = open ? (section?.id ?? "new") : null
  if (loadedFor !== key) {
    setLoadedFor(key)
    setHeading(section?.heading ?? "")
    setIntro(section?.intro ?? "")
    setKind(section?.kind ?? "listings")
    setCategorySource(section?.categorySource ?? "top-level")
    setPickedIds(section?.pickedCategoryIds ?? [])
    setCategoryId(section?.categoryId ?? EVERY_CATEGORY)
    setSort(section?.sort ?? "newest")
    setCount(
      String(section?.listingCount ?? DIRECTORY_FRONT_PAGE_COUNT_DEFAULT)
    )
    setLayout(section?.layout ?? "grid")
    setHero(section?.hero ?? EMPTY_DIRECTORY_FRONT_PAGE_HERO)
    setCentred(section?.centred ?? false)
  }

  /** One field of the hero at a time, the rest of it left alone. */
  const editHero = (change: Partial<DirectoryFrontPageHero>) =>
    setHero((current) => ({ ...current, ...change }))

  // Null for the two kinds that are not a category and a count: a row of
  // listings has its own sort and layout, and a row of category cards picks
  // its categories rather than filtering by one.
  const pickedWords =
    kind === "events" || kind === "deals" || kind === "posts"
      ? PICKED_ROW_WORDS[kind]
      : null

  const countNumber = Number(count)
  const countInvalid =
    !Number.isInteger(countNumber) ||
    countNumber < DIRECTORY_FRONT_PAGE_COUNT_MIN ||
    countNumber > DIRECTORY_FRONT_PAGE_COUNT_MAX

  const dirty =
    heading !== (section?.heading ?? "") ||
    intro !== (section?.intro ?? "") ||
    kind !== (section?.kind ?? "listings") ||
    categorySource !== (section?.categorySource ?? "top-level") ||
    pickedIds.join(",") !== (section?.pickedCategoryIds ?? []).join(",") ||
    categoryId !== (section?.categoryId ?? EVERY_CATEGORY) ||
    sort !== (section?.sort ?? "newest") ||
    count !==
      String(section?.listingCount ?? DIRECTORY_FRONT_PAGE_COUNT_DEFAULT) ||
    layout !== (section?.layout ?? "grid") ||
    heroFingerprint(hero) !==
      heroFingerprint(section?.hero ?? EMPTY_DIRECTORY_FRONT_PAGE_HERO) ||
    centred !== (section?.centred ?? false)

  // A row already saved as a map on a site that has since lost its key still
  // shows its own choice, so saving does not silently change it to a grid.
  const layouts = DIRECTORY_FRONT_PAGE_LAYOUTS.filter(
    (value) => value !== "map" || mapAvailable || section?.layout === "map"
  )

  const save = React.useCallback(async () => {
    if (!heading.trim()) {
      showErrorToast(DIRECTORY_FRONT_PAGE_HEADING_MESSAGE)
      return
    }
    if (countInvalid) {
      showErrorToast(DIRECTORY_FRONT_PAGE_COUNT_MESSAGE)
      return
    }

    if (kind === "hero") {
      const problem = directoryFrontPageHeroProblem(hero)
      if (problem) {
        showErrorToast(problem)
        return
      }
    }

    if (
      kind === "categories" &&
      categorySource === "picked" &&
      cleanPickedCategoryIds(pickedIds).length === 0
    ) {
      showErrorToast(DIRECTORY_CATEGORY_PICK_MESSAGE)
      return
    }

    const values = {
      heading: heading.trim(),
      intro: intro.trim(),
      kind,
      categorySource,
      pickedCategoryIds: pickedIds,
      categoryId: categoryId === EVERY_CATEGORY ? null : categoryId,
      sort,
      listingCount: countNumber,
      layout,
      // Cleaned here as well as on the server, so the window sends what it
      // would have drawn rather than the half-typed version behind it.
      hero: cleanDirectoryFrontPageHero(hero),
      centred,
    }

    setSaving(true)
    try {
      const saved = section
        ? await saveFrontPageSection({ id: section.id, ...values })
        : await saveNewFrontPageSection(values)
      dismissErrorToast()
      onSaved(saved, section === null)
    } catch (error) {
      showErrorToast(getFrontPageSectionErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }, [
    categoryId,
    categorySource,
    centred,
    countInvalid,
    countNumber,
    heading,
    hero,
    intro,
    kind,
    layout,
    onSaved,
    pickedIds,
    section,
    sort,
  ])

  return (
    <FormDialog open={open} dirty={dirty} busy={saving} onClose={onClose}>
      {(requestClose) => (
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>
              {section ? heading.trim() || "Untitled row" : "New row"}
            </DialogTitle>
            <DialogDescription>
              A row on this site&apos;s home page: listings, a card per
              category, the soonest events, the deals that are on, the newest
              posts, a hero, or the plans on sale.
            </DialogDescription>
          </DialogHeader>

          <DialogBody>
            <CollapsibleSettingsCard
              size="sm"
              storageId="front-page-section-words"
              title="What it says"
              description={<>The heading visitors read above the row.</>}
              contentClassName="grid gap-4"
            >
              <div className="grid gap-2">
                <FieldLabel
                  htmlFor="front-page-section-kind"
                  hint={DIRECTORY_FRONT_PAGE_KIND_HINTS[kind]}
                >
                  What the row shows
                </FieldLabel>
                <Select
                  value={kind}
                  disabled={saving}
                  onValueChange={(value) =>
                    setKind(value as DirectoryFrontPageKind)
                  }
                >
                  <SelectTrigger
                    id="front-page-section-kind"
                    className="w-full sm:w-fit"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DIRECTORY_FRONT_PAGE_KINDS.map((value) => (
                      <SelectItem key={value} value={value}>
                        {DIRECTORY_FRONT_PAGE_KIND_LABELS[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <FieldLabel htmlFor="front-page-section-heading">
                  Heading
                </FieldLabel>
                <Input
                  id="front-page-section-heading"
                  value={heading}
                  maxLength={DIRECTORY_FRONT_PAGE_HEADING_MAX}
                  placeholder="New this week"
                  disabled={saving}
                  aria-invalid={heading.trim() === "" ? true : undefined}
                  onChange={(event) => setHeading(event.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <FieldLabel
                  htmlFor="front-page-section-intro"
                  hint="One line under the heading. Leave it empty for no line at all."
                >
                  Introduction
                </FieldLabel>
                <Textarea
                  id="front-page-section-intro"
                  value={intro}
                  maxLength={DIRECTORY_FRONT_PAGE_INTRO_MAX}
                  disabled={saving}
                  onChange={(event) => setIntro(event.target.value)}
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="front-page-section-centred"
                  checked={centred}
                  disabled={saving}
                  onCheckedChange={setCentred}
                />
                <FieldLabel
                  htmlFor="front-page-section-centred"
                  hint="Off, the row reads from the left like the rest of the site. On, its heading, its line and its buttons sit in the middle of the page. The cards under a row are laid out the same way either way."
                >
                  Centre this row
                </FieldLabel>
              </div>
            </CollapsibleSettingsCard>

            {kind === "hero" ? (
              <HeroCard hero={hero} disabled={saving} onChange={editHero} />
            ) : kind === "plans" ? (
              <CollapsibleSettingsCard
                size="sm"
                storageId="front-page-section-plans"
                title="Which plans"
              >
                <p className="text-sm text-muted-foreground">
                  The plans on sale right now, in the same cards the
                  platform&apos;s own front page draws. They belong to the whole
                  deployment rather than to this site, so there is nothing to
                  choose here. A plan card sends a visitor to the register form
                  and a member to their own billing page. The row is left off
                  the page while nothing is on sale.
                </p>
              </CollapsibleSettingsCard>
            ) : pickedWords ? (
              <CollapsibleSettingsCard
                size="sm"
                storageId="front-page-section-picked"
                title={pickedWords.title}
                description={pickedWords.description}
                contentClassName="grid gap-4"
              >
                <div className="grid gap-2">
                  <FieldLabel
                    htmlFor="front-page-section-event-category"
                    hint={pickedWords.categoryHint}
                  >
                    Category
                  </FieldLabel>
                  <Select
                    value={categoryId}
                    disabled={saving}
                    onValueChange={setCategoryId}
                  >
                    <SelectTrigger
                      id="front-page-section-event-category"
                      className="w-full sm:w-fit"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={EVERY_CATEGORY}>
                        {pickedWords.everyLabel}
                      </SelectItem>
                      {categories.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid max-w-40 gap-2">
                  <FieldLabel
                    htmlFor="front-page-section-count"
                    hint={`At most this many ${pickedWords.plural}, between ${DIRECTORY_FRONT_PAGE_COUNT_MIN} and ${DIRECTORY_FRONT_PAGE_COUNT_MAX}.`}
                  >
                    How many
                  </FieldLabel>
                  <Input
                    id="front-page-section-count"
                    type="number"
                    min={DIRECTORY_FRONT_PAGE_COUNT_MIN}
                    max={DIRECTORY_FRONT_PAGE_COUNT_MAX}
                    value={count}
                    disabled={saving}
                    aria-invalid={countInvalid || undefined}
                    onChange={(event) => setCount(event.target.value)}
                  />
                </div>
              </CollapsibleSettingsCard>
            ) : kind === "categories" ? (
              <CollapsibleSettingsCard
                size="sm"
                storageId="front-page-section-categories"
                title="Which categories"
                description={
                  <>
                    Each card shows the category&apos;s photo, its name, and how
                    many listings sit under it — including everything nested
                    beneath it.
                  </>
                }
                contentClassName="grid gap-4"
              >
                <CategoryPicker
                  idPrefix="front-page-section"
                  categories={categories}
                  source={categorySource}
                  pickedIds={pickedIds}
                  disabled={saving}
                  onSourceChange={setCategorySource}
                  onPickedChange={setPickedIds}
                />
                <div className="grid max-w-40 gap-2">
                  <FieldLabel
                    htmlFor="front-page-section-count"
                    hint={`At most this many cards, between ${DIRECTORY_FRONT_PAGE_COUNT_MIN} and ${DIRECTORY_FRONT_PAGE_COUNT_MAX}.`}
                  >
                    How many
                  </FieldLabel>
                  <Input
                    id="front-page-section-count"
                    type="number"
                    min={DIRECTORY_FRONT_PAGE_COUNT_MIN}
                    max={DIRECTORY_FRONT_PAGE_COUNT_MAX}
                    value={count}
                    disabled={saving}
                    aria-invalid={countInvalid || undefined}
                    onChange={(event) => setCount(event.target.value)}
                  />
                </div>
              </CollapsibleSettingsCard>
            ) : (
              <>
                <CollapsibleSettingsCard
                  size="sm"
                  storageId="front-page-section-listings"
                  title="Which listings"
                  description={DIRECTORY_FRONT_PAGE_SORT_HINTS[sort]}
                  contentClassName="grid gap-4"
                >
                  <div className="grid gap-2">
                    <FieldLabel
                      htmlFor="front-page-section-category"
                      hint="A row whose category has nothing published in it is left off the page entirely."
                    >
                      Category
                    </FieldLabel>
                    <Select
                      value={categoryId}
                      disabled={saving}
                      onValueChange={setCategoryId}
                    >
                      <SelectTrigger
                        id="front-page-section-category"
                        className="w-full sm:w-fit"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={EVERY_CATEGORY}>
                          Every category
                        </SelectItem>
                        {categories.map((category) => (
                          <SelectItem key={category.id} value={category.id}>
                            {category.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-2">
                    <FieldLabel htmlFor="front-page-section-sort">
                      Order
                    </FieldLabel>
                    <Select
                      value={sort}
                      disabled={saving}
                      onValueChange={(value) =>
                        setSort(value as DirectoryFrontPageSort)
                      }
                    >
                      <SelectTrigger
                        id="front-page-section-sort"
                        className="w-full sm:w-fit"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DIRECTORY_FRONT_PAGE_SORTS.map((value) => (
                          <SelectItem key={value} value={value}>
                            {DIRECTORY_FRONT_PAGE_SORT_LABELS[value]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid max-w-40 gap-2">
                    <FieldLabel
                      htmlFor="front-page-section-count"
                      hint={`Between ${DIRECTORY_FRONT_PAGE_COUNT_MIN} and ${DIRECTORY_FRONT_PAGE_COUNT_MAX}.`}
                    >
                      How many
                    </FieldLabel>
                    <Input
                      id="front-page-section-count"
                      type="number"
                      min={DIRECTORY_FRONT_PAGE_COUNT_MIN}
                      max={DIRECTORY_FRONT_PAGE_COUNT_MAX}
                      value={count}
                      disabled={saving}
                      aria-invalid={countInvalid || undefined}
                      onChange={(event) => setCount(event.target.value)}
                    />
                  </div>
                </CollapsibleSettingsCard>

                <CollapsibleSettingsCard
                  size="sm"
                  storageId="front-page-section-layout"
                  title="How it draws"
                  description={
                    mapAvailable
                      ? "A map only plots listings that have a location."
                      : "The map choice appears once this site has the map switched on and a map key saved, under Map view above."
                  }
                  contentClassName="grid gap-4"
                >
                  <div className="grid gap-2">
                    <FieldLabel htmlFor="front-page-section-layout">
                      Arrangement
                    </FieldLabel>
                    <Select
                      value={layout}
                      disabled={saving}
                      onValueChange={(value) =>
                        setLayout(value as DirectoryFrontPageLayout)
                      }
                    >
                      <SelectTrigger
                        id="front-page-section-layout"
                        className="w-full sm:w-fit"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {layouts.map((value) => (
                          <SelectItem key={value} value={value}>
                            {DIRECTORY_FRONT_PAGE_LAYOUT_LABELS[value]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CollapsibleSettingsCard>
              </>
            )}
          </DialogBody>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={requestClose}
            >
              Cancel
            </Button>
            <Button type="button" disabled={saving} onClick={() => void save()}>
              {saving ? <Loader2Icon className="size-4 animate-spin" /> : null}
              {section ? "Save changes" : "Create row"}
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </FormDialog>
  )
}
