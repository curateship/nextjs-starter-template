import * as React from "react"
import { useNavigate, useRouter } from "@tanstack/react-router"
import { CopyIcon, Loader2Icon, SparklesIcon, StoreIcon } from "lucide-react"
import { toast } from "sonner"

import {
  MenuLinksFields,
  SocialLinksFields,
} from "@/components/directory/contact-links-fields"
import { ListingViewsPanel } from "@/components/directory/listing-views-panel"
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
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  getClaimErrorMessage,
  proposeListingChange,
  type OwnedListing,
} from "@/lib/api/directory/claims"
import type { ContactLinks } from "@/lib/directory/contact-links"
import {
  buildListingBadgeSnippet,
  listingBadgePath,
  LISTING_BADGE_SIZES,
  type ListingBadgeSize,
  type ListingBadgeTheme,
} from "@/lib/directory/listing-badge"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import {
  confirmFeatured,
  getFeaturedErrorMessage,
  loadFeaturedPurchase,
  startFeaturedCheckout,
  type FeaturedPlan,
} from "@/lib/api/directory/featured"
import { formatMoney } from "@/lib/format/money"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * The listings this account looks after, on every site.
 *
 * **Nothing on this screen changes a public page.** Saving files a request that
 * an admin reads, which the words on the button say out loud — an owner who
 * thought they had edited their page and then found it unchanged would have
 * been misled by a button labelled "Save".
 *
 * The site each listing is on is named, because somebody may look after a café
 * on one and a shop on another, and "The Bakery" on its own would not say which.
 */
export function MyListings({
  listings,
  checkout,
}: {
  listings: OwnedListing[]
  checkout?: { featured_session?: string; featured_checkout?: "cancelled" }
}) {
  const navigate = useNavigate()
  const router = useRouter()
  const handled = React.useRef<string | null>(null)

  React.useEffect(() => {
    const sessionId = checkout?.featured_session
    if (!sessionId || handled.current === sessionId) return
    handled.current = sessionId
    void confirmFeatured(sessionId)
      .then(async () => {
        toast.success("Payment confirmed. The listing is featured now.")
        await router.invalidate()
        void navigate({ to: ".", search: {} as never, replace: true })
      })
      .catch((error) => {
        handled.current = null
        showErrorToast(getFeaturedErrorMessage(error))
      })
  }, [checkout?.featured_session, navigate, router])

  React.useEffect(() => {
    if (checkout?.featured_checkout !== "cancelled") return
    toast.info("Checkout was cancelled. Nothing was charged.")
    void navigate({ to: ".", search: {} as never, replace: true })
  }, [checkout?.featured_checkout, navigate])

  if (listings.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>You do not look after any listings yet</CardTitle>
          <CardDescription>
            Find your business in a directory and press the claim button on its
            page. Once that is approved, it appears here.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <div className="grid gap-2 md:gap-3">
      {listings.map((listing) => (
        <div key={listing.claimId} className="grid gap-2 md:gap-3">
          <OwnedListingCard listing={listing} />
          <ListingViewsPanel listingId={listing.listingId} />
        </div>
      ))}
    </div>
  )
}

