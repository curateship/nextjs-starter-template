import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { SearchIcon } from "lucide-react"

import { ProjectDot, StatusBadge } from "@/components/project/task-bits"
import { DashboardToolbarSearch } from "@/components/shared/dashboard-toolbar"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogToolbar,
} from "@/components/ui/dialog"
import { ErrorRow } from "@/components/ui/error-row"
import { LoadingRow } from "@/components/ui/loading-row"
import type { AppHeaderActionProps } from "@/lib/app-options"
import { searchProjectTasks, type SearchHit } from "@/lib/api/project/finding"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { LIMITS } from "@/lib/project/rules"

/** How long typing pauses before the search goes out. */
const PAUSE_MS = 250

type Found =
  | { state: "idle" }
  | { state: "loading"; q: string; hits: SearchHit[] }
  | { state: "ready"; q: string; hits: SearchHit[] }
  | { state: "error"; q: string; message: string }

/**
 * Search in the signed-in header, beside New task: one box for every project
 * the person can see and their own "Just me" list, so "where was that task
 * about the logo?" is one step. It looks through titles and notes, every
 * word typed, and lists up to 20 matches with their project. A match opens on
 * its project page. Tasks in the bin never show.
 */
export default function TaskSearchHeader(_props: AppHeaderActionProps) {
  const [open, setOpen] = React.useState(false)
  return (
    <>
      <Button
        type="button"
        variant="outline"
        data-icon="inline-start"
        className="justify-start text-muted-foreground lg:w-56"
        onClick={() => setOpen(true)}
      >
        <SearchIcon className="size-4" />
        Search tasks…
      </Button>
      <SearchDialog open={open} onClose={() => setOpen(false)} />
    </>
  )
}

function SearchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const [q, setQ] = React.useState("")
  const [found, setFound] = React.useState<Found>({ state: "idle" })
  const [tries, setTries] = React.useState(0)
  const searchId = React.useId()
  const words = q.trim()

  React.useEffect(() => {
    if (!words) return
    let live = true
    const timer = window.setTimeout(() => {
      setFound((current) => ({
        state: "loading",
        q: words,
        hits: current.state === "ready" || current.state === "loading" ? current.hits : [],
      }))
      searchProjectTasks(words).then(
        (hits) => {
          if (live) setFound({ state: "ready", q: words, hits })
        },
        (failure: unknown) => {
          if (live) setFound({ state: "error", q: words, message: getProjectErrorMessage(failure) })
        }
      )
    }, PAUSE_MS)
    return () => {
      live = false
      window.clearTimeout(timer)
    }
  }, [words, tries])

  function close() {
    onClose()
    setQ("")
    setFound({ state: "idle" })
  }

  function openHit(hit: SearchHit) {
    close()
    void navigate({
      to: "/projects/$projectId",
      params: { projectId: hit.project.id },
      search: { task: hit.id },
    })
  }

  const hits = found.state === "ready" || found.state === "loading" ? found.hits : []
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : close())}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Search every project</DialogTitle>
          <DialogDescription>
            Titles and notes in every project you're on, and your own Just me list.
          </DialogDescription>
        </DialogHeader>
        <DialogToolbar className="px-6 pb-4">
          <label htmlFor={searchId} className="sr-only">
            Search tasks
          </label>
          <DashboardToolbarSearch
            id={searchId}
            className="sm:flex-1"
            inputClassName="sm:w-full lg:w-full"
            placeholder="Search tasks…"
            autoFocus
            value={q}
            onChange={(event) => setQ(event.target.value)}
            onKeyDown={(event) => {
              // Enter opens the first match, so a known title is two keys away.
              if (event.key === "Enter" && hits[0]) {
                event.preventDefault()
                openHit(hits[0])
              }
            }}
          />
        </DialogToolbar>
        <DialogBody className="gap-0 pt-0">
          {!words ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Type a word from a task's title or notes.
            </p>
          ) : found.state === "error" ? (
            <ErrorRow message={found.message} onRetry={() => setTries((n) => n + 1)} />
          ) : hits.length === 0 && found.state !== "ready" ? (
            <LoadingRow label="Searching…" />
          ) : hits.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No tasks match "{found.state === "ready" ? found.q : words}".
            </p>
          ) : (
            <>
              <ul className="-mx-2 grid gap-0.5" aria-label="Matching tasks" aria-busy={found.state === "loading"}>
                {hits.map((hit) => (
                  <li key={hit.id}>
                    <button
                      type="button"
                      onClick={() => openHit(hit)}
                      className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      <span className="grid min-w-0 flex-1 gap-0.5">
                        <span className="truncate font-medium">{hit.title}</span>
                        <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                          <ProjectDot color={hit.project.color} className="size-2" />
                          <span className="truncate">
                            {hit.project.name}
                            {hit.project.archived ? " · Archived" : ""}
                          </span>
                        </span>
                      </span>
                      <StatusBadge status={hit.status} />
                    </button>
                  </li>
                ))}
              </ul>
              {hits.length >= LIMITS.searchResults ? (
                <p className="pt-3 text-xs text-muted-foreground">
                  Showing the first {LIMITS.searchResults}. Add another word to narrow it down.
                </p>
              ) : null}
            </>
          )}
        </DialogBody>
        <DialogFooter>
          <Button type="button" onClick={close}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
