import * as React from "react"
import { Loader2Icon } from "lucide-react"
import { toast } from "sonner"

import { ListingPicker } from "@/components/directory/listing-picker"
import {
  DealClaimsCard,
  DealDaysCard,
  DealHeadlineCard,
  DealTimesCard,
  DealWordsCard,
} from "@/components/promotions/deal-fields"
import { WhoClaimedList } from "@/components/promotions/who-claimed"
import { ImageUpload } from "@/components/shared/image-upload"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
import type { ListingChoice } from "@/lib/api/posts/posts"
import { removeDealClaim, type DealClaim } from "@/lib/api/promotions/claims"
import {
  getPromotionErrorMessage,
  loadListingHoursForDeal,
  loadPromotionForEdit,
  reopenEndedPromotion,
  savePromotion,
  saveNewPromotion,
  type PromotionWindowData,
} from "@/lib/api/promotions/promotions"
import { slugFromTitle } from "@/lib/directory/slugs"
import { hasDealTimes } from "@/lib/promotions/deal-times"
import {
  blankDealContent,
  dealContentFrom,
  dealContentInput,
  type DealContentFields,
} from "@/lib/promotions/deal-content"
import { formatDate } from "@/lib/format/format-time"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

type PromotionFields = DealContentFields & {
  slug: string
  /** Empty while no listing is picked. */
  listingId: string
  status: "draft" | "published"
}

function blankFields(): PromotionFields {
  return { ...blankDealContent(), slug: "", listingId: "", status: "draft" }
}

function fieldsFrom(data: PromotionWindowData): PromotionFields {
  const { promotion } = data
  return {
    ...dealContentFrom(promotion),
    slug: promotion.slug,
    listingId: promotion.listingId,
    status: promotion.status,
  }
}

/**
 * One deal's window, opened over Admin → Promotions, for editing and for
 * creating. It loads its own record from the id, so a link straight to
 * `?open=<id>` works whichever page of the list is showing.
 */
