import * as React from "react"
import {
  BellRingIcon,
  EllipsisIcon,
  HourglassIcon,
  LayersIcon,
  MailIcon,
} from "lucide-react"

import {
  blockView,
  useBlockCount,
} from "@/components/shared/notes/block-card"
import {
  blockNode,
  type AppBlock,
} from "@/components/shared/notes/note-block-nodes"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { CrmBlockFigures } from "@/lib/api/crm/page"
import { CRM_STAGE_LABELS, CRM_STAGES, type CrmStage } from "@/lib/crm/crm"
import { formatDate } from "@/lib/format/format-time"
import { focusRingInset } from "@/lib/layout/focus-ring"
import { cn } from "@/lib/utils"

/**
 * The CRM's own "/" blocks on its left page (the Admin 3 panel design,
 * 7 Nov 2026; Tyler: "Left panel list blocks like emails"). Each is Trade's
 * block card ("we need to use trade's card design though") and keeps no
 * values: it draws what the CRM screen hands down through `CrmBlocksProvider`.
 */

export type CrmBlocks = {
  figures: CrmBlockFigures | null
  /** The address the inbox is narrowed to, lowered, or "". */
  activeAddress: string
  onAddress: (address: string) => void
  onRenameAddress: (id: string, current: string) => void
  onRemoveAddress: (id: string, address: string) => void
  activeStage: CrmStage | "all"
  onStage: (stage: CrmStage | "all") => void
  /** The conversation open on the right, so its row looks picked. */
  openThreadId: string | null
  onOpenThread: (threadId: string) => void
}

const CrmBlocksContext = React.createContext<CrmBlocks | null>(null)

export function CrmBlocksProvider({
  value,
  children,
}: {
  value: CrmBlocks
  children: React.ReactNode
}) {
  return (
    <CrmBlocksContext.Provider value={value}>{children}</CrmBlocksContext.Provider>
  )
}

function useCrmBlocks() {
  return React.useContext(CrmBlocksContext)
}

/** What a block shows on a page with no CRM behind it. */
function NotHere() {
  return (
    <p className="p-3 text-xs text-muted-foreground">
      This block shows on the CRM dashboard.
    </p>
  )
}

/** Five rows, then "Show all 12", as every list in the design. */
const ROWS_SHOWN = 5

/**
 * One row in a block: a button with the title and a muted line, the count
 * on the right. The row the screen is showing looks picked.
 */
function BlockRow({
  picked,
  title,
  line,
  count,
  onClick,
  after,
}: {
  picked: boolean
  title: string
  line?: string | null
  count?: number
  onClick: () => void
  after?: React.ReactNode
}) {
  return (
    <div className="group/row relative flex min-w-0 items-center">
      <button
        type="button"
        aria-current={picked ? "true" : undefined}
        onClick={onClick}
        className={cn(
          "grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-3 py-2 text-left text-sm hover:bg-muted/60",
          picked && "bg-muted shadow-[inset_2px_0_0_var(--foreground)]",
          after ? "pr-10" : null,
          focusRingInset
        )}
      >
        <span className="grid min-w-0">
          <span className="truncate">{title}</span>
          {line ? (
            <span className="truncate text-xs text-muted-foreground">{line}</span>
          ) : null}
        </span>
        {count !== undefined ? (
          <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
        ) : null}
      </button>
      {after ? <span className="absolute right-1.5">{after}</span> : null}
    </div>
  )
}

function ShowAll({
  total,
  shown,
  onToggle,
}: {
  total: number
  shown: boolean
  onToggle: () => void
}) {
  if (total <= ROWS_SHOWN) return null
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="m-1.5 justify-self-start"
      onClick={onToggle}
    >
      {shown ? "Show fewer" : `Show all ${total}`}
    </Button>
  )
}

/**
 * Emails: every address mail arrives at, with its open conversations.
 * Pressing one narrows the inbox to that address; pressing it again lets it
 * go. The + in the panel's header adds one.
 */
function EmailsBlock() {
  const blocks = useCrmBlocks()
  const emails = blocks?.figures?.emails
  useBlockCount(emails?.length || undefined)
  const [all, setAll] = React.useState(false)
  if (!blocks) return <NotHere />
  if (!emails) return <p className="p-3 text-xs text-muted-foreground">Reading…</p>
  if (emails.length === 0) {
    return (
      <p className="p-3 text-sm text-muted-foreground">
        No address yet. The + at the top adds the one mail arrives at.
      </p>
    )
  }
  const shown = all ? emails : emails.slice(0, ROWS_SHOWN)
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] divide-y overflow-y-auto">
      {shown.map((email) => {
        const lowered = email.address.toLowerCase()
        return (
          <BlockRow
            key={email.id}
            picked={blocks.activeAddress === lowered}
            title={email.label || email.address}
            line={email.label ? email.address : null}
            count={email.open}
            onClick={() =>
              blocks.onAddress(blocks.activeAddress === lowered ? "" : lowered)
            }
            after={
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`More for ${email.address}`}
                    className="text-muted-foreground opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 [@media(hover:none)]:opacity-100"
                  >
                    <EllipsisIcon className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  <DropdownMenuItem
                    onSelect={() => blocks.onRenameAddress(email.id, email.label)}
                  >
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => blocks.onRemoveAddress(email.id, email.address)}
                  >
                    Remove
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            }
          />
        )
      })}
      <ShowAll total={emails.length} shown={all} onToggle={() => setAll(!all)} />
    </div>
  )
}

