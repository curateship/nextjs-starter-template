"use client"

import { useCallback, useEffect, useRef, useState, useTransition } from "react"
import { usePathname, useRouter, useSearchParams } from "@/lib/navigation-client"
import Building2 from "lucide-react/dist/esm/icons/building-2.js"
import CheckCircle2 from "lucide-react/dist/esm/icons/circle-check.js"
import Loader2 from "lucide-react/dist/esm/icons/loader-circle.js"

import {
  getDirectoryClaimStateAction,
  submitDirectoryClaimAction,
  type DirectoryClaimStatus,
} from "@/lib/actions/directories/directory-claim-actions"
import Link from "@/components/app-link"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useSiteAuthUser } from "@/components/frontend/layout/site-auth-provider"

interface DirectoryClaimButtonProps {
  directoryId: string
  loginPath?: string
  buttonText?: string
  pendingEmailText?: string
  pendingReviewText?: string
  approvedText?: string
  rowClassName: string
  mutedRowClassName: string
}

interface ClaimState {
  status: DirectoryClaimStatus | null
  claimedByOther: boolean
  canEdit: boolean
}

function buildAuthHref(authPath: string, redirectPath: string) {
  const separator = authPath.includes("?") ? "&" : "?"
  return `${authPath}${separator}tab=login&redirect=${encodeURIComponent(redirectPath)}`
}

const OWNER_EDIT_PATH = "/account/my-listings"

export function DirectoryClaimButton({
  directoryId,
  loginPath = "/account",
  buttonText = "Claim Listing",
  pendingEmailText = "Check Business Email",
  pendingReviewText = "Claim Pending Review",
  approvedText = "Edit Listing",
  rowClassName,
  mutedRowClassName,
}: DirectoryClaimButtonProps) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const user = useSiteAuthUser()
  const [state, setState] = useState<ClaimState | null>(null)
  const [open, setOpen] = useState(false)
  const [checkingState, setCheckingState] = useState(false)
  const [businessEmail, setBusinessEmail] = useState("")
  const [claimantName, setClaimantName] = useState("")
  const [roleTitle, setRoleTitle] = useState("")
  const [phone, setPhone] = useState("")
  const [message, setMessage] = useState("")
  const [proofUrl, setProofUrl] = useState("")
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const claimParam = searchParams.get("claim")

  useEffect(() => {
    if (claimParam === "verified") {
      setNotice("Business email confirmed. Your claim is waiting for review.")
    }
  }, [claimParam])

  const redirectPath = pathname || "/"
  const authHref = buildAuthHref(loginPath, redirectPath)

  const handleClaimClick = useCallback(async () => {
    setError(null)
    setNotice(null)
    setCheckingState(true)

    const result = await getDirectoryClaimStateAction({ data: { directoryId: directoryId } })
    setCheckingState(false)

    if (result.error) {
      setNotice(result.error)
      return
    }

    if (!result.authenticated) {
      // Stale session: this button only renders for a signed-in user, but the
      // server says otherwise (cookie expired). Full reload so the whole client
      // rebuilds with correct auth state — an SPA nav would keep the wrong one.
      window.location.href = authHref
      return
    }

    if (result.claimedByOther) {
      setNotice("This listing has already been claimed.")
      return
    }

    if (result.canEdit) {
      // Already the owner and still signed in — no session change, just an
      // in-app move to their listings, so use SPA navigation (matches the
      // "Edit Listing" Link render path below).
      router.push(OWNER_EDIT_PATH)
      return
    }

    setState({
      status: result.status,
      claimedByOther: result.claimedByOther,
      canEdit: result.canEdit,
    })

    if (result.status !== "pending_email" && result.status !== "pending_review") {
      setOpen(true)
    }
  }, [authHref, directoryId, router])

  // Arriving from a claim-invitation email (…?claim=start) opens the claim flow
  // straight away — the same path as clicking the button, so it also handles a
  // stale session (redirect to sign in, then back here) and existing claims.
  const autoStartedRef = useRef(false)
  useEffect(() => {
    if (claimParam === "start" && !autoStartedRef.current) {
      autoStartedRef.current = true
      void handleClaimClick()
    }
  }, [claimParam, handleClaimClick])

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    setNotice(null)

    startTransition(async () => {
      const result = await submitDirectoryClaimAction({ data: { input: {
        directoryId,
        businessEmail,
        claimantName,
        roleTitle,
        phone,
        message,
        proofUrl,
      } } })

      if (!result.success) {
        setError(result.error || "Failed to submit claim")
        return
      }

      setState((current) => current ? { ...current, status: result.status || "pending_email" } : current)
      setNotice(result.message || "Check your business email to confirm this claim.")
      setOpen(false)
    })
  }

  if (!user) {
    return (
      <Link
        href={authHref}
        className={rowClassName}
      >
        <Building2 className="h-5 w-5 shrink-0" />
        <span className="min-w-0 wrap-break-word text-base leading-snug">{buttonText}</span>
      </Link>
    )
  }

  if (state?.canEdit) {
    return (
      <Link
        href={OWNER_EDIT_PATH}
        className={rowClassName}
      >
        <CheckCircle2 className="h-5 w-5 shrink-0" />
        <span className="min-w-0 wrap-break-word text-base leading-snug">{approvedText}</span>
      </Link>
    )
  }

  const disabledText = state?.status === "pending_email"
    ? pendingEmailText
    : state?.status === "pending_review"
      ? pendingReviewText
      : null

  return (
    <>
      {notice ? (
        <div className="px-6 py-3 text-sm text-muted-foreground">{notice}</div>
      ) : null}
      {disabledText ? (
        <div className={mutedRowClassName}>
          <Building2 className="h-5 w-5 shrink-0" />
          <span className="min-w-0 wrap-break-word text-base leading-snug">{disabledText}</span>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleClaimClick}
          disabled={checkingState}
          className={`${rowClassName} w-full text-left`}
        >
          {checkingState ? <Loader2 className="h-5 w-5 shrink-0 animate-spin" /> : <Building2 className="h-5 w-5 shrink-0" />}
          <span className="min-w-0 wrap-break-word text-base leading-snug">{buttonText}</span>
        </button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Claim Listing</DialogTitle>
            <DialogDescription>
              Confirm your business email before this claim can be reviewed.
            </DialogDescription>
          </DialogHeader>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="claim-name">Name</Label>
                <Input id="claim-name" value={claimantName} onChange={(event) => setClaimantName(event.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="claim-role">Role</Label>
                <Input id="claim-role" value={roleTitle} onChange={(event) => setRoleTitle(event.target.value)} placeholder="Owner, manager..." />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="claim-email">Business Email</Label>
              <Input id="claim-email" type="email" value={businessEmail} onChange={(event) => setBusinessEmail(event.target.value)} required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="claim-phone">Phone</Label>
              <Input id="claim-phone" value={phone} onChange={(event) => setPhone(event.target.value)} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="claim-proof">Proof Link</Label>
              <Input id="claim-proof" value={proofUrl} onChange={(event) => setProofUrl(event.target.value)} placeholder="Website, Google profile, social profile..." />
            </div>

            <div className="space-y-2">
              <Label htmlFor="claim-message">Message</Label>
              <Textarea id="claim-message" value={message} onChange={(event) => setMessage(event.target.value)} rows={4} />
            </div>

            {error ? <p className="text-sm text-red-600">{error}</p> : null}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Submit Claim
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
