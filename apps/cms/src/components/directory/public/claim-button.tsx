import * as React from "react"
import { Link } from "@tanstack/react-router"
import { toast } from "sonner"

import { ClaimedBadge } from "@/components/directory/public/claimed-badge"
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
import { Textarea } from "@/components/ui/textarea"
import {
  getClaimErrorMessage,
  submitClaim,
} from "@/lib/api/directory/claims"
import type { PublicClaimState } from "@/lib/api/directory/public"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

/**
 * "Is this your business?" on a listing's page, and the window behind it.
 *
 * Four things can be true when somebody reads a listing, and each gets its own
 * answer rather than one control that means different things:
 *
 * - the site does not offer claiming — nothing is drawn at all;
 * - somebody already looks after it — the claimed mark, and no way to ask;
 * - this reader has already asked — where their own request stands;
 * - nobody has — the button.
 *
 * A signed-out reader is sent to sign in rather than being shown a form that
 * would refuse them at the end. Claiming needs an account because an approved
 * claim hands somebody the ability to change a public page.
 */
export function ClaimButton({
  listingId,
  listingSlug,
  listingTitle,
  claim,
}: {
  listingId: string
  /** For the come-back-here address on the sign-in link. */
  listingSlug: string
  listingTitle: string
  claim: PublicClaimState
}) {
  const [open, setOpen] = React.useState(false)
  const [sent, setSent] = React.useState(false)

  if (!claim.enabled) return null

  if (claim.claimed) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <ClaimedBadge />
        <span className="text-xs text-muted-foreground">
          {claim.mine === "approved"
            ? claim.approvedMessage
            : "The business itself keeps this page up to date."}
        </span>
      </div>
    )
  }

  if (sent || claim.mine === "pending_verification") {
    return (
      <p className="text-xs text-muted-foreground">
        Check your email for a link confirming the address. Nobody looks at the
        request until you click it.
      </p>
    )
  }

  if (claim.mine === "pending_review") {
    return <p className="text-xs text-muted-foreground">{claim.pendingMessage}</p>
  }

  if (!claim.signedIn) {
    return (
      <Button asChild variant="outline">
        {/* Comes back here afterwards, so signing in does not lose the page
            they were reading. */}
        <Link to="/login" search={{ redirect: `/directory/${listingSlug}` }}>
          {claim.buttonLabel}
        </Link>
      </Button>
    )
  }

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        {claim.buttonLabel}
      </Button>
      <ClaimDialog
        open={open}
        listingId={listingId}
        listingTitle={listingTitle}
        onClose={() => setOpen(false)}
        onSent={() => {
          setOpen(false)
          setSent(true)
        }}
      />
    </>
  )
}

function ClaimDialog({
  open,
  listingId,
  listingTitle,
  onClose,
  onSent,
}: {
  open: boolean
  listingId: string
  listingTitle: string
  onClose: () => void
  onSent: () => void
}) {
  const [contactEmail, setContactEmail] = React.useState("")
  const [claimantName, setClaimantName] = React.useState("")
  const [roleTitle, setRoleTitle] = React.useState("")
  const [phone, setPhone] = React.useState("")
  const [proofUrl, setProofUrl] = React.useState("")
  const [message, setMessage] = React.useState("")
  const [sending, setSending] = React.useState(false)

  const [openedFor, setOpenedFor] = React.useState<string | null>(null)
  const key = open ? listingId : null
  if (openedFor !== key) {
    setOpenedFor(key)
    setContactEmail("")
    setClaimantName("")
    setRoleTitle("")
    setPhone("")
    setProofUrl("")
    setMessage("")
  }

  const dirty = Boolean(
    contactEmail.trim() ||
      claimantName.trim() ||
      roleTitle.trim() ||
      phone.trim() ||
      proofUrl.trim() ||
      message.trim()
  )

  async function send() {
    dismissErrorToast()
    setSending(true)
    try {
      await submitClaim({
        listingId,
        contactEmail,
        claimantName,
        roleTitle,
        phone,
        message,
        proofUrl,
      })
      toast.success("Check your email for the confirmation link.")
      onSent()
    } catch (error) {
      // The server's own words: they are sentences somebody can act on —
      // "Somebody already looks after this listing" — not codes.
      showErrorToast(getClaimErrorMessage(error))
    } finally {
      setSending(false)
    }
  }

  return (
    <FormDialog open={open} dirty={dirty} busy={sending} onClose={onClose}>
      {(requestClose) => (
        <DialogContent variant="admin" className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Claim {listingTitle}</DialogTitle>
            <DialogDescription>
              We email the address you give to check it is yours, then somebody
              reads the request by hand.
            </DialogDescription>
          </DialogHeader>

          <DialogBody>
            <Card size="sm">
              <CardHeader>
                <CardTitle>About you</CardTitle>
                <CardDescription>
                  An address at the business's own domain is checked fastest, but
                  any address you can receive email at will do.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-2">
                  <FieldLabel htmlFor="claim-email">Business email</FieldLabel>
                  <Input
                    id="claim-email"
                    type="email"
                    autoComplete="email"
                    value={contactEmail}
                    disabled={sending}
                    onChange={(event) => setContactEmail(event.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <FieldLabel htmlFor="claim-name">Your name</FieldLabel>
                  <Input
                    id="claim-name"
                    autoComplete="name"
                    value={claimantName}
                    disabled={sending}
                    onChange={(event) => setClaimantName(event.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <FieldLabel htmlFor="claim-role">
                    Your role at the business
                  </FieldLabel>
                  <Input
                    id="claim-role"
                    placeholder="Owner"
                    value={roleTitle}
                    disabled={sending}
                    onChange={(event) => setRoleTitle(event.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <FieldLabel htmlFor="claim-phone">Phone</FieldLabel>
                  <Input
                    id="claim-phone"
                    type="tel"
                    value={phone}
                    disabled={sending}
                    onChange={(event) => setPhone(event.target.value)}
                  />
                </div>
              </CardContent>
            </Card>

            <Card size="sm">
              <CardHeader>
                <CardTitle>Anything that helps</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-2">
                  <FieldLabel
                    htmlFor="claim-proof"
                    hint="A page naming you — your own site's about page, or a profile. Optional."
                  >
                    Link
                  </FieldLabel>
                  <Input
                    id="claim-proof"
                    type="url"
                    placeholder="https://"
                    value={proofUrl}
                    disabled={sending}
                    onChange={(event) => setProofUrl(event.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <FieldLabel htmlFor="claim-message">Message</FieldLabel>
                  <Textarea
                    id="claim-message"
                    rows={1}
                    value={message}
                    disabled={sending}
                    onChange={(event) => setMessage(event.target.value)}
                  />
                </div>
              </CardContent>
            </Card>
          </DialogBody>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={sending}
              onClick={requestClose}
            >
              Cancel
            </Button>
            {/* Kept enabled: the server says what is wrong in a sentence, and a
                button that greys itself out never says why. */}
            <Button type="button" disabled={sending} onClick={() => void send()}>
              Send my request
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </FormDialog>
  )
}
