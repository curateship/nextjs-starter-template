import * as React from "react"
import { BookOpenIcon, CopyIcon, PlusIcon, StoreIcon, Trash2Icon } from "lucide-react"

import { CrmListHeader, CrmRowMenu, type RowMenuItem } from "@/components/crm/crm-row"
import { Chip, CrmTable, CrmTableRow, MainCell } from "@/components/crm/crm-table"
import { EmptyRecord, FooterState, RecordFrame } from "@/components/crm/record-frame"
import { GuideListings } from "@/components/directory/guide-listings"
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
import { CharacterCount } from "@/components/shared/character-count"
import { DashboardToolbarButton } from "@/components/shared/dashboard-toolbar"
import { FilterPopover } from "@/components/shared/filter-popover"
import { ImageUpload } from "@/components/shared/image-upload"
import { SelectedMenu, SelectedMenuRow } from "@/components/shared/mass-select"
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
import { Textarea } from "@/components/ui/textarea"
import {
  getGuideErrorMessage,
  loadGuideForEdit,
  loadGuidesPage,
  removeGuides,
  saveGuide,
  saveNewGuide,
} from "@/lib/api/directory/guides"
import { GUIDE_SORT_COLUMNS, guideSortDirection, MAX_GUIDE_INTRO, type GuideSortColumn } from "@/lib/directory/guides"
import { statusIn } from "@/lib/directory/listings-dashboard-search"
import { slugFromTitle } from "@/lib/directory/slugs"
import { formatDate } from "@/lib/format/format-time"
import { plural } from "@/lib/format/plural"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useClearSelectionOnListChange } from "@/lib/hooks/use-clear-selection"
import { useLoad } from "@/lib/hooks/use-load"
import { useSelection } from "@/lib/hooks/use-selection"
import { useListSearchNavigate, useListSort, useOpenRecord } from "@/lib/nav/list-search"

type Data = Awaited<ReturnType<typeof loadGuidesPage>>
type GuideRow = Data["guides"][number]
type GuideStatus = "draft" | "published"
type ForEdit = NonNullable<Awaited<ReturnType<typeof loadGuideForEdit>>>

/** One read per guide, shared by a hover and the open. */
const guideCache = makeRecordCache((id: string) => loadGuideForEdit(id))

const STATUS_LABELS: Record<GuideStatus, string> = { draft: "Draft", published: "Published" }

/**
 * The Guides row: the guides the editor writes, each an ordered list of
 * listings with a page of its own. It was the Guides page, whose rows opened
 * a window with Save.
 *
 * - **Header:** "N selected" (Delete), search, Select, Filter (Status),
 *   New guide.
 * - **Rows:** the cog and the bin; right-click holds Mass select, Duplicate
 *   and Delete.
 * - **Right:** the open guide, saving by itself: its words and cover, and
 *   its listings dragged into order. Status is in its ⋮, and the footer
 *   publishes it.
 */
