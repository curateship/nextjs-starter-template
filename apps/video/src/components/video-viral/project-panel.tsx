import * as React from "react"
import { Link } from "@tanstack/react-router"
import {
  ChartNoAxesCombinedIcon,
  CircleAlertIcon,
  FilmIcon,
  Loader2Icon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  SettingsIcon,
  XIcon,
} from "lucide-react"

import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { InspectorCard } from "@/components/shared/inspector-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { formatDate } from "@/lib/format/format-time"
import { focusRing } from "@/lib/layout/focus-ring"
import { cn } from "@/lib/utils"
import { formatCount } from "@/lib/video/creators"
import { formatCents } from "@/lib/video/project-spend"
import {
  isKeywordWorking,
  unitsPerKeyword,
  VIRAL_KEYWORD_MAX,
  viralVideoLengthLabels,
  type ViralKeyword,
  type ViralProjectScreen,
} from "@/lib/video/viral"

/**
 * The left panel: what the project is, its keywords and how each one's last
 * search went, the filters, the figures, and what was made from it.
 *
 * A keyword chip narrows the middle panel to the videos it found; its arrow
 * searches it again on its own, and its cross takes it off the project.
 */
export function ProjectPanel({
  screen,
  glance,
  activeKeyword,
  busy,
  onPickKeyword,
  onSearchAll,
  onRefreshKeyword,
  onRemoveKeyword,
  onAddKeyword,
  onOpenSettings,
}: {
  screen: ViralProjectScreen
  glance: {
    videos: number
    creators: number
    bestScore: number | null
    typicalViews: number | null
  }
  activeKeyword: string | null
  busy: boolean
  onPickKeyword: (keyword: string | null) => void
  onSearchAll: () => void
  onRefreshKeyword: (keyword: ViralKeyword) => void
  onRemoveKeyword: (keyword: ViralKeyword) => void
  /** Resolves true once the keyword is on the project. */
  onAddKeyword: (keyword: string) => Promise<boolean>
  onOpenSettings: () => void
}) {
  const { project, keywords, made, spend, youtube } = screen
  const [adding, setAdding] = React.useState("")
  const searching = keywords.some((keyword) => isKeywordWorking(keyword.status))
  const perKeyword = unitsPerKeyword(project.video_length)
  const runCost = keywords.length * perKeyword

  async function add() {
    if (!adding.trim()) return
    if (await onAddKeyword(adding)) setAdding("")
  }

  return (
    <>
      <DashboardCardTitleHeader
        icon={<ChartNoAxesCombinedIcon />}
        back={{ label: "Back to every Viral project", to: "/admin/video-viral" }}
        title={project.name}
        action={
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label="Project settings"
                onClick={onOpenSettings}
              >
                <SettingsIcon className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Project settings</TooltipContent>
          </Tooltip>
        }
      />
      <ScrollArea className="min-h-0 flex-1">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 p-3">
          {project.sample ? (
            <p className="rounded-lg border bg-amber-50 p-3 text-sm dark:bg-amber-400/10">
              This is a sample with made-up videos, so nothing plays and
              nothing is searched. Make your own project to see real ones.
            </p>
          ) : null}

          <InspectorCard storageId="viral-project-about" title="About">
            <p className="text-sm whitespace-pre-wrap text-muted-foreground">
              {project.description || "No description yet. Add one in the settings, so the AI can suggest keywords and judge how well each video fits."}
            </p>
          </InspectorCard>

          <InspectorCard storageId="viral-project-keywords" title="Keywords">
            <div className="grid gap-3">
              <ul className="grid gap-1.5">
                {keywords.map((keyword) => (
                  <KeywordRow
                    key={keyword.id}
                    keyword={keyword}
                    active={activeKeyword === keyword.keyword}
                    busy={busy}
                    perKeyword={perKeyword}
                    onPick={() =>
                      onPickKeyword(
                        activeKeyword === keyword.keyword ? null : keyword.keyword
                      )
                    }
                    onRefresh={() => onRefreshKeyword(keyword)}
                    onRemove={() => onRemoveKeyword(keyword)}
                  />
                ))}
              </ul>
              {keywords.length ? null : (
                <p className="text-sm text-muted-foreground">
                  No keywords yet. Add the words people search for this niche.
                </p>
              )}
              <form
                className="flex gap-2"
                onSubmit={(event) => {
                  event.preventDefault()
                  void add()
                }}
              >
                <Input
                  aria-label="Add a keyword"
                  placeholder="Add a keyword"
                  value={adding}
                  maxLength={VIRAL_KEYWORD_MAX}
                  onChange={(event) => setAdding(event.target.value)}
                />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="submit"
                      variant="outline"
                      size="icon"
                      className="size-8 shrink-0"
                      aria-label="Add the keyword and search it"
                      disabled={busy}
                    >
                      <PlusIcon className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    Adds it and searches it, {perKeyword} units
                  </TooltipContent>
                </Tooltip>
              </form>
              <Button disabled={busy || searching} onClick={onSearchAll}>
                {searching ? (
                  <Loader2Icon className="animate-spin" />
                ) : (
                  <SearchIcon />
                )}
                {searching ? "Searching…" : "Search every keyword"}
              </Button>
              <p className="text-xs text-muted-foreground">
                {keywords.length
                  ? `${keywords.length} ${keywords.length === 1 ? "keyword" : "keywords"} × ${perKeyword} units = ${runCost.toLocaleString()} units. `
                  : ""}
                {youtube.keyConfigured
                  ? `${youtube.unitsLeftToday.toLocaleString()} of today's 10,000 free YouTube units are left.`
                  : "No YouTube key is saved. Paste one in Settings → YouTube to search."}
              </p>
            </div>
          </InspectorCard>

          <InspectorCard storageId="viral-project-filters" title="Filters">
            <dl className="grid gap-1.5 text-sm">
              <Row label="Posted within" value={`The last ${project.days} days`} />
              <Row label="Videos" value={viralVideoLengthLabels[project.video_length]} />
              <Row
                label="Minimum views"
                value={project.min_views ? project.min_views.toLocaleString() : "Any"}
              />
              <Row
                label="Minimum score"
                value={project.min_score ? String(project.min_score) : "Any"}
              />
              <Row
                label="Hidden channels"
                value={String(screen.hidden.length)}
              />
            </dl>
            <Button variant="outline" onClick={onOpenSettings}>
              <SettingsIcon />
              Change filters
            </Button>
          </InspectorCard>

          <InspectorCard storageId="viral-project-glance" title="At a glance">
            <dl className="grid grid-cols-2 gap-2">
              <Tile label="Videos" value={glance.videos.toLocaleString()} />
              <Tile label="Creators" value={glance.creators.toLocaleString()} />
              <Tile label="Best score" value={glance.bestScore === null ? "—" : String(glance.bestScore)} />
              <Tile label="Typical views" value={formatCount(glance.typicalViews)} />
              <Tile label="YouTube units used" value={project.units_spent.toLocaleString()} />
              <Tile
                label="AI spend"
                value={
                  spend.limit_cents === null
                    ? formatCents(spend.total_cents)
                    : `${formatCents(spend.total_cents)} of ${formatCents(spend.limit_cents)}`
                }
              />
            </dl>
          </InspectorCard>

          <InspectorCard storageId="viral-project-made" title="Made from this">
            {made.length ? (
              <ul className="grid gap-1">
                {made.map((editorProject) => (
                  <li key={editorProject.id}>
                    <Link
                      to="/admin/video-editor/$projectId"
                      params={{ projectId: editorProject.id }}
                      className={cn(
                        "flex items-center gap-2 rounded-md px-1 py-1 text-sm hover:bg-muted",
                        focusRing
                      )}
                    >
                      <FilmIcon className="size-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">{editorProject.name}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                Nothing yet. Copy this under a video makes an editor project
                and lists it here.
              </p>
            )}
          </InspectorCard>
        </div>
      </ScrollArea>
    </>
  )
}

function KeywordRow({
  keyword,
  active,
  busy,
  perKeyword,
  onPick,
  onRefresh,
  onRemove,
}: {
  keyword: ViralKeyword
  active: boolean
  busy: boolean
  perKeyword: number
  onPick: () => void
  onRefresh: () => void
  onRemove: () => void
}) {
  const working = isKeywordWorking(keyword.status)
  const status = working
    ? keyword.status === "queued"
      ? "Waiting to search"
      : "Searching"
    : keyword.status === "failed"
      ? "Failed"
      : keyword.ran_at
        ? `${keyword.result_count} found ${formatDate(keyword.ran_at)}`
        : "Not searched yet"
  return (
    <li
      className={cn(
        "flex items-center gap-1 rounded-md border bg-background pl-2",
        active && "border-primary ring-1 ring-primary"
      )}
    >
      <button
        type="button"
        onClick={onPick}
        aria-pressed={active}
        className={cn("grid min-w-0 flex-1 py-1 text-left", focusRing)}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-sm font-medium">{keyword.keyword}</span>
          {keyword.new_count ? (
            <Badge>{keyword.new_count} new</Badge>
          ) : null}
        </span>
        <span
          className={cn(
            "flex items-center gap-1 truncate text-xs text-muted-foreground",
            keyword.status === "failed" && "text-destructive"
          )}
        >
          {working ? <Loader2Icon className="size-3 animate-spin" /> : null}
          {keyword.status === "failed" ? <CircleAlertIcon className="size-3" /> : null}
          {status}
        </span>
        {keyword.status === "failed" && keyword.error ? (
          <span className="text-xs whitespace-normal text-destructive">
            {keyword.error}
          </span>
        ) : null}
      </button>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Search ${keyword.keyword} again`}
            disabled={busy || working}
            onClick={onRefresh}
          >
            <RefreshCwIcon />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Search it again, {perKeyword} units</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Remove ${keyword.keyword}`}
            disabled={busy}
            onClick={onRemove}
          >
            <XIcon />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Remove it and the videos only it found</TooltipContent>
      </Tooltip>
    </li>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  )
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background p-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate text-sm font-medium tabular-nums">{value}</dd>
    </div>
  )
}
