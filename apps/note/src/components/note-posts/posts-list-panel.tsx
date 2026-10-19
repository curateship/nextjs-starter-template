import { ListChecksIcon, Loader2Icon, MessageSquareQuoteIcon, SparklesIcon, XIcon } from "lucide-react"

import { PostCards, type PostCardActions } from "@/components/note-posts/post-cards"
import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import {
  DashboardToolbarButton,
  DashboardToolbarSearch,
  DashboardToolbarSelectTrigger,
} from "@/components/shared/dashboard-toolbar"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ErrorRow } from "@/components/ui/error-row"
import { Input } from "@/components/ui/input"
import { LoadingRow } from "@/components/ui/loading-row"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectValue } from "@/components/ui/select"
import { plural } from "@/lib/format/plural"
import { manyPriceLine, mergePriceLine } from "@/lib/note/posts/analyse-price"
import {
  analyseRefusal,
  PLAN_PROGRESS_FILTERS,
  progressWords,
  type NotePostCard,
  type PlanProgress,
} from "@/lib/note/posts/posts"

const EVERY_PLAN = "all"

/**
 * The middle panel: which folder is showing, the paste box, the search and the
 * plan filter, any author or tag being shown, and the posts, newest first,
 * fifty at a time. Ticking posts brings up one bar with Analyse and One plan,
 * each with its price.
 */
