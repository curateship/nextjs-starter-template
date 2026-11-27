import * as React from "react"
import { Link } from "@tanstack/react-router"
import { CheckIcon, ChevronDownIcon, Loader2Icon, PlusIcon, UsersIcon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { YoutubeChannel, YoutubeModuleView } from "@/lib/api/social/youtube"
import { countWords } from "@/lib/social/phone-apps"
import { channelName } from "@/lib/social/youtube/options"
import { cn } from "@/lib/utils"

/**
 * Which channel a video goes up as, picked above Post, the way Instagram's
 * Post as dropdown works. Nothing is picked when the module opens. Under the
 * project's channels, the ones in no project can be put in it, the picked one
 * taken out, and Manage accounts goes to the Accounts section filtered to
 * YouTube.
 */
export function YoutubeChannelPicker({
  channels,
  freeAccounts,
  selectedId,
  onSelect,
  onAdd,
  onRemove,
}: {
  channels: YoutubeChannel[]
  freeAccounts: YoutubeModuleView["freeAccounts"]
  selectedId: string | null
  onSelect: (accountId: string) => void
  onAdd: (accountId: string) => Promise<void>
  onRemove: (accountId: string) => Promise<void>
}) {
  const [busy, setBusy] = React.useState(false)
  const selected = channels.find((channel) => channel.id === selectedId) ?? null

  async function run(action: () => Promise<void>) {
    setBusy(true)
    try {
      await action()
    } finally {
      setBusy(false)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="min-w-0 flex-1 justify-between font-normal"
          aria-label={selected ? `Post as ${channelName(selected.handle)}. Pick another channel` : "Pick the channel to post as"}
        >
          {busy ? <Loader2Icon className="animate-spin" /> : null}
          <span className={cn("truncate", !selected && "text-muted-foreground")}>{selected ? channelName(selected.handle) : "Pick a channel"}</span>
          <ChevronDownIcon className="shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        {channels.length ? (
          <DropdownMenuGroup>
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Post as</DropdownMenuLabel>
            {channels.map((channel) => (
              <DropdownMenuItem key={channel.id} onSelect={() => onSelect(channel.id)} className="gap-2">
                <span className={cn("size-2 shrink-0 rounded-full", dot(channel))} aria-hidden="true" />
                <span className="grid min-w-0 flex-1">
                  <span className="truncate">{channelName(channel.handle)}</span>
                  <span className="truncate text-xs text-muted-foreground">{channelLine(channel)}</span>
                </span>
                {channel.id === selectedId ? <CheckIcon className="shrink-0" aria-label="Picked" /> : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        ) : (
          <p className="px-2 py-1.5 text-sm text-muted-foreground">No YouTube channels in this project yet. Add one below.</p>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Add to this project</DropdownMenuLabel>
        {freeAccounts.length ? (
          freeAccounts.map((account) => (
            <DropdownMenuItem key={account.id} disabled={busy} onSelect={() => void run(() => onAdd(account.id))}>
              <PlusIcon />
              <span className="truncate">
                {channelName(account.handle)}
                {account.where ? ` · ${account.where}` : ""}
              </span>
            </DropdownMenuItem>
          ))
        ) : (
          <p className="px-2 py-1.5 text-sm text-muted-foreground">Every YouTube channel is in a project. Manage accounts adds a new one.</p>
        )}

        <DropdownMenuSeparator />
        {selected ? (
          <DropdownMenuItem disabled={busy} onSelect={() => void run(() => onRemove(selected.id))}>
            <XIcon />
            <span className="truncate">Take {channelName(selected.handle)} out of this project</span>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem asChild>
          <Link to="/admin/projects" search={{ section: "accounts", platform: "youtube" }}>
            <UsersIcon />
            Manage accounts
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Where it runs and its subscribers, or what is stopping it. */
function channelLine(channel: YoutubeChannel): string {
  if (channel.banScreen) return "Stopped by a ban screen"
  if (channel.paused) {
    return channel.paused === "account"
      ? "Paused"
      : channel.paused === "brake"
        ? "Paused: two bans of its app in a day"
        : channel.paused === "network"
          ? "Network paused"
          : "Project paused"
  }
  const where = channel.phone ? channel.phone.name : channel.profileName ? `Browser: ${channel.profileName}` : "Runs nowhere yet"
  const subscribers = channel.subscribers === null ? "subscribers not read yet" : `${countWords(channel.subscribers)} subscribers`
  return `${where} · ${subscribers}`
}

/** Each channel's dot. What it means is always written beside it. */
function dot(channel: YoutubeChannel): string {
  if (channel.banScreen) return "bg-destructive"
  if (channel.paused || channel.blockedReason || channel.phone?.status === "offline") return "bg-amber-500"
  return "bg-emerald-500"
}
