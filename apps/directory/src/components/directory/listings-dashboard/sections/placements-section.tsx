import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { BanIcon, SparklesIcon, StoreIcon } from "lucide-react"

import { CrmListHeader, CrmRowMenu, type RowMenuItem } from "@/components/crm/crm-row"
import { Chip, CrmTable, CrmTableRow, MainCell } from "@/components/crm/crm-table"
import { EmptyRecord, FooterState, RecordFrame } from "@/components/crm/record-frame"
import { DetailRow, DetailRows } from "@/components/directory/listings-dashboard/detail-rows"
import { ListPager, NoMatches, RecordMenu, useOpenFirstRow, type SectionProps } from "@/components/directory/listings-dashboard/section-parts"
import { SelectedMenu, SelectedMenuRow } from "@/components/shared/mass-select"
import { PanelCard } from "@/components/shared/panel-card"
import { MiddleHeading, PanelReopenButton } from "@/components/shared/three-panels"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { TableCell } from "@/components/ui/table"
import { getFeaturedErrorMessage, revokeFeatured, type loadFeaturedAdmin } from "@/lib/api/directory/featured"
import { endsSoon } from "@/lib/directory/listings-dashboard-page"
import { formatDate } from "@/lib/format/format-time"
import { formatMoney } from "@/lib/format/money"
import { plural } from "@/lib/format/plural"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useClearSelectionOnListChange } from "@/lib/hooks/use-clear-selection"
import { useSelection } from "@/lib/hooks/use-selection"
import { useListSearchNavigate, useOpenRecord } from "@/lib/nav/list-search"
import { cn } from "@/lib/utils"

type Data = Awaited<ReturnType<typeof loadFeaturedAdmin>>
type Placement = Data["entitlements"][number]

const STATUS_WORDS: Record<Placement["status"], string> = { active: "Running", expired: "Ended", revoked: "Revoked" }

/**
 * The Placements row: every featured spot sold, newest first, with the ones
 * ending within seven days tinted amber and put first (Tyler's polish pick,
 * 18 Nov 2026: "Featured placements ending within 7 days get the amber tint
 * and sort first"). It was the bottom table of the Featured page, whose rows
 * had only a Revoke button and opened nothing.
 *
 * - **Header:** "N selected" (Revoke), search, Select.
 * - **Right:** the placement: what it features, the plan, when it started
 *   and ends, what was paid. Revoke is red in its ⋮.
 */
