import * as React from "react"
import { CheckIcon, CopyIcon, QrCodeIcon, UserPlusIcon } from "lucide-react"
import { encode } from "uqr"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ErrorRow } from "@/components/ui/error-row"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LoadingRow } from "@/components/ui/loading-row"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Switch } from "@/components/ui/switch"
import {
  loadInvitableFollows,
  resetFocusGroupInvite,
  saveFocusGroupInviteSettings,
  sendFocusGroupInvites,
  type loadMyGroups,
} from "@/lib/api/pomodoro/groups"
import { formatDate } from "@/lib/format/format-time"
import { plural } from "@/lib/format/plural"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import {
  GROUP_INVITES_PER_DAY,
  GROUP_LINK_LIFETIMES,
  GROUP_LINK_LIFETIME_LABELS,
  groupErrorMessage,
  groupInviteLink,
  type GroupLinkLifetime,
} from "@/lib/pomodoro/groups"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

type Group = Awaited<ReturnType<typeof loadMyGroups>>[number]
type Follow = Awaited<ReturnType<typeof loadInvitableFollows>>[number]

/**
 * What the link does right now, in one sentence everybody in the group sees:
 * paused, run out, counting down, or nothing to say.
 */
function linkState(group: Group) {
  if (group.joinsPaused)
    return "Paused. The link lets nobody new in until the owner switches it back on."
  if (!group.linkWorking)
    return "This link has run out. The owner can make a new one."
  if (group.linkLifetime === "week" && group.linkExpiresAt)
    return `Works until ${formatDate(group.linkExpiresAt)}.`
  if (group.linkLifetime === "ten" && group.linkJoinsLeft !== null)
    return `${group.linkJoinsLeft} ${plural(group.linkJoinsLeft, "join")} left on this link.`
  return null
}

/**
 * Invite people, beside Edit group on the group's card (Tyler, 13 Oct 2026,
 * `workspace/docs/assets/pasted-image-1791912798999022000.png`): a dropdown
 * holding the invite link card (groups task 01, parts 4, 6, 7, 8 and 10).
 *
 * Every member can copy the link, show it as a QR code and invite people
 * they follow, because growing a group is what a member does. The owner also
 * has the three switches that decide what the link does, each saving the
 * moment it moves, and New link, which asks first because every invite
 * already sent dies with it.
 *
 * The QR code, the invite window and New link's question are windows, so
 * they are held here, outside the dropdown: the dropdown closes as one
 * opens, and a window drawn inside it would close with it.
 */
export function InvitePeopleButton({
  group,
  onChanged,
}: {
  group: Group
  /** Refreshes the groups list, which carries the link and its state. */
  onChanged: () => Promise<unknown>
}) {
  const [open, setOpen] = React.useState(false)
  const [showingCode, setShowingCode] = React.useState(false)
  const [inviting, setInviting] = React.useState(false)
  const [confirmingNewLink, setConfirmingNewLink] = React.useState(false)
  const [run, busy] = useAsyncAction(groupErrorMessage)
  const link = groupInviteLink(
    typeof globalThis.location === "undefined" ? "" : globalThis.location.origin,
    group.joinToken
  )
  const state = linkState(group)
  const openWindow = (show: (open: boolean) => void) => {
    setOpen(false)
    show(true)
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm">
            <UserPlusIcon aria-hidden="true" />
            Invite people
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          aria-label="Invite link"
          className="w-[min(26rem,calc(100vw-2rem))] gap-4 p-4"
        >
          <InviteLinkFields
            group={group}
            link={link}
            state={state}
            onChanged={onChanged}
            onShowCode={() => openWindow(setShowingCode)}
            onInviteFollows={() => openWindow(setInviting)}
            onNewLink={() => openWindow(setConfirmingNewLink)}
          />
        </PopoverContent>
      </Popover>
      <ConfirmDialog
        open={confirmingNewLink}
        onOpenChange={setConfirmingNewLink}
        title="Replace the invite link?"
        description="Anyone holding the old link can no longer join with it. People already in the group stay in."
        confirmLabel="Replace link"
        loading={busy}
        onConfirm={() =>
          void run(async () => {
            await resetFocusGroupInvite(group.id)
            setConfirmingNewLink(false)
            await onChanged()
          }, "New link made. The old one no longer works.")
        }
      />
      <QrCodeDialog
        open={showingCode}
        onOpenChange={setShowingCode}
        link={link}
        groupName={group.name}
        note={state}
      />
      <InviteFollowsDialog
        key={`follows-${inviting}`}
        open={inviting}
        onOpenChange={setInviting}
        groupId={group.id}
        groupName={group.name}
      />
    </>
  )
}

