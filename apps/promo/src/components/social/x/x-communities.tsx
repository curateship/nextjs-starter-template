import * as React from "react"
import { ExternalLinkIcon, Loader2Icon, PlusIcon, RefreshCwIcon, Trash2Icon, UsersRoundIcon } from "lucide-react"
import { toast } from "sonner"

import { DashboardToolbarButton } from "@/components/shared/dashboard-toolbar"
import { Hint } from "@/components/social/hint"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import { changeXCommunity, getXErrorMessage, type XCommunityView } from "@/lib/api/social/x"
import { xCommunityId } from "@/lib/social/x/options"
import { postedDateText } from "@/lib/social/wording"
import { shortCount } from "@/lib/social/x/wording"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

import { XListError, XPanelFrame } from "./x-panel-frame"

/** "Rules read 2 days ago", "Reading its rules", "Rules not read yet". */
function rulesWords(community: XCommunityView): string {
  if (community.reading) return "Reading its rules"
  if (!community.rulesReadAt) return "Rules not read yet"
  return `Rules read ${postedDateText(new Date(community.rulesReadAt)).toLowerCase()}`
}

/**
 * The Communities tab's list (part 35): the X Communities on the project's
 * topic, with how many members each has and when its rules were read. A
 * search account reads the rules, and the AI is given them before it writes
 * a post going into that community.
 */
