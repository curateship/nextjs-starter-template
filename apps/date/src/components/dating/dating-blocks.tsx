import * as React from "react"
import {
  BellRingIcon,
  EyeIcon,
  EyeOffIcon,
  HeartIcon,
  LayoutDashboardIcon,
  Loader2Icon,
  MonitorSmartphoneIcon,
  PlusIcon,
  RotateCcwIcon,
  UserRoundIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react"

import { blockView, useBlockCount, useBlockMenu } from "@/components/shared/notes/block-card"
import { DashboardsRows } from "@/components/shared/notes/dashboards-rows"
import { blockNode, keepOnPage, type AppBlock } from "@/components/shared/notes/note-block-nodes"
import { SideRows, type SideRow } from "@/components/shared/notes/side-rows"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { DatingDashboard } from "@/lib/api/dating/dashboard"
import { DATING_BLOCK_NODES, DATING_SECTIONS_NODE, type DatingSections } from "@/lib/dating/dating-page"
import { LEAD_GROUP_WORDS, LEAD_TAB_WORDS, LEAD_TABS, leadGroupCounts, type LeadGroup, type LeadTab } from "@/lib/dating/leads"
import { DATING_APP_WORDS, SECOND_LOOK_POINTS, stopReasonWords, type DatingApp } from "@/lib/dating/options"
import { orderSections } from "@/lib/layout/styling-values"

import { LEAD_DOT, needsWords } from "./lead-status-style"
import { whenWords } from "./words"

/**
 * The Dating dashboard's own "/" blocks on its left page (task
 * "features/07-three-panel-design"). They keep no values of their own: the
 * dashboard hands everything down through `DatingBlocksProvider`, so the
 * blocks read the same rows the list and the right panel do.
 *
 * - **Dashboards**, fixed: Overview, Leads, Matches and Dates, each with its count.
 * - **Needs you**: every lead waiting on the member, each opening that lead.
 * - **Phone**: the phone's line, opening the phone in the right panel.
 * - **Profiles**: every profile, the open one picked, pressing another switches.
 * - **Leads**: the groups, each narrowing the list in place.
 * - **Second Look** (Facebook Dating): near misses, each opening its card, with Like.
 * - **My profile** (not on Facebook Dating): opens the member's own profile.
 */
export type DatingBlocks = {
  data: DatingDashboard
  section: LeadTab
  onPickSection: (section: LeadTab) => void
  /** Overview counts its widgets; null while that is read. */
  widgetCount: number | null
  /** The rows of each list section, as the list would show them unfiltered. */
  sectionCounts: Record<Exclude<LeadTab, "overview">, number>
  /** Null while they are read. */
  sections: DatingSections | null
  onHiddenSectionsChange: (hidden: Exclude<LeadTab, "overview">[]) => void
  onSectionOrderChange: (order: string[]) => void
  group: LeadGroup | undefined
  onGroup: (group: LeadGroup) => void
  /** What the right panel shows: a lead's id, `phone` or `me`. */
  openId: string | undefined
  onOpen: (id: string) => void
  onPickProfile: (accountId: string) => void
  onNewProfile: () => void
  onResumeProfile: () => void
  busy: string | null
  onSecondLookLike: (cardId: string) => void
}

const DatingBlocksContext = React.createContext<DatingBlocks | null>(null)

export const DatingBlocksProvider = DatingBlocksContext.Provider

function useDatingBlocks(): DatingBlocks | null {
  return React.useContext(DatingBlocksContext)
}

/** What a block says away from the Dating dashboard, where it has nothing to read. */
function Elsewhere() {
  return <p className="p-3 text-xs text-muted-foreground">This block shows on the Dating dashboard.</p>
}

/** The groups the Leads block lists, in the order a lead needs the member. */
const GROUPS: LeadGroup[] = ["waiting", "new", "liked", "matched", "chatting", "date"]

/**
 * The fixed Dashboards block: Overview, Leads, Matches and Dates (task
 * "features/07-three-panel-design": the middle header's tabs became these
 * rows). Its ⋮ hides or shows each row and drags them into a new order, as
 * every Dashboards block does (Tyler, 11 Nov 2026: "add this same feature for
 * all apps that has dashboards block"). Overview stays first.
 */
export function DatingSectionsBlock() {
  const blocks = useDatingBlocks()
  const hidden = blocks?.sections?.hidden ?? []
  const change = blocks?.onHiddenSectionsChange
  const ordered = orderSections(LEAD_TABS, blocks?.sections?.order)
  useBlockMenu(
    change
      ? ordered
          .filter((tab): tab is Exclude<LeadTab, "overview"> => tab !== "overview")
          .map((tab) => {
            const isHidden = hidden.includes(tab)
            return {
              label: LEAD_TAB_WORDS[tab],
              ariaLabel: `${isHidden ? "Show" : "Hide"} ${LEAD_TAB_WORDS[tab]}`,
              muted: isHidden,
              keepOpen: true,
              end: isHidden ? <EyeOffIcon aria-hidden /> : <EyeIcon aria-hidden />,
              sortKey: tab,
              onSelect: () => change(isHidden ? hidden.filter((other) => other !== tab) : [...hidden, tab]),
            }
          })
      : undefined,
    blocks?.onSectionOrderChange
  )
  if (!blocks) return <Elsewhere />
  return (
    <DashboardsRows
      current={blocks.section}
      onPick={blocks.onPickSection}
      sections={ordered
        .filter((tab) => tab === blocks.section || tab === "overview" || !(hidden as string[]).includes(tab))
        .map((tab) => ({
          key: tab,
          label: LEAD_TAB_WORDS[tab],
          value:
            tab === "overview"
              ? blocks.widgetCount === null
                ? undefined
                : blocks.widgetCount.toLocaleString()
              : blocks.sectionCounts[tab].toLocaleString(),
        }))}
    />
  )
}

/**
 * Needs you: every lead waiting on the member (part 3), the same rule as the
 * list's Waiting on you, because the list's Needs column only shows once the
 * middle is wide. Five, then "Show all".
 */
export function NeedsYouBlock() {
  const blocks = useDatingBlocks()
  const waiting = blocks ? blocks.data.leads.filter((lead) => lead.waiting !== null && lead.status !== "over") : []
  useBlockCount(blocks ? waiting.length : undefined)
  if (!blocks) return <Elsewhere />
  const rows: SideRow[] = waiting.map((lead) => {
    const needs = needsWords(lead)
    return {
      key: lead.id,
      name: lead.name,
      line: needs?.words,
      dot: needs?.urgent ? "bg-red-500" : LEAD_DOT.waiting,
      picked: blocks.openId === lead.id,
      onPress: () => blocks.onOpen(lead.id),
    }
  })
  return <SideRows rows={rows} empty="Nobody is waiting on you." />
}

/** The phone's one line: not paired, here or away, swiping, or the screen that stopped it. */
function phoneRow(data: DatingDashboard): { name: string; line: string; dot: string } {
  const phone = data.phone
  if (!phone?.paired) return { name: "No phone paired", line: "Press to pair one", dot: "bg-muted-foreground/50" }
  if (phone.stoppedReason) {
    return { name: phone.name, line: `Stopped: ${stopReasonWords(phone.stoppedReason, data.profile.app).toLowerCase()}`, dot: "bg-red-500" }
  }
  const where = phone.here ? "Here" : phone.lastSeenAt ? `Away since ${whenWords(phone.lastSeenAt)}` : "Not heard from"
  // Today's swipes against the limit, now that Today is a widget on Overview.
  const swiping = phone.running ? `swiping, ${data.hour.swipesToday} of ${data.settings.swipesPerDay}` : null
  return { name: phone.name, line: [where, swiping].filter(Boolean).join(", "), dot: phone.here ? "bg-emerald-500" : "bg-muted-foreground/50" }
}

/** The phone: its line opens it in the right panel, and a paused profile says so with Resume. */
export function PhoneBlock() {
  const blocks = useDatingBlocks()
  if (!blocks) return <Elsewhere />
  const { data } = blocks
  const row = phoneRow(data)
  const rows: SideRow[] = [
    { key: "phone", name: row.name, line: row.line, dot: row.dot, picked: blocks.openId === "phone", onPress: () => blocks.onOpen("phone") },
  ]
  return (
    <SideRows
      rows={rows}
      empty=""
      after={
        data.profile.paused ? (
          <div className="flex items-center gap-2 px-2.5 py-1 text-sm">
            <span className="min-w-0 flex-1 text-muted-foreground">Paused. Nothing runs until Resume.</span>
            <Button type="button" variant="outline" size="sm" disabled={blocks.busy === "pause"} onClick={blocks.onResumeProfile}>
              {blocks.busy === "pause" ? <Loader2Icon className="animate-spin" /> : <RotateCcwIcon />}
              Resume
            </Button>
          </div>
        ) : null
      }
    />
  )
}

/** Every profile: the open one picked, another switches the dashboard, and New profile under them. */
export function ProfilesBlock() {
  const blocks = useDatingBlocks()
  useBlockCount(blocks?.data.profiles.length)
  if (!blocks) return <Elsewhere />
  const rows: SideRow[] = blocks.data.profiles.map((profile) => ({
    key: profile.id,
    name: profile.name,
    line: `${DATING_APP_WORDS[profile.app].name}${profile.paused ? ", paused" : ""}`,
    // How many leads wait on the member there; the pill always shows, so a bare number.
    value: profile.waiting ? String(profile.waiting) : undefined,
    picked: profile.id === blocks.data.profile.id,
    onPress: () => profile.id !== blocks.data.profile.id && blocks.onPickProfile(profile.id),
  }))
  return (
    <SideRows
      rows={rows}
      empty=""
      showAll
      after={
        <Button type="button" variant="ghost" size="sm" className="justify-self-start" onClick={blocks.onNewProfile}>
          <PlusIcon /> New profile
        </Button>
      }
    />
  )
}

/**
 * The lead groups, each with its dot and count. On a list it narrows the list
 * in place, keeping the other filters; on Overview it opens Leads narrowed.
 * Pressing the picked one again lets go. Over leads are left out of the count.
 */
export function LeadsBlock() {
  const blocks = useDatingBlocks()
  const live = blocks ? blocks.data.leads.filter((lead) => lead.status !== "over").length : undefined
  useBlockCount(live)
  if (!blocks) return <Elsewhere />
  const counts = leadGroupCounts(blocks.data.leads)
  const rows: SideRow[] = GROUPS.map((group) => ({
    key: group,
    name: LEAD_GROUP_WORDS[group],
    dot: LEAD_DOT[group],
    value: counts[group].toLocaleString(),
    picked: blocks.section !== "overview" && blocks.group === group,
    onPress: () => blocks.onGroup(group),
  }))
  return <SideRows rows={rows} empty="" showAll />
}

/**
 * Second Look, on a Facebook Dating profile (part 14 of "facebook/01"): the
 * cards the AI passed by a few points. A row opens the card on the right, so
 * the photos come before the like (part 10); Like on the row has the phone
 * like them on Facebook's Second Look.
 */
export function SecondLookBlock() {
  const blocks = useDatingBlocks()
  useBlockCount(blocks?.data.profile.app === "facebook" ? blocks.data.secondLook.length : undefined)
  if (!blocks) return <Elsewhere />
  if (blocks.data.profile.app !== "facebook") {
    return <p className="p-3 text-sm text-muted-foreground">Second Look is on Facebook Dating profiles only.</p>
  }
  const rows: SideRow[] = blocks.data.secondLook.map((card) => {
    const busy = blocks.busy === `second-look:${card.id}`
    return {
      key: card.id,
      name: card.age ? `${card.name}, ${card.age}` : card.name,
      value: String(card.score),
      picked: blocks.openId === card.id,
      onPress: () => blocks.onOpen(card.id),
      menu: (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Like ${card.name}`}
              disabled={busy}
              onClick={() => blocks.onSecondLookLike(card.id)}
            >
              {busy ? <Loader2Icon className="animate-spin" /> : <HeartIcon />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>Like</TooltipContent>
        </Tooltip>
      ),
    }
  })
  return (
    <SideRows
      rows={rows}
      empty="No near misses in the last two weeks."
      after={
        <p className="px-2.5 pt-1 text-xs text-muted-foreground">
          Cards the AI passed by {SECOND_LOOK_POINTS} points or fewer under your line of {blocks.data.settings.likeAbove}. Nothing is liked until you press Like.
        </p>
      }
    />
  )
}

/** My profile: the member's own profile as the phone last read it, opened in the right panel. */
function MyProfileBlock() {
  const blocks = useDatingBlocks()
  if (!blocks) return <Elsewhere />
  const { data } = blocks
  if (data.profile.app === "facebook") {
    return <p className="p-3 text-sm text-muted-foreground">Date does not change a Facebook Dating profile.</p>
  }
  const rows: SideRow[] = [
    {
      key: "me",
      name: `Your ${DATING_APP_WORDS[data.profile.app].name} profile`,
      line: data.own ? `Read ${whenWords(data.own.readAt)}${data.own.review ? ", with suggestions" : ""}` : "Not read yet",
      picked: blocks.openId === "me",
      onPress: () => blocks.onOpen("me"),
    },
  ]
  return <SideRows rows={rows} empty="" />
}

type BlockSpec = { key: string; label: string; icon: LucideIcon; node: string; Draw: () => React.ReactNode; offered?: boolean }

const made = new Map<DatingApp, readonly AppBlock[]>()

/**
 * The page's own blocks, made once per app: the Dashboards block, fixed and
 * never in the "/" list, then the rest. Second Look is offered on a Facebook
 * Dating profile and My profile on the others.
 */
export function datingBlocks(app: DatingApp): readonly AppBlock[] {
  const known = made.get(app)
  if (known) return known
  const specs: BlockSpec[] = [
    { key: "needs-you", label: "Needs you", icon: BellRingIcon, node: DATING_BLOCK_NODES.needsYou, Draw: NeedsYouBlock },
    { key: "phone", label: "Phone", icon: MonitorSmartphoneIcon, node: DATING_BLOCK_NODES.phone, Draw: PhoneBlock },
    { key: "profiles", label: "Profiles", icon: UsersIcon, node: DATING_BLOCK_NODES.profiles, Draw: ProfilesBlock },
    { key: "leads", label: "Leads", icon: HeartIcon, node: DATING_BLOCK_NODES.leads, Draw: LeadsBlock },
    {
      key: "second-look",
      label: "Second Look",
      icon: RotateCcwIcon,
      node: DATING_BLOCK_NODES.secondLook,
      Draw: SecondLookBlock,
      offered: app === "facebook",
    },
    {
      key: "my-profile",
      label: "My profile",
      icon: UserRoundIcon,
      node: DATING_BLOCK_NODES.myProfile,
      Draw: MyProfileBlock,
      offered: app !== "facebook",
    },
  ]
  const blocks: AppBlock[] = [
    {
      key: "sections",
      label: "Dashboards",
      icon: LayoutDashboardIcon,
      node: DATING_SECTIONS_NODE,
      extension: keepOnPage(
        blockNode(
          DATING_SECTIONS_NODE,
          {},
          blockView({ kind: "dating-sections", title: "Dashboards", icon: <LayoutDashboardIcon />, Draw: DatingSectionsBlock, fixed: true })
        )
      ),
      offered: false,
    },
    ...specs.map((spec) => {
      const Icon = spec.icon
      return {
        key: spec.key,
        label: spec.label,
        icon: spec.icon,
        node: spec.node,
        extension: blockNode(spec.node, {}, blockView({ kind: `dating-${spec.key}`, title: spec.label, icon: <Icon />, Draw: spec.Draw })),
        offered: spec.offered,
      }
    }),
  ]
  made.set(app, blocks)
  return blocks
}
