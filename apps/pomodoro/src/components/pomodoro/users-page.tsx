import * as React from "react"
import { Link, useNavigate, useRouterState } from "@tanstack/react-router"
import { ArrowRightIcon, SearchIcon } from "lucide-react"
import { toast } from "sonner"

import { ProfilePhoto } from "@/components/pomodoro/profile-photo"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { followProfile, unfollowProfile } from "@/lib/api/pomodoro/following"
import { followErrorMessage } from "@/lib/pomodoro/following"
import { pillTabsList, pillTabsTrigger } from "@/lib/pomodoro/pill-tabs"
import {
  USER_SEARCH_MAX_LENGTH,
  USER_SORT_LABELS,
  USER_SORTS,
  type UserSort,
} from "@/lib/pomodoro/user-directory"
import { showErrorToast } from "@/lib/toast/error-toast"
import type { readUsersPage } from "@/lib/api/pomodoro/public-profile"
import { TextLink } from "@/components/pomodoro/text-link"
import { contentColumn } from "@/lib/pomodoro/content-column"

type UsersResult = Awaited<ReturnType<typeof readUsersPage>>
type DirectoryPerson = UsersResult["rows"][number]

/**
 * `/users`: the members who asked to be listed, drawn to Tyler's design of
 * 8 Oct 2026. A search box and Most focused / Newest beside the title, then a
 * card per person: photo, name, handle and Follow along the top, the bio,
 * and the hours focused with View profile along the foot.
 *
 * Being here takes a second switch on top of having a page at all. A profile
 * somebody switched on but did not list is reachable by its address and
 * appears neither here nor in the sitemap, which is what keeps a public
 * directory a choice rather than a side effect.
 */
