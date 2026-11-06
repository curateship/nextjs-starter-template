import * as React from "react"
import { Link, useNavigate, useRouter } from "@tanstack/react-router"
import { PauseCircleIcon, ServerIcon } from "lucide-react"
import { toast } from "sonner"

import { PhonePanel } from "@/components/phones/phone-panel"
import { RackPanel } from "@/components/phones/rack-panel"
import { RackPhonesPanel } from "@/components/phones/rack-phones-panel"
import { ResumeRackDialog } from "@/components/phones/resume-rack-dialog"
import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { ThreePanels } from "@/components/shared/three-panels"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { WorkspacePanel } from "@/components/ui/resizable"
import {
  disconnectPhoneRack,
  getPhoneErrorMessage,
  removeRacks,
  type RackPageAnswer,
} from "@/lib/api/phones/phones"
import type { SavedView } from "@/lib/api/saved-views"
import { formatTimeAgo } from "@/lib/format/format-time"
import { RACK_PANEL_LAYOUT_KEY, rackPlaceKey } from "@/lib/phones/panel-keys"
import { rackRows } from "@/lib/phones/rack-rows"
import type { RackSearch } from "@/lib/phones/rack-search"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * The rack checks in every 15 seconds and a phone counts as offline after 45,
 * so the page is read again every 10 seconds while it is in view. A phone
 * plugged in or pulled out shows within a minute, and the open phone on the
 * right follows the same read (part 110).
 */
const REFRESH_MS = 10_000

/**
 * One rack's page (Racks dashboard, parts 84 to 118; Tyler, 5 Nov 2026:
 * "rack name (3 panel dashboard): left panel rack details, middle phones
 * (header create new phone), left panel phone detail and screen"). The shell's
 * three-column frame: the rack on the left, its phones in the middle, the
 * open phone and its live screen on the right. The first phone opens on
 * arrival and the page goes back to where it was (`useDashboardPlace`), one
 * place per rack.
 *
 * Pause stops every rack at once, so while it is on a line across the top of
 * every rack's page says so, with Resume (part 88).
 */
export function RackWorkspace({ answer, views, search }: { answer: RackPageAnswer; views: SavedView[]; search: RackSearch }) {
  if (answer.missing) return <MissingRack />
  return <RackPageFrame key={answer.page.rack.id} page={answer.page} views={views} search={search} />
}

/** A link to a rack that has gone, or was never this person's (part 86). */
function MissingRack() {
  return (
    <WorkspacePanel className="flex flex-1 flex-col">
      <DashboardCardTitleHeader back={{ label: "All racks", to: "/admin/racks" }} title="Rack" />
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground">
        <ServerIcon className="size-6" aria-hidden />
        <p>That rack is not there any more.</p>
        <Button asChild variant="outline">
          <Link to="/admin/racks">Back to Racks</Link>
        </Button>
      </div>
    </WorkspacePanel>
  )
}

