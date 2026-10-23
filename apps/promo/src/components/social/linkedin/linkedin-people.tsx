import * as React from "react"
import { CheckIcon, Loader2Icon, RefreshCwIcon, UserPlusIcon } from "lucide-react"
import { toast } from "sonner"

import { Hint } from "@/components/social/hint"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import { acceptLinkedinRequests, getLinkedinErrorMessage, readLinkedinPeopleNow, type LinkedinPeople } from "@/lib/api/social/linkedin"
import { describeBulkResult } from "@/lib/format/bulk-result"
import { linkedinPersonUrl, type LinkedinConnectStatus, type LinkedinInviteStatus } from "@/lib/social/linkedin/options"
import { postedDateText } from "@/lib/social/wording"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

import { XListError } from "../x/x-panel-frame"
import { LinkedinConnectDialog } from "./linkedin-comments"
import { linkedinAccountName } from "./linkedin-words"

type Viewer = LinkedinPeople["viewers"][number]

const INVITE_WORDS: Record<LinkedinInviteStatus, string> = {
  waiting: "Waiting",
  accepting: "Being accepted",
  accepted: "Accepted",
  failed: "Did not accept",
}

const CONNECT_WORDS: Record<LinkedinConnectStatus, string> = {
  waiting: "On its way",
  sent: "Sent",
  failed: "Did not go",
}

/** "in/jane-doe", or what to say before a look has seen it signed in. */
/** A person as the lists draw them: their name, linked to their page, and their job title. */
function Person({ slug, name, headline, fits }: { slug: string; name: string; headline: string; fits: string }) {
  return (
    <span className="grid min-w-0 flex-1 gap-0.5">
      <span className="flex min-w-0 items-center gap-1.5">
        <a href={linkedinPersonUrl(slug)} target="_blank" rel="noreferrer" className="truncate text-sm hover:underline">
          {name || `in/${slug}`}
        </a>
        {fits ? (
          <Hint label={`Their job title matches "${fits}", one of the people the project sells to`}>
            <Badge variant="secondary" className="shrink-0">
              Sells to
            </Badge>
          </Hint>
        ) : null}
      </span>
      {headline ? <span className="truncate text-xs text-muted-foreground">{headline}</span> : null}
    </span>
  )
}

/** One section's heading: a small title, its count, and anything at its right end. */
function Heading({ title, count, children }: { title: string; count: number; children?: React.ReactNode }) {
  return (
    <div className="flex min-h-8 items-center gap-2 px-3">
      <h3 className="text-xs font-medium">
        {title} <span className="font-normal text-muted-foreground tabular-nums">{count}</span>
      </h3>
      <span className="flex-1" />
      {children}
    </div>
  )
}

/**
 * The People tab (parts 39, 40 and 41), in the middle column only: each
 * account's requests this week against the number in Settings → Behaviour
 * with Read now; the requests waiting on the accounts, people the project
 * sells to first, ticked and accepted together a minute or two apart; who
 * viewed the accounts' profiles, each with Connect; and the requests the
 * accounts sent. Tyler, 22 Oct 2026: nothing is accepted without his press,
 * and a request's note is the AI's, edited before Send.
 */
