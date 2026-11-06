import * as React from "react"
import { EllipsisVerticalIcon, Loader2Icon, Trash2Icon, UnplugIcon } from "lucide-react"

import { NotesMorphIcon } from "@/components/phones/notes-morph-icon"
import { RackLogPanel } from "@/components/phones/rack-log"
import { RackNotes } from "@/components/phones/rack-notes"
import { RackPairing } from "@/components/phones/rack-pairing"
import { RackShelf } from "@/components/phones/rack-shelf"
import { usePromoSaveStatus } from "@/components/social/guest/guest-mode"
import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { FoldingMenu, MenuAction, MenuLine, MenuSection, useOpenSections } from "@/components/shared/folding-menu"
import { ImageUpload } from "@/components/shared/image-upload"
import { PanelCard } from "@/components/shared/panel-card"
import { DocumentEditor } from "@/components/shared/rich-text-editor"
import { Hint } from "@/components/social/hint"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  getPhoneErrorMessage,
  saveRack,
  savePhoneFields,
  type RackPage,
  type RackView,
} from "@/lib/api/phones/phones"
import { formatDateTime, formatTimeAgo } from "@/lib/format/format-time"
import type { WrittenPageNode } from "@/lib/pages/written-page-body"
import { MIX_MIN_PHONES, PHONE_STATUS_WORDS, RACK_NAME_MAX, type PhoneStatus } from "@/lib/phones/options"
import { rackMix, MIX_KIND_WORDS } from "@/lib/phones/rack-mix"
import type { RackSearch } from "@/lib/phones/rack-search"
import { STATUS_DOT } from "@/lib/phones/status-dot"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

/** A typed field saves this long after the last letter, as every setting does. */
const SAVE_AFTER_MS = 700

const STATUSES: PhoneStatus[] = ["connected", "busy", "held", "offline"]

/**
 * The left panel of a rack's page: the rack itself (Racks dashboard, parts
 * 89 to 94; Tyler, 5 Nov 2026: "left panel rack details"). Promo's project
 * page is the drawing (Tyler picked it on 6 Nov 2026): the back arrow to the
 * Racks dashboard, the name, the notes icon and the ⋮; the cover banner
 * faintly behind the top with no avatar ("NO avatar just banner cover"); and
 * the description written in place, saving itself.
 *
 * Under it, cards: the counts that filter the list, the rack program (its
 * check-in, version and iPhone tool, or installing it), the shelf map, the
 * mix of models and carriers, and the program's own log. The notes icon swaps
 * the body for the rack's "/" block notes ("Need tiptap editor with blocks
 * ability too"); the header stays.
 */
