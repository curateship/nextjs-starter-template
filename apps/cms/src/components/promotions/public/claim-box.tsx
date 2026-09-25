import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { Loader2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import {
  claimTheDeal,
  getClaimErrorMessage,
  type ClaimAnswer,
} from "@/lib/api/promotions/claims"
import type { ClaimBox as ClaimBoxState } from "@/lib/api/promotions/public"
import { looksLikeEmail } from "@/lib/directory/submission-fields"
import {
  SIGN_UP_EMAIL_MAX,
  SIGN_UP_NAME_MAX,
  SIGN_UP_TRAP,
  signUpProblem,
} from "@/lib/events/sign-up-fields"
import { claimsLeftText } from "@/lib/promotions/claim-fields"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

/**
 * The deal page's claim box: a name and an email, no account. It shows the
 * places left, "All claimed" once they are gone, and "Claims have closed" once
 * the deal is over. The counts come from the server on every visit.
 *
 * A first claim shows its code here once, and it is emailed too. Claiming
 * again with the same email shows no code: it goes to that email again, so
 * typing somebody else's email gets nobody their code.
 */
export function ClaimBox({
  promotionId,
  box,
}: {
  promotionId: string
  box: ClaimBoxState
}) {
  const router = useRouter()
  const [name, setName] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [trap, setTrap] = React.useState("")
  const [touched, setTouched] = React.useState({ name: false, email: false })
  const [sending, setSending] = React.useState(false)
  const [done, setDone] = React.useState<Extract<ClaimAnswer, { done: true }> | null>(null)

  const nameWrong = touched.name && !name.trim()
  const emailWrong = touched.email && !looksLikeEmail(email)

  async function send() {
    dismissErrorToast()
    setTouched({ name: true, email: true })
    const problem = signUpProblem({ name, email })
    if (problem) {
      showErrorToast(problem)
      return
    }
    setSending(true)
    try {
      const result = await claimTheDeal({ promotionId, name, email, trap })
      if (result.done) {
        setDone(result)
      } else {
        showErrorToast(result.problem)
      }
      // The places left, read again now that one is taken or the box is stale.
      void router.invalidate()
    } catch (error) {
      showErrorToast(getClaimErrorMessage(error))
    } finally {
      setSending(false)
    }
  }

  const left = claimsLeftText(box)
  const status = done
    ? done.code
      ? done.emailed
        ? `It's yours, ${name.trim()}. We've emailed the code to you too.`
        : `It's yours, ${name.trim()}. We couldn't email the code, so keep it from here.`
      : done.emailed
        ? "This email already has a code for this deal. We've sent it to that email again."
        : "This email already has a code for this deal, but we couldn't email it again. Please try later."
    : box.closed
      ? "Claims have closed. This deal is over."
      : box.full
        ? "Every place is taken."
        : (left ?? "Free. Claim it with your name and email.")

  return (
    <section
      aria-labelledby="deal-claim-title"
      className="-mx-4 grid gap-3 border-y px-4 py-4"
    >
      <div className="grid gap-1">
        <h2 id="deal-claim-title" className="text-base font-semibold">
          {box.full && !done && !box.closed ? "All claimed" : "Claim this deal"}
        </h2>
        <p role="status" className="text-sm text-muted-foreground">
          {status}
        </p>
      </div>

      {done?.code ? (
        <div className="grid w-fit max-w-full gap-1 rounded-md border px-4 py-3">
          <span className="text-xs text-muted-foreground">Your code</span>
          <span className="font-mono text-lg font-semibold break-all select-all">
            {done.code}
          </span>
        </div>
      ) : null}

      {done || box.closed || box.full ? null : (
        <form
          className="relative grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            void send()
          }}
        >
          {/* A box no person sees or reaches. A bot fills every box it finds,
              and the server throws away anything that arrives with this one
              filled. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -left-[9999px] size-px overflow-hidden"
          >
            <label htmlFor="deal-claim-trap">Leave this empty</label>
            <input
              id="deal-claim-trap"
              name={SIGN_UP_TRAP}
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={trap}
              onChange={(event) => setTrap(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <FieldLabel htmlFor="deal-claim-name">Name</FieldLabel>
            <Input
              id="deal-claim-name"
              autoComplete="name"
              maxLength={SIGN_UP_NAME_MAX}
              value={name}
              disabled={sending}
              aria-invalid={nameWrong}
              onBlur={() => setTouched((was) => ({ ...was, name: true }))}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <FieldLabel htmlFor="deal-claim-email">Email</FieldLabel>
            <Input
              id="deal-claim-email"
              type="email"
              autoComplete="email"
              maxLength={SIGN_UP_EMAIL_MAX}
              value={email}
              disabled={sending}
              aria-invalid={emailWrong}
              onBlur={() => setTouched((was) => ({ ...was, email: true }))}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <Button type="submit" disabled={sending} className="w-fit">
            {sending ? <Loader2Icon className="size-4 animate-spin" /> : null}
            Claim it
          </Button>
        </form>
      )}
    </section>
  )
}