export function GuidesSection({ data, search, frame, onChanged }: SectionProps<Data>) {
  const setListSearch = useListSearchNavigate()
  const setOpen = useOpenRecord()
  const q = search.q ?? ""
  const status = statusIn(search.status, ["draft", "published"] as const)
  const sort = statusIn(search.sort, GUIDE_SORT_COLUMNS) ?? "updated"
  const direction = search.direction ?? "desc"
  const toggleSort = useListSort<GuideSortColumn>({ sort, direction }, guideSortDirection)
  const [massSelect, setMassSelect] = React.useState(false)
  const selection = useSelection()
  const [rightClick, setRightClick] = React.useState<{ id: string; x: number; y: number } | null>(null)
  const [confirm, setConfirm] = React.useState<GuideRow[] | null>(null)
  const [run, busy] = useAsyncAction(getGuideErrorMessage)
  const [pressedId, setPressedId] = React.useState<string>()

  const listKey = `${q}|${status ?? ""}|${sort}|${direction}|${data.page}`
  useClearSelectionOnListChange(selection.setSelected, listKey)
  const ids = data.guides.map((guide) => guide.id)
  const openId = search.open
  useOpenFirstRow(ids, openId, listKey)
  const openRow = data.guides.find((guide) => guide.id === openId) ?? null

  const refresh = async () => {
    guideCache.forget()
    await onChanged()
  }

  /** A copy to start from: the same words and listings, a free address, a draft. It opens on the right. */
  const duplicate = (guide: GuideRow) =>
    void run(async () => {
      const whole = await loadGuideForEdit(guide.id)
      if (!whole) throw new Error("That guide no longer exists.")
      const made = await saveNewGuide({ title: `${guide.title} copy` })
      await saveGuide({
        id: made.id,
        intro: whole.guide.intro,
        coverImage: whole.guide.coverImage,
        listingIds: whole.listings.map((row) => row.id),
      })
      await refresh()
      setOpen(made.id)
    })

  const actionsFor = (guide: GuideRow): RowMenuItem[] => [
    { label: "Duplicate", icon: <CopyIcon className="size-4" />, onSelect: () => duplicate(guide) },
    { label: "Delete", icon: <Trash2Icon className="size-4" />, destructive: true, onSelect: () => setConfirm([guide]) },
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
  const ticked = data.guides.filter((guide) => selection.selected.has(guide.id))
  const rightClicked = rightClick ? data.guides.find((guide) => guide.id === rightClick.id) : undefined

  const middle = (
    <div className="@container flex h-full min-h-0 flex-col overflow-hidden bg-card" {...prefetchHandlers((id) => guideCache.prefetch(id))}>
      <CrmListHeader
        tabs={<MiddleHeading icon={BookOpenIcon} label="Guides" />}
        end={<PanelReopenButton side="right" label="Show the guide" />}
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
                    setConfirm(ticked)
                  }}
                >
                  <Trash2Icon className="size-4" />
                  Delete
                </SelectedMenuRow>
              )}
            />
          ) : null
        }
        menuLabel="More for guides"
        search={{
          name: "guide-search",
          label: "Search guides",
          placeholder: "Search guides",
          value: q,
          onChange: (text) => setListSearch({ q: text.trim() ? text : undefined, page: undefined }),
        }}
        massSelect={{ on: massSelect, onToggle: () => toggleMassSelect() }}
        filter={
          <FilterPopover contentClassName="w-60" count={status ? 1 : 0} onClear={() => setListSearch({ status: undefined, page: undefined })} save={null}>
            <FilterRow id="guides-status" label="Status">
              <Select value={status ?? "all"} onValueChange={(value) => setListSearch({ status: value === "all" ? undefined : value, page: undefined })}>
                <SelectTrigger id="guides-status" className="h-8 w-full">
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
          <NewGuideDropdown
            onCreated={async (id) => {
              await refresh()
              setOpen(id)
            }}
          />
        }
      />
      <CrmTable<GuideSortColumn>
        columns={[
          { key: "title", label: "Guide", column: "main", className: "min-w-40" },
          { key: "status", label: "Status", column: "meta", className: "hidden md:hidden @lg:table-cell" },
          { key: "listings", label: "Listings", column: "meta" },
          { key: "updated", label: "Updated", column: "meta", className: "hidden md:hidden @2xl:table-cell" },
        ]}
        sort={sort}
        direction={direction}
        onSort={toggleSort}
        select={
          massSelect
            ? { noun: "guides", disabled: ids.length === 0, checked: selection.selectAllState(ids), onToggle: () => selection.toggleVisible(ids) }
            : null
        }
        empty={
          data.guides.length > 0 ? null : q.trim() || status ? (
            <NoMatches words={q} noun="guides" onClear={() => setListSearch({ q: undefined, status: undefined, page: undefined })} />
          ) : (
            "No guides yet. A guide is a list of listings with a page of its own. Make one with New guide."
          )
        }
      >
        {data.guides.map((guide) => (
          <CrmTableRow
            key={guide.id}
            open={guide.id === openId}
            label={guide.title}
            tick={{ shown: massSelect, ticked: selection.selected.has(guide.id), onToggle: () => selection.toggle(guide.id) }}
            onOpen={() => {
              setPressedId(guide.id)
              setOpen(guide.id)
            }}
            onDelete={() => setConfirm([guide])}
            onRightClick={(x, y) => setRightClick({ id: guide.id, x, y })}
          >
            <MainCell name={guide.title} line={`/guides/${guide.slug}`}>
              <PrefetchMark id={guide.id} />
            </MainCell>
            <TableCell column="meta" className="hidden md:hidden @lg:table-cell">
              <Chip muted>{STATUS_LABELS[guide.status as GuideStatus] ?? guide.status}</Chip>
            </TableCell>
            <TableCell column="mutedMeta" className="tabular-nums">
              {guide.shown === guide.listings ? guide.listings : `${guide.shown} of ${guide.listings} shown`}
            </TableCell>
            <TableCell column="mutedMeta" className="hidden md:hidden @2xl:table-cell">
              {formatDate(guide.updatedAt)}
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
      label: "Guide",
      showLabel: "Show the guide",
      content: openId ? (
        <GuideRecord
          key={openId}
          guideId={openId}
          title={openRow?.title ?? "Guide"}
          actions={openRow ? actionsFor(openRow) : []}
          busy={busy}
          onSaved={() => {
            guideCache.forget(openId)
            void onChanged()
          }}
        />
      ) : (
        <EmptyRecord
          title="Guide"
          icon={<BookOpenIcon aria-hidden />}
          line={data.total ? "Click a guide to see it here." : "Make a guide with New guide to see it here."}
          hideLabel="Hide the guide"
        />
      ),
    },
    windows: (
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null)
        }}
        title={confirm && confirm.length > 1 ? `Delete ${confirm.length} guides?` : "Delete this guide?"}
        description={
          confirm
            ? confirm.length === 1
              ? `${confirm[0]!.title} goes for good, and its page stops existing. The listings in it stay.`
              : `${confirm.length} guides go for good, and their pages stop existing. The listings in them stay.`
            : null
        }
        confirmLabel={confirm && confirm.length > 1 ? `Delete ${confirm.length} guides` : "Delete guide"}
        destructive
        loading={busy}
        onConfirm={() =>
          void run(async () => {
            if (!confirm) return
            const { done, kept } = await removeGuides(confirm.map((guide) => guide.id))
            // The open guide gone, the first row opens in its place.
            if (openId && done.includes(openId)) setOpen(undefined)
            await refresh()
            selection.setSelected(new Set(kept))
            if (done.length === 0) throw new Error("No guides were deleted. They may already be gone, and the list has been read again.")
            setConfirm(null)
          })
        }
      />
    ),
  })
}

