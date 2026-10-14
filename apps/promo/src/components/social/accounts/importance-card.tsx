import * as React from "react"
import { Link } from "@tanstack/react-router"
import { AlertTriangleIcon, ArrowRightLeftIcon, Loader2Icon, RefreshCwIcon, ShieldCheckIcon, XIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  getRedditAccountsErrorMessage,
  markRedditAccountImportant,
  moveRedditAccountToPhone,
  type RedditAccountRow,
} from "@/lib/api/social/reddit-accounts"
import { formatTimeAgo } from "@/lib/format/format-time"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * Whether an account is important or a throwaway (part 22 of the phone
 * farm), and the one-way ways to make a throwaway important: marking one
 * that already runs on a phone, or moving one from its browser profile to a
 * phone (part 31). Important is never undone (Tyler, 14 Oct 2026).
 */
export function ImportanceCard({
  account,
  phones,
  onChanged,
}: {
  account: RedditAccountRow
  /** Phones free for a Reddit account, each with why it is not ready, if it is not. */
  phones: Array<{ id: string; name: string; note?: string }>
  onChanged: () => Promise<void>
}) {
  const name = account.handle ? `u/${account.handle}` : "this account"
  const [confirming, setConfirming] = React.useState(false)
  const [busy, setBusy] = React.useState<null | "mark" | "start" | "check" | "cancel">(null)
  const [phoneId, setPhoneId] = React.useState("")

  // While the phone is being asked who is signed in, the row is read again
  // every few seconds, so the answer, and a finished move, show by themselves.
  const asking = account.move?.lastRead?.status === "queued" || account.move?.lastRead?.status === "running"
  React.useEffect(() => {
    if (!asking) return
    const timer = setInterval(() => void onChanged(), 3_000)
    return () => clearInterval(timer)
  }, [asking, onChanged])

  async function run(step: NonNullable<typeof busy>, work: () => Promise<void>, success: string) {
    setBusy(step)
    try {
      await work()
      toast.success(success)
      await onChanged()
    } catch (error) {
      showErrorToast(getRedditAccountsErrorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  if (account.importance === "important") {
    return (
      <Card size="sm">
        <CardHeader>
          <CardTitle>Important</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {name} is important. It runs on a phone only, and Promo keeps it apart from every
            throwaway: no shared voice, project or proxy, and no throwaway answers it or names it.
          </p>
        </CardContent>
      </Card>
    )
  }

  const move = account.move
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Throwaway</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {account.phone ? (
          <>
            <p className="text-sm text-muted-foreground">
              {name} runs on a phone as a throwaway. Marking it important keeps it apart from every
              throwaway from then on. It cannot be undone.
            </p>
            <div>
              <Button type="button" variant="outline" disabled={busy !== null} onClick={() => setConfirming(true)}>
                <ShieldCheckIcon />
                Mark important
              </Button>
            </div>
          </>
        ) : move ? (
          <>
            <p className="text-sm">
              Moving to the phone{" "}
              <Link to="/admin/phones" search={{ open: move.phone.id }} className="font-medium hover:underline">
                {move.phone.name}
              </Link>
              . Open its screen there, sign in to Reddit as {name} by hand, then press Check sign-in.
            </p>
            <p className="text-sm text-muted-foreground">{lastReadWords(move.lastRead, account.handle)}</p>
            {move.heldBack ? (
              <p className="flex items-start gap-1.5 text-sm text-amber-600 dark:text-amber-400">
                <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>The move cannot finish yet: {move.heldBack}</span>
              </p>
            ) : null}
            <p className="text-sm text-muted-foreground">
              Once the phone reads {name} signed in, it runs on the phone, is marked important, and its
              browser profile is closed with its saved sign-in deleted. Until then it keeps running on
              its profile.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={busy !== null}
                onClick={() =>
                  void run(
                    "check",
                    () => moveRedditAccountToPhone({ step: "check", accountId: account.id }),
                    "Asked the phone who is signed in."
                  )
                }
              >
                {busy === "check" ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />}
                Check sign-in
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={busy !== null}
                onClick={() =>
                  void run(
                    "cancel",
                    () => moveRedditAccountToPhone({ step: "cancel", accountId: account.id }),
                    "Move cancelled. It stays on its browser profile."
                  )
                }
              >
                {busy === "cancel" ? <Loader2Icon className="animate-spin" /> : <XIcon />}
                Cancel move
              </Button>
            </div>
          </>
        ) : account.profile ? (
          <>
            <p className="text-sm text-muted-foreground">
              {name} runs on a browser profile. Move it to a phone to make it important, one way only:
              once the phone reads it signed in, it can never go back onto a browser profile.
            </p>
            <div className="grid gap-2">
              <Label htmlFor="move-to-phone">Phone</Label>
              <div className="flex flex-wrap gap-2">
                <Select value={phoneId} onValueChange={setPhoneId}>
                  <SelectTrigger id="move-to-phone" className="w-full sm:w-fit sm:min-w-64">
                    <SelectValue placeholder={phones.length ? "Pick a phone" : "No free phone"} />
                  </SelectTrigger>
                  <SelectContent>
                    {phones.map((phone) => (
                      <SelectItem key={phone.id} value={phone.id}>
                        {phone.name}
                        {phone.note ? ` (${phone.note})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy !== null}
                  onClick={() => {
                    if (!phoneId) {
                      showErrorToast(
                        phones.length
                          ? "Pick the phone it moves to first."
                          : "There is no free phone. Add one on the Phones dashboard, or free one up."
                      )
                      return
                    }
                    void run(
                      "start",
                      () => moveRedditAccountToPhone({ step: "start", accountId: account.id, phoneId }),
                      "Move started. Sign in on the phone, then press Check sign-in."
                    )
                  }}
                >
                  {busy === "start" ? <Loader2Icon className="animate-spin" /> : <ArrowRightLeftIcon />}
                  Move to a phone
                </Button>
              </div>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            {name} runs on nothing yet. Pick a phone or a browser profile under Runs on.
          </p>
        )}
      </CardContent>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Mark ${name} important?`}
        description="From now on it runs on a phone only, and Promo refuses anything that links it to a throwaway: a shared voice, project or proxy, a throwaway answering it or naming it, or both commenting under one post. Its phone needs a wipe before a throwaway can use it. This cannot be undone."
        confirmLabel="Mark important"
        destructive={false}
        loading={busy === "mark"}
        onConfirm={() =>
          void run(
            "mark",
            () => markRedditAccountImportant(account.id),
            `${name} is important now.`
          ).then(() => setConfirming(false))
        }
      />
    </Card>
  )
}

function lastReadWords(
  read: NonNullable<RedditAccountRow["move"]>["lastRead"],
  handle: string
): string {
  if (!read) return "The phone has not been asked yet."
  const when = formatTimeAgo(read.at).toLowerCase()
  if (read.status === "queued" || read.status === "running") return "Asking the phone who is signed in now."
  if (read.status === "failed" || read.status === "cancelled") {
    return `The last look, ${when}, did not work: ${read.error || "the rack gave no reason"}.`
  }
  if (!read.handle) return `The last look, ${when}, found the Reddit app signed in to nobody.`
  return read.handle.toLowerCase() === handle.toLowerCase()
    ? `The last look, ${when}, found u/${read.handle} signed in.`
    : `The last look, ${when}, found u/${read.handle} signed in, not u/${handle}. Sign out and sign in as u/${handle}.`
}
