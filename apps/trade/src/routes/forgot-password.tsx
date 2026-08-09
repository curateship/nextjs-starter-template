import * as React from "react"
import {
  createFileRoute,
  Link,
  redirect,
  useLocation,
} from "@tanstack/react-router"
import { Loader2Icon } from "lucide-react"

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
  requestPasswordReset,
} from "@/lib/api/auth/auth"
import { carriedEmail } from "@/lib/email/carried-email"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

export const Route = createFileRoute("/forgot-password")({
  loader: async () => {
    const [user, options] = await Promise.all([
      loadCurrentUser(),
      loadSignInOptions(),
    ])
    if (user) {
      throw redirect({ to: "/home", replace: true })
    }
    return options
  },
  component: ForgotPasswordRoute,
})

function ForgotPasswordRoute() {
  const { siteKey } = Route.useLoaderData()
  // Whatever the sign-in page had typed, checked again here because history
  // state can be hand-edited. Read once as the field's starting value so it
  // stays an ordinary editable field afterwards.
  const carried = useLocation({ select: (location) => location.state.email })
  const [email, setEmail] = React.useState(() => carriedEmail(carried) ?? "")
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

        await requestPasswordReset(email, humanCheckToken ?? undefined)
        setSent(true)
      } catch (resetError) {
        showErrorToast(getAuthErrorMessage(resetError))
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
      title="Reset your password"
      description="We will email you a link to set a new one."
      notice={
        sent
          ? "If that email has an account, a reset link is on its way. The link expires in one hour."
          : null
      }
      onSubmit={handleSubmit}
      footer={
        <p>
          <Link to="/login" className={authLinkClassName}>
            Back to sign in
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
          "Send reset link"
        )}
      </Button>
    </AuthShell>
  )
}
