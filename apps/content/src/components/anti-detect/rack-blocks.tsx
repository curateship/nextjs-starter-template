import * as React from "react"
import { ServerIcon, SmartphoneIcon } from "lucide-react"

import { RackSettingsDialog } from "@/components/anti-detect/rack-settings-dialog"
import { NewRackDialog } from "@/components/phones/new-rack-dialog"
import { RackPairing } from "@/components/phones/rack-pairing"
import { blockView, useBlockCount, useBlockMenu } from "@/components/shared/notes/block-card"
import { blockNode, type AppBlock } from "@/components/shared/notes/note-block-nodes"
import { SideRows } from "@/components/shared/notes/side-rows"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ANTI_DETECT_PHONE_COUNTS_NODE, ANTI_DETECT_RACKS_NODE } from "@/lib/anti-detect/page"
import { NO_GROUP } from "@/lib/anti-detect/search"
import {
  disconnectPhoneRack,
  getPhoneErrorMessage,
  removeRacks,
  type PhoneRecord,
  type PhonesPage,
  type RackView,
} from "@/lib/api/phones/phones"
import { formatDateTime, formatTimeAgo } from "@/lib/format/format-time"
import { PHONE_STATUS_WORDS, type PhoneStatus } from "@/lib/phones/options"
import { STATUS_DOT } from "@/lib/phones/status-dot"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

/**
 * The rack blocks on the Anti Detect dashboard's left page (Tyler, 12 Nov
 * 2026: "all of these can be blocks", of a rack's Phones, Rack program,
 * Shelf and Mix; then "I dont think a rack needs its own dashboard. The
 * racks dashboard should list all the phones and the phones can just be
 * filtered by rack"). They were the cards on a rack's own page, which is
 * gone.
 *
 * - **Racks** lists every rack, and "No rack" while a phone has none; a press
 *   shows that rack's phones in Phones (`?rack=`), and again lets it go. Its
 *   ⋮ holds New rack, and for the rack picked, Rack settings (name,
 *   description and "/" notes), Disconnect or Delete.
 * - **Phones** shows the rack picked, or every rack together while none is
 *   (his answer: "Every rack together"). The Mix block went on 12 Nov 2026
 *   ("remove the mix block and its feature"). Rack program is a tab of the
 *   left page's ⋮ (`RackProgramPanel`), and a rack's Shelf and Log are tabs
 *   of the phones list (Tyler, 12 Nov 2026: "Shelf can go in the tabs instead
 *   of block. Move the rack program into the settings tab. Logs block goes
 *   into tabs").
 *
 * Each keeps no values: it draws what the dashboard hands down.
 */

const STATUSES: PhoneStatus[] = ["connected", "busy", "held", "offline"]

export type RackBlocks = {
  page: PhonesPage
  /** The rack picked: a rack's id, `NO_GROUP` for the phones on none, or "" for every rack. */
  rack: string
  /** Picks a rack ("" lets it go), showing its phones in Phones. */
  onPickRack: (rack: string) => void
  /** The phones in view: the picked rack's, and only a picked project's. */
  phones: PhoneRecord[]
  /** The Phones list's status filter, or its Jobs tab, which the Phones block's rows set. */
  status: PhoneStatus | undefined
  jobsOpen: boolean
  onPhonesFilter: (patch: { status?: PhoneStatus; list?: "jobs" }) => void
  openPhoneId: string | undefined
  onOpenPhone: (phoneId: string) => void
  onChanged: () => Promise<void>
  /** The rack windows, which live with the dashboard so a block can open them from any section. */
  windows: RackWindows
}

const RackBlocksContext = React.createContext<RackBlocks | null>(null)

export function RackBlocksProvider({ value, children }: { value: RackBlocks; children: React.ReactNode }) {
  return <RackBlocksContext.Provider value={value}>{children}</RackBlocksContext.Provider>
}

/** What a block shows on a page with no Anti Detect dashboard behind it. */
function NotHere() {
  return <p className="p-3 text-xs text-muted-foreground">This block shows on the Anti Detect dashboard.</p>
}

/** A block's one muted line. */
function Quiet({ children }: { children: React.ReactNode }) {
  return <p className="px-3 py-2.5 text-sm text-muted-foreground">{children}</p>
}

