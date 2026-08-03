import * as React from "react"
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router"
import { Loader2Icon } from "lucide-react"
import { z } from "zod"

import { AuthShell, authLinkClassName } from "@/components/shell/auth-shell"
import {
  HumanCheck,
  type HumanCheckHandle,
} from "@/components/shell/human-check"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  getAuthErrorMessage,
  HUMAN_CHECK_MESSAGE,
  loadCurrentUser,
  loadSignInOptions,
  requestSignInLink,
  signInWithLink,
} from "@/lib/api/auth"
import { dismissErrorToast, showErrorToast } from "@/lib/error-toast"
import { SIGN_IN_LINK_MINUTES } from "@/lib/sign-in-link"

/**
 * One page for both halves of a sign-in link: with no token it asks for the
 * email address, and with a token it is the landing the emailed link opens.
 * Two pages would only be the same frame twice, and one address keeps the link
 * in the email and the form that produced it plainly related.
 */
export const Route = createFileRoute("/sign-in-link")({
  validateSearch: z.object({ token: z.string().optional() }),
  loader: async () => {
    const [user, options] = await Promise.all([
      loadCurrentUser(),
      loadSignInOptions(),
    ])
    // Somebody already signed in who opens their link has nothing to do here.
    if (user) {
      throw redirect({ to: "/home", replace: true })
    }
    return options
  },
  component: SignInLinkRoute,
})

function SignInLinkRoute() {
  const { token } = Route.useSearch()
  return token ? <UseSignInLink token={token} /> : <RequestSignInLink />
}

function RequestSignInLink() {
  const { siteKey } = Route.useLoaderData()
  const [email, setEmail] = React.useState("")
  const [sent, setSent] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const humanCheckRef = React.useRef<HumanCheckHandle>(null)

  const handleSubmit = React.useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      dismissErrorToast()
      setLoading(true)

      try {
        // Waits under the button's spinner if the widget has not answered yet,
        // rather than telling somebody who filled the form quickly that they
        // are not a person.
        const humanCheckToken = siteKey
          ? await humanCheckRef.current?.getToken()
          : undefined
        if (siteKey && !humanCheckToken) {
          showErrorToast(HUMAN_CHECK_MESSAGE)
          return
        }

        await requestSignInLink(email, humanCheckToken ?? undefined)
        setSent(true)
      } catch (requestError) {
        showErrorToast(getAuthErrorMessage(requestError))
      } finally {
        // The answer is spent the moment the server checks it, so asking for a
        // second link needs a fresh one.
        humanCheckRef.current?.reset()
        setLoading(false)
      }
    },
    [email, siteKey]
  )

  return (
    <AuthShell
      title="Email me a sign-in link"
      description="No password needed. We will email you a link that signs you in."
      notice={
        sent
          ? `If that email has an account, a sign-in link is on its way. The link works once and expires in ${SIGN_IN_LINK_MINUTES} minutes.`
          : null
      }
      onSubmit={handleSubmit}
      footer={
        <p>
          <Link to="/login" className={authLinkClassName}>
            Sign in with a password instead
          </Link>
        </p>
      }
    >
      <div className="grid gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          autoFocus
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </div>
      <HumanCheck ref={humanCheckRef} siteKey={siteKey} />
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? (
          <>
            <Loader2Icon className="animate-spin" />
            Sending...
          </>
        ) : sent ? (
          // A link can go missing or be left too long, so the button stays
          // usable and says what pressing it now would do.
          "Send again"
        ) : (
          "Send sign-in link"
        )}
      </Button>
    </AuthShell>
  )
}

function UseSignInLink({ token }: { token: string }) {
  const navigate = useNavigate()
  const [failed, setFailed] = React.useState(false)
  // The link a browser has already tried. A link is single-use, so a second
  // attempt would spend nothing and report failure over a sign-in that worked.
  const attemptedRef = React.useRef<string | null>(null)

  React.useEffect(() => {
    if (attemptedRef.current === token) {
      return
    }
    attemptedRef.current = token

    let cancelled = false
    signInWithLink(token)
      .then(() => {
        if (!cancelled) navigate({ to: "/home", replace: true })
      })
      .catch((signInError) => {
        if (cancelled) return
        // The page says the link failed; the toast carries why. It stays until
        // dismissed and clears itself when the user navigates away.
        showErrorToast(getAuthErrorMessage(signInError))
        setFailed(true)
      })

    return () => {
      cancelled = true
    }
  }, [navigate, token])

  if (failed) {
    return (
      <AuthShell
        title="We could not sign you in"
        footer={
          <>
            <p>
              <Link
                to="/sign-in-link"
                search={{ token: undefined }}
                className={authLinkClassName}
              >
                Send me a new link
              </Link>
            </p>
            <p>
              <Link to="/login" className={authLinkClassName}>
                Sign in with a password instead
              </Link>
            </p>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">
          Sign-in links work once and expire after {SIGN_IN_LINK_MINUTES}{" "}
          minutes.
        </p>
      </AuthShell>
    )
  }

  return (
    <AuthShell title="Signing you in" description="One moment…">
      <div className="flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground">
        <Loader2Icon className="h-4 w-4 animate-spin" aria-hidden />
        <span>We are checking your link.</span>
      </div>
    </AuthShell>
  )
}
