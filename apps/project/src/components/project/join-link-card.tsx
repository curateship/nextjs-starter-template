import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { CopyIcon, Link2Icon, Loader2Icon, RefreshCwIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { newJoinLink, stopJoinLink, type JoinLinkState } from "@/lib/api/project/team-running"
import { formatDate } from "@/lib/format/format-time"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { JOINS_PER_LINK_PER_DAY } from "@/lib/project/rules"
import { useEscapeCancels } from "@/lib/project/use-escape-cancels"
import { showErrorToast } from "@/lib/toast/error-toast"
import { useTeamId } from "@/lib/project/team-scope"

/**
 * The team's join link, in Team settings for the owner and admins. Anyone
 * signed in who isn't on a team can join as a member through it, straight
 * away (Tyler's choice). Only a fingerprint of the link is kept, so it shows
 * here once, when it is made. A new link stops the old one at once, so
 * making one while the link is on asks first, as turning it off does. Both
 * ask inside the card: it sits in the Team settings window, and a second
 * window on top of it is the thing not to do.
 */
export function JoinLinkCard({ state }: { state: JoinLinkState }) {
  const teamId = useTeamId()
  const router = useRouter()
  const [link, setLink] = React.useState<string | null>(null)
  const [asking, setAsking] = React.useState<"new" | "off" | null>(null)
  const [run, busy] = useAsyncAction(getProjectErrorMessage)
  const question = React.useRef<HTMLDivElement>(null)
  useEscapeCancels(question, () => setAsking(null))

  async function turnOff() {
    if (!(await run(() => stopJoinLink(teamId), "The join link is off."))) return
    setAsking(null)
    setLink(null)
    await router.invalidate()
  }

  async function make() {
    let made = ""
    const ok = await run(async () => {
      made = (await newJoinLink(teamId)).link
    }, state.on ? "A new link is ready. The old one no longer works." : "The join link is on.")
    if (!ok) return
    setAsking(null)
    setLink(made)
    await router.invalidate()
  }

  async function copy() {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      toast.success("Link copied.")
    } catch {
      showErrorToast("This browser wouldn't copy it. Select the link and copy it by hand.")
    }
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Join link</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <p className="text-sm text-muted-foreground">
          {state.on
            ? state.expired
              ? "The link has expired. Make a new one to let people join again."
              : `On until ${formatDate(state.expiresAt!)}. Anyone signed in who isn't on a team joins as a member, up to ${JOINS_PER_LINK_PER_DAY} a day, and you hear about each one in the bell.`
            : "Off. Turn it on to get one link to paste in a message, instead of inviting people one by one."}
        </p>
        {link ? (
          <div className="grid gap-2">
            <Label htmlFor="join-link">The link, shown this once</Label>
            <div className="flex gap-2">
              <Input id="join-link" value={link} readOnly onFocus={(event) => event.currentTarget.select()} />
              <Button type="button" variant="outline" onClick={() => void copy()}>
                <CopyIcon className="size-4" />
                Copy
              </Button>
            </div>
          </div>
        ) : null}
        {asking ? (
          <div ref={question} className="flex flex-wrap items-center gap-2">
            <span className="text-sm">
              {asking === "new"
                ? "Make a new link? The old one stops working at once."
                : "Turn off the join link? It stops working at once. People already on the team stay."}
            </span>
            <Button type="button" variant="outline" disabled={busy} onClick={() => setAsking(null)}>
              Keep it
            </Button>
            <Button
              type="button"
              variant={asking === "off" ? "destructive" : "default"}
              disabled={busy}
              autoFocus
              onClick={() => void (asking === "new" ? make() : turnOff())}
            >
              {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
              {asking === "new" ? "Make a new link" : "Turn it off"}
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => (state.on ? setAsking("new") : void make())}
            >
              {busy ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : state.on ? (
                <RefreshCwIcon className="size-4" />
              ) : (
                <Link2Icon className="size-4" />
              )}
              {state.on ? "Make a new link" : "Turn on the join link"}
            </Button>
            {state.on ? (
              <Button type="button" variant="ghost" disabled={busy} onClick={() => setAsking("off")}>
                Turn it off
              </Button>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