function RackPageFrame({
  page,
  views,
  search,
}: {
  page: Extract<RackPageAnswer, { missing: false }>["page"]
  views: SavedView[]
  search: RackSearch
}) {
  const router = useRouter()
  const navigate = useNavigate()
  const [resuming, setResuming] = React.useState(false)
  const [disconnecting, setDisconnecting] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const rack = page.rack

  const refresh = React.useCallback(async () => {
    try {
      await router.invalidate()
    } catch (error) {
      showErrorToast(getPhoneErrorMessage(error))
    }
  }, [router])

  React.useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void router.invalidate().catch(() => {})
    }, REFRESH_MS)
    return () => clearInterval(timer)
  }, [router])

  /** A filter, a tab or the search into the address, replacing rather than stacking. */
  const onSearch = React.useCallback(
    (patch: Partial<RackSearch>) =>
      void navigate({
        to: ".",
        replace: true,
        search: (previous: Record<string, unknown>) => {
          const next: Record<string, unknown> = { ...previous, ...patch }
          for (const key of Object.keys(next)) if (next[key] === undefined) delete next[key]
          return next
        },
      }),
    [navigate]
  )

  /** Opening a phone is a step of its own, so Back goes to the phone before. */
  const openPhone = React.useCallback(
    (phoneId: string) =>
      void navigate({
        to: ".",
        search: (previous: Record<string, unknown>) => ({ ...previous, open: phoneId }),
      }),
    [navigate]
  )

  const shownIds = rackRows(page, search).flatMap((group) => group.phones.map((phone) => phone.id))
  const phone = page.phones.find((one) => one.id === search.open) ?? null

  // A phone that left this rack since the link was made, or was deleted
  // elsewhere, gives way to the first one, so the right panel never sits empty.
  const firstId = shownIds[0] ?? page.phones[0]?.id
  React.useEffect(() => {
    if (search.open && !phone && firstId) {
      void navigate({ to: ".", replace: true, search: (previous: Record<string, unknown>) => ({ ...previous, open: firstId }) })
    }
  }, [firstId, navigate, phone, search.open])

  async function disconnect() {
    setBusy(true)
    try {
      await disconnectPhoneRack(rack.id)
      toast.success(`${rack.name} is disconnected.`)
      setDisconnecting(false)
      await refresh()
    } catch (error) {
      showErrorToast(getPhoneErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    try {
      const { deleted, kept } = await removeRacks([rack.id])
      if (kept.length) {
        showErrorToast(kept[0].reason)
        return
      }
      if (deleted.length) toast.success(`${rack.name} is deleted. Its phones are under Not on a rack.`)
      setDeleting(false)
      void navigate({ to: "/admin/racks" })
    } catch (error) {
      showErrorToast(getPhoneErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {page.pausedAt ? (
        <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border bg-amber-500/10 px-3 py-2 text-sm">
          <PauseCircleIcon className="size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
          <span className="min-w-0 flex-1">
            All phone jobs are paused, on every rack, since {formatTimeAgo(page.pausedAt)}. Running ones finished.
          </span>
          <Button type="button" size="sm" variant="outline" onClick={() => setResuming(true)}>
            Resume
          </Button>
        </div>
      ) : null}
      <ThreePanels
        layoutKey={RACK_PANEL_LAYOUT_KEY}
        place={{ key: rackPlaceKey(rack.id), search, ids: shownIds }}
        showRightFor={search.open}
        left={{
          label: "Rack",
          showLabel: "Show the rack",
          content: (
            <RackPanel
              page={page}
              search={search}
              onSearch={onSearch}
              onOpenPhone={(phoneId) => openPhone(phoneId)}
              onChanged={refresh}
              onDisconnect={() => setDisconnecting(true)}
              onDelete={() => setDeleting(true)}
            />
          ),
        }}
        middle={{
          label: "Phones",
          content: (
            <RackPhonesPanel page={page} search={search} views={views} onSearch={onSearch} onOpen={openPhone} onChanged={refresh} />
          ),
        }}
        right={{
          label: "Phone",
          showLabel: "Show the phone",
          content: (
            <PhonePanel
              phone={phone}
              page={page}
              onChanged={refresh}
              onDeleted={(phoneId) => {
                // The next phone down opens, or the one above the last (part 117).
                const at = shownIds.indexOf(phoneId)
                const next = shownIds[at + 1] ?? shownIds[at - 1]
                onSearch({ open: next })
              }}
            />
          ),
        }}
      >
        <ResumeRackDialog
          open={resuming}
          onClose={() => setResuming(false)}
          onResumed={async () => {
            setResuming(false)
            await refresh()
          }}
        />
        <ConfirmDialog
          open={disconnecting}
          onOpenChange={setDisconnecting}
          title={`Disconnect ${rack.name}?`}
          description="Its key stops working at once. Its phones go offline, waiting checks are cancelled, and nothing reaches the phones until it is installed again with a new code from this page. The phone records and the accounts on them stay."
          confirmLabel="Disconnect rack"
          loading={busy}
          onConfirm={() => void disconnect()}
        />
        <ConfirmDialog
          open={deleting}
          onOpenChange={setDeleting}
          title={`Delete ${rack.name}?`}
          description="The rack goes. Its phones move to Not on a rack, and keep their history, readings and finished actions. Nothing on the phones changes."
          confirmLabel="Delete rack"
          loading={busy}
          onConfirm={() => void remove()}
        />
      </ThreePanels>
    </div>
  )
}
