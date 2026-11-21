import * as React from "react"
import {
  CircleAlertIcon,
  KeyRoundIcon,
  Loader2Icon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  XIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { DashboardToolbarButton } from "@/components/shared/dashboard-toolbar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { focusRing } from "@/lib/layout/focus-ring"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"
import {
  isKeywordWorking,
  unitsPerKeyword,
  VIRAL_KEYWORD_MAX,
  type ViralKeyword,
  type ViralProjectItem,
} from "@/lib/viral/viral"
import { formatShortDay } from "@/lib/viral/viral-view"

/**
 * The Keywords dropdown in the project page's middle header (Tyler, 21 Nov
 * 2026: "keep the keywords moved to the middle"): the button shows how many
 * keywords there are, and opens each keyword with how its last search went.
 * A keyword narrows the middle panel to the videos it found; its arrow
 * searches it again on its own, and its cross takes it off the project.
 * Under the list sit Add keywords and Search all. Only YouTube is searched
 * by keyword (Tyler, 4 Nov 2026: "Creators only for TikTok"), so the button
 * shows only while the project has YouTube.
 */
export function KeywordsDropdown({
  project,
  keywords,
  activeKeyword,
  isBusy,
  onPickKeyword,
  onSearchAll,
  onRefreshKeyword,
  onRemoveKeyword,
  onAddKeyword,
}: {
  project: ViralProjectItem
  keywords: ViralKeyword[]
  activeKeyword: string | null
  /** Whether the action with this key is running: `search-all`, `add-keyword` or `keyword:<id>`. */
  isBusy: (key: string) => boolean
  onPickKeyword: (keyword: string | null) => void
  onSearchAll: () => void
  onRefreshKeyword: (keyword: ViralKeyword) => void
  onRemoveKeyword: (keyword: ViralKeyword) => void
  /** Resolves true once the keyword is on the project. */
  onAddKeyword: (keyword: string) => Promise<boolean>
}) {
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

  const [open, setOpen] = React.useState(false)
  const picked = activeKeyword !== null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {/* Its word hides in a narrow header, so a tooltip names it there. */}
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <DashboardToolbarButton
              type="button"
              variant="outline"
              aria-label={`YouTube keywords, ${keywords.length}${picked ? `, showing ${activeKeyword}` : ""}`}
              className={cn(picked && "bg-muted")}
            >
              {searching ? <Loader2Icon className="size-4 animate-spin" /> : <KeyRoundIcon className="size-4" />}
              <span className="@max-6xl:sr-only">Keywords</span>
              <span className="text-muted-foreground tabular-nums">{keywords.length}</span>
            </DashboardToolbarButton>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>YouTube keywords</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" collisionPadding={16} className="grid w-80 gap-3 p-3">
      <p className="text-sm font-medium text-muted-foreground">YouTube keywords</p>
      {keywords.length ? (
        <ul className="-mx-1 grid max-h-72 grid-cols-[minmax(0,1fr)] gap-0.5 overflow-y-auto">
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
          {searching ? "Searching…" : "Search all"}
        </Button>
      </div>
      </PopoverContent>
    </Popover>
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
        <span className="truncate text-sm font-medium">{keyword.keyword}</span>
        <span
          className={cn(
            "flex items-center gap-1 truncate text-xs text-muted-foreground",
            keyword.status === "failed" && "text-destructive"
          )}
        >
          {working ? <Loader2Icon className="size-3 animate-spin" /> : null}
          {keyword.status === "failed" ? <CircleAlertIcon className="size-3" /> : null}
          <span className="truncate">{status}</span>
          {/* On the second line, so a narrow panel still shows the keyword itself. */}
          {keyword.new_count ? <Badge className="shrink-0">{keyword.new_count} new</Badge> : null}
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