const pickedRack = (blocks: RackBlocks): RackView | null =>
  blocks.rack && blocks.rack !== NO_GROUP ? (blocks.page.racks.find((rack) => rack.id === blocks.rack) ?? null) : null

const connected = (rack: RackView) => rack.state === "live" || rack.state === "silent"

/** Racks: every rack with its phones online, picking one for Phones; New rack and the picked rack's settings in its ⋮. */
export function RacksBlock() {
  const blocks = React.useContext(RackBlocksContext)
  useBlockCount(blocks?.page.racks.length || undefined)
  const rack = blocks ? pickedRack(blocks) : null
  useBlockMenu(
    blocks
      ? [
          { label: "New rack", icon: <ServerIcon />, onSelect: blocks.windows.newRack },
          ...(rack
            ? [
                { label: `${rack.name}: settings`, onSelect: () => blocks.windows.settings(rack.id) },
                connected(rack)
                  ? { label: `Disconnect ${rack.name}`, onSelect: () => blocks.windows.disconnect(rack.id) }
                  : { label: `Delete ${rack.name}`, onSelect: () => blocks.windows.remove(rack.id) },
              ]
            : []),
        ]
      : undefined
  )
  if (!blocks) return <NotHere />
  const loose = blocks.page.phones.filter((phone) => !phone.rackId)
  const rows = blocks.page.racks.map((one) => {
    const phones = blocks.page.phones.filter((phone) => phone.rackId === one.id)
    const online = phones.filter((phone) => phone.status !== "offline").length
    return {
      key: one.id,
      name: one.name,
      value: phones.length ? `${online}/${phones.length}` : undefined,
      picked: blocks.rack === one.id,
      onPress: () => blocks.onPickRack(blocks.rack === one.id ? "" : one.id),
    }
  })
  if (loose.length) {
    rows.push({
      key: NO_GROUP,
      name: "No rack",
      value: String(loose.length),
      picked: blocks.rack === NO_GROUP,
      onPress: () => blocks.onPickRack(blocks.rack === NO_GROUP ? "" : NO_GROUP),
    })
  }
  return <SideRows empty="No racks yet. New rack in this block's ⋮ makes one." rows={rows} />
}

/**
 * Phones: the phones in view counted by status, and the jobs waiting on them
 * (Racks dashboard, part 91). A status's row sets that status in the Phones
 * list, and pressing it again takes it away; Jobs waiting opens a picked
 * rack's Jobs tab.
 */
export function PhoneCountsBlock() {
  const blocks = React.useContext(RackBlocksContext)
  useBlockCount(blocks?.phones.length || undefined)
  if (!blocks) return <NotHere />
  const rack = pickedRack(blocks)
  // A rack's own queue, or every phone's; the phones on no rack have no count of their own, so No rack shows none.
  const jobs = rack ? (blocks.page.jobsWaiting.byRack[rack.id] ?? 0) : blocks.rack === NO_GROUP ? null : blocks.page.jobsWaiting.all
  return (
    <div className="grid gap-0.5 p-1.5">
      {STATUSES.map((status) => (
        <CountRow
          key={status}
          label={PHONE_STATUS_WORDS[status]}
          dot={STATUS_DOT[status]}
          count={blocks.phones.filter((phone) => phone.status === status).length}
          picked={blocks.status === status && !blocks.jobsOpen}
          onClick={() => blocks.onPhonesFilter({ status: blocks.status === status && !blocks.jobsOpen ? undefined : status })}
        />
      ))}
      {jobs === null ? null : (
      <CountRow
        label="Jobs waiting"
        count={jobs}
        picked={blocks.jobsOpen}
        // The Jobs tab is a rack's own queue, so it opens for a picked rack.
        onClick={rack ? () => blocks.onPhonesFilter(blocks.jobsOpen ? {} : { list: "jobs" }) : undefined}
      />
      )}
    </div>
  )
}

