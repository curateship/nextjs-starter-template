import * as React from "react"
import { Loader2Icon, PauseIcon, PlusIcon } from "lucide-react"

import { DashboardToolbarButton } from "@/components/shared/dashboard-toolbar"
import { FailedTable } from "@/components/social/comments/failed-table"
import { PostsTable } from "@/components/social/comments/posts-table"
import { ProjectColumns } from "@/components/social/projects/project-columns"
import { ErrorRow } from "@/components/ui/error-row"
import { Tabs, TabsCount, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { getCommentsErrorMessage, loadFailures, type FailureRow } from "@/lib/api/social/comments"
import type { ProjectView } from "@/lib/api/social/projects"
import { loadFailedPost, loadOwnPosts, type OwnPostRow } from "@/lib/api/social/reddit/own-posts"
import { loadViralRedditDraft } from "@/lib/api/social/viral-link"
import { useWideScreen } from "@/lib/layout/wide-screen"
import { showErrorToast } from "@/lib/toast/error-toast"

import { NEW_POST_FIRST_FIELD, RedditNewPostPanel, type NewPostStart } from "./reddit-new-post"

/** What Reddit's posts keep in the address: `?list=failed` is Failed, none is Posts. */
export type RedditPostsSearch = { list?: "failed" }

/**
 * Reddit on a project's dashboard: your own posts. Tyler, 5 Nov 2026: "Every
 * middle panel clicking from the left panel should show my own posts"
 * (`workspace/tasks/Projects/commenting-dashboard.md`, parts 1 to 3 and 9).
 * Finding posts to comment on is Reddit's Commenting row in the same card of
 * the project's left column.
 *
 * The middle column is Posts, every post of yours that landed, and Failed,
 * the ones that did not go out, each with Try again. The right column is
 * always New post, since a Reddit post is read on Reddit itself.
 * `newPostRetryId` is a failed post's job, or a Viral draft, whose words New
 * post opens with. Nothing is sent until Post is pressed. A post sent, or a
 * failed one cleared, reads the project again, so Posts' count on Reddit's
 * card changes at once.
 */
export function RedditPostsModule({
  view,
  left,
  dialogs,
  search,
  onSearch,
  newPostRetryId,
  onProjectChanged,
}: {
  view: ProjectView
  left: React.ReactNode
  dialogs: React.ReactNode
  search: RedditPostsSearch
  onSearch: (patch: RedditPostsSearch) => void
  newPostRetryId: string | null
  /** Reads the project again, for the counts on its network cards. */
  onProjectChanged: () => Promise<void>
}) {
  const desktop = useWideScreen()
  const projectId = view.project.id
  const list = search.list === "failed" ? "failed" : "posts"
  const [lists, setLists] = React.useState<{ posts: OwnPostRow[]; failures: FailureRow[] } | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  /** What New post starts with, and a count that starts its boxes afresh after a send. */
  const [start, setStart] = React.useState<NewPostStart | null>(null)
  const [formKey, setFormKey] = React.useState(0)
  /** On a narrow screen, whether New post covers the list. */
  const [composing, setComposing] = React.useState(false)

  const refresh = React.useCallback(
    (): Promise<void> =>
      Promise.all([loadOwnPosts(projectId), loadFailures(projectId)]).then(
        ([posts, failures]) => {
          // Both lists are one person's, narrowed here to this project's
          // posts. Failed comments are on a network's Commenting.
          setLists({
            posts: posts.filter((row) => row.project?.id === projectId),
            failures: failures.filter((row) => row.projectId === projectId && row.kind === "submit"),
          })
          setError(null)
        },
        (failure: unknown) => setError(getCommentsErrorMessage(failure))
      ),
    [projectId]
  )

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  /** After a send or a failure cleared: the lists, and the card's count. */
  const changed = React.useCallback(async () => {
    await Promise.all([refresh(), onProjectChanged()])
  }, [onProjectChanged, refresh])

  // A failed post's words, from Try again, or a post the Viral app wrote
  // (`workspace/docs/viral-link.md`): read once, then New post opens with
  // them. Nothing is sent.
  React.useEffect(() => {
    if (!newPostRetryId) return
    let live = true
    loadFailedPost(newPostRetryId)
      .then(async (failed) => failed ?? (await loadViralRedditDraft(newPostRetryId)))
      .then(
        (words) => {
          if (!live) return
          if (!words) {
            showErrorToast("That post is not a failed one any more, so there is nothing to try again.")
            return
          }
          setStart(words)
          setFormKey((count) => count + 1)
          setComposing(true)
        },
        () => {
          if (live) showErrorToast("That post's words could not be read. Please try again.")
        }
      )
    return () => {
      live = false
    }
  }, [newPostRetryId])

  function newPost() {
    setComposing(true)
    // The panel is already drawn on a wide screen; on a narrow one it is
    // drawn once `composing` is set, so the cursor goes in after that.
    requestAnimationFrame(() => document.getElementById(NEW_POST_FIRST_FIELD)?.focus())
  }

  const tabs = lists ? (
    <Tabs value={list} onValueChange={(value) => onSearch({ list: value === "failed" ? "failed" : undefined })}>
      <TabsList>
        <TabsTrigger value="posts" aria-label={`Posts, ${lists.posts.length}`}>
          Posts
          <TabsCount>{lists.posts.length}</TabsCount>
        </TabsTrigger>
        <TabsTrigger value="failed" aria-label={`Failed, ${lists.failures.length}`}>
          Failed
          <TabsCount>{lists.failures.length}</TabsCount>
        </TabsTrigger>
      </TabsList>
    </Tabs>
  ) : null

  const body = !lists ? (
    error ? (
      <ErrorRow message={error} onRetry={() => void refresh()} />
    ) : (
      <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
        <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
        Reading your posts
      </p>
    )
  ) : list === "failed" ? (
    <FailedTable
      title="Posts that did not go out"
      tabs={tabs}
      failures={lists.failures}
      error={error}
      onRefresh={changed}
      // Only posts are listed here, and a post's Try again opens New post.
      onOpenReplies={() => undefined}
    />
  ) : (
    <PostsTable
      tabs={tabs}
      rows={lists.posts}
      controls={
        <DashboardToolbarButton type="button" onClick={newPost}>
          <PlusIcon className="size-4" />
          New post
        </DashboardToolbarButton>
      }
    />
  )

  return (
    <ProjectColumns
      left={left}
      middle={
        <>
          {view.project.pausedNetworks.includes("reddit") ? (
            <p className="flex shrink-0 items-start gap-2 border-b px-3 py-2 text-sm">
              <PauseIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              Reddit is paused on this project. Nothing is sent or warmed up until it is resumed in the left column.
            </p>
          ) : null}
          <div className="flex min-h-0 flex-1 flex-col">{body}</div>
        </>
      }
      right={
        <RedditNewPostPanel
          key={formKey}
          projectId={projectId}
          accounts={view.accounts}
          start={start}
          onBack={desktop ? undefined : () => setComposing(false)}
          onSent={() => {
            setStart(null)
            setFormKey((count) => count + 1)
            setComposing(false)
            void changed()
          }}
        />
      }
      rightOpen={composing}
      onCloseRight={() => setComposing(false)}
      rightLabel="Show New post"
    >
      {dialogs}
    </ProjectColumns>
  )
}