export function PostsListPanel({
  title,
  count,
  link,
  linkInvalid,
  onLink,
  onSaveLink,
  savingLink,
  query,
  onQuery,
  progress,
  onProgress,
  author,
  onClearAuthor,
  tag,
  onClearTag,
  posts,
  pickedId,
  selected,
  pickedCount,
  onToggle,
  onToggleAll,
  allState,
  pickedPosts,
  similarCount,
  onAnalyseMany,
  analysingMany,
  onMerge,
  merging,
  onClearPicked,
  actions,
  loading,
  failure,
  onRetryList,
  emptyText,
  hasOlder,
  loadingOlder,
  onShowOlder,
}: {
  title: string
  count: number
  link: string
  linkInvalid: boolean
  onLink: (link: string) => void
  onSaveLink: () => void
  savingLink: boolean
  query: string
  onQuery: (query: string) => void
  progress: PlanProgress | undefined
  onProgress: (progress: PlanProgress | undefined) => void
  author: string | undefined
  onClearAuthor: () => void
  tag: string | undefined
  onClearTag: () => void
  posts: NotePostCard[]
  pickedId: string | null
  selected: ReadonlySet<string>
  /** How many ticked posts are on screen, which is what the bar acts on. */
  pickedCount: number
  onToggle: (id: string) => void
  onToggleAll: () => void
  allState: boolean | "indeterminate"
  /** The ticked posts that are on screen, for the bar's prices. */
  pickedPosts: NotePostCard[]
  similarCount: number
  onAnalyseMany: () => void
  analysingMany: boolean
  onMerge: () => void
  merging: boolean
  onClearPicked: () => void
  actions: PostCardActions
  loading: boolean
  failure: string | null
  onRetryList: () => void
  emptyText: string | null
  hasOlder: boolean
  loadingOlder: boolean
  onShowOlder: () => void
}) {
  // Priced as the server will queue them: posts whose Analyse is allowed now.
  const analysable = pickedPosts.filter((post) => post.kind === "post" && analyseRefusal(post) === null)
  const mergeable = pickedPosts.filter((post) => post.kind === "post" && post.planChars > 0)

  return (
    <>
      <DashboardCardTitleHeader
        icon={<MessageSquareQuoteIcon />}
        title={title}
        meta={`${count} ${plural(count, "post")}`}
      />
      <div className="grid shrink-0 gap-2 border-b p-3">
        <form
          className="flex min-w-0 items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            onSaveLink()
          }}
        >
          <Input
            aria-label="Paste a link to an X post"
            placeholder="Paste a link to an X post"
            inputMode="url"
            autoComplete="off"
            value={link}
            aria-invalid={linkInvalid || undefined}
            onChange={(event) => onLink(event.target.value)}
          />
          <DashboardToolbarButton type="submit" disabled={savingLink}>
            {savingLink ? <Loader2Icon className="size-4 animate-spin" /> : null}
            Save
          </DashboardToolbarButton>
        </form>
        <div className="flex flex-wrap items-center gap-2">
          <DashboardToolbarSearch
            className="min-w-40 flex-1 sm:flex-1"
            inputClassName="sm:w-full lg:w-full"
            aria-label="Search posts, authors, summaries, tags and highlights"
            placeholder="Search"
            value={query}
            onChange={(event) => onQuery(event.target.value)}
          />
          <Select
            value={progress ?? EVERY_PLAN}
            onValueChange={(value) =>
              onProgress(value === EVERY_PLAN ? undefined : (value as PlanProgress))
            }
          >
            <DashboardToolbarSelectTrigger aria-label="Show posts by how far the plan has got">
              <SelectValue />
            </DashboardToolbarSelectTrigger>
            <SelectContent>
              <SelectItem value={EVERY_PLAN}>Every plan</SelectItem>
              {PLAN_PROGRESS_FILTERS.map((each) => (
                <SelectItem key={each} value={each}>
                  {progressWords(each)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {author || tag ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {author ? <FilterChip label={`@${author}`} onClear={onClearAuthor} what="author" /> : null}
            {tag ? <FilterChip label={tag} onClear={onClearTag} what="tag" /> : null}
          </div>
        ) : null}
      </div>
      {posts.length ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2">
          <Checkbox
            checked={allState}
            onCheckedChange={onToggleAll}
            aria-label="Pick every post on screen"
          />
          {pickedCount ? (
            <>
              <span className="text-xs font-medium tabular-nums">{pickedCount} picked</span>
              <Button type="button" variant="ghost" size="xs" onClick={onClearPicked}>
                Clear
              </Button>
              <span className="ml-auto flex flex-wrap items-center justify-end gap-2">
                <span className="text-xs text-muted-foreground">
                  {analysable.length ? manyPriceLine(analysable, similarCount) : null}
                </span>
                <DashboardToolbarButton type="button" disabled={analysingMany} onClick={onAnalyseMany}>
                  {analysingMany ? <Loader2Icon className="size-4 animate-spin" /> : <SparklesIcon className="size-4" />}
                  Analyse {pickedCount}
                </DashboardToolbarButton>
                <DashboardToolbarButton type="button" variant="outline" disabled={merging} onClick={onMerge}>
                  {merging ? <Loader2Icon className="size-4 animate-spin" /> : <ListChecksIcon className="size-4" />}
                  One plan
                </DashboardToolbarButton>
              </span>
              {mergeable.length >= 2 ? (
                <span className="w-full text-right text-xs text-muted-foreground">{mergePriceLine(mergeable)}</span>
              ) : null}
            </>
          ) : (
            <span className="text-xs text-muted-foreground">Tick posts to analyse several at once or make one plan.</span>
          )}
        </div>
      ) : null}
      <ScrollArea className="min-h-0 flex-1">
        {failure ? (
          <ErrorRow message={failure} onRetry={onRetryList} />
        ) : loading ? (
          <LoadingRow label="Loading posts" />
        ) : (
          <>
            {emptyText ? (
              <p className="px-4 pt-8 pb-2 text-center text-sm text-muted-foreground">{emptyText}</p>
            ) : null}
            <PostCards
              posts={posts}
              pickedId={pickedId}
              selected={selected}
              onToggle={onToggle}
              actions={actions}
            />
            {hasOlder ? (
              <div className="flex justify-center p-3">
                <Button type="button" variant="outline" disabled={loadingOlder} onClick={onShowOlder}>
                  {loadingOlder ? <Loader2Icon className="animate-spin" /> : null}
                  Show older
                </Button>
              </div>
            ) : null}
          </>
        )}
      </ScrollArea>
    </>
  )
}

/** The author or tag being shown. The whole chip is the button that stops it. */
function FilterChip({ label, what, onClear }: { label: string; what: string; onClear: () => void }) {
  return (
    <Button
      type="button"
      variant="secondary"
      size="xs"
      className="font-normal"
      aria-label={`Stop showing only the ${what} ${label}`}
      onClick={onClear}
    >
      {label}
      <XIcon />
    </Button>
  )
}
