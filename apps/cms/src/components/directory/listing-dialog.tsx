import * as React from "react"
import { Loader2Icon } from "lucide-react"
import { toast } from "sonner"

import {
  MenuLinksFields,
  SocialLinksFields,
} from "@/components/directory/contact-links-fields"
import { ListingDetailsFields } from "@/components/directory/listing-details-fields"
import { ImageUpload } from "@/components/shared/image-upload"
import { DocumentEditor } from "@/components/shared/rich-text-editor"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { CharacterCount } from "@/components/shared/character-count"
import { LISTING_META_DESCRIPTION_MAX } from "@/lib/directory/field-lengths"
import { FieldLabel } from "@/components/ui/field-label"
import { FormDialog } from "@/components/ui/form-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { Category } from "@/lib/api/directory/categories"
import {
  getListingErrorMessage,
  saveListing,
  saveNewListing,
  type ListingForEdit,
} from "@/lib/api/directory/listings"
import {
  getListing,
  readSettledListing,
} from "@/lib/directory/listing-cache"
import type { MenuLink, SocialLink } from "@/lib/directory/contact-links"
import { slugFromTitle } from "@/lib/directory/slugs"
import {
  listingRatingFromText,
  LISTING_RATING_ERROR,
} from "@/lib/directory/listing-rating"
import {
  blankListingHours,
  requireListingCoordinates,
  type ListingHours,
} from "@/lib/directory/listing-details"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import type { WrittenPageNode } from "@/lib/pages/written-page-body"

/**
 * One listing's window, opened over the Listings list, for editing and for
 * creating — the same window does both, so making a listing never closes one
 * modal to animate another over it. A plain form, deliberately: no blocks, no
 * templates, no preview.
 *
 * Editing takes only an id and loads its own data, so a link that names a
 * listing works even when that listing is not on the page of the list you are
 * looking at. One window the whole way: it opens on a spinner and the form
 * appears inside it when the record arrives — never by remounting the dialog.
 */