export function RackPanel({
  page,
  search,
  onSearch,
  onOpenPhone,
  onChanged,
  onDisconnect,
  onDelete,
}: {
  page: RackPage
  search: RackSearch
  onSearch: (patch: Partial<RackSearch>) => void
  onOpenPhone: (phoneId: string) => void
  onChanged: () => Promise<void>
  onDisconnect: () => void
  onDelete: () => void
}) {
  const rack = page.rack
  const notesOpen = search.notes === "1"
  // A picture whose address no longer loads is left out rather than drawn broken.
  const [broken, setBroken] = React.useState<string | null>(null)
  const banner = rack.bannerUrl && rack.bannerUrl !== broken ? rack.bannerUrl : null

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {banner ? (
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-36 overflow-hidden">
          <img src={banner} alt="" className="size-full object-cover opacity-30" onError={() => setBroken(banner)} />
          {/* Fading into the panel at the foot, as on the project page. */}
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-card/40 to-card" />
        </div>
      ) : null}
      <DashboardCardTitleHeader
        // The line goes see-through rather than away, so the header keeps its height.
        className={cn("relative", banner && "border-b-transparent")}
        back={{ label: "All racks", to: "/admin/racks" }}
        title={
          <span className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 truncate">{rack.name}</span>
            <span aria-hidden className={`size-2 shrink-0 rounded-full ${rack.live ? "bg-emerald-500" : rack.state === "silent" ? "bg-destructive" : "bg-muted-foreground/50"}`} />
          </span>
        }
        action={
          <div className="flex items-center gap-0.5">
            <Hint label={notesOpen ? "Close the notes" : "Notes"}>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={notesOpen ? "Close the notes" : "Notes"}
                aria-pressed={notesOpen}
                onClick={() => onSearch({ notes: notesOpen ? undefined : "1" })}
              >
                <NotesMorphIcon open={notesOpen} />
              </Button>
            </Hint>
            <RackMenu key={rack.id} rack={rack} onChanged={onChanged} onDisconnect={onDisconnect} onDelete={onDelete} />
          </div>
        }
      />

      {notesOpen ? (
        <RackNotes key={rack.id} rackId={rack.id} stored={rack.notes} />
      ) : (
        <ScrollArea className="relative min-h-0 flex-1">
          <div className={cn("grid grid-cols-[minmax(0,1fr)] gap-3 p-3", banner && "pt-6")}>
            <RackDescription key={rack.id} rackId={rack.id} description={rack.description} />
            <CountsCard page={page} search={search} onSearch={onSearch} />
            <ProgramCard page={page} onChanged={onChanged} />
            <PanelCard storageId="promo-rack-shelf" title="Shelf" meta={`${page.shelfRows} by ${page.shelfColumns}`}>
              <div className="grid min-w-0 grid-cols-[minmax(0,1fr)]">
                <RackShelf
                phones={page.phones}
                rows={page.shelfRows}
                columns={page.shelfColumns}
                openId={search.open}
                onOpen={onOpenPhone}
                onPlace={async (phoneId, slot) => {
                  dismissErrorToast()
                  try {
                    await savePhoneFields(phoneId, { shelfSlot: String(slot) })
                    await onChanged()
                  } catch (error) {
                    showErrorToast(getPhoneErrorMessage(error))
                  }
                }}
                />
              </div>
            </PanelCard>
            <MixCard page={page} />
            {rack.state === "unpaired" ? null : (
              <PanelCard storageId="promo-rack-log" title="Log">
                <div className="grid min-w-0 grid-cols-[minmax(0,1fr)]">
                  <RackLogPanel rack={rack} />
                </div>
              </PanelCard>
            )}
          </div>
        </ScrollArea>
      )}
    </div>
  )
}

/**
 * The description, written in place in the shared editor as the project
 * page's is, saving 700ms after the last letter and when it is left, with
 * Saving… and Saved in the page header. While it is open it is never drawn
 * again from what was saved, so a late save can't take back what was just
 * written.
 */
function RackDescription({ rackId, description }: { rackId: string; description: WrittenPageNode }) {
  const [start] = React.useState(description)
  const setSaveStatus = usePromoSaveStatus()
  const draft = React.useRef<WrittenPageNode | null>(null)
  const timer = React.useRef(0)

  const flush = React.useCallback(() => {
    window.clearTimeout(timer.current)
    const next = draft.current
    if (!next) return
    draft.current = null
    setSaveStatus("saving")
    saveRack({ rackId, description: next })
      .then(() => setSaveStatus("saved"))
      .catch((error: unknown) => {
        // Kept to try again with the next letter or when the box is left.
        draft.current ??= next
        setSaveStatus("idle")
        showErrorToast(getPhoneErrorMessage(error))
      })
  }, [rackId, setSaveStatus])

  // Leaving the rack saves what was typed.
  React.useEffect(() => flush, [flush])

  return (
    <div
      className={cn(
        // A plain writing area, no box: the panel around it is the page.
        "[&>div]:rounded-none [&>div]:border-0 [&>div]:bg-transparent [&>div]:!opacity-100",
        "[&_.page-rte_.tiptap]:!min-h-[calc(3.3em+1.25rem)] [&_.page-rte_.tiptap]:!px-0 [&_.page-rte_.tiptap]:!pt-0 [&_.page-rte_.tiptap]:!pb-2",
        "[&_.page-rte_.tiptap]:!text-[0.9375rem] [&_.page-rte_.tiptap]:!leading-[1.65]"
      )}
      onBlur={(event) => {
        const next = event.relatedTarget
        // The link box sits outside the writing area.
        if (next instanceof Element && (event.currentTarget.contains(next) || next.closest("[data-radix-popper-content-wrapper], [data-slot=popover-content]"))) {
          return
        }
        flush()
      }}
    >
      <DocumentEditor
        value={start}
        placeholder="Describe this rack: where it is, whose internet it uses, what it is for."
        onChange={(body) => {
          draft.current = body
          dismissErrorToast()
          window.clearTimeout(timer.current)
          timer.current = window.setTimeout(flush, SAVE_AFTER_MS)
        }}
      />
    </div>
  )
}

