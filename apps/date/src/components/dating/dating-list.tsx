import * as React from "react"
import { Link } from "@tanstack/react-router"
import { ChevronDownIcon, FlagIcon, HeartIcon, ListFilterIcon, Loader2Icon, RefreshCwIcon, XIcon } from "lucide-react"

import { DashboardCardHeader, dashboardCardTabClassName } from "@/components/shared/dashboard-card-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Tabs, TabsContent, TabsCount, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { DatingDashboard } from "@/lib/api/dating/dashboard"
import { MATCH_FLAG_WORDS, PROFILE_FILTERS, type ListTab, type ProfileFilter } from "@/lib/dating/options"
import { focusRingInset } from "@/lib/layout/focus-ring"
import { cn } from "@/lib/utils"

import { DatingPicture } from "./picture"
import { nameAndAge, swipeWords, whenWords } from "./words"

const FILTER_WORDS: Record<ProfileFilter, string> = {
  all: "All cards",
  liked: "Liked",
  passed: "Passed",
  unswiped: "Not swiped",
}

/**
 * The left column: the cards the phone read, newest first, and the matches,
 * newest message first. A card or a match opens in the middle column.
 */
export function DatingList({
  data,
  tab,
  filter,
  openProfileId,
  openMatchId,
  busy,
  onTab,
  onFilter,
  onOpenProfile,
  onOpenMatch,
  onReadCard,
  onReadMatches,
}: {
  data: DatingDashboard
  tab: ListTab
  filter: ProfileFilter
  openProfileId: string | null
  openMatchId: string | null
  /** Which header button is waiting on the server. */
  busy: string | null
  onTab: (tab: ListTab) => void
  onFilter: (filter: ProfileFilter) => void
  onOpenProfile: (id: string) => void
  onOpenMatch: (id: string) => void
  onReadCard: () => void
  onReadMatches: () => void
}) {
  const profiles = data.profiles.filter((profile) => {
    if (filter === "liked") return profile.swipe === "like"
    if (filter === "passed") return profile.swipe === "pass"
    if (filter === "unswiped") return profile.swipe === "none"
    return true
  })
  const canAct = Boolean(data.phone?.paired)

  return (
    <Tabs value={tab} onValueChange={(value) => onTab(value === "matches" ? "matches" : "profiles")} className="flex min-h-0 flex-1 flex-col gap-0">
      {/* A container, so the filter and the counts give way when the column is narrow. */}
      <DashboardCardHeader className="@container/list">
        <TabsList className="shrink-0 justify-start">
          <TabsTrigger value="profiles" className={cn("flex-none", dashboardCardTabClassName)}>
            Profiles
            <TabsCount className="hidden @[19rem]/list:inline-flex">{data.profiles.length}</TabsCount>
          </TabsTrigger>
          <TabsTrigger value="matches" className={cn("flex-none", dashboardCardTabClassName)}>
            Matches
            <TabsCount className="hidden @[19rem]/list:inline-flex">{data.matches.length}</TabsCount>
          </TabsTrigger>
        </TabsList>
        {tab === "profiles" ? (
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" className="ml-auto shrink-0 px-2 @[22rem]/list:px-2.5" aria-label={`Which cards to show: ${FILTER_WORDS[filter]}`}>
                    <ListFilterIcon className={cn(filter !== "all" && "text-primary")} />
                    <span className="hidden @[22rem]/list:inline">{FILTER_WORDS[filter]}</span>
                    <ChevronDownIcon className="hidden text-muted-foreground @[22rem]/list:block" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>Showing: {FILTER_WORDS[filter]}</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end">
              {PROFILE_FILTERS.map((value) => (
                <DropdownMenuCheckboxItem key={value} checked={value === filter} onCheckedChange={() => onFilter(value)}>
                  {FILTER_WORDS[value]}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </DashboardCardHeader>

      <TabsContent value="profiles" className="flex min-h-0 flex-1 flex-col">
        <ScrollArea className="min-h-0 flex-1">
          {profiles.length ? (
            <ul className="grid">
              {profiles.map((profile) => (
                <li key={profile.id}>
                  <Row active={profile.id === openProfileId} onClick={() => onOpenProfile(profile.id)}>
                    <DatingPicture pictureId={profile.photoId} alt="" className="size-10 shrink-0 rounded-md" />
                    <span className="grid min-w-0 flex-1 gap-0.5">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate font-medium">{nameAndAge(profile.name, profile.age)}</span>
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {profile.sample ? "Sample · " : ""}
                        {swipeWords(profile.swipe, profile.swipedBy)} · read {whenWords(profile.readAt)}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="text-sm tabular-nums text-muted-foreground" aria-label={profile.score === null ? "Not scored yet" : `Scored ${profile.score} out of 100`}>
                        {profile.score === null ? "–" : profile.score}
                      </span>
                      <SwipeMark swipe={profile.swipe} />
                    </span>
                  </Row>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyList data={data} what={filter === "all" ? "cards" : "cards like that"} action={canAct && filter === "all" ? { label: "Read profile", onClick: onReadCard, busy: busy === "read-card" } : null} />
          )}
        </ScrollArea>
      </TabsContent>

      <TabsContent value="matches" className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-end gap-2 border-b px-3 py-2">
          <ToolbarButton label="Read the chats now" short="Read chats" busy={busy === "read-matches"} onClick={onReadMatches} icon={<RefreshCwIcon />} />
        </div>
        <ScrollArea className="min-h-0 flex-1">
          {data.matches.length ? (
            <ul className="grid">
              {data.matches.map((match) => (
                <li key={match.id}>
                  <Row active={match.id === openMatchId} onClick={() => onOpenMatch(match.id)}>
                    <DatingPicture pictureId={match.photoId} alt="" className="size-10 shrink-0 rounded-full" />
                    <span className="grid min-w-0 flex-1 gap-0.5">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className={cn("truncate font-medium", match.unmatched && "text-muted-foreground line-through")}>{match.theirName}</span>
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {match.sample ? "Sample · " : ""}
                        {match.lastLine || "No messages yet"}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {match.flagged ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-primary">
                              <FlagIcon className="size-4" aria-label="Flagged for you" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>{MATCH_FLAG_WORDS[match.flagged]}</TooltipContent>
                        </Tooltip>
                      ) : null}
                      {match.hasDraft ? (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <span className="size-2 rounded-full bg-primary" aria-hidden />
                          <span className="sr-only sm:not-sr-only">Draft</span>
                        </span>
                      ) : null}
                      {match.unreadCount ? <Badge aria-label={`${match.unreadCount} unread`}>{match.unreadCount}</Badge> : null}
                    </span>
                  </Row>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyList data={data} what="matches" action={canAct ? { label: "Read the chats now", onClick: onReadMatches, busy: busy === "read-matches" } : null} />
          )}
        </ScrollArea>
      </TabsContent>
    </Tabs>
  )
}

/** A toolbar action with a short label; the whole sentence is its tooltip and accessible name. */
function ToolbarButton({ label, short, busy, onClick, icon }: { label: string; short: string; busy: boolean; onClick: () => void; icon: React.ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="outline" className="ml-auto shrink-0" aria-label={label} disabled={busy} onClick={onClick}>
          {busy ? <Loader2Icon className="animate-spin" /> : icon}
          {short}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

function Row({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      className={cn("flex w-full items-center gap-3 border-b px-3 py-2.5 text-left text-sm hover:bg-muted/60", active && "bg-muted", focusRingInset)}
    >
      {children}
    </button>
  )
}

function SwipeMark({ swipe }: { swipe: "none" | "like" | "pass" }) {
  if (swipe === "like") return <HeartIcon className="size-4 fill-primary text-primary" aria-label="Liked" />
  if (swipe === "pass") return <XIcon className="size-4 text-muted-foreground" aria-label="Passed" />
  return <span className="size-4" aria-hidden />
}

function EmptyList({
  data,
  what,
  action,
}: {
  data: DatingDashboard
  what: string
  action: { label: string; onClick: () => void; busy: boolean } | null
}) {
  if (!data.phone?.paired) {
    return (
      <div className="grid gap-3 p-4 text-sm text-muted-foreground">
        <p>No phone is paired yet, so there are no {what} to show.</p>
        <p>
          <Link to="/admin/dating/phone" className="font-medium text-foreground underline underline-offset-4">
            Pair one on the Phone screen
          </Link>
          , or add sample cards there to look around first.
        </p>
      </div>
    )
  }
  return (
    <div className="grid justify-items-start gap-3 p-4 text-sm text-muted-foreground">
      <p>No {what} yet.</p>
      {action ? (
        <Button type="button" variant="outline" onClick={action.onClick} disabled={action.busy}>
          {action.busy ? <Loader2Icon className="animate-spin" /> : null}
          {action.label}
        </Button>
      ) : null}
    </div>
  )
}
