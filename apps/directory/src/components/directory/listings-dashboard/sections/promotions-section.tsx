import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { CopyIcon, Loader2Icon, PlusIcon, StoreIcon, TagIcon, TimerOffIcon, Trash2Icon, UsersIcon } from "lucide-react"

import { CrmListHeader, CrmRowMenu, type RowMenuItem } from "@/components/crm/crm-row"
import { Chip, CrmTable, CrmTableRow, MainCell } from "@/components/crm/crm-table"
import { EmptyRecord, FooterState, RecordFrame } from "@/components/crm/record-frame"
import { ListingPicker } from "@/components/directory/listing-picker"
import { DetailNote } from "@/components/directory/listings-dashboard/detail-rows"
import {
  AutoSaveWords,
  ListPager,
  NoMatches,
  PickGroup,
  PrefetchMark,
  RecordMenu,
  makeRecordCache,
  prefetchHandlers,
  useAutoSave,
  useOpenFirstRow,
  type SectionProps,
} from "@/components/directory/listings-dashboard/section-parts"
import { FilterRow } from "@/components/admin-dashboard/list-parts"
import { CounterPanel } from "@/components/promotions/counter-panel"
import {
  DealCardsAsPanels,
  DealClaimsCard,
  DealDaysCard,
  DealHeadlineCard,
  DealTimesCard,
  DealWordsCard,
} from "@/components/promotions/deal-fields"
import { WhoClaimedList } from "@/components/promotions/who-claimed"
import { useBulkChangeAsk } from "@/components/shared/bulk-change-menu"
import { DashboardToolbarButton } from "@/components/shared/dashboard-toolbar"
import { FilterPopover } from "@/components/shared/filter-popover"
import { ImageUpload } from "@/components/shared/image-upload"
import { SelectedMenu, SelectedMenuRow, SelectedMenuSeparator } from "@/components/shared/mass-select"
import { NewRecordDropdown } from "@/components/shared/new-record-dropdown"
import { PickMenuRow } from "@/components/shared/notes/pick-rows"
import { PanelCard } from "@/components/shared/panel-card"
import { RecordPreviewLink } from "@/components/shared/record-preview-link"
import { MiddleHeading, PanelReopenButton } from "@/components/shared/three-panels"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ErrorRow } from "@/components/ui/error-row"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { LoadingRow } from "@/components/ui/loading-row"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TableCell } from "@/components/ui/table"
import type { ListingChoice } from "@/lib/api/posts/posts"
import { removeDealClaim, type DealClaim } from "@/lib/api/promotions/claims"
import {
  changePromotions,
  copyPromotion,
  getPromotionErrorMessage,
  loadListingHoursForDeal,
  loadPromotionForEdit,
  removePromotions,
  reopenEndedPromotion,
  saveNewPromotion,
  savePromotion,
  type PromotionsPage,
  type PromotionSummary,
  type PromotionWindowData,
} from "@/lib/api/promotions/promotions"
import { statusIn } from "@/lib/directory/listings-dashboard-search"
import { slugFromTitle } from "@/lib/directory/slugs"
import { formatDate } from "@/lib/format/format-time"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useBulkChange } from "@/lib/hooks/use-bulk-change"
import { useClearSelectionOnListChange } from "@/lib/hooks/use-clear-selection"
import { useLoad } from "@/lib/hooks/use-load"
import { useSelection } from "@/lib/hooks/use-selection"
import { useListSearchNavigate, useListSort, useOpenRecord } from "@/lib/nav/list-search"
import { codesUsedText } from "@/lib/promotions/claim-fields"
import { blankDealContent, dealContentFrom, dealContentInput, type DealContentFields } from "@/lib/promotions/deal-content"
import { dealAdminDaysText } from "@/lib/promotions/deal-days"
import { DEAL_TYPE_LABELS, DEAL_TYPES, type DealType } from "@/lib/promotions/deal-headline"
import { dealStage, hasDealTimes } from "@/lib/promotions/deal-times"
import {
  DEFAULT_PROMOTION_SORT,
  PROMOTION_SORT_COLUMNS,
  promotionSortDirection,
  type PromotionSortColumn,
} from "@/lib/promotions/promotion-sort"
import { showErrorToast } from "@/lib/toast/error-toast"