/**
 * The rack's phones counted by status, and its waiting jobs (part 91). A
 * status's number sets that status in the middle panel's filter, and pressing
 * it again takes it away; the jobs number opens the Jobs tab.
 */
function CountsCard({
  page,
  search,
  onSearch,
}: {
  page: RackPage
  search: RackSearch
  onSearch: (patch: Partial<RackSearch>) => void
}) {
  const counts = Object.fromEntries(STATUSES.map((status) => [status, page.phones.filter((phone) => phone.status === status).length]))
  return (
    <PanelCard storageId="promo-rack-counts" title="Phones" meta={page.phones.length}>
      <div className="-mx-2 -mb-2 grid gap-0.5">
        {STATUSES.map((status) => (
          <CountRow
            key={status}
            label={PHONE_STATUS_WORDS[status]}
            dot={STATUS_DOT[status]}
            count={counts[status]}
            picked={search.status === status && !search.list}
            onClick={() =>
              onSearch({ status: search.status === status && !search.list ? undefined : status, list: undefined })
            }
          />
        ))}
        <CountRow
          label="Jobs waiting"
          count={page.jobsWaiting}
          picked={search.list === "jobs"}
          onClick={() => onSearch({ list: search.list === "jobs" ? undefined : "jobs" })}
        />
      </div>
    </PanelCard>
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
  onClick: () => void
}) {
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
      {dot ? <span aria-hidden className={`size-2 shrink-0 rounded-full ${dot}`} /> : <span aria-hidden className="size-2 shrink-0" />}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="text-muted-foreground tabular-nums">{count}</span>
    </button>
  )
}

/**
 * The rack program on the computer the phones plug into: whether it checks
 * in, which computer and version, the iPhone tool's signature, and what its
 * last update did. A rack that never paired, or was disconnected, shows how
 * to install it instead, with a code made for this rack (parts 76 and 77).
 */
function ProgramCard({ page, onChanged }: { page: RackPage; onChanged: () => Promise<void> }) {
  const rack = page.rack
  if (rack.state === "unpaired" || rack.state === "disconnected") {
    return (
      <PanelCard
        storageId="promo-rack-install"
        title="Rack program"
        meta={rack.state === "unpaired" ? "not installed" : "disconnected"}
        openWhen
      >
        {/* One column as wide as the card, so long lines wrap inside it rather than running past its edge. */}
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
          <p className="text-sm text-muted-foreground">
            {rack.state === "unpaired"
              ? "Waiting for the rack program. Install it on the computer this rack's phones plug into."
              : `Disconnected ${rack.disconnectedAt ? formatTimeAgo(rack.disconnectedAt) : ""}. Its key no longer works; install it again with a new code to bring it back.`}
          </p>
          <RackPairing rackId={rack.id} onPaired={() => void onChanged()} />
        </div>
      </PanelCard>
    )
  }
  const wdaExpired = rack.wdaExpiresAt ? new Date(rack.wdaExpiresAt) < new Date() : false
  return (
    <PanelCard storageId="promo-rack-program" title="Rack program" meta={rack.live ? "checking in" : "not checking in"}>
      <dl className="grid gap-1 text-sm">
        <dt className="text-muted-foreground">Checking in</dt>
        <dd className={cn("inline-flex items-center gap-1.5", !rack.live && "text-destructive")}>
          <span aria-hidden className={`size-2 rounded-full ${rack.live ? "bg-emerald-500" : "bg-destructive"}`} />
          {rack.live ? "Yes" : rack.seenAt ? `No, last seen ${formatTimeAgo(rack.seenAt)}` : "Not yet"}
        </dd>
        <dt className="text-muted-foreground">Computer</dt>
        <dd>{rack.platform || "Not reported yet"}</dd>
        <dt className="text-muted-foreground">Program version</dt>
        <dd>
          {!rack.version
            ? "Not reported yet"
            : rack.upToDate
              ? `${rack.version}, the newest`
              : `${rack.version}. ${page.rackVersion} installs itself on its next check-in.`}
        </dd>
        {rack.pairedAt ? (
          <>
            <dt className="text-muted-foreground">Paired</dt>
            <dd>{formatDateTime(rack.pairedAt)}</dd>
          </>
        ) : null}
        {rack.wdaExpiresAt ? (
          <>
            <dt className="text-muted-foreground">iPhone tool</dt>
            {/* The signature on WebDriverAgent, the tool that drives an iPhone. Red once it has run out, with the word too. */}
            <dd className={wdaExpired ? "text-destructive" : undefined}>
              WebDriverAgent signed until {formatDateTime(rack.wdaExpiresAt)}
              {wdaExpired ? ", which has passed" : ""}
            </dd>
          </>
        ) : null}
      </dl>
      {rack.updateNote ? (
        <p role="status" className="mt-2 text-sm text-destructive">
          {rack.updateNote}
        </p>
      ) : null}
    </PanelCard>
  )
}

