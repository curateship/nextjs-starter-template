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
import type { XModuleView } from "@/lib/api/social/x"
import { X_REACH_WORDS } from "@/lib/social/x/options"
import { xPostingRefusal } from "@/lib/social/x/wording"
import { cn } from "@/lib/utils"

import { xAccountName, xFollowersText } from "./x-words"

export type XAccount = XModuleView["accounts"][number]

/** What is stopping the account, or what it is when nothing is: paid, its reach, followers, where it runs. */
function accountLine(account: XAccount): string {
  if (!account.handle) return "Sign it in to X in its own browser, then press Check now on the Accounts dashboard"
  if (account.blocked) return account.blockedReason || "Blocked by X. Open its browser profile to see why."
  const refusal = xPostingRefusal(account.posting, new Date(), account.posting.timeZone)
  if (refusal) {
    if (account.posting.paused) return "Paused"
    if (account.posting.warmUp.endsAt) return "Warming up"
    if (account.posting.warmUp.ageUnknown) return "Not seen signed in yet"
    return "At its pace for now"
  }
  return [
    account.paid ? "Paid" : null,
    account.reach === "hidden" || account.reach === "folded" ? X_REACH_WORDS[account.reach] : null,
    xFollowersText(account.followers),
    account.runsIn,
  ]
    .filter(Boolean)
    .join(" · ")
}

function dot(account: XAccount): string {
  if (!account.handle || account.blocked) return "bg-destructive"
  if (xPostingRefusal(account.posting)) return "bg-amber-500"
  return "bg-emerald-500"
}

/**
 * Who a reply, quote or post goes out as, picked above Post, the same way
 * Medium's dropdown works. Nothing is picked when the module opens. Under the
 * project's X accounts sit the ones in no project, to put in it, and the
 * picked one can be taken out. A search account is never here: it holds no
 * account that posts (part 3).
 */
export function XAccountPicker({
  accounts,
  freeAccounts,
  selectedId,
  label,
  onSelect,
  onAdd,
  onRemove,
}: {
  accounts: XAccount[]
  freeAccounts: XModuleView["freeAccounts"]
  selectedId: string | null
  /** "Reply as", "Post as". */
  label: string
  onSelect: (accountId: string) => void
  onAdd: (accountId: string) => Promise<void>
  onRemove: (accountId: string) => Promise<void>
}) {
  const [busy, setBusy] = React.useState(false)
  const selected = accounts.find((account) => account.id === selectedId) ?? null

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
          aria-label={selected ? `${label} ${xAccountName(selected.handle)}. Pick another account` : `Pick the account to ${label.toLowerCase()}`}
        >
          {busy ? <Loader2Icon className="animate-spin" /> : null}
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected ? xAccountName(selected.handle) : "Pick an account"}
            {selected?.paid ? <span className="text-muted-foreground"> · Paid</span> : null}
          </span>
          <ChevronDownIcon className="shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        {accounts.length ? (
          <DropdownMenuGroup>
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{label}</DropdownMenuLabel>
            {accounts.map((account) => (
              <DropdownMenuItem key={account.id} onSelect={() => onSelect(account.id)} className="gap-2">
                <span className={cn("size-2 shrink-0 rounded-full", dot(account))} aria-hidden="true" />
                <span className="grid min-w-0 flex-1">
                  <span className="truncate">{xAccountName(account.handle)}</span>
                  <span className="truncate text-xs text-muted-foreground">{accountLine(account)}</span>
                </span>
                {account.id === selectedId ? <CheckIcon className="shrink-0" aria-label="Picked" /> : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        ) : (
          <p className="px-2 py-1.5 text-sm text-muted-foreground">No X accounts in this project yet. Add one below.</p>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Add to this project</DropdownMenuLabel>
        {freeAccounts.length ? (
          freeAccounts.map((account) => (
            <DropdownMenuItem key={account.id} disabled={busy} onSelect={() => void run(() => onAdd(account.id))}>
              <PlusIcon />
              <span className="truncate">{xAccountName(account.handle)}</span>
            </DropdownMenuItem>
          ))
        ) : (
          <p className="px-2 py-1.5 text-sm text-muted-foreground">Every X account is in a project. Manage accounts adds a new one.</p>
        )}

        <DropdownMenuSeparator />
        {selected ? (
          <DropdownMenuItem disabled={busy} onSelect={() => void run(() => onRemove(selected.id))}>
            <XIcon />
            <span className="truncate">Take {xAccountName(selected.handle)} out of this project</span>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem asChild>
          <Link to="/admin/accounts" search={{ platform: "x" }}>
            <UsersIcon />
            Manage accounts
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
