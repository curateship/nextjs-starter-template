import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { StoreIcon } from "lucide-react"
import { toast } from "sonner"

import {
  MenuLinksFields,
  SocialLinksFields,
} from "@/components/directory/contact-links-fields"
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
  getClaimErrorMessage,
  proposeListingChange,
  type OwnedListing,
} from "@/lib/api/directory/claims"
import type { ContactLinks } from "@/lib/directory/contact-links"
import { useAsyncAction } from "@/lib/hooks/use-async-action"

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
export function MyListings({ listings }: { listings: OwnedListing[] }) {
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
        <OwnedListingCard key={listing.claimId} listing={listing} />
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
      </CardContent>
    </Card>
  )
}