export function UsersPage({
  result,
  page,
  sort,
  search,
}: {
  result: UsersResult
  page: number
  sort: UserSort
  search: string
}) {
  const pages = Math.ceil(result.total / result.pageSize)
  const navigate = useNavigate({ from: "/users" })
  const [typed, setTyped] = React.useState(search)

  // The address carries the search, so a typed name is a link. Written a
  // moment after the last key, so typing a name is one load, not one per
  // letter. Any new search starts again at page one.
  React.useEffect(() => {
    const next = typed.trim()
    if (next === search) return
    const timer = window.setTimeout(() => {
      void navigate({
        search: (current) => ({
          ...(current.sort ? { sort: current.sort } : {}),
          ...(next ? { q: next } : {}),
        }),
        replace: true,
      })
    }, 300)
    return () => window.clearTimeout(timer)
  }, [typed, search, navigate])

  return (
    <div className={`${contentColumn} flex flex-col gap-6 py-8`}>
      {/* The search and the order sit on the title's right, as the design
          draws them; the sentence under the title wraps to make room, and
          the pair drops under it only when the page is too narrow. */}
      <header className="flex flex-wrap items-end gap-x-8 gap-y-4">
        <div className="flex min-w-[18rem] flex-1 basis-0 flex-col gap-2">
          <h1 className="text-4xl font-bold tracking-tight">Users</h1>
          <p className="text-muted-foreground">
            Members who chose to be listed. Everyone here switched this on
            themselves.
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
          <label className="relative flex min-w-0 flex-1 items-center sm:w-72 sm:flex-none">
            <span className="sr-only">Search people</span>
            <SearchIcon
              aria-hidden="true"
              className="pointer-events-none absolute left-4 size-4 text-muted-foreground"
            />
            <Input
              type="search"
              value={typed}
              maxLength={USER_SEARCH_MAX_LENGTH}
              placeholder="Search people"
              onChange={(event) => setTyped(event.target.value)}
              className="h-12 rounded-full pl-11 text-base"
            />
          </label>
          <Tabs
            value={sort}
            onValueChange={(value) =>
              void navigate({
                search: (current) => ({
                  ...(value === "newest" || value === "online"
                    ? { sort: value }
                    : {}),
                  ...(current.q ? { q: current.q } : {}),
                }),
              })
            }
          >
            <TabsList aria-label="Order" className={pillTabsList}>
              {USER_SORTS.map((key) => (
                <TabsTrigger key={key} value={key} className={pillTabsTrigger}>
                  {USER_SORT_LABELS[key]}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      </header>

      {!result.rows.length && result.total > 0 ? (
        // A page number past the end, usually typed or from an old link.
        <Card>
          <CardContent className="flex flex-col items-start gap-3 py-6">
            <p className="text-sm text-muted-foreground">
              There is nothing on page {page + 1}. The list has {pages}{" "}
              {pages === 1 ? "page" : "pages"}.
            </p>
            <Button asChild variant="outline" size="sm">
              <Link to="/users" search={{}}>
                Back to page 1
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : !result.rows.length && sort === "online" && !search ? (
        <Card>
          <CardContent className="py-6">
            <p className="text-sm text-muted-foreground">
              Nobody listed is focusing right now. This shows people in the
              middle of a focus who switched on &ldquo;Focusing right
              now&rdquo; on their profile.
            </p>
          </CardContent>
        </Card>
      ) : !result.rows.length && search ? (
        <Card>
          <CardContent className="py-6">
            <p className="text-sm text-muted-foreground">
              Nobody listed matches &ldquo;{search}&rdquo;. The search looks at
              names and handles.
            </p>
          </CardContent>
        </Card>
      ) : !result.rows.length ? (
        <Card>
          <CardContent className="py-6">
            <p className="text-sm text-muted-foreground">
              Nobody is listed yet. Switch on &ldquo;List me on /users&rdquo;
              in{" "}
              <TextLink to="/settings" search={{ tab: "public" }}>
                Settings
              </TextLink>{" "}
              to be the first.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {result.rows.map((person) => (
            <PersonCard key={person.handle} person={person} />
          ))}
        </div>
      )}

      {pages > 1 && result.rows.length ? (
        <nav
          aria-label="Pages of people"
          className="flex items-center justify-between gap-2"
        >
          <PagerButton to={page <= 0 ? null : page - 1}>Previous</PagerButton>
          <span className="text-xs text-muted-foreground">
            Page {page + 1} of {pages}
          </span>
          <PagerButton to={page + 1 >= pages ? null : page + 1}>
            Next
          </PagerButton>
        </nav>
      ) : null}
    </div>
  )
}

/**
 * One person: photo, name (with YOU on your own card), handle and Follow
 * along the top; the bio; then a line across and the hours focused beside
 * View profile.
 */
function PersonCard({ person }: { person: DirectoryPerson }) {
  return (
    <article className="flex flex-col gap-4 rounded-[24px] border bg-[var(--p-surface)] p-6">
      <header className="flex items-center gap-4">
        <ProfilePhoto
          name={person.name}
          avatarUrl={person.avatarUrl}
          className="size-11 text-base"
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 className="flex min-w-0 items-center gap-2 text-lg font-semibold leading-tight">
            <span className="truncate">{person.name}</span>
            {person.mine ? (
              <span className="shrink-0 rounded-full border border-primary/60 px-2 py-px font-mono text-[10px] font-normal tracking-[0.1em] text-[var(--p-accent)]">
                YOU
              </span>
            ) : null}
          </h2>
          <span className="truncate font-mono text-sm text-muted-foreground">
            /u/{person.handle}
          </span>
        </div>
        {person.mine ? null : (
          <FollowButton
            handle={person.handle}
            name={person.name}
            initialFollowing={person.following}
          />
        )}
      </header>
      {/* Takes the spare height, so every card's foot sits on one line. */}
      <p className="line-clamp-2 flex-1 text-[15px] text-foreground/80">
        {person.bio ?? ""}
      </p>
      <footer className="flex items-center gap-3 border-t pt-4">
        {/* Null means they keep their figures private, so the figure is left
            off rather than printing a nought beside their name. */}
        {person.focusHours !== null ? (
          <p className="flex items-baseline gap-2">
            <b className="text-lg font-semibold">
              {person.focusHours.toLocaleString()}
            </b>
            <span className="font-mono text-sm text-muted-foreground">
              hours focused
            </span>
          </p>
        ) : null}
        <Link
          to="/u/$handle"
          params={{ handle: person.handle }}
          aria-label={`View ${person.name}'s profile`}
          className="ml-auto flex items-center gap-1 text-[15px] text-[var(--p-accent)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          View profile
          <ArrowRightIcon className="size-4" aria-hidden="true" />
        </Link>
      </footer>
    </article>
  )
}

const followPill =
  "h-9 rounded-full bg-black px-5 text-[15px] text-white hover:bg-black/80 dark:hover:bg-black/80"

/**
 * Follow on a card, the same three words as the profile's button: Follow,
 * Following, and Unfollow under the pointer or keyboard focus. A signed-out
 * reader's Follow opens the login page and comes back here.
 */
function FollowButton({
  handle,
  name,
  initialFollowing,
}: {
  handle: string
  name: string
  /** Null for a signed-out reader. */
  initialFollowing: boolean | null
}) {
  const here = useRouterState({ select: (state) => state.location.href })
  const [following, setFollowing] = React.useState(initialFollowing)
  const [busy, setBusy] = React.useState(false)

  if (following === null)
    return (
      <Button asChild className={followPill}>
        <Link to="/login" search={{ redirect: here }}>
          Follow
        </Link>
      </Button>
    )

  const toggle = async () => {
    setBusy(true)
    try {
      const next = following
        ? await unfollowProfile(handle)
        : await followProfile(handle)
      setFollowing(next.following)
      // One press undoes a follow, so the toast is the confirmation it was
      // meant.
      if (following && !next.following) toast.success(`You unfollowed ${name}.`)
    } catch (cause) {
      showErrorToast(followErrorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  return following ? (
    <Button
      variant="outline"
      className="group/follow h-9 min-w-28 rounded-full px-5 text-[15px]"
      disabled={busy}
      aria-label={`Unfollow ${name}`}
      onClick={() => void toggle()}
    >
      <span className="group-hover/follow:hidden group-focus-visible/follow:hidden">
        Following
      </span>
      <span className="hidden group-hover/follow:inline group-focus-visible/follow:inline">
        Unfollow
      </span>
    </Button>
  ) : (
    <Button
      className={followPill}
      disabled={busy}
      aria-label={`Follow ${name}`}
      onClick={() => void toggle()}
    >
      Follow
    </Button>
  )
}

/**
 * Previous or Next. At the end it is a real disabled button, not a link with
 * `disabled` on it: a link has no disabled state, so the grey one used to
 * still go to an empty page.
 */
function PagerButton({
  to,
  children,
}: {
  /** The page to go to, or null at the end. */
  to: number | null
  children: React.ReactNode
}) {
  if (to === null)
    return (
      <Button variant="outline" size="sm" disabled>
        {children}
      </Button>
    )
  return (
    <Button asChild variant="outline" size="sm">
      {/* Keeps the order and the search, and changes only the page. */}
      <Link
        from="/users"
        to="/users"
        search={(current) => ({
          ...(current.sort ? { sort: current.sort } : {}),
          ...(current.q ? { q: current.q } : {}),
          ...(to > 0 ? { page: to } : {}),
        })}
      >
        {children}
      </Link>
    </Button>
  )
}
