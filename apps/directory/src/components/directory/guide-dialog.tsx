import * as React from "react"
import {
  DndContext,
  closestCenter,
  type Announcements,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { GripVerticalIcon, Loader2Icon, XIcon } from "lucide-react"
import { toast } from "sonner"

import { ListingPicker } from "@/components/directory/listing-picker"
import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import {
  useNavSensors,
  useSortableRow,
} from "@/components/settings/nav-editor-shared"
import { CharacterCount } from "@/components/shared/character-count"
import { ImageUpload } from "@/components/shared/image-upload"
import { RecordPreviewLink } from "@/components/shared/record-preview-link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { DisabledReason } from "@/components/ui/disabled-reason"
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
import { Textarea } from "@/components/ui/textarea"
import {
  getGuideErrorMessage,
  loadGuideForEdit,
  saveGuide,
  saveNewGuide,
  type GuideForEdit,
  type GuideListing,
} from "@/lib/api/directory/guides"
import {
  MAX_GUIDE_INTRO,
  MAX_GUIDE_LISTINGS,
  type GuideStatus,
} from "@/lib/directory/guides"
import { slugFromTitle } from "@/lib/directory/slugs"
import { focusRing } from "@/lib/layout/focus-ring"
import { mediaImageSrcSet } from "@/lib/media/image-sizes"
import {
  collapseStorageKey,
  useRememberedCollapse,
} from "@/lib/remembered-choice"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

type GuideFields = {
  title: string
  slug: string
  intro: string
  coverImage: string
  status: GuideStatus
  listings: GuideListing[]
}

function blankFields(): GuideFields {
  return {
    title: "",
    slug: "",
    intro: "",
    coverImage: "",
    status: "draft",
    listings: [],
  }
}

function fieldsFrom(data: GuideForEdit): GuideFields {
  return {
    title: data.guide.title,
    slug: data.guide.slug,
    intro: data.guide.intro,
    coverImage: data.guide.coverImage,
    status: data.guide.status,
    listings: data.listings,
  }
}

/** What a save compares and sends: the listings as ids, in their order. */
function snapshot(fields: GuideFields) {
  const { listings, ...rest } = fields
  return JSON.stringify({ ...rest, listingIds: listings.map((row) => row.id) })
}

/**
 * One guide's window, opened over the Guides list, for editing and creating.
 * It loads its own record from the id, so a link straight to `?open=<id>`
 * works whichever page of the list is showing.
 *
 * The listings are dragged into the order the public page draws them in. A
 * listing that is not published stays in the guide, marked, and the public
 * page leaves it out until it is published again.
 */
export function GuideDialog({
  open,
  guideId,
  preview,
  onClose,
  onSaved,
}: {
  open: boolean
  /** The guide to edit, or null to create one. */
  guideId: string | null
  /** What the row already says, so a cold open names the guide while it loads. */
  preview?: { title: string; status: GuideStatus } | null
  onClose: () => void
  /** A save landed, so the list behind the window is stale. */
  onSaved: () => void
}) {
  const [loaded, setLoaded] = React.useState<{
    forId: string
    data: GuideForEdit
  } | null>(null)
  /** Set when a create's first half lands, so a retry never makes a twin. */
  const [createdId, setCreatedId] = React.useState<string | null>(null)
  /** Once the address is typed directly, the title stops writing it. */
  const [slugEdited, setSlugEdited] = React.useState(false)
  const [fields, setFields] = React.useState<GuideFields>(blankFields)
  const [saving, setSaving] = React.useState(false)
  const [basicsOpen, setBasicsOpen, basicsNoFlash] = useRememberedCollapse(
    collapseStorageKey.settingsCard("guide-basics")
  )

  const creating = guideId === null && createdId === null
  const ready = guideId === null || loaded?.forId === guideId
  /** The saved record, which is what the preview link may point at. */
  const saved = loaded?.forId === guideId ? loaded.data.guide : null

  // A closed window forgets what it held, so the next open reads afresh.
  const [wasOpen, setWasOpen] = React.useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (!open) {
      setLoaded(null)
      setCreatedId(null)
      setSlugEdited(false)
    }
  }

  React.useEffect(() => {
    if (!open || !guideId) return
    let cancelled = false
    loadGuideForEdit(guideId).then(
      (data) => {
        if (cancelled) return
        if (!data) {
          showErrorToast("That guide no longer exists.")
          onClose()
          onSaved()
          return
        }
        setLoaded({ forId: guideId, data })
      },
      (error: unknown) => {
        if (cancelled) return
        showErrorToast(getGuideErrorMessage(error))
        onClose()
      }
    )
    return () => {
      cancelled = true
    }
    // The fetch runs once per opened id; the callbacks are the parent's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, guideId])

  // Fill the fields the moment there is something to fill them with, during
  // render, which is how React asks for state that follows a prop.
  const seedKey = open
    ? guideId === null
      ? "new"
      : (loaded?.forId ?? null)
    : null
  const [seededFor, setSeededFor] = React.useState<string | null>(null)
  if (seededFor !== seedKey) {
    setSeededFor(seedKey)
    if (seedKey === "new") setFields(blankFields())
    else if (loaded && seedKey === loaded.forId) {
      setFields(fieldsFrom(loaded.data))
    }
  }

  const openedWith = React.useMemo(
    () =>
      guideId === null
        ? snapshot(blankFields())
        : loaded
          ? snapshot(fieldsFrom(loaded.data))
          : null,
    [guideId, loaded]
  )
  const dirty =
    openedWith !== null && seededFor === seedKey && snapshot(fields) !== openedWith

  const update = <Key extends keyof GuideFields>(
    key: Key,
    value: GuideFields[Key]
  ) => setFields((current) => ({ ...current, [key]: value }))

  async function save() {
    dismissErrorToast()
    setSaving(true)
    try {
      let id = guideId ?? createdId
      const { title, slug, listings, ...rest } = fields
      const listingIds = listings.map((row) => row.id)
      if (!id) {
        const created = await saveNewGuide({
          title,
          slug: slugEdited && slug.trim() ? slug.trim() : undefined,
        })
        setCreatedId(created.id)
        id = created.id
        // Take the address the server gave it, which may be numbered.
        setFields((current) => ({
          ...current,
          title: created.title,
          slug: created.slug,
        }))
        await saveGuide({ id, ...rest, listingIds })
      } else {
        await saveGuide({ id, title, slug, ...rest, listingIds })
      }
      onSaved()
      toast.success(guideId ? "Guide saved." : "Guide created.")
      onClose()
    } catch (error) {
      // Every refusal is about the title or the address, in the first card.
      setBasicsOpen(true)
      showErrorToast(getGuideErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  const title = ready ? fields.title : (preview?.title ?? "")
  const status = ready ? fields.status : preview?.status
  const hidden = fields.listings.filter((row) => row.status !== "published")

  return (
    <FormDialog open={open} dirty={dirty} busy={saving} onClose={onClose}>
      {(requestClose) => (
        <DialogContent variant="admin" className="h-[48rem]">
          <DialogHeader>
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
              <DialogTitle className="min-w-0 truncate">
                {title.trim() || (creating ? "New guide" : "Untitled guide")}
              </DialogTitle>
              {status === "published" ? (
                <Badge variant="secondary">Published</Badge>
              ) : status === "draft" ? (
                <Badge variant="outline">Draft</Badge>
              ) : null}
              <RecordPreviewLink
                word="guide"
                path={saved ? `/guides/${saved.slug}` : null}
                published={saved?.status === "published"}
              />
            </div>
            <DialogDescription>
              {creating
                ? "It starts as a draft. Nothing is public until it is published."
                : "What is here is what the guide's page shows, in this order."}
            </DialogDescription>
          </DialogHeader>

          <DialogBody>
            {!ready ? (
              <div className="flex h-40 items-center justify-center">
                <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <CollapsibleSettingsCard
                  size="sm"
                  storageId="guide-basics"
                  collapse={{
                    open: basicsOpen,
                    onOpenChange: setBasicsOpen,
                    noFlashKey: basicsNoFlash,
                  }}
                  title="The guide"
                  description="The title, address, intro and cover. A draft is never shown to a visitor."
                  contentClassName="grid gap-4"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                    <div className="grid gap-2 sm:flex-1">
                      <FieldLabel htmlFor="guide-title">Title</FieldLabel>
                      <Input
                        id="guide-title"
                        value={fields.title}
                        disabled={saving}
                        onChange={(event) => {
                          const next = event.target.value
                          setFields((current) => ({
                            ...current,
                            title: next,
                            // While creating, the address follows the title
                            // until it is typed in directly.
                            slug:
                              creating && !slugEdited
                                ? slugFromTitle(next)
                                : current.slug,
                          }))
                        }}
                      />
                    </div>
                    <div className="grid gap-2 sm:flex-1">
                      <FieldLabel
                        htmlFor="guide-slug"
                        hint="The part after /guides/ in the guide's address. Changing it changes the address. Old links forward to the new one."
                      >
                        Address part
                      </FieldLabel>
                      <Input
                        id="guide-slug"
                        value={fields.slug}
                        placeholder={
                          creating ? "best-brunch-in-the-west-end" : undefined
                        }
                        disabled={saving}
                        onChange={(event) => {
                          update("slug", event.target.value)
                          setSlugEdited(true)
                        }}
                        onBlur={() => {
                          if (!fields.slug.trim() && fields.title.trim()) {
                            update("slug", slugFromTitle(fields.title))
                            setSlugEdited(false)
                          }
                        }}
                      />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <FieldLabel
                        htmlFor="guide-intro"
                        hint="A sentence or two at the top of the guide, on its card on the Guides page and when it is shared."
                      >
                        Intro
                      </FieldLabel>
                      <CharacterCount
                        value={fields.intro}
                        max={MAX_GUIDE_INTRO}
                      />
                    </div>
                    <Textarea
                      id="guide-intro"
                      rows={1}
                      maxLength={MAX_GUIDE_INTRO}
                      value={fields.intro}
                      disabled={saving}
                      onChange={(event) => update("intro", event.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <FieldLabel htmlFor="guide-status">Status</FieldLabel>
                    <Select
                      value={fields.status}
                      disabled={saving}
                      onValueChange={(value) =>
                        update("status", value as GuideStatus)
                      }
                    >
                      <SelectTrigger
                        id="guide-status"
                        className="w-full sm:w-fit"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="published">Published</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <FieldLabel hint="Shown at the top of the guide, on its card on the Guides page, and when it is shared.">
                      Cover image
                    </FieldLabel>
                    <ImageUpload
                      label="Cover image"
                      showLabel={false}
                      value={fields.coverImage}
                      disabled={saving}
                      onChange={(url) => update("coverImage", url)}
                      aspect="square"
                      fit="cover"
                      className="max-w-24"
                    />
                  </div>
                </CollapsibleSettingsCard>

                <CollapsibleSettingsCard
                  size="sm"
                  storageId="guide-listings"
                  title="Listings"
                  description="Drag them into the order the guide's page shows them in."
                  contentClassName="grid gap-4"
                >
                  <GuideListings
                    listings={fields.listings}
                    disabled={saving}
                    onChange={(listings) => update("listings", listings)}
                  />
                  {hidden.length ? (
                    <p className="text-sm text-muted-foreground" role="status">
                      {hidden.length === 1
                        ? "1 listing here is not published, so the guide's page leaves it out until it is."
                        : `${hidden.length} listings here are not published, so the guide's page leaves them out until they are.`}
                    </p>
                  ) : null}
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
            <Button
              type="button"
              disabled={saving || !ready}
              onClick={() => void save()}
            >
              {saving ? <Loader2Icon className="size-4 animate-spin" /> : null}
              {guideId ? "Save changes" : "Create guide"}
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </FormDialog>
  )
}

/**
 * The guide's listings, one row each, dragged by the grip into order. The grip
 * also moves a row from the keyboard: Space picks it up, the arrows move it,
 * Space puts it down.
 */
function GuideListings({
  listings,
  disabled,
  onChange,
}: {
  listings: GuideListing[]
  disabled: boolean
  onChange: (listings: GuideListing[]) => void
}) {
  const sensors = useNavSensors()
  const ids = listings.map((row) => row.id)
  const full = listings.length >= MAX_GUIDE_LISTINGS

  // What a screen reader hears while a row moves: the listing's name and its
  // new place, rather than the ids dnd-kit would read out on its own.
  const titleOf = (id: string | number) =>
    listings.find((row) => row.id === String(id))?.title ?? "The listing"
  const placeOf = (id: string | number | undefined) =>
    id === undefined ? null : ids.indexOf(String(id)) + 1
  const announcements: Announcements = {
    onDragStart: ({ active }) =>
      `Picked up ${titleOf(active.id)}, number ${placeOf(active.id)}.`,
    onDragOver: ({ active, over }) =>
      over
        ? `${titleOf(active.id)} is over number ${placeOf(over.id)}.`
        : undefined,
    onDragEnd: ({ active, over }) =>
      over
        ? `${titleOf(active.id)} dropped at number ${placeOf(over.id)}.`
        : `${titleOf(active.id)} dropped where it was.`,
    onDragCancel: ({ active }) =>
      `${titleOf(active.id)} put back where it was.`,
  }

  const handleDragEnd = (event: DragEndEvent) => {
    if (!event.over || event.active.id === event.over.id) return
    const from = ids.indexOf(String(event.active.id))
    const to = ids.indexOf(String(event.over.id))
    if (from === -1 || to === -1) return
    onChange(arrayMove(listings, from, to))
  }

  return (
    <div className="grid gap-3">
      {listings.length ? (
        <DndContext
          id="guide-listings"
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
          accessibility={{ announcements }}
        >
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <ol className="grid gap-2">
              {listings.map((listing, index) => (
                <GuideListingRow
                  key={listing.id}
                  listing={listing}
                  position={index + 1}
                  disabled={disabled}
                  onRemove={() =>
                    onChange(listings.filter((row) => row.id !== listing.id))
                  }
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      ) : (
        <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
          No listings yet. Add the first one.
        </p>
      )}
      <div>
        <DisabledReason
          disabled={full}
          reason={`A guide holds up to ${MAX_GUIDE_LISTINGS} listings.`}
        >
          <ListingPicker
            label="Add a listing"
            inputId="guide-listing-search"
            size="sm"
            disabled={disabled || full}
            onPick={(picked) => {
              if (ids.includes(picked.id)) {
                showErrorToast(`${picked.title} is already in this guide.`)
                return
              }
              onChange([
                ...listings,
                {
                  id: picked.id,
                  title: picked.title,
                  status: picked.status,
                  featuredImage: picked.featuredImage,
                },
              ])
            }}
          />
        </DisabledReason>
      </div>
    </div>
  )
}

function GuideListingRow({
  listing,
  position,
  disabled,
  onRemove,
}: {
  listing: GuideListing
  position: number
  disabled: boolean
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, style } = useSortableRow(
    listing.id
  )
  const notShown =
    listing.status === "draft"
      ? "Draft, so the page leaves it out"
      : listing.status === "closed"
        ? "Closed, so the page leaves it out"
        : null

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex min-w-0 items-center gap-2 rounded-lg border bg-background p-2"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        disabled={disabled}
        aria-label={`Move ${listing.title}, number ${position}`}
        className={`flex size-8 shrink-0 cursor-grab items-center justify-center rounded-md text-muted-foreground active:cursor-grabbing ${focusRing}`}
      >
        <GripVerticalIcon className="size-4" />
      </button>
      {listing.featuredImage ? (
        <img
          src={listing.featuredImage}
          srcSet={mediaImageSrcSet(listing.featuredImage)}
          sizes="40px"
          alt=""
          className="size-10 shrink-0 rounded-md object-cover"
        />
      ) : (
        <div className="size-10 shrink-0 rounded-md bg-muted" aria-hidden="true" />
      )}
      <div className="grid min-w-0 flex-1 gap-0.5">
        <p className="truncate text-sm font-medium">
          <span className="text-muted-foreground tabular-nums">{position}.</span>{" "}
          {listing.title}
        </p>
        {notShown ? (
          <p className="truncate text-xs text-muted-foreground">{notShown}</p>
        ) : null}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        disabled={disabled}
        aria-label={`Take ${listing.title} out of the guide`}
        onClick={onRemove}
      >
        <XIcon className="size-4" />
      </Button>
    </li>
  )
}