/** New guide: a title, as a dropdown under its button. It starts as a draft and opens on the right. */
function NewGuideDropdown({ onCreated }: { onCreated: (id: string) => Promise<void> }) {
  const [open, setOpen] = React.useState(false)
  const [title, setTitle] = React.useState("")
  const [run, saving] = useAsyncAction(getGuideErrorMessage)
  return (
    <NewRecordDropdown
      label="New guide"
      open={open}
      onOpenChange={setOpen}
      submitLabel="Create guide"
      busy={saving}
      onSubmit={() =>
        void run(async () => {
          if (!title.trim()) throw new Error("Give the guide a title first.")
          const made = await saveNewGuide({ title: title.trim() })
          setTitle("")
          setOpen(false)
          await onCreated(made.id)
        })
      }
      trigger={
        <DashboardToolbarButton type="button" aria-label="New guide">
          <PlusIcon className="size-4" />
          <span className="@max-3xl:sr-only">New guide</span>
        </DashboardToolbarButton>
      }
    >
      <div className="grid gap-2">
        <FieldLabel htmlFor="new-guide-title" hint="Like Best brunch in the west end. It starts as a draft.">
          Title
        </FieldLabel>
        <Input id="new-guide-title" autoFocus value={title} disabled={saving} onChange={(event) => setTitle(event.target.value)} />
      </div>
    </NewRecordDropdown>
  )
}

function GuideRecord({
  guideId,
  title,
  actions,
  busy,
  onSaved,
}: {
  guideId: string
  title: string
  actions: RowMenuItem[]
  busy: boolean
  onSaved: () => void
}) {
  const read = useLoad(() => guideCache.get(guideId).then((record) => ({ record })), getGuideErrorMessage, { keys: [guideId] })
  const record = read.data?.record
  if (!record) {
    return (
      <RecordFrame
        avatar={<BookOpenIcon aria-hidden />}
        title={title}
        hideLabel="Hide the guide"
        body={
          read.error ? (
            <ErrorRow message={read.error} onRetry={read.retry} />
          ) : read.data ? (
            <DetailNote>That guide no longer exists.</DetailNote>
          ) : (
            <LoadingRow label="Opening the guide…" />
          )
        }
      />
    )
  }
  return <GuideForm key={guideId} record={record} actions={actions} busy={busy} onSaved={onSaved} />
}

