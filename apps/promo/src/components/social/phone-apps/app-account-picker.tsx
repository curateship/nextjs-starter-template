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
import type { AppAccount, AppModuleView } from "@/lib/api/social/phone-apps"
import { handleWords, NETWORK_NAMES, type PhoneAppNetwork } from "@/lib/social/networks"
import { appAccountName, countWords } from "@/lib/social/phone-apps"
import { slotWords } from "@/lib/phones/options"
import { cn } from "@/lib/utils"

/**
 * Who a post goes out as, picked above Post, the same way Reddit's Comment as
 * dropdown works. Nothing is picked when the module opens, because picking an
 * account for the person is the one thing this must not do. Under the
 * project's accounts on this network, the ones in no project can be put in
 * it, the picked one taken out, and Manage accounts goes to the Accounts
 * dashboard filtered to this network.
 */
export function AppAccountPicker({
  network,
  accounts,
  freeAccounts,
  selectedId,
  onSelect,
  onAdd,
  onRemove,
}: {
  network: PhoneAppNetwork
  accounts: AppAccount[]
  freeAccounts: AppModuleView["freeAccounts"]
  selectedId: string | null
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
          aria-label={selected ? `Post as ${appAccountName(network, selected.handle)}. Pick another account` : "Pick the account to post as"}
        >
          {busy ? <Loader2Icon className="animate-spin" /> : null}
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected ? appAccountName(network, selected.handle) : "Pick an account"}
          </span>
          <ChevronDownIcon className="shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        {accounts.length ? (
          <DropdownMenuGroup>
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Post as</DropdownMenuLabel>
            {accounts.map((account) => (
              <DropdownMenuItem key={account.id} onSelect={() => onSelect(account.id)} className="gap-2">
                <span className={cn("size-2 shrink-0 rounded-full", dot(account))} aria-hidden="true" />
                <span className="grid min-w-0 flex-1">
                  <span className="truncate">{appAccountName(network, account.handle)}</span>
                  <span className="truncate text-xs text-muted-foreground">{accountLine(account)}</span>
                </span>
                {account.id === selectedId ? <CheckIcon className="shrink-0" aria-label="Picked" /> : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        ) : (
          <p className="px-2 py-1.5 text-sm text-muted-foreground">
            No {NETWORK_NAMES[network]} accounts in this project yet. Add one below.
          </p>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Add to this project</DropdownMenuLabel>
        {freeAccounts.length ? (
          freeAccounts.map((account) => (
            <DropdownMenuItem key={account.id} disabled={busy} onSelect={() => void run(() => onAdd(account.id))}>
              <PlusIcon />
              <span className="truncate">
                {account.handle ? handleWords(network, account.handle) : "Not signed in"}
                {account.phoneName ? ` · ${account.phoneName}` : ""}
              </span>
            </DropdownMenuItem>
          ))
        ) : (
          <p className="px-2 py-1.5 text-sm text-muted-foreground">
            Every {NETWORK_NAMES[network]} account is in a project. Manage accounts adds a new one.
          </p>
        )}

        <DropdownMenuSeparator />
        {selected ? (
          <DropdownMenuItem disabled={busy} onSelect={() => void run(() => onRemove(selected.id))}>
            <XIcon />
            <span className="truncate">Take {appAccountName(network, selected.handle)} out of this project</span>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem asChild>
          <Link to="/admin/accounts" search={{ platform: network }}>
            <UsersIcon />
            Manage accounts
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Its phone and followers, or what is stopping it. */
function accountLine(account: AppAccount): string {
  if (account.banScreen) return "Stopped by a ban screen"
  if (account.paused) return account.paused === "account" ? "Paused" : account.paused === "network" ? "Network paused" : "Project paused"
  const phone = account.phone ? [account.phone.name, slotWords(account.phone.shelfSlot)].filter(Boolean).join(" in ") : "No phone"
  const followers = account.followers === null ? "followers not read yet" : `${countWords(account.followers)} followers`
  return `${phone} · ${followers}${account.shadowbanned ? " · Shadowbanned" : ""}`
}

/** Each account's dot. What it means is always written beside it. */
function dot(account: AppAccount): string {
  if (account.banScreen) return "bg-destructive"
  if (account.shadowbanned || account.paused || account.phone?.status === "offline") return "bg-amber-500"
  return "bg-emerald-500"
}