/** What the dropdown holds: the link, its buttons and the owner's switches. */
function InviteLinkFields({
  group,
  link,
  state,
  onChanged,
  onShowCode,
  onInviteFollows,
  onNewLink,
}: {
  group: Group
  link: string
  state: string | null
  onChanged: () => Promise<unknown>
  onShowCode: () => void
  onInviteFollows: () => void
  onNewLink: () => void
}) {
  const [copied, setCopied] = React.useState(false)
  // Cleared on the way out, so closing the dropdown inside the two seconds
  // does not set state on something that has gone.
  const copiedTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  React.useEffect(
    () => () => {
      if (copiedTimer.current !== null) clearTimeout(copiedTimer.current)
    },
    []
  )
  const [run, busy] = useAsyncAction(groupErrorMessage)
  const pausedId = React.useId()
  const askId = React.useId()
  const lifetimeId = React.useId()

  const saveSettings = (
    settings: Parameters<typeof saveFocusGroupInviteSettings>[1],
    done: string
  ) =>
    void run(async () => {
      await saveFocusGroupInviteSettings(group.id, settings)
      await onChanged()
    }, done)

  return (
    <>
      <h3 className="font-mono text-[11px] font-normal uppercase tracking-[0.2em] text-muted-foreground">
        Invite link
      </h3>
      <div className="grid gap-2">
        <Label htmlFor={`invite-${group.id}`}>Share this address</Label>
        <div className="flex flex-wrap gap-2">
          <Input
            id={`invite-${group.id}`}
            readOnly
            className="min-w-0 flex-1 basis-48"
            value={link}
            onFocus={(event) => event.target.select()}
          />
          <Button
            variant="outline"
            onClick={async () => {
              // A browser with no clipboard, or one that refused, must not be
              // told the link was copied: the address is selectable beside this.
              try {
                await navigator.clipboard.writeText(link)
              } catch {
                showErrorToast(
                  "The link could not be copied. Select it in the box and copy it by hand."
                )
                return
              }
              setCopied(true)
              if (copiedTimer.current !== null) clearTimeout(copiedTimer.current)
              copiedTimer.current = setTimeout(() => setCopied(false), 2_000)
            }}
          >
            {copied ? <CheckIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button variant="outline" onClick={onShowCode}>
            <QrCodeIcon aria-hidden="true" />
            QR code
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Anybody with this link can join the group and see its board. Only
        display names show, never real names or email addresses.
        {group.approveJoins ? " The owner lets each person in." : ""}
      </p>
      {state ? (
        <p role="status" className="text-sm text-muted-foreground">
          {state}
        </p>
      ) : null}
      <Button
        variant="outline"
        size="sm"
        className="self-start"
        onClick={onInviteFollows}
      >
        <UserPlusIcon aria-hidden="true" />
        Invite people you follow
      </Button>

      {group.isOwner ? (
        <div className="-mx-4 grid gap-4 border-t px-4 pt-4">
          <div className="flex items-center gap-2">
            <Switch
              id={pausedId}
              checked={!group.joinsPaused}
              disabled={busy}
              onCheckedChange={(checked) =>
                saveSettings(
                  { joinsPaused: !checked },
                  checked ? "The link lets people in again." : "The link is paused."
                )
              }
            />
            <Label htmlFor={pausedId} className="text-sm font-normal">
              Let new people join
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id={askId}
              checked={group.approveJoins}
              disabled={busy}
              onCheckedChange={(checked) =>
                saveSettings(
                  { approveJoins: checked },
                  checked
                    ? "You let each person in from now on."
                    : "People join straight away again. Anybody waiting is in."
                )
              }
            />
            <Label htmlFor={askId} className="text-sm font-normal">
              Ask me before people join
            </Label>
          </div>
          <div className="grid gap-2">
            <FieldLabel
              htmlFor={lifetimeId}
              hint="After 7 days counts from when you pick it. After 10 joins counts the joins from then. New link starts the count again."
            >
              The link stops working
            </FieldLabel>
            <Select
              value={group.linkLifetime}
              disabled={busy}
              onValueChange={(value) =>
                saveSettings(
                  { linkLifetime: value as GroupLinkLifetime },
                  "Saved."
                )
              }
            >
              <SelectTrigger id={lifetimeId} aria-label="The link stops working">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GROUP_LINK_LIFETIMES.map((lifetime) => (
                  <SelectItem key={lifetime} value={lifetime}>
                    {GROUP_LINK_LIFETIME_LABELS[lifetime]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" disabled={busy} onClick={onNewLink}>
              New link
            </Button>
            <span className="text-xs text-muted-foreground">
              Replaces the link, so anybody still holding the old one cannot
              join.
            </span>
          </div>
        </div>
      ) : null}
    </>
  )
}

/**
 * The link as a QR code (part 10), so a study group at one table joins from
 * their phones. Drawn in the browser from the link already on the page;
 * nothing new goes to the server.
 *
 * Black on white whatever the theme, on purpose: a phone camera reads dark
 * squares on a light ground, and a code drawn light on dark fails on many of
 * them. This is a drawing, not a surface, so it keeps its own colours.
 */
function QrCodeDialog({
  open,
  onOpenChange,
  link,
  groupName,
  note,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  link: string
  groupName: string
  note: string | null
}) {
  const code = React.useMemo(() => (open ? encode(link, { border: 2 }) : null), [open, link])
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Join {groupName}</DialogTitle>
          <DialogDescription>
            Point a phone&apos;s camera at the code to open the invite page.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {code ? (
            <div className="flex flex-col items-center gap-3">
              <svg
                role="img"
                aria-label={`QR code for the invite link to ${groupName}`}
                viewBox={`0 0 ${code.size} ${code.size}`}
                className="aspect-square w-full max-w-72 rounded-xl bg-white"
                shapeRendering="crispEdges"
              >
                {code.data.flatMap((row, y) =>
                  row.map((dark, x) =>
                    dark ? (
                      <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="#000" />
                    ) : null
                  )
                )}
              </svg>
              {note ? (
                <p role="status" className="text-center text-sm text-muted-foreground">
                  {note}
                </p>
              ) : null}
            </div>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Invite people you follow (part 7). Each ticked person gets an invite in
 * the bell with Join and Decline on Groups. People already in the group,
 * kept out of it, holding an invite, or across a block are not listed, and
 * the list never says which of those applies.
 */
function InviteFollowsDialog({
  open,
  onOpenChange,
  groupId,
  groupName,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  groupId: string
  groupName: string
}) {
  const [follows, setFollows] = React.useState<Follow[] | null>(null)
  const [failed, setFailed] = React.useState(false)
  const [attempt, setAttempt] = React.useState(0)
  const [picked, setPicked] = React.useState<Set<string>>(() => new Set())
  const [run, busy] = useAsyncAction(groupErrorMessage)

  React.useEffect(() => {
    if (!open) return
    let cancelled = false
    void loadInvitableFollows(groupId)
      .then((rows) => {
        if (cancelled) return
        setFailed(false)
        setFollows(rows)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [open, groupId, attempt])

  const toggle = (followId: string, on: boolean) =>
    setPicked((previous) => {
      const next = new Set(previous)
      if (on) next.add(followId)
      else next.delete(followId)
      return next
    })

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Invite people you follow</DialogTitle>
          <DialogDescription>
            Each person you tick gets an invite to {groupName} in their bell,
            with Join and Decline. Up to {GROUP_INVITES_PER_DAY} invites a day.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Card size="sm">
            <CardContent className="grid gap-2">
              {failed ? (
                <ErrorRow
                  message="The people you follow could not be loaded."
                  onRetry={() => {
                    dismissErrorToast()
                    setFailed(false)
                    setAttempt((count) => count + 1)
                  }}
                />
              ) : follows === null ? (
                <LoadingRow label="Loading the people you follow" />
              ) : follows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nobody you follow can be invited right now. People already in
                  the group, or already holding an invite to it, are not listed.
                </p>
              ) : (
                <ScrollArea className="max-h-72">
                  <ul className="grid gap-2 pr-3">
                    {follows.map((follow) => {
                      const id = `invite-follow-${follow.followId}`
                      return (
                        <li key={follow.followId} className="flex items-center gap-2">
                          <Checkbox
                            id={id}
                            checked={picked.has(follow.followId)}
                            onCheckedChange={(state) =>
                              toggle(follow.followId, state === true)
                            }
                          />
                          <Label htmlFor={id} className="min-w-0 truncate font-normal">
                            {follow.name}
                          </Label>
                        </li>
                      )
                    })}
                  </ul>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={busy}
            onClick={async () => {
              // The button stays live and says what is missing.
              if (picked.size === 0) {
                showErrorToast("Tick at least one person to invite.")
                return
              }
              const sent = await run(async () => {
                await sendFocusGroupInvites(groupId, [...picked])
              }, picked.size === 1 ? "Invite sent." : `${picked.size} invites sent.`)
              if (sent) onOpenChange(false)
            }}
          >
            Send invites
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
