import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { FlaskConicalIcon, PauseIcon, PlayIcon, ServerIcon } from "lucide-react"

import type { RackWindows } from "@/components/anti-detect/rack-blocks"
import type { CrmFrame } from "@/components/crm/crm-frame"
import { PhonePanel } from "@/components/phones/phone-panel"
import { RackPhonesPanel } from "@/components/phones/rack-phones-panel"
import { ResumeRackDialog } from "@/components/phones/resume-rack-dialog"
import { SelfTestDialog } from "@/components/phones/self-test-dialog"
import { FoldingMenu, MenuAction } from "@/components/shared/folding-menu"
import { PanelReopenButton } from "@/components/shared/three-panels"
import { ErrorRow } from "@/components/ui/error-row"
import { NO_GROUP, type AntiDetectSearch } from "@/lib/anti-detect/search"
import { getPhoneErrorMessage, loadPhonesPage, pauseRack, type PhoneRecord, type PhonesPage } from "@/lib/api/phones/phones"
import { loadSavedViews } from "@/lib/api/saved-views"
import { useLoad } from "@/lib/hooks/use-load"
import { useSyncedDraft } from "@/lib/hooks/use-synced-draft"
import { useListSearchNavigate, useOpenRecord } from "@/lib/nav/list-search"
import { rackRows } from "@/lib/phones/rack-rows"
import { RACK_VIEW_KIND, type RackSearch } from "@/lib/phones/rack-search"
import { showErrorToast } from "@/lib/toast/error-toast"

/** The racks check in every 15 seconds, so the phones are read again every 10 while the list is in view. */
const REFRESH_MS = 10_000

/** The phones a Rack filter and a picked project leave: one rack's, the ones on no rack, or every one. */
export function phonesInView(page: Pick<PhonesPage, "phones">, rack: string | undefined, projectPhones: ReadonlySet<string> | null): PhoneRecord[] {
  return page.phones.filter(
    (phone) =>
      (!rack || (rack === NO_GROUP ? !phone.rackId : phone.rackId === rack)) && (!projectPhones || projectPhones.has(phone.id))
  )
}

/** The dashboard's address as the phones list reads it: the phone kind is `phoneKind` here, since Bans has `kind`. */
function rackSearchOf(search: AntiDetectSearch): RackSearch {
  return {
    open: search.open,
    list: search.list,
    q: search.q,
    status: search.status,
    kind: search.phoneKind,
    carrier: search.carrier,
    wipe: search.wipe,
    banned: search.banned,
    folder: search.folder,
    label: search.label,
    tag: search.tag,
    group: search.group,
  }
}

/**
 * The Anti Detect dashboard's Phones (Tyler, 12 Nov 2026: "I dont think a
 * rack needs its own dashboard. The racks dashboard should list all the
 * phones and the phones can just be filtered by rack tags. So rack name on
 * the dashboard can be renamed to \"Phones\" and in phones dashboard can be
 * filtered by racks").
 *
 * - **Middle:** every phone on every rack in the phones list a rack's page
 *   had: its tabs, Mass select, search, Filter, saved views and New phone.
 *   The Racks block on the left page picks one rack (`?rack=`, or No rack),
 *   and then the Wall and Jobs tabs, a rack's own, show too. The ⋮ holds New
 *   rack, Pause or Resume every rack, and Self-test and app updates.
 * - **Right:** the open phone with its live screen, as on a rack's page.
 * - The Projects block narrows the list to the phones a project's accounts
 *   are on, so the list's own Project filter is not offered here.
 */
