import * as React from "react"
import { Link } from "@tanstack/react-router"
import { BuildingIcon, CheckIcon, ChevronDownIcon, Loader2Icon, PlusIcon, UsersIcon, XIcon } from "lucide-react"

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
import type { LinkedinModuleView } from "@/lib/api/social/linkedin"
import { LINKEDIN_SEEN_WORDS } from "@/lib/social/linkedin/options"
import { linkedinPostingRefusal } from "@/lib/social/linkedin/wording"
import { cn } from "@/lib/utils"

import { linkedinAccountName, linkedinFollowersText } from "./linkedin-words"

export type LinkedinAccount = LinkedinModuleView["accounts"][number]

/** Who a comment goes out as: an account, and the company page it speaks as, or "" for the person (part 38). */
export type LinkedinSpeaker = { accountId: string; asPageId: string }

/** What is stopping the account, or what it is when nothing is: Premium, its comments look, followers, where it runs. */
function accountLine(account: LinkedinAccount): string {
  if (!account.handle) return "Sign it in to LinkedIn in its own browser, then press Check now on the Accounts dashboard"
  if (account.codeAsked) return "LinkedIn wants the code it emailed. Paste it on the Accounts dashboard"
  if (account.blocked) return account.blockedReason || "Blocked by LinkedIn. Open its browser profile to see why."
  const refusal = linkedinPostingRefusal(account.posting, new Date(), account.posting.timeZone)
  if (refusal) {
    if (account.posting.paused) return "Paused"
    if (account.posting.warmUp.endsAt) return "Warming up"
    if (account.posting.warmUp.ageUnknown) return "Not seen signed in yet"
    return "At its pace for now"
  }
  return [
    account.premium ? "Premium" : null,
    account.seen === "hidden" ? LINKEDIN_SEEN_WORDS.hidden : null,
    linkedinFollowersText(account.followers),
    account.posting.working ? null : "Outside its workday",
    account.runsIn,
  ]
    .filter(Boolean)
    .join(" · ")
}

function dot(account: LinkedinAccount): string {
  if (!account.handle || account.blocked || account.codeAsked) return "bg-destructive"
  if (linkedinPostingRefusal(account.posting)) return "bg-amber-500"
  return "bg-emerald-500"
}

/** The speaker's words on the button: "in/jane-doe", or "Acme as in/jane-doe". */
function speakerName(account: LinkedinAccount, asPageId: string): string {
  const page = account.pages.find((item) => item.pageId === asPageId)
  return page ? `${page.name}, through ${linkedinAccountName(account.handle)}` : linkedinAccountName(account.handle)
}

/**
 * Who a comment or post goes out as, picked above Post, the same way X's
 * dropdown works. Nothing is picked when the module opens. Under each
 * important account sit the company pages it runs, picked to speak as the
 * page (part 38); a throwaway account never offers a page. Under the
 * project's LinkedIn accounts sit the ones in no project, to put in it, and
 * the picked one can be taken out. A search account is never here: it holds
 * no account that comments (part 3).
 */
export function LinkedinAccountPicker({
  accounts,
  freeAccounts,
  selected,
  label,
  onSelect,
  onAdd,
  onRemove,
}: {
  accounts: LinkedinAccount[]
  freeAccounts: LinkedinModuleView["freeAccounts"]
  selected: LinkedinSpeaker | null
  /** "Comment as", "Post as". */
  label: string
  onSelect: (speaker: LinkedinSpeaker) => void
  onAdd: (accountId: string) => Promise<void>
  onRemove: (accountId: string) => Promise<void>
}) {
  const [busy, setBusy] = React.useState(false)
  const picked = accounts.find((account) => account.id === selected?.accountId) ?? null

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
          aria-label={picked ? `${label} ${speakerName(picked, selected?.asPageId ?? "")}. Pick another` : `Pick who to ${label.toLowerCase()}`}
        >
          {busy ? <Loader2Icon className="animate-spin" /> : null}
          <span className={cn("truncate", !picked && "text-muted-foreground")}>
            {picked ? speakerName(picked, selected?.asPageId ?? "") : "Pick an account"}
            {picked?.premium ? <span className="text-muted-foreground"> · Premium</span> : null}
          </span>
          <ChevronDownIcon className="shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        {accounts.length ? (
          <DropdownMenuGroup>
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{label}</DropdownMenuLabel>
            {accounts.map((account) => (
              <React.Fragment key={account.id}>
                <DropdownMenuItem onSelect={() => onSelect({ accountId: account.id, asPageId: "" })} className="gap-2">
                  <span className={cn("size-2 shrink-0 rounded-full", dot(account))} aria-hidden="true" />
                  <span className="grid min-w-0 flex-1">
                    <span className="truncate">{linkedinAccountName(account.handle)}</span>
                    <span className="truncate text-xs text-muted-foreground">{accountLine(account)}</span>
                  </span>
                  {account.id === selected?.accountId && !selected.asPageId ? <CheckIcon className="shrink-0" aria-label="Picked" /> : null}
                </DropdownMenuItem>
                {/* A phone's LinkedIn app can't speak as a page, so a page is offered only on a browser account. */}
                {account.important && !account.onPhone
                  ? account.pages.map((page) => (
                      <DropdownMenuItem key={page.pageId} onSelect={() => onSelect({ accountId: account.id, asPageId: page.pageId })} className="gap-2 pl-6">
                        <BuildingIcon className="shrink-0" />
                        <span className="truncate">as {page.name}</span>
                        {account.id === selected?.accountId && selected.asPageId === page.pageId ? <CheckIcon className="ml-auto shrink-0" aria-label="Picked" /> : null}
                      </DropdownMenuItem>
                    ))
                  : null}
              </React.Fragment>
            ))}
          </DropdownMenuGroup>
        ) : (
          <p className="px-2 py-1.5 text-sm text-muted-foreground">No LinkedIn accounts in this project yet. Add one below.</p>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Add to this project</DropdownMenuLabel>
        {freeAccounts.length ? (
          freeAccounts.map((account) => (
            <DropdownMenuItem key={account.id} disabled={busy} onSelect={() => void run(() => onAdd(account.id))}>
              <PlusIcon />
              <span className="truncate">{linkedinAccountName(account.handle)}</span>
            </DropdownMenuItem>
          ))
        ) : (
          <p className="px-2 py-1.5 text-sm text-muted-foreground">Every LinkedIn account is in a project. Manage accounts adds a new one.</p>
        )}

        <DropdownMenuSeparator />
        {picked ? (
          <DropdownMenuItem disabled={busy} onSelect={() => void run(() => onRemove(picked.id))}>
            <XIcon />
            <span className="truncate">Take {linkedinAccountName(picked.handle)} out of this project</span>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem asChild>
          <Link to="/admin/accounts" search={{ platform: "linkedin" }}>
            <UsersIcon />
            Manage accounts
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