export function PlacementsSection({ data, search, frame, onChanged }: SectionProps<Data>) {
  const setListSearch = useListSearchNavigate()
  const setOpen = useOpenRecord()
  const q = search.q ?? ""
  const rows = React.useMemo(
    () =>
      [...data.entitlements].sort(
        (a, b) => Number(b.status === "active" && endsSoon(b.endsAt)) - Number(a.status === "active" && endsSoon(a.endsAt))
      ),
    [data.entitlements]
  )
  const ids = rows.map((row) => row.id)
  const openId = search.open
  useOpenFirstRow(ids, openId)
  const openRow = rows.find((row) => row.id === openId) ?? null
  const [massSelect, setMassSelect] = React.useState(false)
  const selection = useSelection()
  const [rightClick, setRightClick] = React.useState<{ id: string; x: number; y: number } | null>(null)
  const [revoking, setRevoking] = React.useState<Placement[] | null>(null)
  const [run, busy] = useAsyncAction(getFeaturedErrorMessage)
  const [pressedId, setPressedId] = React.useState<string>()
  useClearSelectionOnListChange(selection.setSelected, `${q}|${data.page}`)
  const tickable = rows.filter((row) => row.status === "active").map((row) => row.id)

  const actionsFor = (row: Placement): RowMenuItem[] =>
    row.status === "active"
      ? [{ label: "Revoke", icon: <BanIcon className="size-4" />, destructive: true, onSelect: () => setRevoking([row]) }]
      : []
  const toggleMassSelect = (tickId?: string) => {
    if (massSelect) {
      selection.clear()
      setMassSelect(false)
      return
    }
    setMassSelect(true)
    if (tickId && tickable.includes(tickId)) selection.setSelected(new Set([tickId]))
  }
  const ticked = rows.filter((row) => selection.selected.has(row.id))
  const rightClicked = rightClick ? rows.find((row) => row.id === rightClick.id) : undefined

  const middle = (
    <div className="@container flex h-full min-h-0 flex-col overflow-hidden bg-card">
      <CrmListHeader
        tabs={<MiddleHeading icon={SparklesIcon} label="Placements" />}
        end={<PanelReopenButton side="right" label="Show the placement" />}
        selected={
          massSelect && ticked.length ? (
            <SelectedMenu
              count={ticked.length}
              busy={busy}
              onClear={selection.clear}
              pages={{}}
              main={(menu) => (
                <SelectedMenuRow
                  className="text-destructive"
                  onClick={() => {
                    menu.close()
                    setRevoking(ticked)
                  }}
                >
                  <BanIcon className="size-4" />
                  Revoke
                </SelectedMenuRow>
              )}
            />
          ) : null
        }
        menuLabel="More for placements"
        search={{
          name: "placement-search",
          label: "Search placements by title or buyer email",
          placeholder: "Search placements",
          value: q,
          onChange: (text) => setListSearch({ q: text.trim() ? text : undefined, page: undefined }),
        }}
        massSelect={{ on: massSelect, onToggle: () => toggleMassSelect() }}
      />
      <CrmTable<"name">
        columns={[
          { key: "name", label: "Featured", column: "main", className: "min-w-40", sortable: false },
          { key: "ends", label: "Ends", column: "meta", sortable: false },
          { key: "plan", label: "Plan", column: "meta", className: "hidden md:hidden @xl:table-cell", sortable: false },
          { key: "paid", label: "Paid", column: "meta", className: "hidden md:hidden @2xl:table-cell", sortable: false },
        ]}
        sort="name"
        direction="asc"
        onSort={() => undefined}
        select={
          massSelect
            ? { noun: "placements", disabled: tickable.length === 0, checked: selection.selectAllState(tickable), onToggle: () => selection.toggleVisible(tickable) }
            : null
        }
        empty={
          rows.length > 0 ? null : q.trim() ? (
            <NoMatches words={q} noun="placements" onClear={() => setListSearch({ q: undefined, page: undefined })} />
          ) : (
            "No featured spot has been bought yet."
          )
        }
      >
        {rows.map((row) => {
          const soon = row.status === "active" && endsSoon(row.endsAt)
          return (
            <CrmTableRow
              key={row.id}
              open={row.id === openId}
              label={row.title}
              tick={{ shown: massSelect, ticked: selection.selected.has(row.id), none: row.status !== "active", onToggle: () => selection.toggle(row.id) }}
              onOpen={() => {
                setPressedId(row.id)
                setOpen(row.id)
              }}
              onRightClick={(x, y) => setRightClick({ id: row.id, x, y })}
            >
              <MainCell name={row.title} line={row.buyerEmail}>
                {row.kind === "event" ? <Chip muted>Event</Chip> : null}
              </MainCell>
              <TableCell column="meta">
                <Chip
                  muted={!soon}
                  className={cn(soon && "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300")}
                >
                  {row.status === "active" ? formatDate(row.endsAt) : STATUS_WORDS[row.status]}
                </Chip>
              </TableCell>
              <TableCell column="mutedMeta" className="hidden md:hidden @xl:table-cell">
                <span className="block max-w-48 truncate">{row.planName}</span>
              </TableCell>
              <TableCell column="mutedMeta" className="hidden tabular-nums md:hidden @2xl:table-cell">
                {formatMoney(row.amountTotal, row.currency)}
              </TableCell>
            </CrmTableRow>
          )
        })}
      </CrmTable>
      <ListPager page={data.page} pageSize={data.pageSize} total={data.entitlementsTotal} />
      {rightClick && rightClicked ? (
        <CrmRowMenu
          key={`${rightClick.id}-${rightClick.x}-${rightClick.y}`}
          at={rightClick}
          massSelect={{ on: massSelect, onToggle: () => toggleMassSelect(!massSelect ? rightClick.id : undefined) }}
          items={actionsFor(rightClicked)}
          onClose={() => setRightClick(null)}
        />
      ) : null}
    </div>
  )

  return frame({
    ids,
    showMiddleFor: `${q}|${data.page}`,
    showRightFor: pressedId && pressedId === openId ? pressedId : undefined,
    middle,
    right: {
      label: "Placement",
      showLabel: "Show the placement",
      content: openRow ? (
        <PlacementRecord key={openRow.id} placement={openRow} actions={actionsFor(openRow)} busy={busy} />
      ) : (
        <EmptyRecord
          title="Placement"
          icon={<SparklesIcon aria-hidden />}
          line={data.entitlementsTotal ? "Click a placement to see it here." : "No featured spot has been bought yet."}
          hideLabel="Hide the placement"
        />
      ),
    },
    windows: (
      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(open) => {
          if (!open) setRevoking(null)
        }}
        title={revoking && revoking.length > 1 ? `Revoke ${revoking.length} placements?` : "Revoke this placement?"}
        description="The Featured badge and the top spot stop at once. This does not refund the Stripe payment."
        confirmLabel={revoking && revoking.length > 1 ? `Revoke ${revoking.length}` : "Revoke placement"}
        destructive
        loading={busy}
        onConfirm={() =>
          void run(async () => {
            if (!revoking) return
            const failed: string[] = []
            for (const row of revoking) {
              try {
                await revokeFeatured(row.id)
              } catch {
                failed.push(row.title)
              }
            }
            const total = revoking.length
            setRevoking(null)
            selection.clear()
            await onChanged()
            if (failed.length) throw new Error(`${total - failed.length} of ${total} revoked. ${failed.join(", ")} ${plural(failed.length, "was", "were")} not running any more.`)
          })
        }
      />
    ),
  })
}

