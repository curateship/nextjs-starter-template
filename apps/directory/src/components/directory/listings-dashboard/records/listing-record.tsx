import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { BookOpenIcon, CopyIcon, EyeIcon, FileTextIcon, LinkIcon, StoreIcon, TagIcon, Trash2Icon, UserRoundIcon } from "lucide-react"

import { TextPickRow } from "@/components/crm/crm-record-menu"
import { FooterState, RecordFrame } from "@/components/crm/record-frame"
import { CategoryCombobox } from "@/components/directory/category-combobox"
import { MenuLinksFields, SocialLinksFields } from "@/components/directory/contact-links-fields"
import { ListingCustomFields } from "@/components/directory/listing-custom-fields"
import { ListingDetailsFields } from "@/components/directory/listing-details-fields"
import { DetailNote, DetailRow, DetailRows } from "@/components/directory/listings-dashboard/detail-rows"
import {
  AutoSaveWords,
  PickGroup,
  RecordMenu,
  useAutoSave,
  type MenuAction,
} from "@/components/directory/listings-dashboard/section-parts"
import { CharacterCount } from "@/components/shared/character-count"
import { ImageUpload } from "@/components/shared/image-upload"
import { PickMenuRow } from "@/components/shared/notes/pick-rows"
import { PanelCard } from "@/components/shared/panel-card"
import { RecordPreviewLink } from "@/components/shared/record-preview-link"
import { DocumentEditor } from "@/components/shared/rich-text-editor"
import { Button } from "@/components/ui/button"
import { ErrorRow } from "@/components/ui/error-row"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { LoadingRow } from "@/components/ui/loading-row"
import { Textarea } from "@/components/ui/textarea"
import type { Category } from "@/lib/api/directory/categories"
import { getListingErrorMessage, loadFeaturedSpotEnd, saveListing, type ListingForEdit } from "@/lib/api/directory/listings"
import {
  getListingsDashboardErrorMessage,
  loadListingRecordFacts,
  type ListingRecordFacts,
} from "@/lib/api/directory/listings-dashboard"
import { categoryTreeOrder } from "@/lib/directory/category-tree"
import type { MenuLink, SocialLink } from "@/lib/directory/contact-links"
import { formCustomValues, type CustomSection, type CustomValues } from "@/lib/directory/custom-fields"
import { LISTING_META_DESCRIPTION_MAX } from "@/lib/directory/field-lengths"
import { forgetListings, getListing } from "@/lib/directory/listing-cache"
import { requireListingCoordinates, type ListingHours } from "@/lib/directory/listing-details"
import { LISTING_RATING_ERROR, listingRatingFromText } from "@/lib/directory/listing-rating"
import {
  DIRECTORY_LISTING_STATUSES,
  DIRECTORY_LISTING_STATUS_LABELS,
  type ListingStatus,
} from "@/lib/directory/listing-status"
import { waitedText } from "@/lib/directory/listings-dashboard-page"
import type { ListingsSection } from "@/lib/directory/listings-dashboard-search"
import { LISTING_REPORT_REASON_LABELS } from "@/lib/directory/report-reasons"
import { slugFromTitle } from "@/lib/directory/slugs"
import { formatDate } from "@/lib/format/format-time"
import { plural } from "@/lib/format/plural"
import { useLoad } from "@/lib/hooks/use-load"
import type { WrittenPageNode } from "@/lib/pages/written-page-body"

/**
 * One listing on the right of the Listings dashboard (Tyler, 18 Nov 2026:
 * "Match design pattern of the shell 1 to 1"). It was a window over the
 * Listings page with Cancel and Save; on the right it is the shell's record
 * frame, and every field saves itself, as the shell's contact and lead
 * records do.
 *
 * - **Header:** the featured photo, the name and its status and address,
 *   the public page's link, the ⋮ and the collapse button.
 * - **⋮:** Status, Primary category and Display order as grouped rows, then
 *   Duplicate, then Delete in red.
 * - **Body:** the listing's own fields in the shell's panel cards, and three
 *   cards of facts about it: who looks after it with its reports and saves,
 *   its views, and where else it appears. Each fact opens its own record.
 * - **Footer:** whether it is saved, and Publish or Unpublish.
 */
