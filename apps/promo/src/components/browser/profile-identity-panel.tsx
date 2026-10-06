import * as React from "react"
import { CheckIcon, InfoIcon, Loader2Icon, ScanEyeIcon, XIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  askForNewIdentity,
  getProfileErrorMessage,
  profileJob,
  type ProfileRow,
} from "@/lib/api/browser/profiles"
import { identityRows } from "@/lib/browser/wording"
import { formatDateTime } from "@/lib/format/format-time"
import type { SiteCheckLine } from "@/lib/social/options"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * A profile's identity and what a website sees through it, in the Identity
 * tab of the profile's window.
 *
 * Both are read from the profile's row; nothing here calls a browser. The
 * check writes a job for the browser program and the row updates when it is
 * done, which the dashboard behind this window is already watching for.
 */
export function ProfileIdentityPanel({
  profile,
  onChanged,
}: {
  profile: ProfileRow
  onChanged: () => Promise<void>
}) {
  return (
    <div className="grid gap-6">
      <IdentityCard profile={profile} onChanged={onChanged} />
      <SiteCheckCard profile={profile} onChanged={onChanged} />
    </div>
  )
}

function IdentityCard({ profile, onChanged }: { profile: ProfileRow; onChanged: () => Promise<void> }) {
  // A new identity is asked for twice, inline, rather than in a window on top
  // of this one: it changes what every signed-in site sees.
  const [confirming, setConfirming] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const seen = profile.identity?.seen

  async function renew() {
    setBusy(true)
    try {
      await askForNewIdentity(profile.id)
      toast.success(`${profile.name} gets a new identity the next time its browser opens.`)
      setConfirming(false)
      await onChanged()
    } catch (error) {
      showErrorToast(getProfileErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>This profile&apos;s machine</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 text-sm">
        {seen ? (
          <>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
              {identityRows(seen).map((row) => (
                <React.Fragment key={row.label}>
                  <dt className="text-muted-foreground">{row.label}</dt>
                  <dd className="min-w-0 truncate" title={row.value}>
                    {row.value}
                  </dd>
                </React.Fragment>
              ))}
            </dl>
            <p className="text-xs text-muted-foreground">
              Read from inside its browser {profile.identity?.seenAt ? formatDateTime(profile.identity.seenAt) : ""}.
              The same on every launch. The clock and the language follow the proxy&apos;s country.
            </p>
          </>
        ) : (
          <p className="text-muted-foreground">
            Its identity is made on its first launch, and kept from then on.
          </p>
        )}

        {profile.identity?.renew ? (
          <p role="status" className="text-muted-foreground">
            A new identity is made the next time its browser opens.
            {profile.browser !== "stopped" ? " Its browser is open, so stop it and open it again." : ""}
          </p>
        ) : confirming ? (
          <div role="alert" className="grid gap-3 rounded-lg border p-3">
            <p>
              Every site this profile is signed in to will see a different machine: a new screen,
              graphics card and fonts. Sites notice that, and some sign the account out or ask
              for a check. The cookies stay.
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" disabled={busy} onClick={() => setConfirming(false)}>
                Keep this one
              </Button>
              <Button type="button" variant="destructive" disabled={busy} onClick={() => void renew()}>
                {busy ? <Loader2Icon className="animate-spin" /> : null}
                Make a new identity
              </Button>
            </div>
          </div>
        ) : seen ? (
          <div>
            <Button type="button" variant="outline" size="sm" onClick={() => setConfirming(true)}>
              Make a new identity
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

const VERDICT_WORDS: Record<SiteCheckLine["verdict"], string> = {
  matches: "Matches",
  differs: "Does not match",
  noted: "Seen",
}

function VerdictIcon({ verdict }: { verdict: SiteCheckLine["verdict"] }) {
  if (verdict === "matches") return <CheckIcon className="size-4 shrink-0" aria-hidden />
  if (verdict === "differs") return <XIcon className="size-4 shrink-0 text-destructive" aria-hidden />
  return <InfoIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
}

function SiteCheckCard({ profile, onChanged }: { profile: ProfileRow; onChanged: () => Promise<void> }) {
  const [asking, setAsking] = React.useState(false)
  const checking = asking || profile.siteChecking
  const check = profile.siteCheck

  async function run() {
    setAsking(true)
    try {
      await profileJob(profile.id, "site_check")
      await onChanged()
    } catch (error) {
      showErrorToast(getProfileErrorMessage(error))
    } finally {
      setAsking(false)
    }
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>What a site sees</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 text-sm">
        <p className="text-muted-foreground">
          The proxy test proves the proxy works from the server. This reads what a website sees
          from inside the browser, and compares it with a proxy test taken at the same moment.
          It opens the browser if it is closed.
        </p>

        {check ? (
          <div className="grid gap-3">
            <ul className="grid gap-3">
              {check.lines.map((line) => (
                <li key={line.label} className="flex items-start gap-2">
                  <VerdictIcon verdict={line.verdict} />
                  <span className="min-w-0">
                    <span className="font-medium">{line.label}</span>
                    <span className="text-muted-foreground"> · {VERDICT_WORDS[line.verdict]}</span>
                    <span className="block text-muted-foreground">{line.text}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              Checked {formatDateTime(check.checkedAt)}
              {check.proxy ? `, through ${check.proxy.name}` : ", with no proxy"}.
            </p>
          </div>
        ) : (
          <p className="text-muted-foreground">Not checked yet.</p>
        )}

        <div>
          <Button type="button" variant="outline" size="sm" disabled={checking} onClick={() => void run()}>
            {checking ? <Loader2Icon className="animate-spin" /> : <ScanEyeIcon />}
            {checking ? "Checking" : "Check what a site sees"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