/** Follow up today: leads whose chase date has come, soonest first. Pressing one opens their newest conversation. */
function FollowUpsBlock() {
  const blocks = useCrmBlocks()
  const due = blocks?.figures?.followUps
  useBlockCount(due?.length || undefined)
  const [all, setAll] = React.useState(false)
  if (!blocks) return <NotHere />
  if (!due) return <p className="p-3 text-xs text-muted-foreground">Reading…</p>
  if (due.length === 0) {
    return <p className="p-3 text-sm text-muted-foreground">Nobody to chase today.</p>
  }
  const shown = all ? due : due.slice(0, ROWS_SHOWN)
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] divide-y overflow-y-auto">
      {shown.map((lead) => (
        <BlockRow
          key={lead.leadId}
          picked={lead.threadId !== null && lead.threadId === blocks.openThreadId}
          title={lead.name?.trim() || lead.email}
          line={lead.note?.trim() || `Due ${formatDate(lead.followUpAt)}`}
          onClick={() => {
            if (lead.threadId) blocks.onOpenThread(lead.threadId)
          }}
        />
      ))}
      <ShowAll total={due.length} shown={all} onToggle={() => setAll(!all)} />
    </div>
  )
}

/** How many whole days ago, at least one. */
export function daysSince(iso: string) {
  return Math.max(1, Math.floor((new Date().getTime() - new Date(iso).getTime()) / 86_400_000))
}

/**
 * Waiting on you (CRM task 11): open conversations they wrote last and
 * nobody answered for the site's number of days, the longest waiting first.
 * The number is the CRM settings ⋮'s; with the chase off the block says so.
 */
function WaitingBlock() {
  const blocks = useCrmBlocks()
  const waiting = blocks?.figures?.waiting
  useBlockCount(waiting?.length || undefined)
  const [all, setAll] = React.useState(false)
  if (!blocks) return <NotHere />
  if (!waiting) return <p className="p-3 text-xs text-muted-foreground">Reading…</p>
  if (!blocks.figures?.unansweredDays) {
    return (
      <p className="p-3 text-sm text-muted-foreground">
        The chase is off. The ⋮ at the top turns it on.
      </p>
    )
  }
  if (waiting.length === 0) {
    return <p className="p-3 text-sm text-muted-foreground">Nobody is waiting on you.</p>
  }
  const shown = all ? waiting : waiting.slice(0, ROWS_SHOWN)
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] divide-y overflow-y-auto">
      {shown.map((thread) => {
        const days = daysSince(thread.lastMessageAt)
        return (
          <BlockRow
            key={thread.threadId}
            picked={thread.threadId === blocks.openThreadId}
            title={thread.name?.trim() || thread.email}
            line={`Waiting ${days} ${days === 1 ? "day" : "days"}`}
            onClick={() => blocks.onOpenThread(thread.threadId)}
          />
        )
      })}
      <ShowAll total={waiting.length} shown={all} onToggle={() => setAll(!all)} />
    </div>
  )
}

/** Stages: how many leads are at each one. Pressing one narrows the inbox to it; pressing it again lets it go. */
function StagesBlock() {
  const blocks = useCrmBlocks()
  if (!blocks) return <NotHere />
  const stages = blocks.figures?.stages
  if (!stages) return <p className="p-3 text-xs text-muted-foreground">Reading…</p>
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] divide-y">
      {CRM_STAGES.map((stage) => (
        <BlockRow
          key={stage}
          picked={blocks.activeStage === stage}
          title={CRM_STAGE_LABELS[stage]}
          count={stages[stage]}
          onClick={() => blocks.onStage(blocks.activeStage === stage ? "all" : stage)}
        />
      ))}
    </div>
  )
}

const EmailsBlockView = blockView({
  kind: "crm-emails",
  title: "Emails",
  icon: <MailIcon />,
  Draw: EmailsBlock,
})

const FollowUpsBlockView = blockView({
  kind: "crm-follow-ups",
  title: "Follow up today",
  icon: <BellRingIcon />,
  Draw: FollowUpsBlock,
})

const WaitingBlockView = blockView({
  kind: "crm-waiting",
  title: "Waiting on you",
  icon: <HourglassIcon />,
  Draw: WaitingBlock,
})

const StagesBlockView = blockView({
  kind: "crm-stages",
  title: "Stages",
  icon: <LayersIcon />,
  Draw: StagesBlock,
})

/**
 * The blocks the CRM page offers under Advanced blocks, in the "/" list's
 * order. Their node names are `CRM_PAGE_BLOCK_TYPES`, which the server cleans
 * a saved page with.
 */
export const CRM_APP_BLOCKS: readonly AppBlock[] = [
  {
    key: "crmEmails",
    label: "Emails",
    icon: MailIcon,
    node: "noteCrmEmails",
    extension: blockNode("noteCrmEmails", {}, EmailsBlockView),
  },
  {
    key: "crmFollowUps",
    label: "Follow up today",
    icon: BellRingIcon,
    node: "noteCrmFollowUps",
    extension: blockNode("noteCrmFollowUps", {}, FollowUpsBlockView),
  },
  {
    key: "crmWaiting",
    label: "Waiting on you",
    icon: HourglassIcon,
    node: "noteCrmWaiting",
    extension: blockNode("noteCrmWaiting", {}, WaitingBlockView),
  },
  {
    key: "crmStages",
    label: "Stages",
    icon: LayersIcon,
    node: "noteCrmStages",
    extension: blockNode("noteCrmStages", {}, StagesBlockView),
  },
]
