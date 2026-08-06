import * as React from "react"
import { SparklesIcon } from "lucide-react"

import { DashboardTable } from "@/components/shared/dashboard-table"
import { DashboardToolbarSearch } from "@/components/shared/dashboard-toolbar"
import {
  getChangelogErrorMessage,
  loadChangelog,
  type ChangelogEntry,
} from "@/lib/api/changelog"
import { formatDate } from "@/lib/format/format-time"

/**
 * What's new: every published update, newest first, in full. This is what a
 * changelog notification opens, and it is the same page for everyone — an admin
 * reading it sees exactly what their users see. Writing them happens on the
 * Changelog page above this one in the sidebar.
 */
export function ChangelogPage({
  initialEntries,
}: {
  initialEntries: ChangelogEntry[]
}) {
  const [entries, setEntries] = React.useState(initialEntries)
  const [searchQuery, setSearchQuery] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)

  const visibleEntries = React.useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return entries
    return entries.filter(
      (entry) =>
        entry.title.toLowerCase().includes(query) ||
        entry.body.toLowerCase().includes(query)
    )
  }, [entries, searchQuery])

  const refresh = React.useCallback(async () => {
    try {
      const data = await loadChangelog()
      setEntries(data.entries)
      setError(null)
    } catch (loadError) {
      setError(getChangelogErrorMessage(loadError))
    }
  }, [])

  return (
    <DashboardTable
      title="What's new"
      icon={<SparklesIcon />}
      count={visibleEntries.length}
      error={error ? { message: error, onRetry: () => void refresh() } : null}
      controls={
        <DashboardToolbarSearch
          name="changelog-search"
          aria-label="Search updates"
          placeholder="Search updates…"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
        />
      }
      content={
        visibleEntries.length ? (
          <div className="flex flex-col gap-6 p-5">
            {visibleEntries.map((entry) => (
              <article key={entry.id} className="flex flex-col gap-1">
                <p className="text-sm font-medium">{entry.title}</p>
                <p className="text-xs text-muted-foreground">
                  {entry.publishedAt
                    ? formatDate(entry.publishedAt)
                    : null}
                </p>
                <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                  {entry.body}
                </p>
              </article>
            ))}
          </div>
        ) : (
          <div className="p-10 text-center text-sm text-muted-foreground">
            {entries.length === 0
              ? "No updates yet."
              : "No updates found matching your search."}
          </div>
        )
      }
      footer={{
        type: "summary",
        count: visibleEntries.length,
        label: "updates",
      }}
    />
  )
}