function CountRow({
  label,
  dot,
  count,
  picked,
  onClick,
}: {
  label: string
  dot?: string
  count: number
  picked: boolean
  onClick?: () => void
}) {
  const inside = (
    <>
      {dot ? <span aria-hidden className={`size-2 shrink-0 rounded-full ${dot}`} /> : <span aria-hidden className="size-2 shrink-0" />}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="text-muted-foreground tabular-nums">{count}</span>
    </>
  )
  if (!onClick) return <div className="flex h-8 items-center gap-2 px-2 text-sm">{inside}</div>
  return (
    <button
      type="button"
      aria-pressed={picked}
      onClick={onClick}
      className={cn(
        "flex h-8 items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none",
        picked && "bg-accent font-medium"
      )}
    >
      {inside}
    </button>
  )
}

/**
 * Rack program, a tab of the left page's ⋮ (Tyler, 12 Nov 2026: "Move the
 * rack program into the settings tab"): the picked rack's program (whether
 * it checks in, the computer, the version, the iPhone tool's signature, its
 * last update), or how to install it for a rack that never paired or was
 * disconnected (parts 76 and 77). With no rack picked, each rack's check-in,
 * a press picking it.
 */
export function RackProgramPanel({ blocks }: { blocks: RackBlocks }) {
  const rack = pickedRack(blocks)
  if (!rack) {
    if (!blocks.page.racks.length) return <Quiet>No racks yet.</Quiet>
    return (
      <SideRows
        empty=""
        rows={blocks.page.racks.map((one) => ({
          key: one.id,
          name: one.name,
          value: one.live ? "Checking in" : one.state === "silent" ? "Not checking in" : one.state === "unpaired" ? "Not installed" : "Disconnected",
          picked: false,
          onPress: () => blocks.onPickRack(one.id),
        }))}
      />
    )
  }
  if (rack.state === "unpaired" || rack.state === "disconnected") {
    return (
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 p-3">
        <p className="text-sm text-muted-foreground">
          {rack.state === "unpaired"
            ? "Waiting for the rack program. Install it on the computer this rack's phones plug into."
            : `Disconnected ${rack.disconnectedAt ? formatTimeAgo(rack.disconnectedAt) : ""}. Its key no longer works; install it again with a new code to bring it back.`}
        </p>
        <RackPairing rackId={rack.id} onPaired={() => void blocks.onChanged()} />
      </div>
    )
  }
  const wdaExpired = rack.wdaExpiresAt ? new Date(rack.wdaExpiresAt) < new Date() : false
  return (
    <div className="grid gap-2 p-3 text-sm">
      <Fact label="Checking in" tone={rack.live ? undefined : "text-destructive"}>
        {rack.live ? "Yes" : rack.seenAt ? `No, last seen ${formatTimeAgo(rack.seenAt)}` : "Not yet"}
      </Fact>
      <Fact label="Computer">{rack.platform || "Not reported yet"}</Fact>
      <Fact label="Program version">
        {!rack.version
          ? "Not reported yet"
          : rack.upToDate
            ? `${rack.version}, the newest`
            : `${rack.version}. ${blocks.page.rackVersion} installs itself on its next check-in.`}
      </Fact>
      {rack.pairedAt ? <Fact label="Paired">{formatDateTime(rack.pairedAt)}</Fact> : null}
      {rack.wdaExpiresAt ? (
        // The signature on WebDriverAgent, the tool that drives an iPhone. Red once it has run out, with the word too.
        <Fact label="iPhone tool" tone={wdaExpired ? "text-destructive" : undefined}>
          WebDriverAgent signed until {formatDateTime(rack.wdaExpiresAt)}
          {wdaExpired ? ", which has passed" : ""}
        </Fact>
      ) : null}
      {rack.updateNote ? (
        <p role="status" className="text-destructive">
          {rack.updateNote}
        </p>
      ) : null}
    </div>
  )
}

/** A name over its value, as the program's facts read. */
function Fact({ label, tone, children }: { label: string; tone?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <span className="text-muted-foreground">{label}</span>
      <span className={tone}>{children}</span>
    </div>
  )
}

const views = {
  racks: blockView({ kind: "promo-anti-detect-racks", title: "Racks", icon: <ServerIcon />, Draw: RacksBlock }),
  counts: blockView({ kind: "promo-anti-detect-phone-counts", title: "Phones", icon: <SmartphoneIcon />, Draw: PhoneCountsBlock }),
}

