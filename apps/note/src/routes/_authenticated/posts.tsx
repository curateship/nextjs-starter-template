import { createFileRoute } from "@tanstack/react-router"

import { PostsPage } from "@/components/note-posts/posts-page"
import { routeErrorComponent } from "@/components/shell/route-error"
import { loadPostFolders } from "@/lib/api/note/post-folders"
import { getPostErrorMessage, loadPostAuthors, loadPosts } from "@/lib/api/note/posts"
import { PLAN_PROGRESS_FILTERS, type PlanProgress } from "@/lib/note/posts/posts"
import { NO_FOLDER, type FolderScope } from "@/lib/note/videos"

const ID = /^[\w-]{1,36}$/
const HANDLE = /^[A-Za-z0-9_]{1,15}$/

function readFolder(value: unknown): FolderScope {
  if (value === NO_FOLDER) return NO_FOLDER
  return typeof value === "string" && ID.test(value) ? value : undefined
}

function readSearch(search: Record<string, unknown>) {
  return {
    folder: readFolder(search.folder),
    author: typeof search.author === "string" && HANDLE.test(search.author) ? search.author : undefined,
    tag:
      typeof search.tag === "string" && search.tag.trim() && search.tag.length <= 60 ? search.tag.trim() : undefined,
    progress: PLAN_PROGRESS_FILTERS.includes(search.progress as PlanProgress)
      ? (search.progress as PlanProgress)
      : undefined,
    open: typeof search.open === "string" && ID.test(search.open) ? search.open : undefined,
    // The Save from x.com button's link. Only ever read as a post's address.
    save: typeof search.save === "string" && search.save.length <= 2048 ? search.save : undefined,
  }
}

/**
 * The posts dashboard. Here rather than under `/admin`, so every signed-in
 * member gets it, like Videos and Notes. The folder, author, tag, plan filter
 * and picked post live in the address, so a reload and a bell notice come back
 * to the same place.
 */
export const Route = createFileRoute("/_authenticated/posts")({
  validateSearch: readSearch,
  // Picking a filter or a post never reloads the page under it; the screen
  // asks for what it needs itself.
  loaderDeps: () => ({}),
  loader: async ({ location }) => {
    const { folder, author, tag, progress } = readSearch(location.search as Record<string, unknown>)
    const [folders, authors, page] = await Promise.all([
      loadPostFolders(),
      loadPostAuthors(),
      loadPosts({ folder, author, tag, progress }),
    ])
    return { folders, authors, page, filters: { folder, author, tag, progress } }
  },
  component: PostsRoute,
  errorComponent: routeErrorComponent(getPostErrorMessage),
})

function PostsRoute() {
  const search = Route.useSearch()
  return (
    <PostsPage
      initial={Route.useLoaderData()}
      filters={{ folder: search.folder, author: search.author, tag: search.tag, progress: search.progress }}
      open={search.open}
      save={search.save}
    />
  )
}