/** One guide on the right: its words, cover and listings, saving by themselves; its status in the ⋮. */
function GuideForm({
  record,
  actions,
  busy,
  onSaved,
}: {
  record: ForEdit
  actions: RowMenuItem[]
  busy: boolean
  onSaved: () => void
}) {
  const guide = record.guide
  const [title, setTitle] = React.useState(guide.title)
  const [slug, setSlug] = React.useState(guide.slug)
  const [savedSlug, setSavedSlug] = React.useState(guide.slug)
  const [intro, setIntro] = React.useState(guide.intro)
  const [coverImage, setCoverImage] = React.useState(guide.coverImage)
  const [status, setStatus] = React.useState<GuideStatus>(guide.status as GuideStatus)
  const [listings, setListings] = React.useState(record.listings)
  const ready = title.trim().length > 0
  const auto = useAutoSave({
    value: { title, slug: savedSlug, intro, coverImage, status, listingIds: listings.map((row) => row.id) },
    ready,
    message: getGuideErrorMessage,
    save: async (next) => {
      await saveGuide({ id: guide.id, ...next })
      onSaved()
    },
  })
  const hidden = listings.filter((row) => row.status !== "published")

  return (
    <RecordFrame
      avatar={coverImage ? <img src={coverImage} alt="" className="size-6 rounded-md object-cover" /> : <BookOpenIcon aria-hidden />}
      title={title.trim() || "Untitled guide"}
      line={`${STATUS_LABELS[status]} · /guides/${savedSlug}`}
      hideLabel="Hide the guide"
      actions={
        <>
          <RecordPreviewLink word="guide" path={`/guides/${savedSlug}`} published={status === "published"} />
          <RecordMenu
            label="Guide menu"
            groups={
              <PickGroup title="Guide">
                <PickMenuRow
                  label="Status"
                  value={STATUS_LABELS[status]}
                  options={[
                    { value: "draft", label: "Draft" },
                    { value: "published", label: "Published" },
                  ]}
                  selected={status}
                  onPick={(value) => setStatus(value as GuideStatus)}
                />
              </PickGroup>
            }
            actions={actions.map((action) => ({ ...action, disabled: busy }))}
          />
        </>
      }
      body={
        <>
          <PanelCard storageId="guide-basics" icon={<BookOpenIcon />} title="The guide" openWhen={!ready}>
            <div className="grid gap-4">
              <div className="grid gap-2">
                <FieldLabel htmlFor="guide-title">Title</FieldLabel>
                <Input id="guide-title" value={title} aria-invalid={!ready} onChange={(event) => setTitle(event.target.value)} />
              </div>
              <div className="grid gap-2">
                <FieldLabel
                  htmlFor="guide-slug"
                  hint="The part after /guides/ in the guide's address. Changing it changes the address. Old links forward to the new one."
                >
                  Address part
                </FieldLabel>
                <Input
                  id="guide-slug"
                  value={slug}
                  onChange={(event) => setSlug(event.target.value)}
                  onBlur={() => {
                    const next = slug.trim() || slugFromTitle(title)
                    setSlug(next)
                    setSavedSlug(next)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur()
                  }}
                />
              </div>
              <div className="grid gap-2">
                <div className="flex items-center justify-between gap-2">
                  <FieldLabel htmlFor="guide-intro" hint="A sentence or two at the top of the guide, on its card on the Guides page and when it is shared.">
                    Intro
                  </FieldLabel>
                  <CharacterCount value={intro} max={MAX_GUIDE_INTRO} />
                </div>
                <Textarea id="guide-intro" rows={3} maxLength={MAX_GUIDE_INTRO} value={intro} onChange={(event) => setIntro(event.target.value)} />
              </div>
              <ImageUpload
                label="Cover image"
                hint="Shown at the top of the guide, on its card on the Guides page, and when it is shared."
                value={coverImage}
                aspect="square"
                fit="cover"
                className="max-w-24"
                onChange={(url) => setCoverImage(url)}
              />
            </div>
          </PanelCard>
          <PanelCard storageId="guide-listings" icon={<StoreIcon />} title="Listings" meta={listings.length || undefined}>
            <div className="grid gap-3">
              <p className="text-sm text-muted-foreground">Drag them into the order the guide's page shows them in.</p>
              <GuideListings listings={listings} disabled={false} onChange={setListings} />
              {hidden.length ? (
                <p className="text-sm text-muted-foreground" role="status">
                  {hidden.length === 1
                    ? "1 listing here is not published, so the guide's page leaves it out until it is."
                    : `${hidden.length} listings here are not published, so the guide's page leaves them out until they are.`}
                </p>
              ) : null}
            </div>
          </PanelCard>
        </>
      }
      footer={
        <>
          <FooterState>
            <AutoSaveWords state={auto.state} ready={ready} why="Give it a title to save" />
            <span className="text-muted-foreground">
              · {listings.length} {plural(listings.length, "listing", "listings")}
            </span>
          </FooterState>
          {status === "published" ? (
            <Button type="button" variant="outline" onClick={() => setStatus("draft")}>
              Unpublish
            </Button>
          ) : (
            <Button type="button" onClick={() => setStatus("published")}>
              Publish
            </Button>
          )}
        </>
      }
    />
  )
}