function OwnedListingCard({ listing }: { listing: OwnedListing }) {
  const router = useRouter()
  const [title, setTitle] = React.useState(listing.title)
  const [metaDescription, setMetaDescription] = React.useState(
    listing.metaDescription
  )
  const [featuredImage, setFeaturedImage] = React.useState(listing.featuredImage)
  const [contactLinks, setContactLinks] = React.useState<ContactLinks>(
    listing.contactLinks
  )
  const [send, sending] = useAsyncAction(getClaimErrorMessage)

  // Back to what the listing actually says whenever the record underneath
  // changes — an admin editing the page while the owner has this open would
  // otherwise leave them typing over values that no longer exist, and
  // `whatChanged()` comparing against the new ones would report differences
  // they never made. Same reset the edit windows elsewhere in this app use.
  const stamp = `${listing.listingId}:${listing.title}:${listing.metaDescription}:${listing.featuredImage}`
  const [loadedFrom, setLoadedFrom] = React.useState(stamp)
  if (loadedFrom !== stamp) {
    setLoadedFrom(stamp)
    setTitle(listing.title)
    setMetaDescription(listing.metaDescription)
    setFeaturedImage(listing.featuredImage)
    setContactLinks(listing.contactLinks)
  }

  const waiting = Boolean(listing.pendingRequestId)

  /**
   * Only what they actually changed.
   *
   * Sending every field each time would be simpler here and wrong on the
   * admin's screen: a request that lists all five fields makes them hunt for
   * the one that moved, and a photo that was always empty would be reported as
   * "removed". Comparing the links as text is enough — they are small, already
   * cleaned, and the alternative is a deep-compare that says the same thing.
   */
  function whatChanged() {
    const changes: {
      title?: string
      metaDescription?: string
      featuredImage?: string
      contactLinks?: ContactLinks
    } = {}
    if (title !== listing.title) changes.title = title
    if (metaDescription !== listing.metaDescription) {
      changes.metaDescription = metaDescription
    }
    if (featuredImage !== listing.featuredImage) {
      changes.featuredImage = featuredImage
    }
    if (
      JSON.stringify(contactLinks) !== JSON.stringify(listing.contactLinks)
    ) {
      changes.contactLinks = contactLinks
    }
    return changes
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <StoreIcon className="size-4 text-muted-foreground" aria-hidden="true" />
          <CardTitle>{listing.title}</CardTitle>
          <Badge variant="outline">{listing.siteName}</Badge>
          {waiting ? <Badge>A change is waiting to be read</Badge> : null}
        </div>
        <CardDescription>
          {waiting
            ? "Sending another change replaces the one already waiting."
            : "Changes here go to the site's admin before they appear on the page."}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-2">
          <FieldLabel htmlFor={`owner-title-${listing.claimId}`}>Name</FieldLabel>
          <Input
            id={`owner-title-${listing.claimId}`}
            maxLength={200}
            value={title}
            disabled={sending}
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>

        <div className="grid gap-2">
          <FieldLabel
            htmlFor={`owner-summary-${listing.claimId}`}
            hint="The line under your name in search results and on listing cards."
          >
            Short description
          </FieldLabel>
          <Textarea
            id={`owner-summary-${listing.claimId}`}
            rows={1}
            maxLength={300}
            value={metaDescription}
            disabled={sending}
            onChange={(event) => setMetaDescription(event.target.value)}
          />
        </div>

        {/* The same small square the admin's own form uses, and the shared
            uploader rather than a second one — the label sits outside the cap
            or it wraps. */}
        <div className="grid gap-2">
          <div className="max-w-24">
            <ImageUpload
              label="Photo"
              value={featuredImage}
              aspect="square"
              disabled={sending}
              onChange={(url) => setFeaturedImage(url)}
            />
          </div>
        </div>

        <div className="grid gap-2">
          <FieldLabel htmlFor={`owner-address-${listing.claimId}`}>
            Address
          </FieldLabel>
          <Input
            id={`owner-address-${listing.claimId}`}
            maxLength={300}
            value={contactLinks.address}
            disabled={sending}
            onChange={(event) =>
              setContactLinks((was) => ({ ...was, address: event.target.value }))
            }
          />
        </div>

        <MenuLinksFields
          links={contactLinks.menuLinks}
          disabled={sending}
          onChange={(menuLinks) =>
            setContactLinks((was) => ({ ...was, menuLinks }))
          }
        />

        <SocialLinksFields
          links={contactLinks.socialLinks}
          disabled={sending}
          onChange={(socialLinks) =>
            setContactLinks((was) => ({ ...was, socialLinks }))
          }
        />

        <div>
          <Button
            type="button"
            disabled={sending}
            onClick={() =>
              void send(async () => {
                // The server refuses an empty one with a sentence, which is
                // the right answer for "you pressed send without changing
                // anything" — better than a button that greys itself out and
                // never says why.
                await proposeListingChange({
                  claimId: listing.claimId,
                  ...whatChanged(),
                })
                await router.invalidate()
                toast.success(
                  "Sent. An admin reads it before anything changes on the page."
                )
              })
            }
          >
            Send these changes for approval
          </Button>
        </div>

        <FeaturedPurchase listingId={listing.listingId} />
        <ListingBadgeBuilder listing={listing} />
      </CardContent>
    </Card>
  )
}