/**
 * How alike this rack's phones are (part 27 of the phone farm, Mix): each
 * model, carrier and system version with how many share it, with a warning
 * when more than half of four or more share one.
 */
function MixCard({ page }: { page: RackPage }) {
  const mix = React.useMemo(
    () =>
      rackMix(
        page.phones.map((phone) => ({
          kind: phone.kind,
          model: phone.model,
          androidVersion: phone.androidVersion,
          connection: phone.connection,
          // What the SIM itself says beats what was typed.
          carrier: phone.setupCheck?.figures.simCarrier || phone.simCarrier,
          proxyName: phone.proxy ? phone.proxy.label || phone.proxy.host : "",
        }))
      ),
    [page.phones]
  )
  return (
    <PanelCard
      storageId="promo-rack-mix"
      title="Mix"
      meta={mix.warnings.length ? `${mix.warnings.length} ${mix.warnings.length === 1 ? "warning" : "warnings"}` : undefined}
    >
      <div className="grid gap-3 text-sm">
        {mix.warnings.length ? (
          <ul className="grid gap-1">
            {mix.warnings.map((warning) => (
              <li key={`${warning.kind}:${warning.value}`} className="text-amber-600 dark:text-amber-400">
                {warning.text}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">
            {mix.total < MIX_MIN_PHONES
              ? `${mix.total} ${mix.total === 1 ? "phone" : "phones"} so far. The warning starts at ${MIX_MIN_PHONES}.`
              : "No kind, model, carrier or system version is on more than half the phones."}
          </p>
        )}
        {(["model", "carrier", "android"] as const).map((kind) =>
          mix.counts[kind].length ? (
            <div key={kind} className="grid gap-1">
              <p className="text-xs font-medium text-muted-foreground">{MIX_KIND_WORDS[kind]}</p>
              <ul className="grid gap-0.5">
                {mix.counts[kind].map((entry) => (
                  <li key={entry.value} className="flex items-center justify-between gap-3">
                    <span className={entry.known ? "truncate" : "truncate text-muted-foreground"}>{entry.value}</span>
                    <span className="shrink-0 text-muted-foreground tabular-nums">
                      {entry.count} of {mix.total}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null
        )}
      </div>
    </PanelCard>
  )
}

/**
 * The rack's ⋮, the shell's one dropdown look, as the project page's: Name
 * and Banner as folding rows, each saving itself, then a line, then
 * Disconnect for a connected rack or Delete in red for one that is not. It
 * opens to the right, over the middle panel.
 */
function RackMenu({
  rack,
  onChanged,
  onDisconnect,
  onDelete,
}: {
  rack: RackView
  onChanged: () => Promise<void>
  onDisconnect: () => void
  onDelete: () => void
}) {
  const [open, setOpen] = React.useState(false)
  const [shown, toggle] = useOpenSections<"name" | "banner">()
  const connected = rack.state === "live" || rack.state === "silent"

  function change(next: boolean) {
    // The name saves as its box is left, so it is left before the menu shuts.
    if (!next && document.activeElement instanceof HTMLElement) document.activeElement.blur()
    setOpen(next)
  }

  /** Shuts the menu, then does the thing, so a window it opens is not behind it. */
  const then = (action: () => void) => () => {
    change(false)
    action()
  }

  return (
    <FoldingMenu
      label="Rack settings"
      align="start"
      open={open}
      onOpenChange={change}
      // The small size, as the notes button beside it, so the name keeps the room.
      trigger={
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Rack settings">
          <EllipsisVerticalIcon />
        </Button>
      }
    >
      <MenuSection label="Name" value={rack.name} open={shown.has("name")} onToggle={() => toggle("name")}>
        <RackNameField rack={rack} onSaved={onChanged} />
      </MenuSection>
      <MenuSection label="Banner" value={rack.bannerUrl ? "Added" : "None"} open={shown.has("banner")} onToggle={() => toggle("banner")}>
        <RackBannerField rack={rack} onSaved={onChanged} />
      </MenuSection>
      <MenuLine />
      {connected ? (
        <MenuAction icon={<UnplugIcon className="size-4" />} onClick={then(onDisconnect)}>
          Disconnect this rack
        </MenuAction>
      ) : (
        <MenuAction icon={<Trash2Icon className="size-4" />} destructive onClick={then(onDelete)}>
          Delete rack
        </MenuAction>
      )}
    </FoldingMenu>
  )
}

/** The name, saving 700ms after the last key, on Enter, and at once when the box is left. */
function RackNameField({ rack, onSaved }: { rack: RackView; onSaved: () => Promise<void> }) {
  const [name, setName] = React.useState(rack.name)
  const [invalid, setInvalid] = React.useState(false)
  const setSaveStatus = usePromoSaveStatus()
  const saved = React.useRef(rack.name)
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const save = React.useCallback(
    async (next: string) => {
      if (timer.current) clearTimeout(timer.current)
      const clean = next.trim()
      if (clean === saved.current) return
      if (!clean) {
        setInvalid(true)
        showErrorToast("A rack needs a name. What was there before is kept until you type one.")
        return
      }
      setSaveStatus("saving")
      dismissErrorToast()
      try {
        await saveRack({ rackId: rack.id, name: clean })
        saved.current = clean
        setSaveStatus("saved")
        await onSaved()
      } catch (error) {
        setInvalid(true)
        setSaveStatus("idle")
        showErrorToast(getPhoneErrorMessage(error))
      }
    },
    [onSaved, rack.id, setSaveStatus]
  )

  return (
    <Input
      aria-label="Name"
      value={name}
      maxLength={RACK_NAME_MAX}
      aria-invalid={invalid || undefined}
      onChange={(event) => {
        const next = event.target.value
        setName(next)
        setInvalid(false)
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => void save(next), SAVE_AFTER_MS)
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") void save(name)
      }}
      onBlur={() => void save(name)}
    />
  )
}

/** The cover banner, from the media library, saving the moment it is picked. There is no avatar. */
function RackBannerField({ rack, onSaved }: { rack: RackView; onSaved: () => Promise<void> }) {
  const [bannerUrl, setBannerUrl] = React.useState(rack.bannerUrl)
  const [busy, setBusy] = React.useState(false)
  const setSaveStatus = usePromoSaveStatus()

  return (
    <div className="grid gap-2">
      <ImageUpload
        label="Rack banner"
        showLabel={false}
        value={bannerUrl}
        aspect="video"
        fit="cover"
        emptyLabel="Add a banner"
        onChange={async (next) => {
          const before = bannerUrl
          setBannerUrl(next)
          setBusy(true)
          setSaveStatus("saving")
          dismissErrorToast()
          try {
            await saveRack({ rackId: rack.id, bannerUrl: next })
            setSaveStatus("saved")
            await onSaved()
          } catch (error) {
            setBannerUrl(before)
            setSaveStatus("idle")
            showErrorToast(getPhoneErrorMessage(error))
          } finally {
            setBusy(false)
          }
        }}
      />
      {busy ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2Icon className="size-3 animate-spin" aria-hidden />
          Saving the banner
        </p>
      ) : null}
    </div>
  )
}
