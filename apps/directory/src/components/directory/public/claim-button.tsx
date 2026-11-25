import * as React from "react"
import { Link } from "@tanstack/react-router"
import {
  Building2Icon,
  Loader2Icon,
} from "lucide-react"

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
import { CharacterCount } from "@/components/shared/character-count"
import { FieldProblem } from "@/components/directory/public/field-problem"
import { LISTING_ROW_CLASS } from "@/components/directory/public/listing-contact-links"
import { focusRing } from "@/lib/layout/focus-ring"
import { CLAIM_MESSAGE_MAX } from "@/lib/directory/field-lengths"
import { FieldLabel } from "@/components/ui/field-label"
import { FormDialog } from "@/components/ui/form-dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { getClaimErrorMessage, submitClaim } from "@/lib/api/directory/claims"
import { looksLikeEmail } from "@/lib/directory/submission-fields"
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
  startOpen = false,
  asRow = false,
}: {
  listingId: string
  /** For the come-back-here address on the sign-in link. */
  listingSlug: string
  listingTitle: string
  claim: PublicClaimState
  /** Outreach links land with the form open after sign-in. */
  startOpen?: boolean
  /**
   * Drawn as the last line of the listing's card of links rather than as a
   * button of its own. Same five answers either way; only the shape changes.
   */
  asRow?: boolean
}) {
  const [open, setOpen] = React.useState(startOpen && claim.signedIn)
  const [sent, setSent] = React.useState(false)
  const messageClass = asRow
    ? `${LISTING_ROW_CLASS} text-muted-foreground`
    : "text-xs text-muted-foreground"
  const rowLinkClass = `${LISTING_ROW_CLASS} hover:bg-accent/40 ${focusRing}`

  if (!claim.enabled) return null

  if (claim.claimed) {
    return (
      <div
        className={
          asRow
            ? `${LISTING_ROW_CLASS} flex-wrap text-muted-foreground`
            : "flex flex-wrap items-center gap-2"
        }
      >
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
      <p className={messageClass}>
        Check your email for a link confirming the address. Nobody looks at the
        request until you click it.
      </p>
    )
  }

  if (claim.mine === "pending_review") {
    return <p className={messageClass}>{claim.pendingMessage}</p>
  }

  if (!claim.signedIn) {
    // Comes back here afterwards, so signing in does not lose the page they
    // were reading.
    const redirect = {
      redirect: `/directory/${listingSlug}${startOpen ? "?claim=start" : ""}`,
    }
    return asRow ? (
      <Link to="/login" search={redirect} className={rowLinkClass}>
        <Building2Icon className="size-4 shrink-0" aria-hidden="true" />
        {claim.buttonLabel}
      </Link>
    ) : (
      <Button asChild variant="outline">
        <Link to="/login" search={redirect}>
          {claim.buttonLabel}
        </Link>
      </Button>
    )
  }

  return (
    <>
      {asRow ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`${rowLinkClass} w-full text-left`}
        >
          <Building2Icon className="size-4 shrink-0" aria-hidden="true" />
          {claim.buttonLabel}
        </button>
      ) : (
        <Button type="button" variant="outline" onClick={() => setOpen(true)}>
          {claim.buttonLabel}
        </Button>
      )}
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
  /** Which required boxes have been left, so nothing is marked while typed. */
  const [touched, setTouched] = React.useState<Set<"email" | "name">>(new Set())

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
    setTouched(new Set())
  }

  function problemWith(field: "email" | "name"): string | null {
    if (field === "name") return claimantName.trim() ? null : "Your name is needed."
    const email = contactEmail.trim()
    if (!email) return "An email is needed, so we can check it is yours."
    return looksLikeEmail(email) ? null : "That does not look like an email address."
  }
  const emailProblem = touched.has("email") ? problemWith("email") : null
  const nameProblem = touched.has("name") ? problemWith("name") : null

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
    // Checked here as well as by the server: a round trip to be told the name
    // was left blank is a worse answer than saying so now.
    setTouched(new Set(["email", "name"]))
    const firstProblem = problemWith("email") ?? problemWith("name")
    if (firstProblem) {
      showErrorToast(firstProblem)
      return
    }
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
            {/* The name lives in the line under the title: a long one in the
                title ran under the close button on a phone, which is why the
                report and message windows took it out too. */}
            <DialogTitle>Claim this business</DialogTitle>
            <DialogDescription>
              For {listingTitle}. We email the address you give to check it is
              yours, then somebody reads the request by hand.
            </DialogDescription>
          </DialogHeader>

          <DialogBody>
            <Card size="sm">
              <CardHeader>
                <CardTitle>About you</CardTitle>
                <CardDescription>
                  An address at the business's own domain is checked fastest,
                  but any address you can receive email at will do.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <ClaimField
                  id="claim-email"
                  label="Business email"
                  type="email"
                  autoComplete="email"
                  max={255}
                  value={contactEmail}
                  onChange={setContactEmail}
                  disabled={sending}
                  problem={emailProblem}
                  onBlur={() => setTouched((was) => new Set(was).add("email"))}
                />
                <ClaimField
                  id="claim-name"
                  label="Your name"
                  autoComplete="name"
                  max={200}
                  value={claimantName}
                  onChange={setClaimantName}
                  disabled={sending}
                  problem={nameProblem}
                  onBlur={() => setTouched((was) => new Set(was).add("name"))}
                />
                <ClaimField
                  id="claim-role"
                  label="Your role at the business (optional)"
                  placeholder="Owner"
                  max={120}
                  value={roleTitle}
                  onChange={setRoleTitle}
                  disabled={sending}
                />
                <ClaimField
                  id="claim-phone"
                  label="Phone (optional)"
                  type="tel"
                  max={60}
                  value={phone}
                  onChange={setPhone}
                  disabled={sending}
                />
              </CardContent>
            </Card>

            <Card size="sm">
              <CardHeader>
                <CardTitle>Anything that helps</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <ClaimField
                  id="claim-proof"
                  label="Link (optional)"
                  hint="A page naming you, such as your own site's about page or a profile."
                  type="url"
                  placeholder="https://"
                  max={2000}
                  value={proofUrl}
                  onChange={setProofUrl}
                  disabled={sending}
                />
                <div className="grid gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <FieldLabel htmlFor="claim-message">Message (optional)</FieldLabel>
                    <CharacterCount value={message} max={CLAIM_MESSAGE_MAX} />
                  </div>
                  <Textarea
                    id="claim-message"
                    rows={1}
                    maxLength={CLAIM_MESSAGE_MAX}
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
            <Button
              type="button"
              disabled={sending}
              onClick={() => void send()}
            >
              {sending ? <Loader2Icon className="animate-spin" /> : null}
              Send my request
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </FormDialog>
  )
}

/**
 * One box of the claim window: its label, how much of its cap is used, and
 * what is wrong with it once it has been left. The caps are the server's own
 * (`lib/api/directory/claims.ts`), so a long paste stops at the box instead of
 * coming back as the validator's words.
 */
function ClaimField({
  id,
  label,
  hint,
  max,
  value,
  onChange,
  problem = null,
  onBlur,
  ...input
}: {
  id: string
  label: string
  hint?: string
  max: number
  value: string
  onChange: (value: string) => void
  problem?: string | null
  onBlur?: () => void
  type?: string
  autoComplete?: string
  placeholder?: string
  disabled: boolean
}) {
  return (
    <div className="relative grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <FieldLabel htmlFor={id} hint={hint}>
          {label}
        </FieldLabel>
        <CharacterCount value={value} max={max} />
      </div>
      <Input
        id={id}
        maxLength={max}
        value={value}
        aria-invalid={problem ? true : undefined}
        aria-describedby={problem ? `${id}-problem` : undefined}
        onBlur={onBlur}
        onChange={(event) => onChange(event.target.value)}
        {...input}
      />
      <FieldProblem id={id} problem={problem} />
    </div>
  )
}
