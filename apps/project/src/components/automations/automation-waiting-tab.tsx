import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { HandIcon } from "lucide-react"

import { RunRecord } from "@/components/automations/run-record"
import { RunsTable } from "@/components/automations/runs-table"
import type { CrmFrame } from "@/components/crm/crm-frame"
import { CrmListHeader } from "@/components/crm/crm-row"
import { EmptyRecord } from "@/components/crm/record-frame"
import { Button } from "@/components/ui/button"
import {
  getAutomationRunErrorMessage,
  listWaitingRuns,
  type AutomationRunsPage,
} from "@/lib/api/automations/automation-runs"
import type { AutomationsSearch } from "@/lib/automations/automations-search"
import { useListSearchNavigate, useOpenRecord } from "@/lib/nav/list-search"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * The Automations dashboard's Waiting on you section (Tyler, 9 Nov 2026: "a
 * dashboard that list all the waiting on me steps"): every run stopped at an
 * approval step, the closest deadline first, in the runs table, and the open
 * run on the right (`RunRecord`) with Reject and Approve in its footer. A
 * decided run leaves the list and the next one opens. Search looks through
 * the flow's name and who the run was about.
 *
 * Runs had a section of their own beside it until Tyler picked "Only the
 * flow's Runs tab" the same day; every run is now on its own flow's canvas.
 *
 * The first page comes from the route's loader; Load more adds the next.
 */
export function AutomationWaitingTab({
  page,
  search,
  heading,
  headingEnd,
  frame,
  onOpenFlow,
}: {
  page: AutomationRunsPage
  search: AutomationsSearch
  heading: React.ReactNode
  headingEnd: React.ReactNode
  frame: CrmFrame
  onOpenFlow: (automationId: string) => void
}) {
  const router = useRouter()
  const setListSearch = useListSearchNavigate()
  const setOpen = useOpenRecord()
  const q = search.q ?? ""

  // The first page from the loader; Load more appends. A fresh loader result
  // replaces the lot, checked while drawing so it is in the first paint.
  const [runs, setRuns] = React.useState(page.runs)
  const [total, setTotal] = React.useState(page.total)
  const [lastLoaded, setLastLoaded] = React.useState(page)
  if (lastLoaded !== page) {
    setLastLoaded(page)
    setRuns(page.runs)
    setTotal(page.total)
  }
  const [loadingMore, setLoadingMore] = React.useState(false)

  const loadMore = async () => {
    if (loadingMore) return
    setLoadingMore(true)
    try {
      const next = await listWaitingRuns({ search: q || undefined, offset: runs.length })
      // By id: a run starting mid-scroll moves the list on the server.
      setRuns((current) => {
        const seen = new Set(current.map((run) => run.id))
        return [...current, ...next.runs.filter((run) => !seen.has(run.id))]
      })
      setTotal(next.total)
    } catch (error) {
      showErrorToast(getAutomationRunErrorMessage(error))
    } finally {
      setLoadingMore(false)
    }
  }

  const ids = runs.map((run) => run.id)
  // A link's own run opens even when it is not on this page of the list.
  const openId = search.open ?? ids[0]
  const openRow = runs.find((run) => run.id === openId) ?? null
  const reload = () => void router.invalidate()
  const narrowed = Boolean(q.trim())
  const noun = "waiting runs"

  const middle = (
    <div className="@container flex h-full min-h-0 flex-col overflow-hidden bg-card">
      <CrmListHeader
        tabs={heading}
        end={headingEnd}
        menuLabel={`More for ${noun}`}
        search={{
          name: "waiting-run-search",
          label: `Search ${noun}`,
          placeholder: `Search ${noun}`,
          value: q,
          onChange: (text) => setListSearch({ q: text.trim() ? text : undefined, open: undefined }),
        }}
        massSelect={null}
      />
      <RunsTable
        mode="waiting"
        runs={runs}
        total={total}
        openId={openId}
        loadingMore={loadingMore}
        onOpen={(runId) => setOpen(runId)}
        onLoadMore={() => void loadMore()}
        empty={
          narrowed ? (
            <span className="grid justify-items-center gap-2">
              {`No waiting run matches "${q.trim()}".`}
              <Button type="button" variant="outline" size="sm" onClick={() => setListSearch({ q: undefined, open: undefined })}>
                Clear search
              </Button>
            </span>
          ) : (
            "Nothing is waiting on you. A run that stops at an approval step shows here."
          )
        }
      />
    </div>
  )

  return frame({
    ids,
    showMiddleFor: `waiting|${q}`,
    showRightFor: search.open,
    middle,
    right: {
      label: "Run",
      showLabel: "Show the run",
      content: openId ? (
        <RunRecord
          key={openId}
          runId={openId}
          fallback={openRow}
          onChanged={() => {
            // The list is read again first, then a decided run gives way to
            // the next one: opening the next straight away cancelled the read,
            // and the decided run stayed in the list.
            void router.invalidate().then(() => {
                const rest = ids.filter((id) => id !== openId)
              const at = Math.min(Math.max(0, ids.indexOf(openId)), rest.length - 1)
              setOpen(rest[at])
            })
          }}
          onDeleted={() => {
            setOpen(undefined)
            reload()
          }}
          onOpenFlow={onOpenFlow}
        />
      ) : (
        <EmptyRecord
          title="Run"
          icon={<HandIcon aria-hidden />}
          line={narrowed ? "No waiting run matches." : "Nothing is waiting on you."}
          hideLabel="Hide the run"
        />
      ),
    },
  })
}
