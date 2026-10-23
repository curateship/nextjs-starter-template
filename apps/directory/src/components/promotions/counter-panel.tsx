import * as React from "react"
import { CheckCircle2Icon, Loader2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import {
  checkCodeAtCounter,
  getClaimErrorMessage,
  markCodeUsedAtCounter,
  type CounterAnswer,
  type DealClaim,
} from "@/lib/api/promotions/claims"
import { formatDateTime } from "@/lib/format/format-time"
import { readScannedCode } from "@/lib/promotions/claim-code"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

/**
 * The counter: a code is typed or pasted in, the screen says whether it is
 * good to use, and one button marks it used.
 *
 * The usual way in is not this box at all. A phone camera pointed at the
 * customer's QR opens their own code page, which carries the same Mark used
 * button for whoever is signed in as the owner or an admin. This box is for
 * the times the camera is blocked, the screen is cracked or the code is being
 * read out across a counter, and it is why a typed code always works.
 *
 * It only ever works on the deal it was opened from. A real code for a
 * different deal is refused by name rather than marked used here.
 */
export function CounterPanel({
  promotionId,
  dealTitle,
  onClaims,
}: {
  promotionId: string
  dealTitle: string
  /** The deal's claims as they are after a code was marked used. */
  onClaims: (claims: DealClaim[]) => void
}) {
  const [typed, setTyped] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [answer, setAnswer] = React.useState<CounterAnswer | null>(null)

  const readable = readScannedCode(typed) !== ""

  async function run(step: "check" | "use") {
    dismissErrorToast()
    if (!readable) {
      showErrorToast(
        "A code is eight characters, like K7QX-P2MD. Type it or paste the whole link from their screen."
      )
      return
    }
    setBusy(true)
    try {
      const result = await (step === "check"
        ? checkCodeAtCounter({ promotionId, scanned: typed })
        : markCodeUsedAtCounter({ promotionId, scanned: typed }))
      setAnswer(result)
      if (result.claims) onClaims(result.claims)
    } catch (error) {
      showErrorToast(getClaimErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>At the counter</CardTitle>
        <CardDescription>
          Point a phone camera at the customer&rsquo;s QR and it opens their
          code with a Mark used button on it. Their code can be typed in here
          instead, which is the way that always works.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <form
          className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end"
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            void run("check")
          }}
        >
          <div className="grid gap-2">
            <FieldLabel htmlFor="counter-code">Their code</FieldLabel>
            <Input
              id="counter-code"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              placeholder="K7QX-P2MD"
              maxLength={200}
              value={typed}
              disabled={busy}
              onChange={(event) => {
                setTyped(event.target.value)
                setAnswer(null)
              }}
            />
          </div>
          <Button type="submit" variant="outline" disabled={busy}>
            {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
            Check code
          </Button>
        </form>

        {answer ? (
          <CounterResult
            answer={answer}
            dealTitle={dealTitle}
            busy={busy}
            onUse={() => void run("use")}
          />
        ) : null}
      </CardContent>
    </Card>
  )
}

/** What the code turned out to be, in a sentence, with the one action it has. */
function CounterResult({
  answer,
  dealTitle,
  busy,
  onUse,
}: {
  answer: CounterAnswer
  dealTitle: string
  busy: boolean
  onUse: () => void
}) {
  const { state, claim, justUsed } = answer
  // The code as stored, not as it was typed: a whole link pasted in, or a
  // code typed without its dash, is otherwise never confirmed back.
  const whose = claim ? `${claim.name} · ${claim.email} · ${claim.code}` : ""
  const words = (() => {
    if (state === "good") return "Good to use."
    // The press of the button and a code somebody used an hour ago both end
    // up here, and they must not read the same.
    if (justUsed) return "Used, and that is it done."
    if (state === "used") {
      return `Already used, ${formatDateTime(claim?.usedAt ?? null)}.`
    }
    if (state === "cancelled") {
      return "That claim was taken away, so this code is nobody's. It cannot be used."
    }
    if (state === "other") {
      return `That code is for another deal, not ${dealTitle}.`
    }
    return `No code like that has been claimed for ${dealTitle}.`
  })()

  return (
    <div className="grid gap-2 border-t pt-4">
      <p role="status" className="text-sm font-medium">
        {words}
      </p>
      {whose ? <p className="text-sm text-muted-foreground">{whose}</p> : null}
      {state === "good" ? (
        <Button type="button" className="w-fit" disabled={busy} onClick={onUse}>
          {busy ? (
            <Loader2Icon className="size-4 animate-spin" />
          ) : (
            <CheckCircle2Icon />
          )}
          Mark used
        </Button>
      ) : null}
    </div>
  )
}