export function ListingRecord({
  listingId,
  title,
  categories,
  customSections,
  actions,
  onSaved,
}: {
  listingId: string
  /** The row's name, for the header while the record is read. */
  title: string
  categories: Category[]
  customSections: CustomSection[]
  /** Duplicate and Delete, from the list that owns them. */
  actions: { duplicate: () => void; remove: () => void; busy: boolean }
  onSaved: () => void
}) {
  // Wrapped, so a listing that is gone (an answer of null) is told apart
  // from one still being read.
  const read = useLoad(() => getListing(listingId).then((record) => ({ record })), getListingErrorMessage, {
    keys: [listingId],
  })
  const facts = useLoad(() => loadListingRecordFacts(listingId), getListingsDashboardErrorMessage, { keys: [listingId] })
  const record = read.data?.record

  if (!record) {
    return (
      <RecordFrame
        avatar={<StoreIcon aria-hidden />}
        title={title}
        hideLabel="Hide the listing"
        body={
          read.error ? (
            <ErrorRow message={read.error} onRetry={read.retry} />
          ) : read.data ? (
            <DetailNote>That listing no longer exists.</DetailNote>
          ) : (
            <LoadingRow label="Opening the listing…" />
          )
        }
      />
    )
  }

  return (
    <ListingForm
      key={listingId}
      record={record}
      categories={categories}
      customSections={customSections}
      facts={facts}
      actions={actions}
      onSaved={onSaved}
    />
  )
}

function ratingTextIsInvalid(value: string) {
  try {
    listingRatingFromText(value)
    return false
  } catch {
    return true
  }
}

function coordinatesProblem(latitude: string, longitude: string) {
  try {
    requireListingCoordinates(latitude, longitude)
    return null
  } catch (error) {
    return error instanceof Error ? error.message : "Check the map pin."
  }
}