export function PhonesSection({
  initial,
  search,
  projectPhones,
  rackWindows,
  frame,
}: {
  initial: PhonesPage
  search: AntiDetectSearch
  /** The phones a picked project's accounts are on, or null with no project picked. */
  projectPhones: ReadonlySet<string> | null
  rackWindows: RackWindows
  frame: CrmFrame
}) {
  const router = useRouter()
  const setListSearch = useListSearchNavigate()
  const setOpen = useOpenRecord()
  // Its own copy, read again every 10 seconds; a new read of the route replaces it.
  const [page, setPage] = useSyncedDraft(initial)
  const [error, setError] = React.useState<string | null>(null)
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [selfTestOpen, setSelfTestOpen] = React.useState(false)
  const [resuming, setResuming] = React.useState(false)

  const refresh = React.useCallback(
    async (everywhere = true) => {
      try {
        setPage(await loadPhonesPage())
        setError(null)
        if (everywhere) void router.invalidate()
      } catch (failure) {
        setError(getPhoneErrorMessage(failure))
      }
    },
    [router, setPage]
  )

  React.useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh(false)
    }, REFRESH_MS)
    return () => clearInterval(timer)
  }, [refresh])

  const rackId = search.rack && search.rack !== NO_GROUP && page.racks.some((rack) => rack.id === search.rack) ? search.rack : null
  // The list's own Project filter gives way to the Projects block.
  const shownPage = { ...page, phones: phonesInView(page, search.rack, projectPhones), projects: [] }
  const rackSearch = rackSearchOf(search)
  const onSearch = (patch: Partial<RackSearch>) => {
    // The list's own Project filter is not offered here, so a saved view's project is dropped.
    const { kind, project: _project, ...rest } = patch
    setListSearch({ ...rest, ...("kind" in patch ? { phoneKind: kind } : {}) })
  }

  const views = useLoad(() => loadSavedViews(`${RACK_VIEW_KIND}:${rackId ?? "all"}`), getPhoneErrorMessage, {
    keys: [rackId],
  })

  const ids = rackRows(shownPage, rackSearch).flatMap((group) => group.phones.map((phone) => phone.id))
  const openPhone = page.phones.find((phone) => phone.id === search.open) ?? null

  // The right panel is never left empty: a filter that leaves the open phone
  // out of the list opens the list's first phone instead.
  const firstId = ids[0]
  const openInList = Boolean(search.open && ids.includes(search.open))
  React.useEffect(() => {
    if (firstId && !openInList) setListSearch({ open: firstId })
  }, [firstId, openInList, setListSearch])
  const [pressedId, setPressedId] = React.useState<string>()
  const pick = (phoneId: string) => {
    setPressedId(phoneId)
    setOpen(phoneId)
  }

  async function pause() {
    try {
      await pauseRack()
      await refresh()
    } catch (failure) {
      showErrorToast(getPhoneErrorMessage(failure))
    }
  }

  const then = (action: () => void) => () => {
    setMenuOpen(false)
    action()
  }

  const middle = (
    <div className="@container flex h-full min-h-0 flex-col overflow-hidden bg-card">
      <RackPhonesPanel
        page={shownPage}
        rackId={rackId}
        start={<PanelReopenButton side="left" label="Show the page" />}
        end={<PanelReopenButton side="right" label="Show the phone" />}
        menu={
          <FoldingMenu label="More for phones" fit align="end" open={menuOpen} onOpenChange={setMenuOpen}>
            <MenuAction icon={<ServerIcon className="size-4" />} onClick={then(rackWindows.newRack)}>
              New rack
            </MenuAction>
            {page.pausedAt ? (
              <MenuAction icon={<PlayIcon className="size-4" />} onClick={then(() => setResuming(true))}>
                Resume every rack
              </MenuAction>
            ) : (
              <MenuAction icon={<PauseIcon className="size-4" />} onClick={then(() => void pause())}>
                Pause every rack
              </MenuAction>
            )}
            <MenuAction icon={<FlaskConicalIcon className="size-4" />} onClick={then(() => setSelfTestOpen(true))}>
              Self-test and app updates
            </MenuAction>
          </FoldingMenu>
        }
        search={rackSearch}
        views={views.data ?? []}
        onSearch={onSearch}
        onOpen={pick}
        onChanged={() => refresh()}
      />
      {page.pausedAt ? (
        <p className="flex shrink-0 items-center gap-2 border-t px-6 py-2 text-sm">
          <PauseIcon className="size-4 shrink-0" aria-hidden />
          Every rack is paused. Nothing runs on a phone until it is resumed from the ⋮.
        </p>
      ) : null}
      {error ? (
        <div className="px-6 py-3">
          <ErrorRow message={error} onRetry={() => void refresh()} />
        </div>
      ) : null}
    </div>
  )

  return frame({
    ids,
    showMiddleFor: `${search.rack ?? ""}|${search.q ?? ""}|${search.list ?? ""}`,
    showRightFor: pressedId && pressedId === search.open ? pressedId : undefined,
    middle,
    right: {
      label: "Phone",
      showLabel: "Show the phone",
      content: (
        <PhonePanel
          key={openPhone?.id ?? "none"}
          phone={openPhone}
          page={page}
          onChanged={() => refresh()}
          onDeleted={(phoneId) => {
            // The next phone down opens, or the one above the last (part 117).
            const at = ids.indexOf(phoneId)
            setListSearch({ open: ids[at + 1] ?? ids[at - 1] })
            void refresh()
          }}
        />
      ),
    },
    windows: (
      <>
        <SelfTestDialog open={selfTestOpen} phones={page.phones} onClose={() => setSelfTestOpen(false)} onChanged={() => refresh()} />
        <ResumeRackDialog
          open={resuming}
          onClose={() => setResuming(false)}
          onResumed={async () => {
            setResuming(false)
            await refresh()
          }}
        />
      </>
    ),
  })
}