/** One placement on the right: what it features and for how long, and what was paid. */
function PlacementRecord({ placement, actions, busy }: { placement: Placement; actions: RowMenuItem[]; busy: boolean }) {
  const navigate = useNavigate()
  const soon = placement.status === "active" && endsSoon(placement.endsAt)
  const openFeatured = () =>
    placement.listingId
      ? void navigate({ to: "/admin/listings", search: { open: placement.listingId } })
      : placement.eventId
        ? void navigate({ to: "/admin/events", search: { open: placement.eventId } })
        : undefined
  return (
    <RecordFrame
      avatar={<SparklesIcon aria-hidden />}
      title={placement.title}
      line={`${STATUS_WORDS[placement.status]} · ${placement.planName}`}
      hideLabel="Hide the placement"
      actions={
        <RecordMenu
          label="Placement menu"
          actions={[
            {
              label: placement.kind === "event" ? "Open the event" : "Open the listing",
              icon: <StoreIcon className="size-4" />,
              onSelect: () => openFeatured(),
            },
            ...actions.map((action) => ({ ...action, disabled: busy })),
          ]}
        />
      }
      body={
        <PanelCard storageId="featured-placement" icon={<SparklesIcon />} title="The placement">
          <DetailRows>
            <DetailRow label={placement.kind === "event" ? "Event" : "Listing"} value={placement.title} />
            <DetailRow label="Plan" value={placement.planName} />
            <DetailRow label="Bought by" value={placement.buyerEmail} />
            <DetailRow label="Started" value={formatDate(placement.startsAt)} />
            <DetailRow label="Ends" value={formatDate(placement.endsAt)} />
            <DetailRow label="Paid" value={formatMoney(placement.amountTotal, placement.currency)} />
            {placement.revokeNote ? <DetailRow label="Why it was revoked" value={placement.revokeNote} /> : null}
          </DetailRows>
        </PanelCard>
      }
      footer={
        <FooterState>
          <span className={cn("text-muted-foreground", soon && "text-amber-700 dark:text-amber-300")}>
            {placement.status === "active"
              ? soon
                ? `Ends ${formatDate(placement.endsAt)}, within a week`
                : `Running until ${formatDate(placement.endsAt)}`
              : STATUS_WORDS[placement.status]}
          </span>
        </FooterState>
      }
    />
  )
}