function ListingForm({
  record,
  categories,
  customSections,
  facts,
  actions,
  onSaved,
}: {
  record: ListingForEdit
  categories: Category[]
  customSections: CustomSection[]
  facts: { data: ListingRecordFacts | null; error: string | null; retry: () => void }
  actions: { duplicate: () => void; remove: () => void; busy: boolean }
  onSaved: () => void
}) {
  const listing = record.listing
  const [title, setTitle] = React.useState(listing.title)
  const [slug, setSlug] = React.useState(listing.slug)
  // The address part saves when its box is left, never mid-word: a half-typed
  // address would move the public page with every key.
  const [savedSlug, setSavedSlug] = React.useState(listing.slug)
  const [metaDescription, setMetaDescription] = React.useState(listing.metaDescription)
  const [rating, setRating] = React.useState(listing.rating === null ? "" : String(listing.rating))
  const [status, setStatus] = React.useState<ListingStatus>(listing.status)
  const [displayOrder, setDisplayOrder] = React.useState(String(listing.displayOrder))
  const [featuredImage, setFeaturedImage] = React.useState(listing.featuredImage)
  const [gallery, setGallery] = React.useState<string[]>(listing.gallery)
  const [hours, setHours] = React.useState<ListingHours>(listing.hours)
  const [latitude, setLatitude] = React.useState(listing.latitude === null ? "" : String(listing.latitude))
  const [longitude, setLongitude] = React.useState(listing.longitude === null ? "" : String(listing.longitude))
  const [address, setAddress] = React.useState(listing.contactLinks.address)
  const [menuLinks, setMenuLinks] = React.useState<MenuLink[]>(listing.contactLinks.menuLinks)
  const [socialLinks, setSocialLinks] = React.useState<SocialLink[]>(listing.contactLinks.socialLinks)
  const [body, setBody] = React.useState<WrittenPageNode>(listing.body)
  const [customValues, setCustomValues] = React.useState<CustomValues>(() =>
    formCustomValues(customSections, listing.customValues)
  )
  const [categoryIds, setCategoryIds] = React.useState<Set<string>>(() => new Set(record.categoryIds))
  const [primaryCategoryId, setPrimaryCategoryId] = React.useState<string | null>(record.primaryCategoryId)
  /** When its paid spot runs out, asked the moment Closed is picked. */
  const [closingSpotEnds, setClosingSpotEnds] = React.useState<Date | null>(null)

  const ratingInvalid = ratingTextIsInvalid(rating)
  const mapProblem = coordinatesProblem(latitude, longitude)
  const ready = !ratingInvalid && !mapProblem && title.trim().length > 0

  const value = {
    title,
    slug: savedSlug,
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
    customValues,
    // Sorted so choosing a category and dropping it is not read as an edit.
    categoryIds: [...categoryIds].sort(),
    primaryCategoryId: primaryCategoryId && categoryIds.has(primaryCategoryId) ? primaryCategoryId : null,
  }

  const auto = useAutoSave({
    value,
    ready,
    message: getListingErrorMessage,
    save: async (next) => {
      const coordinates = requireListingCoordinates(next.latitude, next.longitude)
      const { rating: ratingText, latitude: _latitude, longitude: _longitude, ...rest } = next
      // Forgotten before as well as after, so the record opened again while
      // this save is on its way is read fresh rather than from the old copy.
      forgetListings()
      await saveListing({
        id: listing.id,
        ...rest,
        rating: listingRatingFromText(ratingText),
        latitude: coordinates?.latitude ?? null,
        longitude: coordinates?.longitude ?? null,
      })
      // The kept copy of the record is stale now, so the next open reads it again.
      forgetListings()
      onSaved()
    },
  })

  const orderedCategories = React.useMemo(() => categoryTreeOrder(categories), [categories])
  const chosenCategories = orderedCategories.filter(({ category }) => categoryIds.has(category.id))

  const pickStatus = (next: ListingStatus) => {
    setStatus(next)
    if (next === "closed") {
      loadFeaturedSpotEnd(listing.id).then(setClosingSpotEnds, () => setClosingSpotEnds(null))
    } else {
      setClosingSpotEnds(null)
    }
  }

  const menuActions: MenuAction[] = [
    { label: "Duplicate", icon: <CopyIcon className="size-4" />, onSelect: actions.duplicate, disabled: actions.busy },
    {
      label: "Delete listing",
      icon: <Trash2Icon className="size-4" />,
      destructive: true,
      onSelect: actions.remove,
      disabled: actions.busy,
    },
  ]

  const why = !title.trim() ? "Give it a name to save" : ratingInvalid ? "Fix the rating to save" : mapProblem ? "Fix the map pin to save" : undefined

  return (
    <RecordFrame
      avatar={
        featuredImage ? (
          <img src={featuredImage} alt="" className="size-6 rounded-md object-cover" />
        ) : (
          <StoreIcon aria-hidden />
        )
      }
      title={title.trim() || "Untitled listing"}
      line={`${DIRECTORY_LISTING_STATUS_LABELS[status]} · /directory/${savedSlug}`}
      hideLabel="Hide the listing"
      actions={
        <>
          {/* A closed listing still has its page, so the link opens it. */}
          <RecordPreviewLink word="listing" path={`/directory/${savedSlug}`} published={status !== "draft"} />
          <RecordMenu
            label="Listing menu"
            actions={menuActions}
            groups={
              <PickGroup
                title="Listing"
                after={
                  status === "closed" && closingSpotEnds ? (
                    <p role="note" className="px-1 pt-1.5 text-xs text-muted-foreground">
                      Closing ends its featured spot, paid until {formatDate(closingSpotEnds)}. No money is refunded.
                    </p>
                  ) : null
                }
              >
                <PickMenuRow
                  label="Status"
                  value={DIRECTORY_LISTING_STATUS_LABELS[status]}
                  options={DIRECTORY_LISTING_STATUSES.map((each) => ({
                    value: each,
                    label: DIRECTORY_LISTING_STATUS_LABELS[each],
                  }))}
                  selected={status}
                  onPick={(next) => pickStatus(next as ListingStatus)}
                />
                <PickMenuRow
                  label="Primary category"
                  value={chosenCategories.find(({ category }) => category.id === primaryCategoryId)?.category.name ?? "None"}
                  empty={!primaryCategoryId || !categoryIds.has(primaryCategoryId)}
                  disabled={!chosenCategories.length}
                  options={[
                    { value: "none", label: "None" },
                    ...chosenCategories.map(({ category }) => ({ value: category.id, label: category.name })),
                  ]}
                  selected={primaryCategoryId && categoryIds.has(primaryCategoryId) ? primaryCategoryId : "none"}
                  onPick={(next) => setPrimaryCategoryId(next === "none" ? null : next)}
                />
                <TextPickRow
                  label="Display order"
                  value={displayOrder}
                  inputMode="numeric"
                  onCommit={(next) => setDisplayOrder(String(Number.parseInt(next, 10) || 0))}
                />
              </PickGroup>
            }
          />
        </>
      }
      body={
        <>
          <PanelCard storageId="listing-basics" icon={<StoreIcon />} title="The listing" openWhen={!title.trim() || ratingInvalid}>
            <div className="grid gap-4">
              <div className="grid gap-2">
                <FieldLabel htmlFor="listing-title">Title</FieldLabel>
                <Input id="listing-title" value={title} aria-invalid={!title.trim()} onChange={(event) => setTitle(event.target.value)} />
              </div>
              <div className="grid gap-2">
                <FieldLabel
                  htmlFor="listing-slug"
                  hint="The public page's address part, like joes-diner. Changing it changes the page's address. Old links forward to the new one."
                >
                  Address part
                </FieldLabel>
                <Input
                  id="listing-slug"
                  value={slug}
                  onChange={(event) => setSlug(event.target.value)}
                  onBlur={() => {
                    const next = slug.trim() || slugFromTitle(title)
                    setSlug(next)
                    setSavedSlug(next)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur()
                  }}
                />
              </div>
              <div className="grid gap-2">
                <div className="flex items-center justify-between gap-2">
                  <FieldLabel htmlFor="listing-meta" hint="What a search result shows under the title. A sentence or two.">
                    Search description
                  </FieldLabel>
                  <CharacterCount value={metaDescription} max={LISTING_META_DESCRIPTION_MAX} />
                </div>
                <Textarea
                  id="listing-meta"
                  rows={2}
                  maxLength={LISTING_META_DESCRIPTION_MAX}
                  value={metaDescription}
                  onChange={(event) => setMetaDescription(event.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <FieldLabel htmlFor="listing-rating" hint="Use a rating from a trusted editorial source. This is not a visitor review score.">
                  Rating
                </FieldLabel>
                <Input
                  id="listing-rating"
                  inputMode="decimal"
                  placeholder="4.3"
                  className="max-w-32"
                  value={rating}
                  aria-invalid={ratingInvalid}
                  onChange={(event) => setRating(event.target.value)}
                />
                {ratingInvalid ? <p className="text-xs text-destructive">{LISTING_RATING_ERROR}</p> : null}
              </div>
              <div className="grid gap-2">
                <FieldLabel hint="Shown on the listing's page and its card in the public list.">Featured photo</FieldLabel>
                <ImageUpload
                  label="Featured photo"
                  showLabel={false}
                  value={featuredImage}
                  onChange={(url) => setFeaturedImage(url)}
                  aspect="square"
                  fit="cover"
                  className="max-w-24"
                />
              </div>
            </div>
          </PanelCard>

          <ListingFactCards facts={facts} />

          <ListingDetailsFields
            gallery={gallery}
            hours={hours}
            latitude={latitude}
            longitude={longitude}
            disabled={false}
            onGalleryChange={setGallery}
            onHoursChange={setHours}
            onLatitudeChange={setLatitude}
            onLongitudeChange={setLongitude}
            locationOpenWhen={Boolean(mapProblem)}
          />

          <PanelCard storageId="listing-categories" icon={<TagIcon />} title="Categories" meta={categoryIds.size || undefined}>
            <div className="grid gap-2">
              <p className="text-sm text-muted-foreground">
                Where visitors find it when browsing. The primary one, in the ⋮, is the category its breadcrumb names.
              </p>
              <CategoryCombobox
                idPrefix="listing-category"
                rows={orderedCategories}
                checked={categoryIds}
                disabled={false}
                onToggle={(id) =>
                  setCategoryIds((current) => {
                    const next = new Set(current)
                    if (next.has(id)) next.delete(id)
                    else next.add(id)
                    return next
                  })
                }
              />
            </div>
          </PanelCard>

          <PanelCard storageId="listing-contact" icon={<LinkIcon />} title="Contact and links">
            <div className="grid gap-4">
              <div className="grid gap-2">
                <FieldLabel
                  htmlFor="listing-address"
                  hint="Shown as text on the page. The Get directions link type below is what makes it clickable."
                >
                  Street address
                </FieldLabel>
                <Input id="listing-address" value={address} onChange={(event) => setAddress(event.target.value)} />
              </div>
              <MenuLinksFields links={menuLinks} disabled={false} onChange={setMenuLinks} />
              <SocialLinksFields links={socialLinks} disabled={false} onChange={setSocialLinks} />
            </div>
          </PanelCard>

          <PanelCard storageId="listing-write-up" icon={<FileTextIcon />} title="Write-up">
            <DocumentEditor value={body} onChange={setBody} placeholder="Write about this place…" />
          </PanelCard>

          {/* Last, in the site's own order: the same place they sit on the
              public page, so the record reads like the result. */}
          <ListingCustomFields sections={customSections} values={customValues} disabled={false} onChange={setCustomValues} />
        </>
      }
      footer={
        <>
          <FooterState>
            <AutoSaveWords state={auto.state} ready={ready} why={why} />
          </FooterState>
          {status === "published" ? (
            <Button type="button" variant="outline" onClick={() => pickStatus("draft")}>
              Unpublish
            </Button>
          ) : (
            <Button type="button" onClick={() => pickStatus("published")}>
              Publish
            </Button>
          )}
        </>
      }
    />
  )
}

/** A fact that opens its own record in another row of the dashboard. */
function OpenRow({
  name,
  line,
  section,
  id,
  search,
}: {
  name: string
  line?: string
  section: ListingsSection
  id: string
  /** The row's own filter, so a record that is not waiting is still in its list. */
  search?: Record<string, string>
}) {
  const navigate = useNavigate()
  return (
    <button
      type="button"
      className="flex w-full min-w-0 items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      onClick={() =>
        void navigate({
          to: "/admin/listings",
          search: { ...(section === "listings" ? {} : { section }), ...search, open: id },
        })
      }
    >
      <span className="min-w-0 flex-1 truncate">{name}</span>
      {line ? <span className="shrink-0 text-xs text-muted-foreground">{line}</span> : null}
    </button>
  )
}

/**
 * The listing's facts from elsewhere on the site, in three cards: who looks
 * after it with its open reports and saves, its views, and where else it
 * appears (Tyler's polish picks, 18 Nov 2026).
 */
function ListingFactCards({ facts }: { facts: { data: ListingRecordFacts | null; error: string | null; retry: () => void } }) {
  if (facts.error) return <ErrorRow message={facts.error} onRetry={facts.retry} />
  const data = facts.data
  if (!data) return null
  const elsewhere = data.guides.length + data.events.length + data.deals.length
  return (
    <>
      <PanelCard storageId="listing-owner-reports-saves" icon={<UserRoundIcon />} title="Owner, reports and saves">
        <div className="grid gap-2">
          <DetailRows>
            <DetailRow label="Owner" value={data.owner ? data.owner.name : "Not claimed"} />
            <DetailRow label="Open reports" value={data.reports.length ? data.reports.length.toLocaleString() : "None"} />
            <DetailRow
              label="Saved by"
              value={data.saves ? `${data.savedBy.toLocaleString()} ${plural(data.savedBy, "person", "people")}` : "Nobody yet"}
            />
          </DetailRows>
          {data.owner || data.waitingClaims.length || data.reports.length ? (
            <div className="-mx-1.5 grid">
              {data.owner ? (
                <OpenRow name={`${data.owner.name}'s claim`} line="Approved" section="claims" id={data.owner.id} search={{ status: "all" }} />
              ) : null}
              {data.waitingClaims.map((claim) => (
                <OpenRow key={claim.id} name={`${claim.name}'s claim`} line={`Waiting ${waitedText(claim.at)}`} section="claims" id={claim.id} />
              ))}
              {data.reports.map((report) => (
                <OpenRow
                  key={report.id}
                  name={LISTING_REPORT_REASON_LABELS[report.reason as keyof typeof LISTING_REPORT_REASON_LABELS] ?? "Report"}
                  line={waitedText(report.at)}
                  section="reports"
                  id={report.id}
                />
              ))}
            </div>
          ) : null}
        </div>
      </PanelCard>

      <PanelCard storageId="listing-views" icon={<EyeIcon />} title="Views" meta={data.views.all.toLocaleString()}>
        <DetailRows>
          <DetailRow label="Last 7 days" value={data.views.week.toLocaleString()} />
          <DetailRow label="Last 30 days" value={data.views.month.toLocaleString()} />
          <DetailRow label="Last year" value={data.views.year.toLocaleString()} />
          <DetailRow label="All time" value={data.views.all.toLocaleString()} />
        </DetailRows>
      </PanelCard>

      <PanelCard storageId="listing-elsewhere" icon={<BookOpenIcon />} title="Where it appears" meta={elsewhere || undefined}>
        {elsewhere ? (
          <div className="-mx-1.5 grid">
            {data.guides.map((guide) => (
              <OpenRow key={guide.id} name={guide.title} line="Guide" section="guides" id={guide.id} />
            ))}
            {data.events.map((event) => (
              <EventRow key={event.id} title={event.title} startDate={event.startDate} id={event.id} />
            ))}
            {data.deals.map((deal) => (
              <DealRow key={deal.id} title={deal.title} id={deal.id} />
            ))}
          </div>
        ) : (
          <DetailNote>No guide, upcoming event or live deal names it.</DetailNote>
        )}
      </PanelCard>
    </>
  )
}

/** An event at the listing, opening on Admin → Events. */
function EventRow({ title, startDate, id }: { title: string; startDate: string; id: string }) {
  const navigate = useNavigate()
  return (
    <button
      type="button"
      className="flex w-full min-w-0 items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      onClick={() => void navigate({ to: "/admin/events", search: { open: id } })}
    >
      <span className="min-w-0 flex-1 truncate">{title}</span>
      <span className="shrink-0 text-xs text-muted-foreground">Event, {formatDate(startDate)}</span>
    </button>
  )
}

/** A live deal of the listing, opening on Admin → Promotions. */
function DealRow({ title, id }: { title: string; id: string }) {
  const navigate = useNavigate()
  return (
    <button
      type="button"
      className="flex w-full min-w-0 items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      onClick={() => void navigate({ to: "/admin/promotions", search: { open: id } })}
    >
      <span className="min-w-0 flex-1 truncate">{title}</span>
      <span className="shrink-0 text-xs text-muted-foreground">Deal</span>
    </button>
  )
}
