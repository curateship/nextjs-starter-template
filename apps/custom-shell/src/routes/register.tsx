import * as React from "react"
import { createFileRoute, Link, redirect } from "@tanstack/react-router"
import { Loader2Icon } from "lucide-react"

import { AuthShell, authLinkClassName } from "@/components/shell/auth-shell"
import { GoogleSignIn } from "@/components/shell/google-sign-in"
import {
  HumanCheck,
  type HumanCheckHandle,
} from "@/components/shell/human-check"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { FieldLabel } from "@/components/ui/field-label"
import { Label } from "@/components/ui/label"
import { PasswordInput } from "@/components/ui/password-input"
import {
  getAuthErrorMessage,
  HUMAN_CHECK_MESSAGE,
  loadCurrentUser,
  loadSignInOptions,
  PASSWORD_RULE_HINT,
  register,
} from "@/lib/api/auth/auth"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

export const Route = createFileRoute("/register")({
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
  component: RegisterRoute,
})

function RegisterRoute() {
  const { siteKey, google } = Route.useLoaderData()
  const [name, setName] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [loading, setLoading] = React.useState(false)
  const [registered, setRegistered] = React.useState(false)
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

        await register({
          name,
          email,
          password,
          humanCheckToken: humanCheckToken ?? undefined,
        })
        setRegistered(true)
      } catch (registerError) {
        showErrorToast(getAuthErrorMessage(registerError))
      } finally {
        // The answer is spent the moment the server checks it, so a second
        // attempt needs a fresh one.
        humanCheckRef.current?.reset()
        setLoading(false)
      }
    },
    [email, name, password, siteKey]
  )

  if (registered) {
    return (
      <AuthShell
        title="Check your email"
        description={`We sent a verification link to ${email}. Open it to finish setting up your account.`}
        footer={
          <p>
            <Link to="/login" className={authLinkClassName}>
              Back to sign in
            </Link>
          </p>
        }
      >
        <p className="text-sm text-muted-foreground">
          The link expires in 24 hours. If it does not arrive, you can request a
          new one from the sign-in page.
        </p>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="Create your account"
      description="It takes less than a minute."
      onSubmit={handleSubmit}
      footer={
        <p>
          Already have an account?{" "}
          <Link to="/login" className={authLinkClassName}>
            Sign in
          </Link>
        </p>
      }
    >
      <div className="grid gap-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          autoComplete="name"
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </div>
      <div className="grid gap-2">
        <FieldLabel htmlFor="password" hint={PASSWORD_RULE_HINT}>
          Password
        </FieldLabel>
        <PasswordInput
          id="password"
          autoComplete="new-password"
          minLength={8}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </div>
      <HumanCheck ref={humanCheckRef} siteKey={siteKey} />
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? (
          <>
            <Loader2Icon className="animate-spin" />
            Creating account...
          </>
        ) : (
          "Create account"
        )}
      </Button>
      {google ? <GoogleSignIn label="Continue with Google" /> : null}
    </AuthShell>
  )
}