type DealStatus = "draft" | "published"
const STATUS_LABELS: Record<DealStatus, string> = { draft: "Draft", published: "Published" }

/** One read per deal, shared by a hover and the open. */
const dealCache = makeRecordCache((id: string) => loadPromotionForEdit(id))

/**
 * The Promotions row: the site's deals, each at one listing (Tyler, 18 Nov
 * 2026: "we have to move promotions in the new dashboard too"). It was
 * Admin → Promotions, whose rows opened a window with Save.
 *
 * - **Header:** "N selected" (Publish, Unpublish, Delete), search, Select,
 *   Filter (Status), New deal. The "From owners" button went: the Deals from
 *   owners row's pill counts what is waiting.
 * - **Rows:** the cog and the bin; right-click holds Mass select, Duplicate
 *   and Delete.
 * - **Right:** the open deal, saving by itself, in the same cards an owner
 *   writes a deal in. Status is in its ⋮, and the footer publishes it.
 */
export function PromotionsSection({ data, search, frame, onChanged }: SectionProps<PromotionsPage>) {
  const setListSearch = useListSearchNavigate()
  const setOpen = useOpenRecord()
  const q = search.q ?? ""
  const status = statusIn(search.status, ["draft", "published"] as const)
  const sort = statusIn(search.sort, PROMOTION_SORT_COLUMNS) ?? DEFAULT_PROMOTION_SORT
  const direction = search.direction ?? promotionSortDirection(sort)
  const toggleSort = useListSort<PromotionSortColumn>({ sort, direction }, promotionSortDirection)
  const [massSelect, setMassSelect] = React.useState(false)
  const selection = useSelection()
  const [rightClick, setRightClick] = React.useState<{ id: string; x: number; y: number } | null>(null)
  const [confirm, setConfirm] = React.useState<PromotionSummary[] | null>(null)
  const [run, busy] = useAsyncAction(getPromotionErrorMessage)
  const [pressedId, setPressedId] = React.useState<string>()
  /** Bumped when a bulk change reaches the open deal, so its record is read again. */
  const [recordRead, setRecordRead] = React.useState(0)

  const listKey = `${q}|${status ?? ""}|${sort}|${direction}|${data.page}|${data.pageSize}`
  useClearSelectionOnListChange(selection.setSelected, listKey)
  const ids = data.promotions.map((promotion) => promotion.id)
  const openId = search.open
  useOpenFirstRow(ids, openId, listKey)
  const openRow = data.promotions.find((promotion) => promotion.id === openId) ?? null

  const refresh = React.useCallback(async () => {
    dealCache.forget()
    await onChanged()
  }, [onChanged])

  const bulk = useBulkChange({
    one: "deal",
    rows: data.promotions,
    // A deal is filed under its listing, not the site's categories, so
    // publishing and unpublishing are the whole of it.
    send: changePromotions,
    describeError: getPromotionErrorMessage,
    onChanged: refresh,
    setSelected: selection.setSelected,
  })
  const ticked = data.promotions.filter((promotion) => selection.selected.has(promotion.id))
  const tickedIds = ticked.map((promotion) => promotion.id)
  const change = useBulkChangeAsk({
    count: ticked.length,
    one: "deal",
    many: "deals",
    busy: bulk.busy,
    categories: null,
    onRun: async (next) => {
      const went = await bulk.run(tickedIds, next)
      // The open deal's form would save its old status back on the next edit.
      if (openId && tickedIds.includes(openId)) setRecordRead((count) => count + 1)
      return went
    },
  })

  /** A copy to start from: the same deal as a draft at a free address. It opens on the right, ready to rename. */
  const duplicate = (promotion: PromotionSummary) =>
    void run(async () => {
      const copy = await copyPromotion(promotion.id)
      await refresh()
      setOpen(copy.id)
    })

  const actionsFor = (promotion: PromotionSummary): RowMenuItem[] => [
    { label: "Duplicate", icon: <CopyIcon className="size-4" />, onSelect: () => duplicate(promotion) },
    { label: "Delete", icon: <Trash2Icon className="size-4" />, destructive: true, onSelect: () => setConfirm([promotion]) },
  ]

  const toggleMassSelect = (tickId?: string) => {
    if (massSelect) {
      selection.clear()
      setMassSelect(false)
      return
    }
    setMassSelect(true)
    if (tickId) selection.setSelected(new Set([tickId]))
  }
  const rightClicked = rightClick ? data.promotions.find((promotion) => promotion.id === rightClick.id) : undefined

  const middle = (
    <div className="@container flex h-full min-h-0 flex-col overflow-hidden bg-card" {...prefetchHandlers((id) => dealCache.prefetch(id))}>
      <CrmListHeader
        tabs={<MiddleHeading icon={TagIcon} label="Promotions" />}
        end={<PanelReopenButton side="right" label="Show the deal" />}
        selected={
          massSelect && ticked.length ? (
            <SelectedMenu
              count={ticked.length}
              busy={busy || bulk.busy}
              onClear={selection.clear}
              pages={{}}
              main={(menu) => (
                <>
                  <SelectedMenuRow
                    onClick={() => {
                      menu.close()
                      change.ask.status("published")
                    }}
                  >
                    Publish
                  </SelectedMenuRow>
                  <SelectedMenuRow
                    onClick={() => {
                      menu.close()
                      change.ask.status("draft")
                    }}
                  >
                    Unpublish
                  </SelectedMenuRow>
                  <SelectedMenuSeparator />
                  <SelectedMenuRow
                    className="text-destructive"
                    onClick={() => {
                      menu.close()
                      setConfirm(ticked)
                    }}
                  >
                    <Trash2Icon className="size-4" />
                    Delete
                  </SelectedMenuRow>
                </>
              )}
            />
          ) : null
        }
        menuLabel="More for deals"
        search={{
          name: "promotion-search",
          label: "Search deals by title, listing or code",
          placeholder: "Search deals",
          value: q,
          onChange: (text) => setListSearch({ q: text.trim() ? text : undefined, page: undefined }),
        }}
        massSelect={{ on: massSelect, onToggle: () => toggleMassSelect() }}
        filter={
          <FilterPopover contentClassName="w-60" count={status ? 1 : 0} onClear={() => setListSearch({ status: undefined, page: undefined })} save={null}>
            <FilterRow id="promotions-status" label="Status">
              <Select value={status ?? "all"} onValueChange={(value) => setListSearch({ status: value === "all" ? undefined : value, page: undefined })}>
                <SelectTrigger id="promotions-status" className="h-8 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                </SelectContent>
              </Select>
            </FilterRow>
          </FilterPopover>
        }
        primary={
          <NewDealDropdown
            onCreated={async (id) => {
              await refresh()
              setOpen(id)
            }}
          />
        }
      />
      <CrmTable<PromotionSortColumn>
        columns={[
          { key: "title", label: "Deal", column: "main", className: "min-w-40" },
          { key: "status", label: "Status", column: "meta", className: "hidden md:hidden @lg:table-cell" },
          { key: "start", label: "Days", column: "meta", className: "hidden md:hidden @xl:table-cell" },
          { key: "views", label: "Views", column: "meta", className: "hidden md:hidden @2xl:table-cell" },
          { key: "updated", label: "Updated", column: "meta", className: "hidden md:hidden @3xl:table-cell" },
        ]}
        sort={sort}
        direction={direction}
        onSort={toggleSort}
        select={
          massSelect
            ? { noun: "deals", disabled: ids.length === 0, checked: selection.selectAllState(ids), onToggle: () => selection.toggleVisible(ids) }
            : null
        }
        empty={
          data.promotions.length > 0 ? null : q.trim() || status ? (
            <NoMatches words={q} noun="deals" onClear={() => setListSearch({ q: undefined, status: undefined, page: undefined })} />
          ) : (
            "No deals yet. A deal is an offer at one listing, with a page of its own. Make one with New deal."
          )
        }
      >
        {data.promotions.map((promotion) => (
          <CrmTableRow
            key={promotion.id}
            open={promotion.id === openId}
            label={promotion.title}
            tick={{ shown: massSelect, ticked: selection.selected.has(promotion.id), onToggle: () => selection.toggle(promotion.id) }}
            onOpen={() => {
              setPressedId(promotion.id)
              setOpen(promotion.id)
            }}
            onDelete={() => setConfirm([promotion])}
            onRightClick={(x, y) => setRightClick({ id: promotion.id, x, y })}
          >
            <MainCell name={promotion.title} line={promotion.ownerUserId ? `${promotion.listingTitle} · From the owner` : promotion.listingTitle}>
              <PrefetchMark id={promotion.id} />
            </MainCell>
            <TableCell column="meta" className="hidden md:hidden @lg:table-cell">
              <DealStatusChip promotion={promotion} now={data.now} />
            </TableCell>
            <TableCell column="mutedMeta" className="hidden md:hidden @xl:table-cell">
              {dealAdminDaysText(promotion)}
            </TableCell>
            <TableCell column="mutedMeta" className="hidden tabular-nums md:hidden @2xl:table-cell">
              {promotion.views.toLocaleString()}
            </TableCell>
            <TableCell column="mutedMeta" className="hidden md:hidden @3xl:table-cell">
              {formatDate(promotion.updatedAt)}
            </TableCell>
          </CrmTableRow>
        ))}
      </CrmTable>
      <ListPager page={data.page} pageSize={data.pageSize} total={data.total} />
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
    showMiddleFor: listKey,
    showRightFor: pressedId && pressedId === openId ? pressedId : undefined,
    middle,
    right: {
      label: "Deal",
      showLabel: "Show the deal",
      content: openId ? (
        <DealRecord
          key={`${openId}:${recordRead}`}
          dealId={openId}
          title={openRow?.title ?? "Deal"}
          actions={openRow ? actionsFor(openRow) : []}
          busy={busy}
          onSaved={() => {
            dealCache.forget(openId)
            void onChanged()
          }}
        />
      ) : (
        <EmptyRecord
          title="Deal"
          icon={<TagIcon aria-hidden />}
          line={data.total ? "Click a deal to see it here." : "Make a deal with New deal to see it here."}
          hideLabel="Hide the deal"
        />
      ),
    },
    windows: (
      <>
        {change.windows}
        <ConfirmDialog
          open={confirm !== null}
          onOpenChange={(open) => {
            if (!open) setConfirm(null)
          }}
          title={confirm && confirm.length > 1 ? `Delete ${confirm.length} deals?` : "Delete this deal?"}
          description={
            confirm
              ? confirm.length === 1
                ? `${confirm[0]!.title} goes for good, and its page stops existing. The listing it is at stays.`
                : `${confirm.length} deals go for good, and their pages stop existing. The listings they are at stay.`
              : null
          }
          confirmLabel={confirm && confirm.length > 1 ? `Delete ${confirm.length} deals` : "Delete deal"}
          destructive
          loading={busy}
          onConfirm={() =>
            void run(async () => {
              if (!confirm) return
              const { done, kept } = await removePromotions(confirm.map((promotion) => promotion.id))
              // The open deal gone, the first row opens in its place.
              if (openId && done.includes(openId)) setOpen(undefined)
              await refresh()
              selection.setSelected(new Set(kept))
              if (done.length === 0) throw new Error("No deals were deleted. They may already be gone, and the list has been read again.")
              setConfirm(null)
            })
          }
        />
      </>
    ),
  })
}