function ListingBadgeBuilder({ listing }: { listing: OwnedListing }) {
  const [size, setSize] = React.useState<ListingBadgeSize>("badge")
  const [theme, setTheme] = React.useState<ListingBadgeTheme>("light")

  if (!listing.badgesEnabled || listing.status !== "published") {
    return (
      <div className="border-t pt-4">
        <p className="text-sm font-medium">Website badge</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {listing.status !== "published"
            ? "This badge becomes available when the listing is published."
            : `Badges are turned off on ${listing.siteName}.`}
        </p>
      </div>
    )
  }

  const dimensions = LISTING_BADGE_SIZES[size]
  const src = `${listing.siteUrl}${listingBadgePath(listing.listingId, size, theme)}`
  const snippet = buildListingBadgeSnippet({
    origin: listing.siteUrl,
    listingId: listing.listingId,
    listingTitle: listing.title,
    siteName: listing.siteName,
    size,
    theme,
  })

  return (
    <div className="grid gap-4 border-t pt-4">
      <div>
        <p className="text-sm font-medium">Website badge</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose a look, then paste the code into your website.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-2">
          <FieldLabel htmlFor={`badge-size-${listing.claimId}`}>Size</FieldLabel>
          <Select
            value={size}
            onValueChange={(value) => setSize(value as ListingBadgeSize)}
          >
            <SelectTrigger id={`badge-size-${listing.claimId}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="badge">Badge — 260 × 64</SelectItem>
              <SelectItem value="card">Card — 320 × 160</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <FieldLabel htmlFor={`badge-theme-${listing.claimId}`}>Theme</FieldLabel>
          <Select
            value={theme}
            onValueChange={(value) => setTheme(value as ListingBadgeTheme)}
          >
            <SelectTrigger id={`badge-theme-${listing.claimId}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="light">Light</SelectItem>
              <SelectItem value="dark">Dark</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-lg bg-muted/40 p-3">
        <iframe
          src={src}
          width={dimensions.width}
          height={dimensions.height}
          className="block max-w-full border-0"
          title={`${listing.title} badge preview`}
        />
      </div>

      <div className="grid gap-2">
        <FieldLabel htmlFor={`badge-code-${listing.claimId}`}>
          Code to paste
        </FieldLabel>
        <Textarea
          id={`badge-code-${listing.claimId}`}
          rows={3}
          readOnly
          value={snippet}
          onFocus={(event) => event.currentTarget.select()}
        />
        <div>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              void navigator.clipboard
                .writeText(snippet)
                .then(() => toast.success("Badge code copied."))
                .catch(() => toast.error("The badge code could not be copied."))
            }}
          >
            <CopyIcon /> Copy code
          </Button>
        </div>
      </div>
    </div>
  )
}

function FeaturedPurchase({ listingId }: { listingId: string }) {
  const [open, setOpen] = React.useState(false)
  const [state, setState] = React.useState<{ plans: FeaturedPlan[]; active: boolean } | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [loadError, setLoadError] = React.useState(false)
  const [starting, setStarting] = React.useState<string | null>(null)

  function loadPlans() {
    if (loading) return
    setLoading(true)
    setLoadError(false)
    void loadFeaturedPurchase(listingId)
      .then(setState)
      .catch((error) => {
        setLoadError(true)
        showErrorToast(getFeaturedErrorMessage(error))
      })
      .finally(() => setLoading(false))
  }

  function changeOpen(next: boolean) {
    setOpen(next)
    if (next && !state && !loading && !loadError) loadPlans()
  }

  return (
    <div className="border-t pt-4">
      <Popover open={open} onOpenChange={changeOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline">
            <SparklesIcon /> {state?.active ? "Featured now" : "Feature this listing"}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start">
          <PopoverHeader>
            <PopoverTitle>Featured placement</PopoverTitle>
          </PopoverHeader>
          {loadError ? (
            <div className="grid min-h-16 content-center justify-items-center gap-2 text-center">
              <p className="text-sm text-muted-foreground">Featured plans could not be loaded.</p>
              <Button type="button" size="sm" variant="outline" onClick={loadPlans}>
                Try again
              </Button>
            </div>
          ) : loading || !state ? (
            <div className="flex min-h-16 items-center justify-center"><Loader2Icon className="size-4 animate-spin" aria-label="Loading featured plans" /></div>
          ) : state.active ? (
            <p className="text-sm text-muted-foreground">This listing is already featured. Another placement can be bought after it ends.</p>
          ) : state.plans.length ? (
            <div className="grid gap-2">
              {state.plans.map((plan) => (
                <Button
                  key={plan.id}
                  type="button"
                  variant="outline"
                  className="h-auto justify-between py-2 text-left"
                  disabled={Boolean(starting)}
                  onClick={() => {
                    setStarting(plan.id)
                    void startFeaturedCheckout(listingId, plan.id)
                      .then(({ url }) => window.location.assign(url))
                      .catch((error) => {
                        setStarting(null)
                        showErrorToast(getFeaturedErrorMessage(error))
                      })
                  }}
                >
                  <span><span className="block font-medium">{plan.name}</span><span className="block text-xs text-muted-foreground">{plan.durationDays} days</span></span>
                  <span>{starting === plan.id ? <Loader2Icon className="animate-spin" /> : formatMoney(plan.priceCents, plan.currency)}</span>
                </Button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">This site is not offering featured placement yet.</p>
          )}
        </PopoverContent>
      </Popover>
    </div>
  )
}
