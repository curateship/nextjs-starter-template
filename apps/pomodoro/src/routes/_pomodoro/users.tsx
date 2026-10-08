import { createFileRoute } from "@tanstack/react-router"

import { UsersPage } from "@/components/pomodoro/users-page"
import { routeErrorComponent } from "@/components/shell/route-error"
import { readUsersPage } from "@/lib/api/pomodoro/public-profile"
import {
  USER_SEARCH_MAX_LENGTH,
  type UserSort,
} from "@/lib/pomodoro/user-directory"

/**
 * `/users`: a directory of the members who asked to be in one.
 *
 * Under `_pomodoro` like every other screen here, so it draws in the app's
 * own shell. A signed-out visitor sees the same list; being listed is the
 * lister's choice and nothing on the page needs an account.
 *
 * The page number is read from the address so a link to page three is a link
 * to page three, and it is clamped on the server rather than trusted.
 */
export const Route = createFileRoute("/_pomodoro/users")({
  // `page` is left off the address entirely on the first page, so `/people`
  // is its own canonical address and does not redirect to `/people?page=0`.
  // Most focused and an empty search are the defaults, so they are left off
  // the address too.
  validateSearch: (
    search: Record<string, unknown>
  ): { page?: number; sort?: "newest" | "online"; q?: string } => {
    const page = Math.max(0, Math.min(Number(search.page) || 0, 200))
    const q =
      typeof search.q === "string"
        ? search.q.trim().slice(0, USER_SEARCH_MAX_LENGTH)
        : ""
    return {
      ...(page > 0 ? { page } : {}),
      ...(search.sort === "newest" || search.sort === "online"
        ? { sort: search.sort }
        : {}),
      ...(q ? { q } : {}),
    }
  },
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const page = deps.page ?? 0
    const sort: UserSort = deps.sort ?? "focused"
    const search = deps.q ?? ""
    return {
      result: await readUsersPage({ page, sort, search }),
      page,
      sort,
      search,
    }
  },
  errorComponent: routeErrorComponent(
    () => "The directory could not be loaded. Reload to try again."
  ),
  component: UsersRoute,
})

function UsersRoute() {
  const { result, page, sort, search } = Route.useLoaderData()
  return <UsersPage result={result} page={page} sort={sort} search={search} />
}
