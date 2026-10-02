import { Link } from "@tanstack/react-router"

import { ProfilePhoto } from "@/components/pomodoro/profile-photo"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { readUsersPage } from "@/lib/api/pomodoro/public-profile"

type UsersResult = Awaited<ReturnType<typeof readUsersPage>>

/**
 * `/users`: the members who asked to be listed.
 *
 * Being here takes a second switch on top of having a page at all. A profile
 * somebody switched on but did not list is reachable by its address and
 * appears neither here nor in the sitemap, which is what keeps a public
 * directory a choice rather than a side effect.
 *
 * Newest first, never by activity. Tyler's call, 2 Oct 2026: ranking it would
 * make a second leaderboard and bury everybody with a quiet week.
 */
export function UsersPage({
  result,
  page,
}: {
  result: UsersResult
  page: number
}) {
  const pages = Math.ceil(result.total / result.pageSize)

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 py-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Users</h1>
        <p className="text-sm text-muted-foreground">
          Members who chose to be listed. Everyone here switched this on
          themselves.
        </p>
      </header>

      {!result.rows.length ? (
        <Card>
          <CardContent className="py-6">
            <p className="text-sm text-muted-foreground">
              Nobody is listed yet. Switch on &ldquo;List me on /users&rdquo;
              in Settings to be the first.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {result.rows.map((person) => (
            <Card key={person.handle}>
              <CardHeader className="flex-row items-center gap-3">
                <ProfilePhoto
                  name={person.name}
                  avatarUrl={person.avatarUrl}
                  className="size-10"
                />
                <div className="flex min-w-0 flex-col">
                  <CardTitle className="truncate">
                    <Link
                      to="/u/$handle"
                      params={{ handle: person.handle }}
                      className="underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {person.name}
                    </Link>
                  </CardTitle>
                  <span className="truncate font-mono text-xs text-muted-foreground">
                    /u/{person.handle}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {person.bio ? (
                  <p className="line-clamp-2 text-sm text-muted-foreground">
                    {person.bio}
                  </p>
                ) : null}
                {/* Zero means they keep their figures private, so the line is
                    left off rather than printing a nought beside their name. */}
                {person.focusHours > 0 ? (
                  <p className="font-mono text-sm">
                    {person.focusHours.toLocaleString()}{" "}
                    <span className="text-xs text-muted-foreground">
                      hours focused
                    </span>
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {pages > 1 ? (
        <nav className="flex items-center justify-between gap-2">
          <Button asChild variant="outline" size="sm" disabled={page <= 0}>
            <Link
              to="/users"
              search={page - 1 > 0 ? { page: page - 1 } : {}}
            >
              Previous
            </Link>
          </Button>
          <span className="text-xs text-muted-foreground">
            Page {page + 1} of {pages}
          </span>
          <Button
            asChild
            variant="outline"
            size="sm"
            disabled={page + 1 >= pages}
          >
            <Link to="/users" search={{ page: page + 1 }}>
              Next
            </Link>
          </Button>
        </nav>
      ) : null}
    </div>
  )
}