export function ListingDialog({
  open,
  listingId,
  categories,
  preview,
  onClose,
  onSaved,
}: {
  open: boolean
  /** The listing to edit, or null to create a new one. */
  listingId: string | null
  /** The category tree, already in hand from the page's own loader. */
  categories: Category[]
  /**
   * What the row already says about this listing. Only used on the rare cold
   * open — a link straight to `?open=<id>`, or a click the prefetch did not
   * beat — so the window still says which listing it is instead of "Edit
   * listing" while the record is on its way.
   */
  preview?: { title: string; status: "draft" | "published" } | null
  onClose: () => void
  /** A save landed — the list behind the window is stale. */
  onSaved: () => void
}) {
  const [loaded, setLoaded] = React.useState<{
    forId: string
    data: ListingForEdit
  } | null>(null)

  /**
   * Set the moment a create's first request lands, so a failure in the rest
   * of the save leaves the window updating that listing rather than creating
   * a twin of it on the next press.
   */
  const [createdId, setCreatedId] = React.useState<string | null>(null)
  /** Once the address has been typed in directly, the title stops writing it. */
  const [slugEdited, setSlugEdited] = React.useState(false)

  const creating = listingId === null && createdId === null

  // A closed window forgets what it held, so reopening always reads afresh —
  // otherwise a second open would show the values from before the last save.
  const [wasOpen, setWasOpen] = React.useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (!open) {
      setLoaded(null)
      setCreatedId(null)
      setSlugEdited(false)
    }
  }

  /**
   * The record if the list's prefetch already has it. Read during render on
   * purpose: going through the effect below would paint one frame of spinner
   * even when the answer was already in hand.
   */
  const prefetched = open && listingId ? readSettledListing(listingId) : null

  // The window loads its own record. A listing that is gone (deleted in
  // another tab, a stale link) says so and closes rather than showing an
  // empty form that would "save" a blank over nothing.
  React.useEffect(() => {
    if (!open || !listingId) return
    if (loaded?.forId === listingId) return
    let cancelled = false
    void (async () => {
      try {
        const data = await getListing(listingId)
        if (cancelled) return
        if (!data) {
          showErrorToast("That listing no longer exists.")
          onClose()
          onSaved()
          return
        }
        setLoaded({ forId: listingId, data })
      } catch (error) {
        if (cancelled) return
        showErrorToast(getListingErrorMessage(error))
        onClose()
      }
    })()
    return () => {
      cancelled = true
    }
    // `loaded` is checked, not depended on: the fetch must run once per id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, listingId])

  // Yesterday's record must not flash while today's loads. A prefetched
  // record counts as ready straight away; a prefetch that came back empty
  // does not, so the effect above still runs and says the listing is gone.
  // Held steady across renders: the dirty check below is memoised on it, and
  // a fresh object every render would rebuild that on every keystroke.
  const ready = React.useMemo(
    () =>
      loaded?.forId === listingId
        ? loaded
        : listingId && prefetched?.value
          ? { forId: listingId, data: prefetched.value }
          : null,
    [loaded, listingId, prefetched]
  )

  /**
   * What the window is drawing, which is not quite the same thing as what it
   * has: a closing window keeps showing its last record until it is gone.
   *
   * Without this, saving looked like a second load. Closing empties the
   * record and the address's `?open=`, both of which are read by the header —
   * so for the length of the fade-out the window fell back to "Edit listing"
   * and a spinner, right after the form had been sitting there filled in.
   */
  const [shown, setShown] = React.useState(ready)
  if (open && shown !== ready) setShown(ready)

  /**
   * Creating starts on a blank form with nothing to wait for. Keyed on
   * `listingId` rather than `creating`: a create whose second half failed has
   * a `createdId` now, and asking `creating` there would blank the form the
   * person is still looking at.
   */
  const formReady = listingId === null || shown !== null

  const [title, setTitle] = React.useState("")
  const [slug, setSlug] = React.useState("")
  const [metaDescription, setMetaDescription] = React.useState("")
  const [rating, setRating] = React.useState("")
  const [ratingTouched, setRatingTouched] = React.useState(false)
  const [status, setStatus] = React.useState<"draft" | "published">("draft")
  const [displayOrder, setDisplayOrder] = React.useState("0")
  const [featuredImage, setFeaturedImage] = React.useState("")
  const [gallery, setGallery] = React.useState<string[]>([])
  const [hours, setHours] = React.useState<ListingHours>(blankListingHours)
  const [latitude, setLatitude] = React.useState("")
  const [longitude, setLongitude] = React.useState("")
  const [address, setAddress] = React.useState("")
  const [menuLinks, setMenuLinks] = React.useState<MenuLink[]>([])
  const [socialLinks, setSocialLinks] = React.useState<SocialLink[]>([])
  const [body, setBody] = React.useState<WrittenPageNode>({
    type: "doc",
    content: [],
  })
  const [categoryIds, setCategoryIds] = React.useState<Set<string>>(new Set())
  const [primaryCategoryId, setPrimaryCategoryId] = React.useState<
    string | null
  >(null)
  const [saving, setSaving] = React.useState(false)

  // Seed the fields the moment the record is in hand — adjusting during
  // render, which is what React asks for when state has to follow a prop.
  const [seededFor, setSeededFor] = React.useState<string | null>(null)
  /**
   * What the fields should currently hold: a record's id once it is here, or
   * "new" for a blank one. A window opened to create needs a key of its own —
   * it never gets a record, so keying only on that left the second listing
   * somebody wrote starting out full of the first one's words.
   */
  const seedKey = open ? (ready?.forId ?? (listingId === null ? "new" : null)) : null
  if (seededFor !== seedKey) {
    setSeededFor(seedKey)
    // Read straight off the record rather than the drawn one: this runs in
    // the same render that first sees it, one pass before `shown` catches up.
    if (ready) {
      const record = ready.data.listing
      setTitle(record.title)
      setSlug(record.slug)
      setMetaDescription(record.metaDescription)
      setRating(record.rating === null ? "" : String(record.rating))
      setRatingTouched(false)
      setStatus(record.status)
      setDisplayOrder(String(record.displayOrder))
      setFeaturedImage(record.featuredImage)
      setGallery(record.gallery)
      setHours(record.hours)
      setLatitude(record.latitude === null ? "" : String(record.latitude))
      setLongitude(record.longitude === null ? "" : String(record.longitude))
      setAddress(record.contactLinks.address)
      setMenuLinks(record.contactLinks.menuLinks)
      setSocialLinks(record.contactLinks.socialLinks)
      setBody(record.body)
      setCategoryIds(new Set(ready.data.categoryIds))
      setPrimaryCategoryId(ready.data.primaryCategoryId)
    } else if (seedKey === "new") {
      const blank = blankSnapshot()
      setTitle(blank.title)
      setSlug(blank.slug)
      setMetaDescription(blank.metaDescription)
      setRating(blank.rating)
      setRatingTouched(false)
      setStatus(blank.status)
      setDisplayOrder(String(blank.displayOrder))
      setFeaturedImage(blank.featuredImage)
      setGallery(blank.gallery)
      setHours(blank.hours)
      setLatitude(blank.latitude)
      setLongitude(blank.longitude)
      setAddress(blank.contactLinks.address)
      setMenuLinks(blank.contactLinks.menuLinks)
      setSocialLinks(blank.contactLinks.socialLinks)
      setBody(blank.body)
      setCategoryIds(new Set())
      setPrimaryCategoryId(null)
    }
  }

  const payload = () => ({
    title,
    slug,
    metaDescription,
    rating,
    status,
    displayOrder: Number.parseInt(displayOrder, 10) || 0,
    featuredImage,
    gallery,
    hours,
    latitude,
    longitude,
    contactLinks: { address, menuLinks, socialLinks },
    body,
    // Sorted so ticking a box off and on again is not read as an edit.
    categoryIds: [...categoryIds].sort(),
    primaryCategoryId:
      primaryCategoryId && categoryIds.has(primaryCategoryId)
        ? primaryCategoryId
        : null,
  })

  /** What the window opened with, in exactly the shape a save sends. */
  const openedWith = React.useMemo(() => {
    if (creating || createdId) return JSON.stringify(blankSnapshot())
    return ready ? JSON.stringify(openedSnapshot(ready.data)) : null
  }, [creating, createdId, ready])
  const dirty =
    openedWith !== null &&
    (creating || createdId !== null || seededFor === seedKey) &&
    JSON.stringify(payload()) !== openedWith

  async function save() {
    dismissErrorToast()
    let parsedRating: number | null
    let coordinates: ReturnType<typeof requireListingCoordinates>
    try {
      parsedRating = listingRatingFromText(rating)
      coordinates = requireListingCoordinates(latitude, longitude)
    } catch (error) {
      if (ratingTextIsInvalid(rating)) setRatingTouched(true)
      showErrorToast(
        error instanceof Error ? error.message : LISTING_RATING_ERROR
      )
      return
    }
    setSaving(true)
    try {
      const {
        rating: _rating,
        latitude: _latitude,
        longitude: _longitude,
        ...values
      } = payload()
      const next = {
        ...values,
        rating: parsedRating,
        latitude: coordinates?.latitude ?? null,
        longitude: coordinates?.longitude ?? null,
      }
      let id = listingId ?? createdId
      if (!id) {
        // Creating is two of the same guarded doors the edit path uses: make
        // the row, then fill it. If the second half fails, `createdId` keeps
        // the window pointed at the row it made, so pressing the button again
        // finishes the job instead of creating a twin.
        const created = await saveNewListing({
          title: next.title,
          slug: slugEdited && next.slug.trim() ? next.slug.trim() : undefined,
        })
        setCreatedId(created.id)
        id = created.id
        // Take the address the server actually gave it. Left alone, a name
        // that clashed would be saved as "joes-diner-2" while the form still
        // said "joes-diner" — and a retry after a failure here would then
        // fight over an address that is already taken.
        setTitle(created.title)
        setSlug(created.slug)
        const { title: _title, slug: _slug, ...rest } = next
        await saveListing({ id, ...rest })
      } else {
        await saveListing({ id, ...next })
      }
      onSaved()
      toast.success(listingId ? "Listing saved." : "Listing created.")
      onClose()
    } catch (error) {
      showErrorToast(getListingErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  const orderedCategories = React.useMemo(
    () => treeOrder(categories),
    [categories]
  )
  const chosenCategories = orderedCategories.filter(({ category }) =>
    categoryIds.has(category.id)
  )

  return (
    <FormDialog open={open} dirty={dirty} busy={saving} onClose={onClose}>
      {(requestClose) => (
        <DialogContent variant="admin" className="h-[48rem]">
          <DialogHeader>
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
              <DialogTitle className="min-w-0 truncate">
                {creating
                  ? title.trim() || "New listing"
                  : formReady
                    ? title || "Untitled listing"
                    : preview?.title || "Edit listing"}
              </DialogTitle>
              {/* The row already knows the name and whether it is live, so a
                  cold open says which listing it is rather than sitting on a
                  placeholder while the record arrives. */}
              {(formReady ? status : preview?.status) === "published" ? (
                <Badge variant="secondary">Published</Badge>
              ) : formReady || preview ? (
                <Badge variant="outline">Draft</Badge>
              ) : null}
            </div>
            <DialogDescription>
              {creating
                ? "It starts as a draft — nothing is public until it is published."
                : "What is typed here is what the public page shows."}
            </DialogDescription>
          </DialogHeader>

          <DialogBody>
            {!formReady ? (
              <div className="flex h-40 items-center justify-center">
                <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <Card size="sm">
                  <CardHeader>
                    <CardTitle>The listing</CardTitle>
                    <CardDescription>
                      The name, address and search wording. A draft is never
                      shown to a visitor.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-4">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                      <div className="grid gap-2 sm:flex-1">
                        <FieldLabel htmlFor="listing-title">Title</FieldLabel>
                        <Input
                          id="listing-title"
                          value={title}
                          disabled={saving}
                          onChange={(event) => {
                            setTitle(event.target.value)
                            // While creating, the address writes itself from
                            // the title until it is typed in directly.
                            if (creating && !slugEdited) {
                              setSlug(slugFromTitle(event.target.value))
                            }
                          }}
                        />
                      </div>
                      <div className="grid gap-2 sm:flex-1">
                        <FieldLabel
                          htmlFor="listing-slug"
                          hint="The public page's address part, like joes-diner. Changing it changes the page's address — old links stop working."
                        >
                          Address part
                        </FieldLabel>
                        <Input
                          id="listing-slug"
                          value={slug}
                          placeholder={creating ? "joes-diner" : undefined}
                          disabled={saving}
                          onChange={(event) => {
                            setSlug(event.target.value)
                            setSlugEdited(true)
                          }}
                          onBlur={() => {
                            if (!slug.trim() && title.trim()) {
                              setSlug(slugFromTitle(title))
                              setSlugEdited(false)
                            }
                          }}
                        />
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <div className="flex items-center justify-between gap-2">
                        <FieldLabel
                          htmlFor="listing-meta"
                          hint="What a search result shows under the title. A sentence or two."
                        >
                          Search description
                        </FieldLabel>
                        <CharacterCount
                          value={metaDescription}
                          max={LISTING_META_DESCRIPTION_MAX}
                        />
                      </div>
                      <Textarea
                        id="listing-meta"
                        rows={1}
                        maxLength={LISTING_META_DESCRIPTION_MAX}
                        value={metaDescription}
                        disabled={saving}
                        onChange={(event) =>
                          setMetaDescription(event.target.value)
                        }
                      />
                    </div>
                    <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start">
                      <div className="grid gap-2">
                        <FieldLabel htmlFor="listing-status">Status</FieldLabel>
                        <Select
                          value={status}
                          disabled={saving}
                          onValueChange={(value) =>
                            setStatus(value as "draft" | "published")
                          }
                        >
                          <SelectTrigger
                            id="listing-status"
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
                      <div className="grid gap-2 sm:max-w-40">
                        <FieldLabel
                          htmlFor="listing-order"
                          hint='Where it sits when the public list is sorted by "display order" — lower comes first.'
                        >
                          Display order
                        </FieldLabel>
                        <Input
                          id="listing-order"
                          type="number"
                          value={displayOrder}
                          disabled={saving}
                          onChange={(event) =>
                            setDisplayOrder(event.target.value)
                          }
                        />
                      </div>
                      <div className="grid gap-2 sm:max-w-40">
                        <FieldLabel
                          htmlFor="listing-rating"
                          hint="Use a rating from a trusted editorial source. This is not a visitor review score."
                        >
                          Rating
                        </FieldLabel>
                        <Input
                          id="listing-rating"
                          inputMode="decimal"
                          placeholder="4.3"
                          value={rating}
                          disabled={saving}
                          aria-invalid={
                            ratingTouched && ratingTextIsInvalid(rating)
                          }
                          onChange={(event) => setRating(event.target.value)}
                          onBlur={() => {
                            setRatingTouched(true)
                            if (ratingTextIsInvalid(rating)) {
                              showErrorToast(LISTING_RATING_ERROR)
                            }
                          }}
                        />
                      </div>
                    </div>
                    <div className="grid gap-2">
                      {/* The label sits outside the width cap so it stays on
                          one line while the box matches Settings' logo size. */}
                      <FieldLabel hint="Shown on the listing's page and its card in the public list.">
                        Featured photo
                      </FieldLabel>
                      <ImageUpload
                        label="Featured photo"
                        showLabel={false}
                        value={featuredImage}
                        disabled={saving}
                        onChange={(url) => setFeaturedImage(url)}
                        aspect="square"
                        fit="cover"
                        inlinePicker
                        className="max-w-24"
                      />
                    </div>
                  </CardContent>
                </Card>

                <ListingDetailsFields
                  gallery={gallery}
                  hours={hours}
                  latitude={latitude}
                  longitude={longitude}
                  disabled={saving}
                  onGalleryChange={setGallery}
                  onHoursChange={setHours}
                  onLatitudeChange={setLatitude}
                  onLongitudeChange={setLongitude}
                />

                <Card size="sm">
                  <CardHeader>
                    <CardTitle>Categories</CardTitle>
                    <CardDescription>
                      {orderedCategories.length
                        ? "Where visitors find it when browsing. The primary one is the category its breadcrumb names."
                        : "No categories exist yet — create them on the Categories screen and they appear here."}
                    </CardDescription>
                  </CardHeader>
                  {orderedCategories.length ? (
                    <CardContent className="grid gap-4">
                      <div className="grid gap-2">
                        {orderedCategories.map(({ category, depth }) => (
                          <div
                            key={category.id}
                            className="flex items-center gap-2"
                            style={
                              depth
                                ? { paddingLeft: `${depth * 1.25}rem` }
                                : undefined
                            }
                          >
                            <Checkbox
                              id={`listing-category-${category.id}`}
                              checked={categoryIds.has(category.id)}
                              disabled={saving}
                              onCheckedChange={() => {
                                setCategoryIds((current) => {
                                  const next = new Set(current)
                                  if (next.has(category.id)) {
                                    next.delete(category.id)
                                  } else {
                                    next.add(category.id)
                                  }
                                  return next
                                })
                              }}
                            />
                            <Label htmlFor={`listing-category-${category.id}`}>
                              {category.name}
                            </Label>
                          </div>
                        ))}
                      </div>
                      {chosenCategories.length ? (
                        <div className="grid gap-2">
                          <FieldLabel
                            htmlFor="listing-primary-category"
                            hint="The one category the listing's breadcrumb names. It has to be one of the ticked ones."
                          >
                            Primary category
                          </FieldLabel>
                          <Select
                            value={
                              primaryCategoryId &&
                              categoryIds.has(primaryCategoryId)
                                ? primaryCategoryId
                                : "none"
                            }
                            disabled={saving}
                            onValueChange={(value) =>
                              setPrimaryCategoryId(
                                value === "none" ? null : value
                              )
                            }
                          >
                            <SelectTrigger
                              id="listing-primary-category"
                              className="w-full sm:w-fit"
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">None</SelectItem>
                              {chosenCategories.map(({ category }) => (
                                <SelectItem
                                  key={category.id}
                                  value={category.id}
                                >
                                  {category.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ) : null}
                    </CardContent>
                  ) : null}
                </Card>

                <Card size="sm">
                  <CardHeader>
                    <CardTitle>Contact and links</CardTitle>
                    <CardDescription>
                      The street address, ways to reach the place, and its
                      social profiles. Blank rows are dropped on save.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-4">
                    <div className="grid gap-2">
                      <FieldLabel
                        htmlFor="listing-address"
                        hint="Shown as text on the page. The Get directions link type below is what makes it clickable."
                      >
                        Street address
                      </FieldLabel>
                      <Input
                        id="listing-address"
                        value={address}
                        disabled={saving}
                        onChange={(event) => setAddress(event.target.value)}
                      />
                    </div>
                    <MenuLinksFields
                      links={menuLinks}
                      disabled={saving}
                      onChange={setMenuLinks}
                    />
                    <SocialLinksFields
                      links={socialLinks}
                      disabled={saving}
                      onChange={setSocialLinks}
                    />
                  </CardContent>
                </Card>

                <Card size="sm">
                  <CardHeader>
                    <CardTitle>Write-up</CardTitle>
                    <CardDescription>
                      The listing's own words: headings, lists, links and
                      emphasis.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <DocumentEditor
                      value={body}
                      disabled={saving}
                      onChange={setBody}
                      placeholder="Write about this place…"
                    />
                  </CardContent>
                </Card>
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
              disabled={saving || !formReady}
              onClick={() => void save()}
            >
              {saving ? <Loader2Icon className="size-4 animate-spin" /> : null}
              {listingId ? "Save changes" : "Create listing"}
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </FormDialog>
  )
}

/** The categories in tree order, with how deep each sits, for the checkboxes. */
function treeOrder(
  categoriesList: Category[]
): { category: Category; depth: number }[] {
  const byParent = new Map<string | null, Category[]>()
  for (const category of categoriesList) {
    const key = category.parentId ?? null
    byParent.set(key, [...(byParent.get(key) ?? []), category])
  }
  const rows: { category: Category; depth: number }[] = []
  const walk = (parentId: string | null, depth: number) => {
    // Deeper than the tree can honestly be is a cycle left by hand-edited
    // data; stopping keeps the window up rather than looping forever.
    if (depth > 10) return
    for (const category of byParent.get(parentId) ?? []) {
      rows.push({ category, depth })
      walk(category.id, depth + 1)
    }
  }
  walk(null, 0)
  return rows
}

/** What a brand-new listing's form holds before anything is typed. */
function blankSnapshot() {
  return {
    title: "",
    slug: "",
    metaDescription: "",
    rating: "",
    status: "draft" as const,
    displayOrder: 0,
    featuredImage: "",
    gallery: [] as string[],
    hours: blankListingHours(),
    latitude: "",
    longitude: "",
    contactLinks: { address: "", menuLinks: [], socialLinks: [] },
    body: { type: "doc" as const, content: [] },
    categoryIds: [] as string[],
    primaryCategoryId: null,
  }
}

/** The opened-with snapshot, in exactly the shape a save sends. */
function openedSnapshot(data: ListingForEdit) {
  const { listing } = data
  return {
    title: listing.title,
    slug: listing.slug,
    metaDescription: listing.metaDescription,
    rating: listing.rating === null ? "" : String(listing.rating),
    status: listing.status,
    displayOrder: listing.displayOrder,
    featuredImage: listing.featuredImage,
    gallery: listing.gallery,
    hours: listing.hours,
    latitude: listing.latitude === null ? "" : String(listing.latitude),
    longitude: listing.longitude === null ? "" : String(listing.longitude),
    contactLinks: listing.contactLinks,
    body: listing.body,
    categoryIds: [...data.categoryIds].sort(),
    primaryCategoryId: data.primaryCategoryId,
  }
}

function ratingTextIsInvalid(value: string) {
  try {
    listingRatingFromText(value)
    return false
  } catch {
    return true
  }
}
