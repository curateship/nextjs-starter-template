import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { Loader2Icon, MapPinIcon, PlusIcon, TagIcon } from "lucide-react"
import { toast } from "sonner"

import {
  DealClaimsCard,
  DealDaysCard,
  DealHeadlineCard,
  DealTimesCard,
  DealWordsCard,
} from "@/components/promotions/deal-fields"
import { WhoClaimedList } from "@/components/promotions/who-claimed"
import { CharacterCount } from "@/components/shared/character-count"
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
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DisabledReason } from "@/components/ui/disabled-reason"
import {
  Dialog,
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
import type { OwnedListing } from "@/lib/api/directory/claims"
import { loadMyDealClaims, type DealClaim } from "@/lib/api/promotions/claims"
import {
  endMyDeal,
  getOwnerDealErrorMessage,
  loadMyListingHours,
  sendChangeToMyDeal,
  sendDealForMyListing,
  type OwnerDeal,
  type OwnerDeals,
} from "@/lib/api/promotions/owner"
import {
  blankDealContent,
  dealContentFrom,
  dealContentInput,
  type DealContentFields,
} from "@/lib/promotions/deal-content"
import { dealAdminDaysText } from "@/lib/promotions/deal-days"
import { shownHeadline } from "@/lib/promotions/deal-headline"
import { hasDealTimes } from "@/lib/promotions/deal-times"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

/**
 * An owner's deals at their own listing, on My listings: the ones they have
 * sent, each with where it stands, and "Add deal".
 *
 * Nothing here publishes anything. A new deal and every change go to the
 * site's admin, and approving is what puts them on the Deals page. "End now"
 * is the one thing that works at once, because taking a deal down is never
 * the risky direction.
 */
export function OwnerDealsCard({
  listing,
  owner,
}: {
  listing: OwnedListing
  owner: OwnerDeals
}) {
  /** The deal being changed, "new" for a new one, or null while closed. */
  const [editing, setEditing] = React.useState<OwnerDeal | "new" | null>(null)
  const [ending, setEnding] = React.useState<OwnerDeal | null>(null)
  const [claimsOf, setClaimsOf] = React.useState<OwnerDeal | null>(null)
  const [endBusy, setEndBusy] = React.useState(false)
  const router = useRouter()
  const deals = owner.deals[listing.listingId] ?? []
  const dealsOn = owner.sites[listing.siteId]?.dealsOn ?? false

  async function endNow() {
    const live = ending?.live
    if (!live) return
    dismissErrorToast()
    setEndBusy(true)
    try {
      const result = await endMyDeal(live.id)
      if (!result.ended) {
        showErrorToast(result.problem)
        return
      }
      await router.invalidate()
      toast.success(`${live.content.title} has ended. It is off the Deals page now.`)
      setEnding(null)
    } catch (error) {
      showErrorToast(getOwnerDealErrorMessage(error))
    } finally {
      setEndBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <TagIcon className="size-4 text-muted-foreground" aria-hidden="true" />
            <CardTitle>Deals at {listing.title}</CardTitle>
          </div>
          {dealsOn ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditing("new")}
            >
              <PlusIcon />
              Add deal
            </Button>
          ) : null}
        </div>
        <CardDescription>
          {dealsOn
            ? `Each deal and each change goes to ${listing.siteName}'s admin. Once it is approved, it is on the Deals page.`
            : `${listing.siteName} has its Deals page switched off, so deals cannot be added here.`}
        </CardDescription>
      </CardHeader>
      {deals.length || dealsOn ? (
        <CardContent>
          {deals.length ? (
            <ul className="-mx-4 divide-y border-t">
              {deals.map((deal) => (
                <OwnerDealRow
                  key={deal.requestId}
                  deal={deal}
                  siteUrl={listing.siteUrl}
                  canAct={dealsOn}
                  onChange={() => setEditing(deal)}
                  onEnd={() => setEnding(deal)}
                  onClaims={() => setClaimsOf(deal)}
                />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              No deals yet. Add one, and it goes to the admin to approve.
            </p>
          )}
        </CardContent>
      ) : null}

      <OwnerDealDialog
        open={editing !== null}
        listing={listing}
        deal={editing === "new" ? null : editing}
        onClose={() => setEditing(null)}
      />
      <OwnerClaimsDialog
        deal={claimsOf}
        onClose={() => setClaimsOf(null)}
      />
      <ConfirmDialog
        open={ending !== null}
        onOpenChange={(next) => {
          if (!next) setEnding(null)
        }}
        title="End this deal now?"
        description={`${ending?.live?.content.title ?? "The deal"} disappears from the Deals page straight away, and its page says it has ended. Only the admin can start it again.`}
        confirmLabel="End now"
        loading={endBusy}
        onConfirm={() => void endNow()}
      />
    </Card>
  )
}

const REQUEST_WORDS: Record<OwnerDeal["status"], string> = {
  pending: "Waiting for approval",
  approved: "Approved",
  rejected: "Not approved",
}

function OwnerDealRow({
  deal,
  siteUrl,
  canAct,
  onChange,
  onEnd,
  onClaims,
}: {
  deal: OwnerDeal
  siteUrl: string
  canAct: boolean
  onChange: () => void
  onEnd: () => void
  onClaims: () => void
}) {
  const live = deal.live
  const ended = live?.stage === "ended"
  return (
    <li className="grid gap-1 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 truncate text-sm font-medium">
          {shownHeadline(deal.headline)} · {deal.title}
        </span>
        <Badge
          variant={
            deal.status === "pending"
              ? "default"
              : deal.status === "approved" && !ended
                ? "secondary"
                : "outline"
          }
        >
          {ended ? "Ended" : REQUEST_WORDS[deal.status]}
        </Badge>
        {live?.changeWaiting ? (
          <Badge variant="outline">Change waiting for approval</Badge>
        ) : null}
        {live && !ended ? (
          <a
            href={`${siteUrl}/deals/${live.slug}`}
            target="_blank"
            rel="noreferrer"
            className="text-sm underline-offset-4 hover:underline"
          >
            See its page
          </a>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        {dealAdminDaysText(deal)}
      </p>
      {deal.status === "rejected" && deal.reviewNote ? (
        <p className="text-xs whitespace-pre-wrap text-muted-foreground">
          The admin said: {deal.reviewNote}
        </p>
      ) : null}
      {live && live.changeRefused !== null ? (
        <p className="text-xs whitespace-pre-wrap text-muted-foreground">
          Your last change was not made.
          {live.changeRefused ? ` The admin said: ${live.changeRefused}` : ""}
        </p>
      ) : null}
      {deal.status === "approved" && live === null ? (
        <p className="text-xs text-muted-foreground">
          The admin has removed this deal.
        </p>
      ) : null}
      {live && !ended && canAct ? (
        <div className="flex flex-wrap gap-2 pt-1">
          <DisabledReason
            disabled={live.changeWaiting}
            reason="Your last change is still waiting for the admin. You can send another once it has been read."
          >
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={live.changeWaiting}
              onClick={onChange}
            >
              Change
            </Button>
          </DisabledReason>
          <Button type="button" variant="outline" size="sm" onClick={onEnd}>
            End now
          </Button>
          {live.content.takesClaims ? (
            <Button type="button" variant="ghost" size="sm" onClick={onClaims}>
              Who claimed
            </Button>
          ) : null}
        </div>
      ) : null}
    </li>
  )
}

/**
 * The owner's window for a new deal or a change to a live one. The same boxes
 * as the admin's window, less the listing, the address and the status: the
 * listing is always theirs, and nothing is published until the admin says so.
 */
function OwnerDealDialog({
  open,
  listing,
  deal,
  onClose,
}: {
  open: boolean
  listing: OwnedListing
  /** The deal being changed, or null for a new one. */
  deal: OwnerDeal | null
  onClose: () => void
}) {
  const router = useRouter()
  const live = deal?.live ?? null
  const startWith = React.useMemo(
    () => (live ? dealContentFrom(live.content) : blankDealContent()),
    [live]
  )
  const [fields, setFields] = React.useState<DealContentFields>(startWith)
  const [tried, setTried] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [copying, setCopying] = React.useState(false)

  // Filled afresh each time the window opens, so a second deal starts clean.
  const openKey = open ? (live?.id ?? "new") : null
  const [openedFor, setOpenedFor] = React.useState<string | null>(null)
  if (openedFor !== openKey) {
    setOpenedFor(openKey)
    if (openKey) {
      setFields(startWith)
      setTried(false)
    }
  }
  const dirty = JSON.stringify(fields) !== JSON.stringify(startWith)

  const update = <Key extends keyof DealContentFields>(
    key: Key,
    value: DealContentFields[Key]
  ) => setFields((current) => ({ ...current, [key]: value }))

  async function copyHours() {
    dismissErrorToast()
    setCopying(true)
    try {
      const hours = await loadMyListingHours(listing.claimId)
      if (!hours) throw new Error("You do not look after that listing any more.")
      if (!hasDealTimes(hours)) {
        throw new Error(`${listing.title} has no opening hours to copy.`)
      }
      update("times", hours)
    } catch (error) {
      showErrorToast(getOwnerDealErrorMessage(error))
    } finally {
      setCopying(false)
    }
  }

  async function send() {
    dismissErrorToast()
    setBusy(true)
    try {
      const input = dealContentInput(fields)
      const result = live
        ? await sendChangeToMyDeal({ ...input, promotionId: live.id })
        : await sendDealForMyListing({ ...input, claimId: listing.claimId })
      if (!result.sent) {
        setTried(true)
        showErrorToast(result.problem)
        return
      }
      // Read again before the window closes, so the row is there when it does.
      await router.invalidate()
      toast.success(
        live
          ? "Sent. The deal stays as it is until the admin approves the change."
          : "Sent. The admin reads it before it goes on the Deals page."
      )
      onClose()
    } catch (error) {
      showErrorToast(getOwnerDealErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <FormDialog open={open} dirty={dirty} busy={busy} onClose={onClose}>
      {(requestClose) => (
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>{live ? "Change this deal" : "Add a deal"}</DialogTitle>
            <DialogDescription>
              {live
                ? `It goes to ${listing.siteName}'s admin. The deal stays as it is until the change is approved.`
                : `It goes to ${listing.siteName}'s admin, and is on the Deals page once it is approved.`}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Card size="sm">
              <CardHeader>
                <CardTitle>The deal</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <FieldLabel htmlFor="owner-deal-title">Title</FieldLabel>
                    <CharacterCount value={fields.title} max={200} />
                  </div>
                  <Input
                    id="owner-deal-title"
                    value={fields.title}
                    maxLength={200}
                    placeholder="Free cookie with any coffee"
                    disabled={busy}
                    aria-invalid={tried && !fields.title.trim()}
                    onChange={(event) => update("title", event.target.value)}
                  />
                </div>
                <div className="grid gap-1">
                  <span className="text-sm font-medium">Place</span>
                  {/* Wraps rather than truncating: one long line in a grid
                      widens the whole column, and every box beside it. */}
                  <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
                    <MapPinIcon
                      className="mt-0.5 size-3.5 shrink-0"
                      aria-hidden="true"
                    />
                    <span>
                      {listing.title}. Your deals are always at your listing.
                    </span>
                  </p>
                </div>
                <div className="grid gap-2">
                  <FieldLabel hint="Shown on the deal's card and at the top of its page. With none, your listing's own photo is used.">
                    Photo (optional)
                  </FieldLabel>
                  <ImageUpload
                    label="Photo"
                    showLabel={false}
                    value={fields.coverImage}
                    disabled={busy}
                    onChange={(url) => update("coverImage", url)}
                    aspect="square"
                    fit="cover"
                    className="max-w-24"
                  />
                </div>
              </CardContent>
            </Card>
            <DealHeadlineCard
              idPrefix="owner-deal"
              fields={fields}
              update={update}
              disabled={busy}
              tried={tried}
              oldDeal={Boolean(live) && !live?.content.dealType}
            />
            <DealDaysCard
              idPrefix="owner-deal"
              fields={fields}
              update={update}
              disabled={busy}
            />
            <DealTimesCard
              idPrefix="owner-deal"
              fields={fields}
              update={update}
              disabled={busy}
              copyBlockedBy={null}
              copying={copying}
              onCopyHours={() => void copyHours()}
            />
            <DealClaimsCard
              idPrefix="owner-deal"
              fields={fields}
              update={update}
              disabled={busy}
              tried={tried}
            />
            <DealWordsCard
              idPrefix="owner-deal"
              fields={fields}
              update={update}
              disabled={busy}
            />
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={requestClose}
            >
              Cancel
            </Button>
            <Button type="button" disabled={busy} onClick={() => void send()}>
              {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
              Send for approval
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </FormDialog>
  )
}

/**
 * Who claimed one of the owner's deals, read-only. Only an admin can take a
 * claim away. Read when the window opens, so the list is never stale.
 */
function OwnerClaimsDialog({
  deal,
  onClose,
}: {
  deal: OwnerDeal | null
  onClose: () => void
}) {
  const liveId = deal?.live?.id ?? null
  const [loaded, setLoaded] = React.useState<{
    forId: string
    claims: DealClaim[]
  } | null>(null)

  React.useEffect(() => {
    if (!liveId) return
    let cancelled = false
    loadMyDealClaims(liveId).then(
      (claims) => {
        if (!cancelled) setLoaded({ forId: liveId, claims })
      },
      (error: unknown) => {
        if (cancelled) return
        showErrorToast(getOwnerDealErrorMessage(error))
        onClose()
      }
    )
    return () => {
      cancelled = true
    }
    // The fetch runs once per opened deal; the callback is the parent's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveId])

  const claims = loaded && loaded.forId === liveId ? loaded.claims : null
  const limit = deal?.live?.content.claimLimit ?? null
  return (
    <Dialog
      open={liveId !== null}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent variant="admin" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Who claimed</DialogTitle>
          <DialogDescription>
            {claims
              ? `${claims.length} claimed${limit ? ` of ${limit}` : ""} for ${deal?.live?.content.title ?? "this deal"}. Each code is theirs alone.`
              : `For ${deal?.live?.content.title ?? "this deal"}.`}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Card size="sm">
            <CardContent>
              {claims ? (
                <WhoClaimedList claims={claims} />
              ) : (
                <div className="flex h-24 items-center justify-center">
                  <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
                </div>
              )}
            </CardContent>
          </Card>
        </DialogBody>
        <DialogFooter>
          <Button type="button" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
