import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { Loader2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import type { SignUpBox as SignUpBoxState } from "@/lib/api/events/public"
import { getSignUpErrorMessage, signUp } from "@/lib/api/events/sign-ups"
import { looksLikeEmail } from "@/lib/directory/submission-fields"
import {
  SIGN_UP_EMAIL_MAX,
  SIGN_UP_NAME_MAX,
  SIGN_UP_TRAP,
  signUpProblem,
} from "@/lib/events/sign-up-fields"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

/** "12 of 20 seats left", "1 of 20 seats left", or null with no limit. */
function seatsLine(box: SignUpBoxState): string | null {
  if (box.seats === null || box.left === null) return null
  return `${box.left} of ${box.seats} ${box.seats === 1 ? "seat" : "seats"} left`
}

/**
 * The event page's sign-up box: a name and an email, no account. It shows
 * the seats left, "Full" once they are gone, and "Sign-ups have closed" once
 * the event has started. The counts come from the server on every visit.
 */
export function SignUpBox({
  eventId,
  box,
}: {
  eventId: string
  box: SignUpBoxState
}) {
  const router = useRouter()
  const [name, setName] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [trap, setTrap] = React.useState("")
  const [touched, setTouched] = React.useState({ name: false, email: false })
  const [sending, setSending] = React.useState(false)
  const [done, setDone] = React.useState(false)

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
      const result = await signUp({ eventId, name, email, trap })
      if (result.done) {
        setDone(true)
        // The seats left, read again now that one is taken.
        void router.invalidate()
      } else {
        showErrorToast(result.problem)
        // A refusal like "full" or "closed" means the box is out of date.
        void router.invalidate()
      }
    } catch (error) {
      showErrorToast(getSignUpErrorMessage(error))
    } finally {
      setSending(false)
    }
  }

  const seats = seatsLine(box)
  const status = done
    ? `You're on the list, ${name.trim()}.`
    : box.closed
      ? "Sign-ups have closed."
      : box.full
        ? "Every seat is taken."
        : (seats ?? "Free. Add your name to the list.")

  return (
    <section
      aria-labelledby="event-sign-up-title"
      className="-mx-4 grid gap-3 border-y px-4 py-4"
    >
      <div className="grid gap-1">
        <h2 id="event-sign-up-title" className="text-base font-semibold">
          {box.full && !done && !box.closed ? "Full" : "Sign up"}
        </h2>
        <p role="status" className="text-sm text-muted-foreground">
          {status}
        </p>
      </div>

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
            <label htmlFor="sign-up-trap">Leave this empty</label>
            <input
              id="sign-up-trap"
              name={SIGN_UP_TRAP}
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={trap}
              onChange={(event) => setTrap(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <FieldLabel htmlFor="sign-up-name">Name</FieldLabel>
            <Input
              id="sign-up-name"
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
            <FieldLabel htmlFor="sign-up-email">Email</FieldLabel>
            <Input
              id="sign-up-email"
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
            Sign up
          </Button>
        </form>
      )}
    </section>
  )
}