/** The rack blocks in the "/" list, under Advanced blocks. */
export const RACK_APP_BLOCKS: readonly AppBlock[] = [
  { key: "promoRacks", label: "Racks", icon: ServerIcon, node: ANTI_DETECT_RACKS_NODE, extension: blockNode(ANTI_DETECT_RACKS_NODE, {}, views.racks) },
  {
    key: "promoPhoneCounts",
    label: "Phones",
    icon: SmartphoneIcon,
    node: ANTI_DETECT_PHONE_COUNTS_NODE,
    extension: blockNode(ANTI_DETECT_PHONE_COUNTS_NODE, {}, views.counts),
  },
]

/** The rack windows the blocks open: New rack, a rack's settings, and asking before Disconnect or Delete. */
export type RackWindows = {
  newRack: () => void
  settings: (rackId: string) => void
  disconnect: (rackId: string) => void
  remove: (rackId: string) => void
}

/**
 * The rack windows, held by the dashboard so a block can open them from any
 * section. New rack's Open the rack picks the new rack. A deleted rack's
 * phones move to No rack, and a picked rack that goes lets go of the filter.
 */
export function useRackWindows({
  page,
  onPickRack,
  onChanged,
}: {
  page: PhonesPage
  onPickRack: (rack: string) => void
  onChanged: () => Promise<void>
}) {
  const [creating, setCreating] = React.useState(false)
  const [settingsFor, setSettingsFor] = React.useState<string | null>(null)
  const [disconnecting, setDisconnecting] = React.useState<string | null>(null)
  const [deleting, setDeleting] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const nameOf = (rackId: string | null) => page.racks.find((rack) => rack.id === rackId)?.name ?? "this rack"

  const windows: RackWindows = React.useMemo(
    () => ({
      newRack: () => setCreating(true),
      settings: setSettingsFor,
      disconnect: setDisconnecting,
      remove: setDeleting,
    }),
    []
  )

  /** Does it, then closes its window; an action answering false was refused and said why itself. */
  async function work(action: () => Promise<boolean | void>, done: () => void) {
    setBusy(true)
    try {
      if ((await action()) === false) return
      done()
      await onChanged()
    } catch (failure) {
      showErrorToast(getPhoneErrorMessage(failure))
    } finally {
      setBusy(false)
    }
  }

  const settingsRack = page.racks.find((rack) => rack.id === settingsFor) ?? null

  const node = (
    <>
      <NewRackDialog
        open={creating}
        onClose={() => setCreating(false)}
        onOpenRack={(rackId) => {
          setCreating(false)
          void onChanged().then(() => onPickRack(rackId))
        }}
      />
      {settingsRack ? (
        <RackSettingsDialog key={settingsRack.id} rack={settingsRack} onClose={() => setSettingsFor(null)} onChanged={onChanged} />
      ) : null}
      <ConfirmDialog
        open={disconnecting !== null}
        onOpenChange={(open) => (open ? null : setDisconnecting(null))}
        title={`Disconnect ${nameOf(disconnecting)}?`}
        description="Its key stops working at once. Its phones go offline, waiting checks are cancelled, and nothing reaches the phones until it is installed again with a new code from its Rack program block. The phone records and the accounts on them stay."
        confirmLabel="Disconnect rack"
        loading={busy}
        onConfirm={() => {
          if (disconnecting) void work(() => disconnectPhoneRack(disconnecting), () => setDisconnecting(null))
        }}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => (open ? null : setDeleting(null))}
        title={`Delete ${nameOf(deleting)}?`}
        description="The rack goes. Its phones move to No rack, and keep their history, readings and finished actions. Nothing on the phones changes."
        confirmLabel="Delete rack"
        loading={busy}
        onConfirm={() => {
          const rackId = deleting
          if (!rackId) return
          void work(
            async () => {
              const { kept } = await removeRacks([rackId])
              if (!kept.length) return true
              // A connected rack is kept, with why.
              showErrorToast(kept[0].reason)
              return false
            },
            () => {
              setDeleting(null)
              onPickRack("")
            }
          )
        }}
      />
    </>
  )

  return { windows, node }
}
