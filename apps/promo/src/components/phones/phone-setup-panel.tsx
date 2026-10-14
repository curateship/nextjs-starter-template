import * as React from "react"
import { CheckIcon, InfoIcon, Loader2Icon, RefreshCwIcon, Trash2Icon, XIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { getPhoneErrorMessage, runSetupCheck, wipePhone, type PhoneRecord } from "@/lib/api/phones/phones"
import { formatDateTime, formatTimeAgo } from "@/lib/format/format-time"
import type { SeenVerdict, SetupVerdict } from "@/lib/phones/setup-check"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * A phone's setup, in its window (parts 23, 26 and 28 of the phone farm).
 *
 * The setup check is read off the phone by the rack: charging held near 80,
 * Wi-Fi off on a SIM phone, location off for the apps, the clock and language
 * matching the country, and automatic app updates off. Beside it, what the
 * platform sees: the outside address, its country, the carrier, the clock
 * and the language. Under them, wiping: a phone an account left needs one
 * before it takes another, and a wiped phone takes one again once its setup
 * check passes.
 */
export function PhoneSetupPanel({
  phone,
  onChanged,
}: {
  phone: PhoneRecord
  /** The check or the wipe was asked for, so the list is read again. */
  onChanged: () => Promise<void>
}) {
  const [busy, setBusy] = React.useState<null | "check" | "wipe">(null)
  const [confirming, setConfirming] = React.useState(false)
  const check = phone.setupCheck
  const checking = busy === "check" || phone.setupChecking
  const setUpSinceWipe = Boolean(
    phone.wipedAt && check?.passed && new Date(check.checkedAt).getTime() > new Date(phone.wipedAt).getTime()
  )

  async function askCheck() {
    setBusy("check")
    try {
      await runSetupCheck(phone.id)
      toast.success("Asked the rack for a setup check. It takes a minute or two.")
      await onChanged()
    } catch (error) {
      showErrorToast(getPhoneErrorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  async function wipe() {
    setBusy("wipe")
    try {
      await wipePhone(phone.id)
      toast.success(`Asked the rack to wipe ${phone.name}. It is held once the wipe starts.`)
      setConfirming(false)
      await onChanged()
    } catch (error) {
      showErrorToast(getPhoneErrorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="grid gap-6">
      {phone.addressStop ? (
        <Card size="sm" className="border-destructive/50">
          <CardHeader>
            <CardTitle>Stopped for showing the wrong address</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <p>{phone.addressStop.words}</p>
            <p className="text-muted-foreground">
              Since {formatDateTime(phone.addressStop.at)}, every job on it is refused. Turn the proxy app
              on the phone back on, then check again: the stop lifts once the proxy&apos;s address shows.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card size="sm">
        <CardHeader>
          <CardTitle>Setup check</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          {check ? (
            <>
              <ul className="grid gap-3">
                {check.lines.map((line) => (
                  <li key={line.key} className="flex items-start gap-2 text-sm">
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
                {setupSummary(check)}Read {formatTimeAgo(new Date(check.checkedAt)).toLowerCase()}.
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Not checked yet. Check now asks the rack to read the phone&apos;s Wi-Fi, location
              permissions, clock, language and Play Store setting, and the address apps see.
            </p>
          )}
          <div>
            <Button type="button" variant="outline" size="sm" disabled={checking} onClick={() => void askCheck()}>
              {checking ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />}
              {checking ? "Checking" : "Check now"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>What the platform sees</CardTitle>
        </CardHeader>
        <CardContent>
          {check ? (
            <ul className="grid gap-3">
              {check.seen.map((line) => (
                <li key={line.label} className="flex items-start gap-2 text-sm">
                  <VerdictIcon verdict={line.verdict} />
                  <span className="min-w-0">
                    <span className="font-medium">{line.label}</span>
                    <span className="text-muted-foreground"> · {VERDICT_WORDS[line.verdict]}</span>
                    <span className="block text-muted-foreground">{line.text}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Read with the setup check.</p>
          )}
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Wiping</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <p className="text-sm text-muted-foreground">{wipeWords(phone, setUpSinceWipe)}</p>
          <div>
            <Button type="button" variant="destructive" disabled={busy !== null} onClick={() => setConfirming(true)}>
              <Trash2Icon />
              Wipe the phone
            </Button>
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Wipe ${phone.name}?`}
        description="The rack factory-resets it: every app, account, photo and setting on it is erased, and USB debugging goes off. Afterwards it is held while you set it up by hand (USB debugging, Google, the apps), then release it and run its setup check. It takes an account again once that check passes."
        confirmLabel="Wipe the phone"
        loading={busy === "wipe"}
        onConfirm={() => void wipe()}
      />
    </div>
  )
}

/** One sentence on the whole check: passing, and any line that could not be read. */
function setupSummary(check: NonNullable<PhoneRecord["setupCheck"]>): string {
  const unknown = check.lines.filter((line) => line.verdict === "unknown").length
  if (!check.passed) return ""
  if (!unknown) return "Every line passes. "
  return `Nothing fails; ${unknown} ${unknown === 1 ? "line" : "lines"} could not be read. `
}

function wipeWords(phone: PhoneRecord, setUpSinceWipe: boolean): string {
  if (phone.needsWipeAt) {
    return `An account left it on ${formatDateTime(phone.needsWipeAt)}, so it needs wiping before another account goes on. A new account never inherits an old one's phone.`
  }
  if (phone.wipedAt && !setUpSinceWipe) {
    return `Wiped on ${formatDateTime(phone.wipedAt)}. Set it up again, release it, and run the setup check: it takes an account once every line passes.`
  }
  if (phone.heldImportantAt) {
    return "It has held an important account since its last wipe, so no throwaway can go on it until it is wiped."
  }
  if (phone.wipedAt) return `Wiped on ${formatDateTime(phone.wipedAt)} and set up again since.`
  return "It does not need wiping. When an account leaves it, it does, before the next one goes on."
}

/** Drawn like the browser's "Check what a site sees" (`profile-identity-panel.tsx`). */
const VERDICT_WORDS: Record<SetupVerdict | SeenVerdict, string> = {
  passes: "Passes",
  fails: "Fails",
  unknown: "Could not tell",
  matches: "Matches",
  differs: "Does not match",
  noted: "Seen",
}

function VerdictIcon({ verdict }: { verdict: SetupVerdict | SeenVerdict }) {
  if (verdict === "passes" || verdict === "matches") return <CheckIcon className="size-4 shrink-0" aria-hidden />
  if (verdict === "fails" || verdict === "differs") return <XIcon className="size-4 shrink-0 text-destructive" aria-hidden />
  return <InfoIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
}
