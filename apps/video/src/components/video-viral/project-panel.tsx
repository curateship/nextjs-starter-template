import * as React from "react"
import {
  ChartNoAxesCombinedIcon,
  CircleAlertIcon,
  Loader2Icon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  SettingsIcon,
  XIcon,
} from "lucide-react"

import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { FlatSection } from "@/components/video-viral/flat-section"
import { focusRing } from "@/lib/layout/focus-ring"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"
import {
  isKeywordWorking,
  unitsPerKeyword,
  VIRAL_KEYWORD_MAX,
  type ViralKeyword,
  type ViralProjectScreen,
} from "@/lib/video/viral"
import { formatShortDay } from "@/lib/video/viral-view"

/**
 * The left panel: the project's keywords and how each one's last search
 * went, then its creators. Tyler took the About, Filters, At a glance and
 * Made from this sections off on 29 Oct 2026; the description and filters
 * are still in the settings window. Each group is a flat folding section (`FlatSection`), Tyler's design of
 * 20 Oct 2026, split from the next by a line.
 *
 * A keyword chip narrows the middle panel to the videos it found; its arrow
 * searches it again on its own, and its cross takes it off the project.
 */
export function ProjectPanel({
  screen,
  activeKeyword,
  isBusy,
  onPickKeyword,
  onSearchAll,
  onRefreshKeyword,
  onRemoveKeyword,
  onAddKeyword,
  onOpenSettings,
  creators,
}: {
  screen: ViralProjectScreen
  activeKeyword: string | null
  /** Whether the action with this key is running: `search-all`, `add-keyword` or `keyword:<id>`. */
  isBusy: (key: string) => boolean
  onPickKeyword: (keyword: string | null) => void
  onSearchAll: () => void
  onRefreshKeyword: (keyword: ViralKeyword) => void
  onRemoveKeyword: (keyword: ViralKeyword) => void
  /** Resolves true once the keyword is on the project. */
  onAddKeyword: (keyword: string) => Promise<boolean>
  onOpenSettings: () => void
  /** The Creators card, after Keywords. */
  creators: React.ReactNode
}) {
  const { project, keywords } = screen
  const [adding, setAdding] = React.useState("")
  // The field stays hidden until Add keywords is pressed (Tyler, 20 Oct 2026),
  // then stays open for the next keyword until it is left empty.
  const [fieldOpen, setFieldOpen] = React.useState(false)
  const searching = keywords.some((keyword) => isKeywordWorking(keyword.status))
  const perKeyword = unitsPerKeyword(project.video_length)

  async function add() {
    if (!adding.trim()) {
      showErrorToast("Type a keyword first, then press Enter or +.")
      return
    }
    if (await onAddKeyword(adding)) setAdding("")
  }

  function closeFieldIfEmpty() {
    if (!adding.trim()) setFieldOpen(false)
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
        <div className="grid grid-cols-[minmax(0,1fr)]">
          <FlatSection storageId="viral-project-keywords" title="Keywords" meta={keywords.length}>
            {keywords.length ? (
              <ul className="-mx-2 grid gap-0.5">
                {keywords.map((keyword) => (
                  <KeywordRow
                    key={keyword.id}
                    keyword={keyword}
                    active={activeKeyword === keyword.keyword}
                    busy={isBusy(`keyword:${keyword.id}`)}
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
            ) : (
              <p className="text-sm text-muted-foreground">
                No keywords yet. Add the words people search for this niche.
              </p>
            )}
            {fieldOpen ? (
              <form
                className="flex gap-2"
                onSubmit={(event) => {
                  event.preventDefault()
                  void add()
                }}
                onBlur={(event) => {
                  // Leaving the form, not moving from the field to its +.
                  if (!event.currentTarget.contains(event.relatedTarget)) closeFieldIfEmpty()
                }}
              >
                <Input
                  aria-label="Add a keyword"
                  placeholder="Add a keyword"
                  autoFocus
                  value={adding}
                  maxLength={VIRAL_KEYWORD_MAX}
                  onChange={(event) => setAdding(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== "Escape") return
                    event.preventDefault()
                    setAdding("")
                    setFieldOpen(false)
                  }}
                />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="submit"
                      variant="outline"
                      size="icon"
                      className="size-8 shrink-0"
                      aria-label="Add the keyword and search it"
                      disabled={isBusy("add-keyword")}
                    >
                      <PlusIcon className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    Adds it and searches it, using {perKeyword} units of
                    your daily YouTube allowance
                  </TooltipContent>
                </Tooltip>
              </form>
            ) : null}
            {/* Two worded buttons under the list, as Filter and Add creator sit
                under Creators (Tyler, 20 Oct 2026). A panel too narrow for both
                puts Search on a row of its own rather than cutting its words. */}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                className="grow"
                aria-expanded={fieldOpen}
                onClick={() => setFieldOpen(true)}
              >
                <PlusIcon />
                Add keywords
              </Button>
              <Button className="grow" disabled={isBusy("search-all") || searching} onClick={onSearchAll}>
                {searching ? (
                  <Loader2Icon className="animate-spin" />
                ) : (
                  <SearchIcon />
                )}
                {searching ? "Searching…" : "Search every keyword"}
              </Button>
            </div>
          </FlatSection>

          {creators}

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
        ? `${keyword.result_count} found · ${formatShortDay(keyword.ran_at)}`
        : "Not searched yet"
  return (
    <li className={cn("flex items-center gap-1 rounded-md pl-2", active && "bg-muted")}>
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
        <TooltipContent>
          Search it again, using {perKeyword} units of your daily YouTube
          allowance
        </TooltipContent>
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