export function XCommunitiesList({
  projectId,
  rows,
  loading,
  error,
  selectedId,
  onSelect,
  onRetry,
  onChanged,
}: {
  projectId: string
  rows: XCommunityView[]
  loading: boolean
  error: string | null
  selectedId: string | null
  onSelect: (communityRowId: string) => void
  onRetry: () => void
  onChanged: () => Promise<void>
}) {
  const [open, setOpen] = React.useState(false)
  const [address, setAddress] = React.useState("")
  const [tried, setTried] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const wrong = tried && !xCommunityId(address)

  async function add(event: React.FormEvent) {
    event.preventDefault()
    setTried(true)
    if (!xCommunityId(address)) {
      showErrorToast("Paste the community's address on X. It looks like x.com/i/communities/ and a long number.")
      return
    }
    setBusy(true)
    try {
      const added = await changeXCommunity({ change: "add", projectId, address: address.trim() })
      setOpen(false)
      setAddress("")
      setTried(false)
      await onChanged()
      if (added?.readRefused) showErrorToast(`Added, but its rules are not read yet. ${added.readRefused}`)
      else toast.success("Added. A search account reads its name and rules.")
    } catch (failure) {
      showErrorToast(getXErrorMessage(failure))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b px-3">
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">Groups on X around one topic. An account has to be let in before it posts there.</span>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <DashboardToolbarButton type="button">
              <PlusIcon className="size-4" />
              Add community
            </DashboardToolbarButton>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-3">
            <form className="grid gap-4" onSubmit={add}>
              <div className="grid gap-2">
                <FieldLabel htmlFor="x-community-address">Its address on X</FieldLabel>
                <Input
                  id="x-community-address"
                  autoFocus
                  value={address}
                  aria-invalid={wrong || undefined}
                  placeholder="x.com/i/communities/1493446837214187523"
                  onChange={(event) => setAddress(event.target.value)}
                  onBlur={() => setTried(address.trim() !== "")}
                />
              </div>
              <div className="flex justify-end">
                <Button type="submit" disabled={busy}>
                  {busy ? <Loader2Icon className="animate-spin" /> : null}
                  Add it
                </Button>
              </div>
            </form>
          </PopoverContent>
        </Popover>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        {error ? (
          <XListError what="communities" error={error} onRetry={onRetry} />
        ) : loading && !rows.length ? (
          <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
            Reading the communities
          </p>
        ) : !rows.length ? (
          <p className="p-4 text-sm text-muted-foreground">No communities yet. Find one on X on the project&apos;s topic and add it by its address.</p>
        ) : (
          <div className="py-1.5">
            {rows.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => onSelect(row.id)}
                aria-current={row.id === selectedId || undefined}
                className={cn(
                  "flex w-full min-w-0 items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  row.id === selectedId && "bg-muted shadow-[inset_2px_0_0_var(--foreground)] hover:bg-muted"
                )}
              >
                <UsersRoundIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className="truncate text-sm">{row.name || `Community ${row.communityId}`}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {[row.members === null ? "Members not read yet" : `${shortCount(row.members)} members`, rulesWords(row)].join(" · ")}
                  </span>
                </span>
                {row.reading ? <Loader2Icon className="size-4 shrink-0 animate-spin text-muted-foreground" aria-label="Reading its rules" /> : null}
              </button>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}

/** One community in the right column: its name, about words, members, and its rules for the AI. */
export function XCommunityPanel({
  community,
  onBack,
  onClose,
  onChanged,
}: {
  community: XCommunityView | null
  onBack?: () => void
  onClose: () => void
  onChanged: () => Promise<void>
}) {
  const [rules, setRules] = React.useState(community?.rules ?? "")
  // Rules read again from X replace the box's words, unless the box was
  // being changed. Worked out while drawing, React's way for state that
  // follows a prop.
  const [shownRules, setShownRules] = React.useState(community?.rules ?? "")
  if ((community?.rules ?? "") !== shownRules) {
    setShownRules(community?.rules ?? "")
    if (rules === shownRules) setRules(community?.rules ?? "")
  }
  const [busy, setBusy] = React.useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = React.useState(false)

  async function run(which: string, action: () => Promise<void>) {
    setBusy(which)
    try {
      await action()
      await onChanged()
    } catch (failure) {
      showErrorToast(getXErrorMessage(failure))
    } finally {
      setBusy(null)
    }
  }

  const header = community ? (
    <>
      <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{community.name || `Community ${community.communityId}`}</span>
      <Hint label="Read its name, members and rules again, through a search account">
        <Button
          type="button"
          variant="outline"
          disabled={busy !== null || community.reading}
          onClick={() =>
            void run("read", async () => {
              await changeXCommunity({ change: "read", communityRowId: community.id })
              toast.success("Reading it again through a search account.")
            })
          }
        >
          {busy === "read" || community.reading ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />}
          Read again
        </Button>
      </Hint>
      <Hint label="Take it off this project">
        <Button type="button" size="icon" variant="ghost" aria-label="Take it off this project" onClick={() => setConfirmRemove(true)}>
          <Trash2Icon />
        </Button>
      </Hint>
      <Hint label="Open it on X">
        <Button type="button" size="icon" variant="ghost" asChild>
          <a href={community.url} target="_blank" rel="noreferrer" aria-label="Open it on X">
            <ExternalLinkIcon />
          </a>
        </Button>
      </Hint>
    </>
  ) : undefined

  return (
    <XPanelFrame title="A community" header={header} onBack={onBack}>
      <ScrollArea className="min-h-0 flex-1">
        {!community ? (
          <p className="p-4 text-sm text-muted-foreground">Click a community to see its rules for the AI.</p>
        ) : (
          <div className="grid gap-4 p-4">
            <p className="text-sm">{community.members === null ? "Members not read yet." : `${community.members.toLocaleString("en-US")} members.`}</p>
            <p className="text-xs text-muted-foreground">{rulesWords(community)}.</p>
            {community.description ? <p className="text-sm text-muted-foreground">{community.description}</p> : null}
            <div className="grid gap-2">
              <FieldLabel
                htmlFor="x-community-rules"
                hint="Read from the community's page on X, or pasted here. The AI is given them before it writes a post going into this community, and the Check button checks the words against them too."
              >
                Its rules for the AI
              </FieldLabel>
              <Textarea id="x-community-rules" className="min-h-32" value={rules} onChange={(event) => setRules(event.target.value)} />
              <div className="flex justify-end">
                <Button
                  type="button"
                  disabled={busy !== null}
                  onClick={() =>
                    void run("rules", async () => {
                      if (rules === community.rules) {
                        toast.success("Nothing changed, so there was nothing to save.")
                        return
                      }
                      await changeXCommunity({ change: "rules", communityRowId: community.id, rules })
                      toast.success("Saved. The AI is given these before it writes for this community.")
                    })
                  }
                >
                  {busy === "rules" ? <Loader2Icon className="animate-spin" /> : null}
                  Save changes
                </Button>
              </div>
            </div>
          </div>
        )}
      </ScrollArea>
      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title="Take this community off the project?"
        description="It leaves this list and the Community menu where a post is written on the Posts tab. Nothing changes on X."
        confirmLabel="Take it off"
        loading={busy === "remove"}
        onConfirm={() =>
          community
            ? void run("remove", async () => {
                await changeXCommunity({ change: "remove", communityRowId: community.id })
                setConfirmRemove(false)
                onClose()
              })
            : undefined
        }
      />
    </XPanelFrame>
  )
}