/**
 * One chip, the one that says most: Draft, or for a published deal why it is
 * not on the Deals page (it has ended, or its listing is a draft or closed),
 * else Published.
 */
function DealStatusChip({ promotion, now }: { promotion: PromotionSummary; now: string }) {
  if (promotion.status !== "published") return <Chip muted>Draft</Chip>
  if (dealStage(promotion, now) === "ended") return <Chip muted>Ended</Chip>
  if (promotion.listingStatus === "draft") return <Chip muted>Listing is a draft</Chip>
  if (promotion.listingStatus === "closed") return <Chip muted>Listing is closed</Chip>
  return <Chip>Published</Chip>
}

/** Today on this computer's calendar, "2026-11-18", the day a new deal starts on until it is changed. */
function today() {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/**
 * New deal: what the server needs before a deal can exist (a title, its
 * listing, its type and the number or words of its headline), as a dropdown
 * under its button. It starts today, as a draft, and opens on the right for
 * the rest.
 */
function NewDealDropdown({ onCreated }: { onCreated: (id: string) => Promise<void> }) {
  const [open, setOpen] = React.useState(false)
  const [title, setTitle] = React.useState("")
  const [listing, setListing] = React.useState<ListingChoice | null>(null)
  const [dealType, setDealType] = React.useState<DealType | "">("")
  const [words, setWords] = React.useState("")
  const [run, saving] = useAsyncAction(getPromotionErrorMessage)
  const byNumber = dealType === "money_off" || dealType === "percent_off"

  return (
    <NewRecordDropdown
      label="New deal"
      open={open}
      onOpenChange={setOpen}
      submitLabel="Create deal"
      busy={saving}
      onSubmit={() =>
        void run(async () => {
          if (!title.trim()) throw new Error("Give the deal a title first.")
          if (!listing) throw new Error("Pick the listing the deal is at.")
          const fields: DealContentFields = {
            ...blankDealContent(),
            title: title.trim(),
            startDate: today(),
            dealType,
            amount: byNumber ? words : "",
            headline: byNumber ? "" : words,
          }
          const made = await saveNewPromotion({ ...fields, ...dealContentInput(fields), listingId: listing.id, status: "draft" })
          setTitle("")
          setListing(null)
          setDealType("")
          setWords("")
          setOpen(false)
          await onCreated(made.id)
        })
      }
      trigger={
        <DashboardToolbarButton type="button" aria-label="New deal">
          <PlusIcon className="size-4" />
          <span className="@max-3xl:sr-only">New deal</span>
        </DashboardToolbarButton>
      }
    >
      <div className="grid gap-2">
        <FieldLabel htmlFor="new-deal-title" hint="Like Two-for-one pasta Tuesdays. It starts today as a draft.">
          Title
        </FieldLabel>
        <Input id="new-deal-title" autoFocus value={title} maxLength={200} disabled={saving} onChange={(event) => setTitle(event.target.value)} />
      </div>
      <div className="grid gap-2">
        <FieldLabel htmlFor="new-deal-listing">Listing</FieldLabel>
        <div className="grid justify-items-start gap-2">
          <Input id="new-deal-listing" readOnly value={listing?.title ?? ""} placeholder="None picked" />
          <ListingPicker label={listing ? "Change the listing" : "Pick a listing"} inputId="new-deal-listing-search" size="sm" disabled={saving} onPick={setListing} />
        </div>
      </div>
      <div className="grid gap-2">
        <FieldLabel htmlFor="new-deal-type">Type</FieldLabel>
        <Select value={dealType} disabled={saving} onValueChange={(value) => setDealType(value as DealType)}>
          <SelectTrigger id="new-deal-type" className="h-8 w-full">
            <SelectValue placeholder="Pick a type" />
          </SelectTrigger>
          <SelectContent>
            {DEAL_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {DEAL_TYPE_LABELS[type]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {dealType ? (
        <div className="grid gap-2">
          <FieldLabel htmlFor="new-deal-words">
            {dealType === "money_off" ? "Dollars off" : dealType === "percent_off" ? "Percent off" : "Headline"}
          </FieldLabel>
          <Input
            id="new-deal-words"
            inputMode={byNumber ? "decimal" : undefined}
            value={words}
            maxLength={byNumber ? 10 : 24}
            placeholder={dealType === "money_off" ? "5" : dealType === "percent_off" ? "20" : "Free dessert"}
            disabled={saving}
            onChange={(event) => setWords(event.target.value)}
          />
        </div>
      ) : null}
    </NewRecordDropdown>
  )
}

function DealRecord({
  dealId,
  title,
  actions,
  busy,
  onSaved,
}: {
  dealId: string
  title: string
  actions: RowMenuItem[]
  busy: boolean
  onSaved: () => void
}) {
  // Wrapped, so a deal that is gone (an answer of null) is told apart from one still being read.
  const read = useLoad(() => dealCache.get(dealId).then((record) => ({ record })), getPromotionErrorMessage, { keys: [dealId] })
  const record = read.data?.record
  if (!record) {
    return (
      <RecordFrame
        avatar={<TagIcon aria-hidden />}
        title={title}
        hideLabel="Hide the deal"
        body={
          read.error ? (
            <ErrorRow message={read.error} onRetry={read.retry} />
          ) : read.data ? (
            <DetailNote>That deal no longer exists.</DetailNote>
          ) : (
            <LoadingRow label="Opening the deal…" />
          )
        }
      />
    )
  }
  return <DealForm key={dealId} record={record} actions={actions} busy={busy} onSaved={onSaved} />
}

type DealFields = DealContentFields & { listingId: string; status: DealStatus }

/**
 * One deal on the right, saving by itself: who and where first, then the
 * cards an owner writes a deal in, the counter and who claimed it.
 */
function DealForm({
  record,
  actions,
  busy,
  onSaved,
}: {
  record: PromotionWindowData
  actions: RowMenuItem[]
  busy: boolean
  onSaved: () => void
}) {
  const navigate = useNavigate()
  const promotion = record.promotion
  const [fields, setFields] = React.useState<DealFields>(() => ({
    ...dealContentFrom(promotion),
    listingId: promotion.listingId,
    status: promotion.status,
  }))
  const [slug, setSlug] = React.useState(promotion.slug)
  // The address part saves when its box is left, never mid-word: a half-typed
  // address would move the public page with every key.
  const [savedSlug, setSavedSlug] = React.useState(promotion.slug)
  const [picked, setPicked] = React.useState<ListingChoice | null>(record.listing)
  /** Set by a refused save, so the boxes the server named are marked. */
  const [tried, setTried] = React.useState(false)
  const [endedAt, setEndedAt] = React.useState(promotion.endedAt)
  const [claims, setClaims] = React.useState<DealClaim[]>(record.claims)
  const [removingClaim, setRemovingClaim] = React.useState<string | null>(null)
  // The trash button asks first: it frees the place at once and cannot be
  // undone, the way taking somebody off an event's list asks.
  const [askingRemove, setAskingRemove] = React.useState<DealClaim | null>(null)
  const [copyingHours, setCopyingHours] = React.useState(false)
  const [runNow, nowBusy] = useAsyncAction(getPromotionErrorMessage)

  const update = <Key extends keyof DealContentFields>(key: Key, value: DealContentFields[Key]) =>
    setFields((current) => ({ ...current, [key]: value }))

  const ready = fields.title.trim().length > 0 && fields.listingId.length > 0
  const auto = useAutoSave({
    value: { ...fields, slug: savedSlug },
    ready,
    message: getPromotionErrorMessage,
    save: async (next) => {
      try {
        await savePromotion({ id: promotion.id, ...next, ...dealContentInput(next) })
      } catch (error) {
        setTried(true)
        throw error
      }
      onSaved()
    },
  })

  /** Fills every day from the listing's opening hours. */
  const copyListingHours = async () => {
    setCopyingHours(true)
    try {
      const hours = await loadListingHoursForDeal(fields.listingId)
      if (!hours) throw new Error("That listing is not on this site any more.")
      if (!hasDealTimes(hours)) throw new Error(`${picked?.title ?? "That listing"} has no opening hours to copy.`)
      update("times", hours)
    } catch (error) {
      showErrorToast(getPromotionErrorMessage(error))
    } finally {
      setCopyingHours(false)
    }
  }

  const openListing = () => void navigate({ to: "/admin/listings", search: { open: fields.listingId } })
  const why = !fields.title.trim() ? "Give it a title to save" : !fields.listingId ? "Pick its listing to save" : undefined

  return (
    <RecordFrame
      avatar={fields.coverImage ? <img src={fields.coverImage} alt="" className="size-6 rounded-md object-cover" /> : <TagIcon aria-hidden />}
      title={fields.title.trim() || "Untitled deal"}
      line={`${STATUS_LABELS[fields.status]}${endedAt ? " · Ended" : ""} · /deals/${savedSlug}`}
      hideLabel="Hide the deal"
      actions={
        <>
          <RecordPreviewLink word="deal" path={`/deals/${savedSlug}`} published={fields.status === "published"} />
          <RecordMenu
            label="Deal menu"
            groups={
              <PickGroup title="Deal">
                <PickMenuRow
                  label="Status"
                  value={STATUS_LABELS[fields.status]}
                  options={[
                    { value: "draft", label: "Draft" },
                    { value: "published", label: "Published" },
                  ]}
                  selected={fields.status}
                  onPick={(value) => setFields((current) => ({ ...current, status: value as DealStatus }))}
                />
              </PickGroup>
            }
            actions={[
              ...(fields.listingId ? [{ label: "Open the listing", icon: <StoreIcon className="size-4" />, onSelect: openListing }] : []),
              ...actions.map((action) => ({ ...action, disabled: busy })),
            ]}
          />
        </>
      }
      body={
        <DealCardsAsPanels>
          <PanelCard storageId="deal-basics" icon={<TagIcon />} title="The deal" openWhen={!ready}>
            <div className="grid gap-4">
              <div className="grid gap-2">
                <FieldLabel htmlFor="deal-title">Title</FieldLabel>
                <Input
                  id="deal-title"
                  value={fields.title}
                  maxLength={200}
                  aria-invalid={!fields.title.trim()}
                  onChange={(event) => update("title", event.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <FieldLabel
                  htmlFor="deal-slug"
                  hint="The part after /deals/ in the deal's address. Changing it changes the address. Old links forward to the new one."
                >
                  Address part
                </FieldLabel>
                <Input
                  id="deal-slug"
                  value={slug}
                  onChange={(event) => setSlug(event.target.value)}
                  onBlur={() => {
                    const next = slug.trim() || slugFromTitle(fields.title)
                    setSlug(next)
                    setSavedSlug(next)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur()
                  }}
                />
              </div>
              <div className="grid gap-2">
                <FieldLabel htmlFor="deal-listing" hint="The place the deal is at. The deal page links to it. Deleting the listing deletes its deals.">
                  Listing
                </FieldLabel>
                <div className="grid justify-items-start gap-2">
                  <Input id="deal-listing" readOnly value={picked?.title ?? ""} placeholder="None picked" />
                  <ListingPicker
                    label="Change the listing"
                    inputId="deal-listing-search"
                    size="sm"
                    onPick={(listing) => {
                      setPicked(listing)
                      setFields((current) => ({ ...current, listingId: listing.id }))
                    }}
                  />
                </div>
                {picked?.status === "draft" ? (
                  <p className="text-sm text-muted-foreground" role="status">
                    This listing is a draft, so the deal stays off the Deals page until the listing is published.
                  </p>
                ) : picked?.status === "closed" ? (
                  <p className="text-sm text-muted-foreground" role="status">
                    This listing is closed for good, so the deal stays off the Deals page.
                  </p>
                ) : null}
              </div>
              <ImageUpload
                label="Cover image"
                hint="Shown on the deal's card and at the top of its page. With none, the listing's own photo is used."
                value={fields.coverImage}
                aspect="square"
                fit="cover"
                className="max-w-24"
                onChange={(url) => update("coverImage", url)}
              />
              <p className="text-xs text-muted-foreground">
                Written by {record.createdBy ?? "an account that is gone"} on {formatDate(promotion.createdAt)}.
              </p>
            </div>
          </PanelCard>
          {endedAt ? (
            <PanelCard storageId="deal-ended" icon={<TimerOffIcon />} title="Ended early">
              <div className="grid gap-3">
                <p className="text-sm text-muted-foreground">
                  {promotion.ownerUserId ? "The owner" : "Somebody"} pressed End now on {formatDate(endedAt)}. It is off every public
                  list, and its page says it has ended.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="w-fit"
                  disabled={nowBusy}
                  onClick={() =>
                    void runNow(async () => {
                      await reopenEndedPromotion(promotion.id)
                      setEndedAt(null)
                      onSaved()
                    })
                  }
                >
                  {nowBusy ? <Loader2Icon className="size-4 animate-spin" /> : null}
                  Start it again
                </Button>
              </div>
            </PanelCard>
          ) : null}
          <DealHeadlineCard idPrefix="deal" fields={fields} update={update} disabled={false} tried={tried} oldDeal={!promotion.dealType} />
          <DealDaysCard idPrefix="deal" fields={fields} update={update} disabled={false} />
          <DealTimesCard
            idPrefix="deal"
            fields={fields}
            update={update}
            disabled={false}
            copyBlockedBy={fields.listingId ? null : "Pick the listing first, then its hours can be copied."}
            copying={copyingHours}
            onCopyHours={() => void copyListingHours()}
          />
          <DealClaimsCard idPrefix="deal" fields={fields} update={update} disabled={false} tried={tried} />
          {promotion.takesClaims ? (
            <>
              <CounterPanel promotionId={promotion.id} dealTitle={promotion.title} onClaims={setClaims} />
              <PanelCard storageId="deal-claimed" icon={<UsersIcon />} title="Who claimed" meta={claims.length || undefined}>
                <div className="grid gap-3">
                  <p className="text-sm text-muted-foreground">
                    {codesUsedText(claims)}. {claims.length} claimed
                    {promotion.claimLimit ? ` of ${promotion.claimLimit}` : ""}. Taking a claim away frees the place, and the same email can
                    claim again, but a code already used stays.
                  </p>
                  <WhoClaimedList
                    claims={claims}
                    removingId={removingClaim}
                    onRemove={setAskingRemove}
                  />
                  <ConfirmDialog
                    open={askingRemove !== null}
                    onOpenChange={(open) => {
                      if (!open) setAskingRemove(null)
                    }}
                    title={`Take ${askingRemove?.name ?? "this"}'s claim away?`}
                    description="The place opens up for somebody else, and their code stops working. The same email can claim again."
                    confirmLabel="Take it away"
                    destructive
                    loading={removingClaim !== null}
                    onConfirm={() => {
                      const claim = askingRemove
                      if (!claim) return
                      void runNow(async () => {
                        setRemovingClaim(claim.id)
                        try {
                          setClaims(await removeDealClaim({ promotionId: promotion.id, claimId: claim.id }))
                        } finally {
                          setRemovingClaim(null)
                          setAskingRemove(null)
                        }
                      })
                    }}
                  />
                </div>
              </PanelCard>
            </>
          ) : null}
          <DealWordsCard idPrefix="deal" fields={fields} update={update} disabled={false} />
        </DealCardsAsPanels>
      }
      footer={
        <>
          <FooterState>
            <AutoSaveWords state={auto.state} ready={ready} why={why} />
          </FooterState>
          {fields.status === "published" ? (
            <Button type="button" variant="outline" onClick={() => setFields((current) => ({ ...current, status: "draft" }))}>
              Unpublish
            </Button>
          ) : (
            <Button type="button" onClick={() => setFields((current) => ({ ...current, status: "published" }))}>
              Publish
            </Button>
          )}
        </>
      }
    />
  )
}
