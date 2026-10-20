import * as React from "react"
import { Link } from "@tanstack/react-router"
import { CheckIcon, ChevronDownIcon, Loader2Icon, PlusIcon, UsersIcon, XIcon } from "lucide-react"

import { usePromoGuest } from "@/components/social/guest/guest-mode"
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
import type { ProjectAccount, ProjectView } from "@/lib/api/social/projects"
import { accountStatusText } from "@/lib/social/account-status"
import { ACCOUNT_IMPORTANCE, IMPORTANCE_WORDS } from "@/lib/social/importance"
import { paceLineText } from "@/lib/social/wording"
import { cn } from "@/lib/utils"

import { Hint } from "../hint"

/**
 * Who the comment goes out as, picked beside Post comment. Tyler, 14 Oct
 * 2026: "Accounts can be a dropdown in the right panel to select accounts to
 * use".
 *
 * The project's Reddit accounts are listed best to comment from first, an
 * order worked out on the server, each with its status and today's comments.
 * Nothing is picked when the page opens, because picking one for the person is
 * the one thing this must not do. Under them, the accounts in no project can
 * be put in this one, the picked account can be taken out, and Manage accounts
 * goes to the Accounts dashboard, filtered to Reddit.
 */
export function AccountPicker({
  accounts,
  freeAccounts,
  selectedId,
  onSelect,
  onAdd,
  onRemove,
}: {
  accounts: ProjectAccount[]
  freeAccounts: ProjectView["freeAccounts"]
  selectedId: string | null
  onSelect: (accountId: string) => void
  onAdd: (accountId: string) => Promise<void>
  onRemove: (accountId: string) => Promise<void>
}) {
  // A guest picks among the project's accounts and never moves one in or out.
  const guest = usePromoGuest()
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
      {/* The picked account's counts behind it, in plain figures. */}
      <Hint label={selected ? paceLineText(selected.posting) : null}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="min-w-0 flex-1 justify-between font-normal"
          aria-label={selected ? `Comment as ${accountName(selected)}. Pick another account` : "Pick the account to comment as"}
        >
          {busy ? <Loader2Icon className="animate-spin" /> : null}
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected ? accountName(selected) : "Pick an account"}
          </span>
          <ChevronDownIcon className="shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      </Hint>
      <DropdownMenuContent align="end" className="w-72">
        {accounts.length ? (
          // Under Important and Throwaway (part 30 of the phone farm). A
          // project holds one kind only, so this is usually one heading that
          // says which kind it is; the order within is still best first.
          ACCOUNT_IMPORTANCE.map((importance) => {
            const group = accounts.filter((account) => account.importance === importance)
            if (!group.length) return null
            return (
              <DropdownMenuGroup key={importance}>
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                  Comment as · {IMPORTANCE_WORDS[importance]}
                </DropdownMenuLabel>
                {group.map((account) => (
                  <DropdownMenuItem key={account.id} onSelect={() => onSelect(account.id)} className="gap-2">
                    <span className={cn("size-2 shrink-0 rounded-full", statusDot(account))} aria-hidden="true" />
                    <span className="grid min-w-0 flex-1">
                      <span className="truncate">{accountName(account)}</span>
                      <span className="truncate text-xs text-muted-foreground">{accountLine(account)}</span>
                    </span>
                    {account.id === selectedId ? <CheckIcon className="shrink-0" aria-label="Picked" /> : null}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            )
          })
        ) : (
          <p className="px-2 py-1.5 text-sm text-muted-foreground">
            {guest ? "No Reddit accounts in this project yet." : "No Reddit accounts in this project yet. Add one below."}
          </p>
        )}

        {guest ? null : (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Add to this project</DropdownMenuLabel>
            {freeAccounts.length ? (
              freeAccounts.map((account) => (
                <DropdownMenuItem key={account.id} disabled={busy} onSelect={() => void run(() => onAdd(account.id))}>
                  <PlusIcon />
                  <span className="truncate">
                    {account.handle ? `u/${account.handle}` : "Not signed in"}
                    {account.profileName ? ` · ${account.profileName}` : ""}
                  </span>
                </DropdownMenuItem>
              ))
            ) : (
              <p className="px-2 py-1.5 text-sm text-muted-foreground">
                Every account is in a project. Manage accounts adds a new one.
              </p>
            )}

            <DropdownMenuSeparator />
            {selected ? (
              <DropdownMenuItem disabled={busy} onSelect={() => void run(() => onRemove(selected.id))}>
                <XIcon />
                <span className="truncate">Take {selected.handle ? `u/${selected.handle}` : "this account"} out of this project</span>
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem asChild>
              <Link to="/admin/accounts" search={{ platform: "reddit" }}>
                <UsersIcon />
                Manage accounts
              </Link>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function accountName(account: ProjectAccount): string {
  return account.handle ? `u/${account.handle}` : "An account not signed in"
}

/** Its status, then today's comments against its daily limit when it has one. */
function accountLine(account: ProjectAccount): string {
  const posting = account.posting
  const status = posting.paused ? "Paused" : accountStatusText(account.status)
  const today = posting.young ? `${posting.lastDay} of ${posting.youngPerDay} today` : `${posting.lastDay} today`
  return `${status} · ${today}`
}

/** Each status's dot. The status is always written beside it. */
function statusDot(account: ProjectAccount): string {
  switch (account.status.status) {
    case "ready":
    case "working":
      return "bg-emerald-500"
    case "warming_up":
      return "bg-amber-500"
    case "banned":
      return "bg-destructive"
    default:
      return "bg-muted-foreground/40"
  }
}