export function PromotionDialog({
  open,
  promotionId,
  preview,
  onClose,
  onSaved,
}: {
  open: boolean
  /** The deal to edit, or null to create one. */
  promotionId: string | null
  /** What the row already says, so a cold open names the deal while it loads. */
  preview?: { title: string; status: "draft" | "published" } | null
  onClose: () => void
  /** A save landed, so the list behind the window is stale. */
  onSaved: () => void
}) {
  const [loaded, setLoaded] = React.useState<{
    forId: string
    data: PromotionWindowData
  } | null>(null)
  /** Once the address is typed directly, the title stops writing it. */
  const [slugEdited, setSlugEdited] = React.useState(false)
  /** Set by a refused save, so the missing fields are marked. */
  const [tried, setTried] = React.useState(false)
  const [fields, setFields] = React.useState<PromotionFields>(blankFields)
  /** The listing as the picker or the load gave it, for its name and status. */
  const [picked, setPicked] = React.useState<ListingChoice | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [copyingHours, setCopyingHours] = React.useState(false)
  const [reopening, setReopening] = React.useState(false)
  /** Who claimed. Taking one away changes it without a save. */
  const [claims, setClaims] = React.useState<DealClaim[]>([])
  const [removingClaim, setRemovingClaim] = React.useState<string | null>(null)

  const creating = promotionId === null
  const ready = creating || loaded?.forId === promotionId

  // A closed window forgets what it held, so the next open reads afresh.
  const [wasOpen, setWasOpen] = React.useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (!open) {
      setLoaded(null)
      setSlugEdited(false)
      setTried(false)
    }
  }

  React.useEffect(() => {
    if (!open || !promotionId) return
    let cancelled = false
    loadPromotionForEdit(promotionId).then(
      (data) => {
        if (cancelled) return
        if (!data) {
          showErrorToast("That deal no longer exists.")
          onClose()
          onSaved()
          return
        }
        setLoaded({ forId: promotionId, data })
      },
      (error: unknown) => {
        if (cancelled) return
        showErrorToast(getPromotionErrorMessage(error))
        onClose()
      }
    )
    return () => {
      cancelled = true
    }
    // The fetch runs once per opened id; the callbacks are the parent's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, promotionId])

  // Fill the fields the moment there is something to fill them with, during
  // render, which is how React asks for state that follows a prop.
  const seedKey = open
    ? creating
      ? "new"
      : (loaded?.forId ?? null)
    : null
  const [seededFor, setSeededFor] = React.useState<string | null>(null)
  if (seededFor !== seedKey) {
    setSeededFor(seedKey)
    if (seedKey === "new") {
      setFields(blankFields())
      setPicked(null)
    } else if (loaded && seedKey === loaded.forId) {
      setFields(fieldsFrom(loaded.data))
      setPicked(loaded.data.listing)
      setClaims(loaded.data.claims)
    }
  }

  const openedWith = React.useMemo(
    () =>
      creating
        ? JSON.stringify(blankFields())
        : loaded
          ? JSON.stringify(fieldsFrom(loaded.data))
          : null,
    [creating, loaded]
  )
  const dirty =
    openedWith !== null &&
    seededFor === seedKey &&
    JSON.stringify(fields) !== openedWith

  const update = <Key extends keyof PromotionFields>(
    key: Key,
    value: PromotionFields[Key]
  ) => setFields((current) => ({ ...current, [key]: value }))
  /** The same, for the shared content cards, which know only their own boxes. */
  const updateContent = <Key extends keyof DealContentFields>(
    key: Key,
    value: DealContentFields[Key]
  ) => setFields((current) => ({ ...current, [key]: value }))

  /** Fills every day from the listing's opening hours. */
  async function copyListingHours() {
    dismissErrorToast()
    setCopyingHours(true)
    try {
      const hours = await loadListingHoursForDeal(fields.listingId)
      if (!hours) throw new Error("That listing is not on this site any more.")
      if (!hasDealTimes(hours)) {
        throw new Error(
          `${picked?.title ?? "That listing"} has no opening hours to copy.`
        )
      }
      update("times", hours)
    } catch (error) {
      showErrorToast(getPromotionErrorMessage(error))
    } finally {
      setCopyingHours(false)
    }
  }

  /** Takes one claim away at once, without waiting for a save. */
  async function takeClaimAway(claimId: string) {
    if (!promotionId) return
    dismissErrorToast()
    setRemovingClaim(claimId)
    try {
      setClaims(await removeDealClaim({ promotionId, claimId }))
      toast.success("The claim is taken away. Its place is free again.")
    } catch (error) {
      showErrorToast(getPromotionErrorMessage(error))
    } finally {
      setRemovingClaim(null)
    }
  }

  /** Undoes "End now" at once, without waiting for a save. */
  async function reopen() {
    if (!promotionId || !loaded) return
    dismissErrorToast()
    setReopening(true)
    try {
      await reopenEndedPromotion(promotionId)
      setLoaded({
        ...loaded,
        data: {
          ...loaded.data,
          promotion: { ...loaded.data.promotion, endedAt: null },
        },
      })
      onSaved()
      toast.success("The deal is back on its own days and times.")
    } catch (error) {
      showErrorToast(getPromotionErrorMessage(error))
    } finally {
      setReopening(false)
    }
  }

  async function save() {
    dismissErrorToast()
    setSaving(true)
    try {
      const input = { ...fields, ...dealContentInput(fields) }
      if (promotionId) {
        await savePromotion({ id: promotionId, ...input })
      } else {
        await saveNewPromotion({
          ...input,
          slug: slugEdited && fields.slug.trim() ? fields.slug.trim() : undefined,
        })
      }
      onSaved()
      toast.success(promotionId ? "Deal saved." : "Deal created.")
      onClose()
    } catch (error) {
      setTried(true)
      showErrorToast(getPromotionErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  const title = ready ? fields.title : (preview?.title ?? "")
  const status = ready ? fields.status : preview?.status
  const createdBy = loaded?.data.createdBy
  const createdAt = loaded?.data.promotion.createdAt

  return (
    <FormDialog open={open} dirty={dirty} busy={saving} onClose={onClose}>
      {(requestClose) => (
        <DialogContent variant="admin">
          <DialogHeader>
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
              <DialogTitle className="min-w-0 truncate">
                {title.trim() || (creating ? "New deal" : "Untitled deal")}
              </DialogTitle>
              {status === "published" ? (
                <Badge variant="secondary">Published</Badge>
              ) : status === "draft" ? (
                <Badge variant="outline">Draft</Badge>
              ) : null}
            </div>
            <DialogDescription>
              {creating
                ? "Nothing is public until it is published."
                : createdAt
                  ? `Written by ${createdBy ?? "an account that is gone"} on ${formatDate(createdAt)}.`
                  : "What is written here is what the deal's page shows."}
            </DialogDescription>
          </DialogHeader>

          <DialogBody>
            {!ready ? (
              <div className="flex h-40 items-center justify-center">
                <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <Card size="sm">
                  <CardHeader>
                    <CardTitle>The deal</CardTitle>
                    <CardDescription>
                      One deal at one listing. A draft is never shown to a
                      visitor.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-4">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                      <div className="grid gap-2 sm:flex-1">
                        <FieldLabel htmlFor="promotion-title">Title</FieldLabel>
                        <Input
                          id="promotion-title"
                          value={fields.title}
                          maxLength={200}
                          placeholder="Two-for-one pasta Tuesdays"
                          disabled={saving}
                          aria-invalid={tried && !fields.title.trim()}
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
                          htmlFor="promotion-slug"
                          hint="The part after /deals/ in the deal's address. Changing it changes the address, and old links stop working."
                        >
                          Address part
                        </FieldLabel>
                        <Input
                          id="promotion-slug"
                          value={fields.slug}
                          disabled={saving}
                          aria-invalid={tried && !creating && !fields.slug.trim()}
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
                      <FieldLabel
                        htmlFor="promotion-listing"
                        hint="The place the deal is at. The deal page links to it. Deleting the listing deletes its deals."
                      >
                        Listing
                      </FieldLabel>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <Input
                          id="promotion-listing"
                          readOnly
                          value={picked?.title ?? ""}
                          placeholder="No listing picked yet"
                          aria-invalid={tried && !fields.listingId}
                          className="sm:flex-1"
                        />
                        <ListingPicker
                          label={fields.listingId ? "Pick another" : "Pick a listing"}
                          inputId="promotion-listing-search"
                          disabled={saving}
                          onPick={(listing) => {
                            setPicked(listing)
                            update("listingId", listing.id)
                          }}
                        />
                      </div>
                      {picked?.status === "draft" ? (
                        <p className="text-sm text-muted-foreground" role="status">
                          This listing is a draft, so the deal stays off the
                          Deals page until the listing is published.
                        </p>
                      ) : null}
                    </div>
                    <div className="grid gap-2">
                      <FieldLabel htmlFor="promotion-status">Status</FieldLabel>
                      <Select
                        value={fields.status}
                        disabled={saving}
                        onValueChange={(value) =>
                          update("status", value as "draft" | "published")
                        }
                      >
                        <SelectTrigger
                          id="promotion-status"
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
                      <FieldLabel hint="Shown on the deal's card and at the top of its page. With none, the listing's own photo is used.">
                        Cover image
                      </FieldLabel>
                      <ImageUpload
                        label="Cover image"
                        showLabel={false}
                        value={fields.coverImage}
                        disabled={saving}
                        onChange={(url) => update("coverImage", url)}
                        aspect="video"
                        fit="cover"
                        inlinePicker
                        className="max-w-60"
                      />
                    </div>
                  </CardContent>
                </Card>

                {loaded?.data.promotion.endedAt ? (
                  <Card size="sm">
                    <CardHeader>
                      <CardTitle>Ended early</CardTitle>
                      <CardDescription>
                        {loaded.data.promotion.ownerUserId
                          ? "The owner"
                          : "Somebody"}{" "}
                        pressed End now on{" "}
                        {formatDate(loaded.data.promotion.endedAt)}. It is off
                        every public list, and its page says it has ended.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={saving || reopening}
                        onClick={() => void reopen()}
                      >
                        {reopening ? (
                          <Loader2Icon className="size-4 animate-spin" />
                        ) : null}
                        Start it again
                      </Button>
                    </CardContent>
                  </Card>
                ) : null}
                <DealHeadlineCard
                  idPrefix="promotion"
                  fields={fields}
                  update={updateContent}
                  disabled={saving}
                  tried={tried}
                  oldDeal={!creating && !loaded?.data.promotion.dealType}
                />
                <DealDaysCard
                  idPrefix="promotion"
                  fields={fields}
                  update={updateContent}
                  disabled={saving}
                />
                <DealTimesCard
                  idPrefix="promotion"
                  fields={fields}
                  update={updateContent}
                  disabled={saving}
                  copyBlockedBy={
                    fields.listingId
                      ? null
                      : "Pick the listing first, then its hours can be copied."
                  }
                  copying={copyingHours}
                  onCopyHours={() => void copyListingHours()}
                />
                <DealClaimsCard
                  idPrefix="promotion"
                  fields={fields}
                  update={updateContent}
                  disabled={saving}
                  tried={tried}
                />
                {loaded?.data.promotion.takesClaims ? (
                  <Card size="sm">
                    <CardHeader>
                      <CardTitle>Who claimed</CardTitle>
                      <CardDescription>
                        {claims.length} claimed
                        {loaded.data.promotion.claimLimit
                          ? ` of ${loaded.data.promotion.claimLimit}`
                          : ""}
                        . Taking a claim away frees the place, and the same
                        email can claim again.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <WhoClaimedList
                        claims={claims}
                        removingId={removingClaim}
                        onRemove={(claim) => void takeClaimAway(claim.id)}
                      />
                    </CardContent>
                  </Card>
                ) : null}
                <DealWordsCard
                  idPrefix="promotion"
                  fields={fields}
                  update={updateContent}
                  disabled={saving}
                />
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
              {promotionId ? "Save changes" : "Create deal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </FormDialog>
  )
}
