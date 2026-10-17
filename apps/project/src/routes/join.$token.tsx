import * as React from "react"
import { createFileRoute, Link } from "@tanstack/react-router"
import { Loader2Icon } from "lucide-react"

import { AuthShell, authLinkClassName } from "@/components/shell/auth-shell"
import { HumanCheck, type HumanCheckHandle } from "@/components/shell/human-check"
import { visitorRouteErrorComponent } from "@/components/shell/route-error"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { HUMAN_CHECK_MESSAGE, loadSignInOptions } from "@/lib/api/auth/auth"
import { joinThroughLink, loadJoinLink } from "@/lib/api/project/team-running"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

/**
 * Where a team's join link opens, signed out. The person types their name and
 * email, becomes an employee on the team, and gets the "Set your password"
 * email; its link signs them in on My dashboard. Signed-out on purpose: an
 * employee's account is made here, so there is nothing to sign in to yet.
 */
export const Route = createFileRoute("/join/$token")({
  loader: async ({ params }) => {
    const [offer, options] = await Promise.all([loadJoinLink(params.token), loadSignInOptions()])
    return { offer, siteKey: options.siteKey, token: params.token }
  },
  head: () => ({ meta: [{ title: "Join a team" }] }),
  errorComponent: visitorRouteErrorComponent(getProjectErrorMessage),
  component: JoinRoute,
})

function JoinRoute() {
  const { offer, siteKey, token } = Route.useLoaderData()
  const [name, setName] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [sent, setSent] = React.useState<{ emailed: boolean } | null>(null)
  const [loading, setLoading] = React.useState(false)
  const humanCheckRef = React.useRef<HumanCheckHandle>(null)

  const footer = (
    <p>
      Already have a password?{" "}
      <Link to="/login" className={authLinkClassName}>
        Sign in
      </Link>
    </p>
  )

  if (!offer || offer.blocker) {
    return (
      <AuthShell
        title="This join link doesn't work"
        description={
          offer
            ? "It has expired. Ask the site admin for a new one."
            : "It was reset or turned off. Ask the site admin for a new one."
        }
        footer={footer}
      >
        {null}
      </AuthShell>
    )
  }

  async function join(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    dismissErrorToast()
    setLoading(true)
    try {
      const humanCheckToken = siteKey ? await humanCheckRef.current?.getToken() : undefined
      if (siteKey && !humanCheckToken) {
        showErrorToast(HUMAN_CHECK_MESSAGE)
        return
      }
      setSent(await joinThroughLink({ token, name, email, humanCheckToken: humanCheckToken ?? undefined }))
    } catch (error) {
      showErrorToast(getProjectErrorMessage(error))
    } finally {
      humanCheckRef.current?.reset()
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <AuthShell
        title={`You're on ${offer.teamName}`}
        notice={
          sent.emailed
            ? `We emailed ${email} a link to set your password. Opening it signs you in.`
            : "Email is switched off on this server, so the link to set your password went to the server log."
        }
        footer={footer}
      >
        {null}
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title={`Join ${offer.teamName}`}
      description="Type your name and email. We'll email you a link to set your password."
      onSubmit={join}
      footer={footer}
    >
      <div className="grid gap-2">
        <Label htmlFor="join-name">Your name</Label>
        <Input
          id="join-name"
          autoComplete="name"
          autoFocus
          maxLength={255}
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="join-email">Email</Label>
        <Input
          id="join-email"
          type="email"
          autoComplete="email"
          maxLength={254}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </div>
      <HumanCheck ref={humanCheckRef} siteKey={siteKey} />
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? <Loader2Icon className="animate-spin" /> : null}
        Join {offer.teamName}
      </Button>
    </AuthShell>
  )
}
