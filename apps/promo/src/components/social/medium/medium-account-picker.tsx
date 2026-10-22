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
import type { MediumModuleView } from "@/lib/api/social/medium"
import { followersText, mediumPostingRefusal } from "@/lib/social/medium/wording"
import { cn } from "@/lib/utils"

import { MediumSignInButton } from "./medium-sign-in-button"

type Account = MediumModuleView["accounts"][number]

/** An account's name as Medium writes it, or what to do when it has none yet. */
function mediumAccountName(handle: string): string {
  return handle ? `@${handle}` : "Not signed in yet"
}

/** What is stopping the account, or its followers when nothing is. */
function accountLine(account: Account): string {
  if (!account.handle) return "Sign it in with the link Medium emails"
  if (account.blocked) return account.blockedReason || "Medium is in the way"
  const refusal = mediumPostingRefusal(account.posting, new Date(), account.posting.timeZone)
  if (refusal) {
    if (account.posting.paused) return "Paused"
    if (account.posting.warmUp.endsAt) return "Warming up"
    if (account.posting.warmUp.ageUnknown) return "Joined date not read yet"
    return "At its pace for now"
  }
  return [followersText(account.followers), account.runsIn].filter(Boolean).join(" · ")
}

function dot(account: Account): string {
  if (!account.handle || account.blocked) return "bg-destructive"
  if (mediumPostingRefusal(account.posting)) return "bg-amber-500"
  return "bg-emerald-500"
}

/**
 * Who a response or an article goes out as, picked above Post, the same way
 * Reddit's and the phone apps' dropdowns work. Nothing is picked when the
 * module opens. Under the project's Medium accounts sit the ones in no
 * project, to put in it; the picked one can be taken out; and an account not
 * signed in yet gets Paste sign-in link (part 2), because Medium signs in
 * with an emailed link that has to be opened inside the account's own
 * browser, not an everyday one.
 */
export function MediumAccountPicker({
  accounts,
  freeAccounts,
  selectedId,
  label,
  onSelect,
  onAdd,
  onRemove,
  onSignInQueued,
}: {
  accounts: Account[]
  freeAccounts: MediumModuleView["freeAccounts"]
  selectedId: string | null
  /** "Respond as", "Publish as". */
  label: string
  onSelect: (accountId: string) => void
  onAdd: (accountId: string) => Promise<void>
  onRemove: (accountId: string) => Promise<void>
  onSignInQueued: () => void
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
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="min-w-0 flex-1 justify-between font-normal"
            aria-label={selected ? `${label} ${mediumAccountName(selected.handle)}. Pick another account` : `Pick the account to ${label.toLowerCase()}`}
          >
            {busy ? <Loader2Icon className="animate-spin" /> : null}
            <span className={cn("truncate", !selected && "text-muted-foreground")}>
              {selected ? mediumAccountName(selected.handle) : "Pick an account"}
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
                    <span className="truncate">{mediumAccountName(account.handle)}</span>
                    <span className="truncate text-xs text-muted-foreground">{accountLine(account)}</span>
                  </span>
                  {account.id === selectedId ? <CheckIcon className="shrink-0" aria-label="Picked" /> : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          ) : (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">No Medium accounts in this project yet. Add one below.</p>
          )}

          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Add to this project</DropdownMenuLabel>
          {freeAccounts.length ? (
            freeAccounts.map((account) => (
              <DropdownMenuItem key={account.id} disabled={busy} onSelect={() => void run(() => onAdd(account.id))}>
                <PlusIcon />
                <span className="truncate">{mediumAccountName(account.handle)}</span>
              </DropdownMenuItem>
            ))
          ) : (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">Every Medium account is in a project. Manage accounts adds a new one.</p>
          )}

          <DropdownMenuSeparator />
          {selected ? (
            <DropdownMenuItem disabled={busy} onSelect={() => void run(() => onRemove(selected.id))}>
              <XIcon />
              <span className="truncate">Take {mediumAccountName(selected.handle)} out of this project</span>
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem asChild>
            <Link to="/admin/accounts" search={{ platform: "medium" }}>
              <UsersIcon />
              Manage accounts
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {selected && !selected.onPhone ? (
        <MediumSignInButton accountId={selected.id} name={mediumAccountName(selected.handle)} onQueued={onSignInQueued} />
      ) : null}
    </>
  )
}