export function LinkedinPeopleTab({
  data,
  loading,
  error,
  onRetry,
  onChanged,
}: {
  projectId: string
  data: LinkedinPeople | null
  loading: boolean
  error: string | null
  onRetry: () => void
  onChanged: () => Promise<void>
}) {
  const [selecting, setSelecting] = React.useState(false)
  const [ticked, setTicked] = React.useState<Set<string>>(() => new Set())
  const [busy, setBusy] = React.useState<string | null>(null)
  const [connecting, setConnecting] = React.useState<Viewer | null>(null)

  const waiting = (data?.invites ?? []).filter((invite) => invite.status !== "accepted")
  const accountById = new Map((data?.accounts ?? []).map((account) => [account.id, account]))
  // Ticks on rows that left the list are not counted.
  const tickedIds = waiting.filter((invite) => ticked.has(invite.id) && invite.status === "waiting").map((invite) => invite.id)

  function tick(id: string, on: boolean) {
    setTicked((current) => {
      const next = new Set(current)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }

  async function accept() {
    if (!tickedIds.length) {
      showErrorToast("Tick the requests to accept first.")
      return
    }
    setBusy("accept")
    try {
      const result = await acceptLinkedinRequests(tickedIds)
      toast.success(describeBulkResult({ done: result.completed.length, kept: result.skipped.length, one: "request", many: "requests", verb: "accepted soon", keptReason: "refused, each with its reason" }))
      for (const skipped of result.skipped) {
        const invite = waiting.find((item) => item.id === skipped.id)
        showErrorToast(`${invite?.name || "One request"}: ${skipped.reason}`)
      }
      setTicked(new Set())
      setSelecting(false)
      await onChanged()
    } catch (failure) {
      showErrorToast(getLinkedinErrorMessage(failure))
    } finally {
      setBusy(null)
    }
  }

  if (error) return <XListError what="people" error={error} onRetry={onRetry} />
  if (loading && !data) {
    return (
      <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
        <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
        Reading the people
      </p>
    )
  }
  if (!data) return null

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b px-3">
        <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
          Up to {data.connectsPerWeek} connection requests a week from each account
        </span>
        {selecting && tickedIds.length ? (
          <Button type="button" size="sm" disabled={busy !== null} onClick={() => void accept()}>
            {busy === "accept" ? <Loader2Icon className="animate-spin" /> : <CheckIcon />}
            Accept {tickedIds.length} selected
          </Button>
        ) : null}
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="grid gap-4 py-3">
          <section aria-label="The accounts" className="grid gap-1">
            {data.accounts.length ? (
              data.accounts.map((account) => (
                <div key={account.id} className="flex min-w-0 items-center gap-2 px-3 py-1">
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <span className="truncate text-sm">
                      {linkedinAccountName(account.handle)}
                      {account.premium ? <span className="text-muted-foreground"> · Premium</span> : null}
                      {account.onPhone ? <span className="text-muted-foreground"> · on a phone</span> : null}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {account.connectsThisWeek} of {data.connectsPerWeek} requests sent in the last 7 days
                    </span>
                  </span>
                  <Hint label={account.onPhone ? "Read the requests waiting on it now, on its phone" : "Read the requests waiting on it and who viewed its profile now"}>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy !== null || account.reading}
                      onClick={async () => {
                        setBusy(account.id)
                        try {
                          const { queued } = await readLinkedinPeopleNow(account.id)
                          toast.success(
                            !queued
                              ? "A read is on its way already."
                              : account.onPhone
                                ? "Reading its waiting requests on its phone, inside its workday. Viewers are read in a browser only."
                                : "Reading them in its own browser, inside its workday."
                          )
                          await onChanged()
                        } catch (failure) {
                          showErrorToast(getLinkedinErrorMessage(failure))
                        } finally {
                          setBusy(null)
                        }
                      }}
                    >
                      {busy === account.id || account.reading ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />}
                      {account.reading ? "Reading" : "Read now"}
                    </Button>
                  </Hint>
                </div>
              ))
            ) : (
              <p className="px-3 text-sm text-muted-foreground">This project has no LinkedIn account yet. Add one with the account dropdown above a post.</p>
            )}
          </section>

          <section aria-label="Requests waiting" className="grid gap-1 border-t pt-3">
            <Heading title="Requests waiting" count={waiting.length}>
              {waiting.length ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-pressed={selecting}
                  onClick={() => {
                    setSelecting((on) => !on)
                    setTicked(new Set())
                  }}
                >
                  {selecting ? "Hide select" : "Mass select"}
                </Button>
              ) : null}
            </Heading>
            {waiting.length ? (
              waiting.map((invite) => (
                <div key={invite.id} className={cn("flex min-w-0 items-center gap-3 px-3 py-2", ticked.has(invite.id) && "bg-muted/50")}>
                  {selecting ? (
                    <Checkbox
                      checked={ticked.has(invite.id)}
                      disabled={invite.status !== "waiting"}
                      onCheckedChange={(checked) => tick(invite.id, checked === true)}
                      aria-label={`Select ${invite.name || invite.slug}`}
                    />
                  ) : null}
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <Person slug={invite.slug} name={invite.name} headline={invite.headline} fits={invite.fits} />
                    {invite.note ? <span className="line-clamp-2 text-xs text-muted-foreground">&ldquo;{invite.note}&rdquo;</span> : null}
                    <span className={cn("text-xs", invite.status === "failed" ? "text-destructive" : "text-muted-foreground")}>
                      {[`To ${linkedinAccountName(accountById.get(invite.account.id)?.handle ?? invite.account.handle)}`, INVITE_WORDS[invite.status], invite.status === "failed" ? invite.lastError : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                </div>
              ))
            ) : (
              <p className="px-3 text-sm text-muted-foreground">No requests are waiting. They are read once a workday, or with Read now.</p>
            )}
          </section>

          <section aria-label="Viewed your profile" className="grid gap-1 border-t pt-3">
            <Heading title="Viewed your profile" count={data.viewers.length} />
            {data.accounts.some((account) => !account.premium && !account.onPhone) ? (
              <p className="px-3 text-xs text-muted-foreground">A free account sees only its last few viewers. Premium shows every one.</p>
            ) : null}
            {data.viewers.length ? (
              data.viewers.map((viewer) => (
                <div key={viewer.id} className="flex min-w-0 items-center gap-3 px-3 py-2">
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <Person slug={viewer.slug} name={viewer.name} headline={viewer.headline} fits={viewer.fits} />
                    <span className="text-xs text-muted-foreground">
                      {[`Viewed ${linkedinAccountName(viewer.account.handle)}`, viewer.viewedAt ? postedDateText(new Date(viewer.viewedAt)) : null].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  {viewer.connect ? (
                    <span className="shrink-0 text-xs text-muted-foreground">Request {CONNECT_WORDS[viewer.connect].toLowerCase()}</span>
                  ) : (
                    <Button type="button" size="sm" variant="outline" onClick={() => setConnecting(viewer)}>
                      <UserPlusIcon />
                      Connect
                    </Button>
                  )}
                </div>
              ))
            ) : (
              <p className="px-3 text-sm text-muted-foreground">Nobody yet. Viewers are read once a workday in each account&apos;s own browser.</p>
            )}
          </section>

          <section aria-label="Requests sent" className="grid gap-1 border-t pt-3">
            <Heading title="Requests sent" count={data.connects.length} />
            {data.connects.length ? (
              data.connects.map((connect) => (
                <div key={connect.id} className="flex min-w-0 items-center gap-3 px-3 py-2">
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <Person slug={connect.slug} name={connect.name} headline={connect.headline} fits={connect.fits} />
                    {connect.note ? <span className="line-clamp-2 text-xs text-muted-foreground">&ldquo;{connect.note}&rdquo;</span> : null}
                    <span className={cn("text-xs", connect.status === "failed" ? "text-destructive" : "text-muted-foreground")}>
                      {[
                        `From ${linkedinAccountName(connect.account.handle)}`,
                        connect.source === "viewer" ? "after they viewed the profile" : "after a comment on their post",
                        CONNECT_WORDS[connect.status],
                        postedDateText(new Date(connect.sentAt ?? connect.createdAt)),
                        connect.status === "failed" ? connect.lastError : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                </div>
              ))
            ) : (
              <p className="px-3 text-sm text-muted-foreground">No requests sent yet. Connect from a sent comment on the Comments tab, or from a viewer above.</p>
            )}
          </section>
        </div>
      </ScrollArea>
      {connecting ? (
        <LinkedinConnectDialog
          accountId={connecting.account.id}
          accountName={linkedinAccountName(connecting.account.handle)}
          personName={connecting.name}
          from={{ viewerId: connecting.id }}
          onClose={() => setConnecting(null)}
          onSent={onChanged}
        />
      ) : null}
    </div>
  )
}
