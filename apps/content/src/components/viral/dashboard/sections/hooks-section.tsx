import * as React from "react"
import { FilmIcon, QuoteIcon } from "lucide-react"

import { FilterRow } from "@/components/admin-dashboard/list-parts"
import { ListHeader } from "@/components/content-app/list-header"
import { Chip, CrmTable, CrmTableRow, MainCell } from "@/components/crm/crm-table"
import { EmptyRecord } from "@/components/crm/record-frame"
import { FilterPopover } from "@/components/shared/filter-popover"
import { SavedViewsControls, SaveViewDialog, type EditFields, type SavedViewsScreen } from "@/components/shared/saved-views"
import { MiddleHeading, PanelReopenButton } from "@/components/shared/three-panels"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TableCell } from "@/components/ui/table"
import { CoverImage } from "@/components/viral/cover-image"
import type { ViralLoaded } from "@/components/viral/dashboard/load-section"
import { NoMatches, useOpenFirstRow, type SectionProps } from "@/components/viral/dashboard/section-parts"
import { LibraryHookPanel } from "@/components/viral/library-hook-panel"
import { NewHookDropdown } from "@/components/viral/library-own-hook"
import type { SavedView } from "@/lib/api/saved-views"
import { getViralErrorMessage } from "@/lib/api/viral/viral"
import type { LibraryHook } from "@/lib/api/viral/viral-library"
import { plural } from "@/lib/format/plural"
import { useListSearchNavigate } from "@/lib/nav/list-search"
import { SAVED_VIEW_ERRORS, savedViewScreen, type SavedViewValues } from "@/lib/saved-views"
import { showErrorToast } from "@/lib/toast/error-toast"
import { creatorPlatformLabels, formatCount } from "@/lib/viral/creators"
import { hookTypeChoices, hookTypeLabel, winnersByType, type HookTypeChoice } from "@/lib/viral/hook-types"
import { describeLibraryView, filterLibraryHooks, LIBRARY_SAVED_VIEW_KIND, libraryFilters } from "@/lib/viral/library"

type Data = Extract<ViralLoaded, { section: "hooks" }>
type HookColumn = "hook" | "type" | "views"

const ANY = "any"

/**
 * The Hooks row (task features/03), which was Library → Hooks
 * (`workspace/docs/library.md`): the opening line of every analysed video,
 * across every project or the one picked in the Projects block, and your
 * own hooks under All projects. Search, Filter (tag and type, each type with
 * its winners) and Views sit in the one header, then "+ New hook". The open
 * hook is on the right in the shell's record frame.
 */
export function HooksSection({ data, search, frame }: SectionProps<Data>) {
  const setSearch = useListSearchNavigate()
  const [filterOpen, setFilterOpen] = React.useState(false)
  const [savingView, setSavingView] = React.useState(false)
  const { projects, views } = data
  const { tags, hookTypes, hookIdeasPrice } = data.library

  // A hook added, edited or deleted on the right shows in the list at once;
  // the next read of the row replaces these.
  const [edits, setEdits] = React.useState<Record<string, LibraryHook | null>>({})
  const [added, setAdded] = React.useState<LibraryHook[]>([])
  const [loadedFrom, setLoadedFrom] = React.useState(data.library.hooks)
  if (loadedFrom !== data.library.hooks) {
    setLoadedFrom(data.library.hooks)
    setEdits({})
    setAdded([])
  }
  const hooks = React.useMemo(
    () =>
      [...added, ...data.library.hooks].flatMap((hook) => {
        const edit = edits[hook.id]
        return edit === null ? [] : [edit ?? hook]
      }),
    [added, edits, data.library.hooks]
  )
  const typeChoices = React.useMemo(() => hookTypeChoices(hookTypes), [hookTypes])
  const winners = React.useMemo(() => winnersByType(hooks), [hooks])
  const typeName = (id: string) => hookTypeLabel(id, typeChoices)

  const project = search.project ? (projects.find((one) => one.id === search.project) ?? null) : null
  const projectId = project?.id
  const currentView = React.useMemo(
    () =>
      libraryFilters({
        ...(search.q ? { q: search.q } : {}),
        ...(search.tag ? { tag: search.tag } : {}),
        ...(search.type ? { type: search.type } : {}),
        ...(projectId ? { project: projectId } : {}),
      }),
    [projectId, search.q, search.tag, search.type]
  )
  const shown = React.useMemo(() => filterLibraryHooks(hooks, currentView), [currentView, hooks])
  const ids = shown.map((hook) => hook.id)
  useOpenFirstRow(ids, search.open)
  const openHook = search.open ? (hooks.find((hook) => hook.id === search.open) ?? null) : null

  // ------------------------------------------------------- Saved views --

  const viewsHere: SavedViewsScreen = {
    screen: savedViewScreen(LIBRARY_SAVED_VIEW_KIND, ""),
    describe: (filters) => {
      const kept = libraryFilters(filters)
      const name = kept.project ? projects.find((one) => one.id === kept.project)?.name : null
      return [name, describeLibraryView(kept, typeName)].filter(Boolean).join(" · ")
    },
    kept: (filters) => libraryFilters(filters) as SavedViewValues,
    describeError: (error) => {
      const message = error instanceof Error ? error.message : ""
      return (Object.values(SAVED_VIEW_ERRORS) as string[]).includes(message) ? message : getViralErrorMessage(error)
    },
  }

  function openView(saved: SavedView) {
    const filters = libraryFilters(saved.filters)
    if (filters.project && !projects.some((one) => one.id === filters.project)) {
      showErrorToast(`The project in "${saved.name}" is gone, so it opened on every project.`)
      delete filters.project
    }
    if (filters.tag && !tags.some((tag) => tag.toLowerCase() === filters.tag?.toLowerCase())) {
      showErrorToast(`No hook carries the tag "${filters.tag}" any more, so "${saved.name}" opened without it.`)
      delete filters.tag
    }
    if (filters.type && !typeName(filters.type)) {
      showErrorToast(`The hook type in "${saved.name}" was deleted, so it opened without it.`)
      delete filters.type
    }
    setSearch({ q: filters.q, tag: filters.tag, type: filters.type, project: filters.project, open: undefined })
  }

  function saveAsView() {
    setFilterOpen(false)
    if (Object.keys(currentView).length === 0) {
      showErrorToast("Search, pick a project or set a filter first, then save it as a view.")
      return
    }
    setSavingView(true)
  }

  const editViewFields: EditFields = ({ filters, change }) => (
    <>
      <div className="grid gap-2">
        <Label htmlFor="edit-library-view-search">Search</Label>
        <Input
          id="edit-library-view-search"
          value={typeof filters.q === "string" ? filters.q : ""}
          maxLength={200}
          placeholder="Words in the hook, title or channel"
          onChange={(event) => change({ q: event.target.value || undefined })}
        />
      </div>
      <TagFilterRow id="edit-library-view-tag" value={libraryFilters(filters).tag} tags={tags} onChange={(tag) => change({ tag })} />
      <TypeFilterRow
        id="edit-library-view-type"
        value={libraryFilters(filters).type}
        choices={typeChoices}
        winners={winners}
        onChange={(type) => change({ type })}
      />
    </>
  )

  const filterCount = (search.tag ? 1 : 0) + (search.type ? 1 : 0)
  const ownProjects = projects.filter((one) => !one.sample)
  const writeFor = project && !project.sample ? project : (ownProjects[0] ?? null)

  const middle = (
    <div className="@container flex h-full min-h-0 flex-col overflow-hidden bg-card">
      <ListHeader
        tabs={<MiddleHeading icon={QuoteIcon} label={project ? `Hooks in ${project.name}` : "Hooks"} />}
        end={<PanelReopenButton side="right" label="Show the hook" />}
        menuLabel="More for hooks"
        search={{
          name: "library-search",
          label: "Search the hooks",
          placeholder: "Search hooks",
          value: search.q ?? "",
          onChange: (text) => setSearch({ q: text.trim() ? text : undefined }),
        }}
        massSelect={null}
        filter={
          <FilterPopover
            contentClassName="w-60"
            count={filterCount}
            open={filterOpen}
            onOpenChange={setFilterOpen}
            onClear={() => setSearch({ tag: undefined, type: undefined })}
            save={
              <Button type="button" onClick={saveAsView}>
                Save as view
              </Button>
            }
          >
            <TagFilterRow id="library-filter-tag" value={search.tag} tags={tags} onChange={(tag) => setSearch({ tag })} />
            <TypeFilterRow id="library-filter-type" value={search.type} choices={typeChoices} winners={winners} onChange={(type) => setSearch({ type })} />
          </FilterPopover>
        }
        view={
          <SavedViewsControls
            here={viewsHere}
            views={views}
            filters={currentView as SavedViewValues}
            onOpen={openView}
            onClose={() => setSearch({ q: undefined, tag: undefined, type: undefined, project: undefined })}
            editFields={editViewFields}
            saveButton={false}
            buttonVariant="ghost"
          />
        }
        primary={
          <NewHookDropdown
            choices={typeChoices}
            tags={tags}
            onCreated={(hook) => {
              setAdded((was) => [hook, ...was])
              // A new hook is nobody's project's, so it shows under All projects, with nothing filtering it out.
              setSearch({ project: undefined, q: undefined, tag: undefined, type: undefined, open: hook.id })
            }}
          />
        }
      />
      <CrmTable<HookColumn>
        columns={[
          { key: "hook", label: "Hook", column: "main", className: "min-w-40", sortable: false },
          { key: "type", label: "Type", column: "meta", className: "hidden md:hidden @lg:table-cell", sortable: false },
          { key: "views", label: "Views", column: "meta", className: "hidden md:hidden @xl:table-cell", sortable: false },
        ]}
        sort="hook"
        direction="asc"
        onSort={() => undefined}
        actions={false}
        empty={
          shown.length ? null : !hooks.length ? (
            "Press Analyse with AI on a project's videos, and their hooks gather here. Press New hook to add one you heard."
          ) : (
            <NoMatches words={search.q ?? ""} noun="hooks" onClear={() => setSearch({ q: undefined, tag: undefined, type: undefined })} />
          )
        }
      >
        {shown.map((hook) => {
          const type = hookTypeLabel(hook.typeId, typeChoices)
          return (
            <CrmTableRow key={hook.id} open={hook.id === openHook?.id} label={hook.text} onOpen={() => setSearch({ open: hook.id })}>
              <MainCell
                lead={
                  <span className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                    {hook.kind === "video" ? (
                      <CoverImage src={hook.thumbnailUrl} className="size-full object-cover" fallback={<FilmIcon className="size-3.5 text-muted-foreground" />} />
                    ) : (
                      <QuoteIcon className="size-3.5 text-muted-foreground" aria-hidden />
                    )}
                  </span>
                }
                name={`"${hook.text}"`}
                line={
                  hook.kind === "video"
                    ? [hook.projects[0]?.name, hook.channelName || creatorPlatformLabels[hook.platform], ...hook.tags.slice(0, 2)]
                        .filter(Boolean)
                        .join(" · ")
                    : ["Your hook", ...hook.tags.slice(0, 2)].join(" · ")
                }
              />
              <TableCell column="meta" className="hidden md:hidden @lg:table-cell">
                {type ? <Chip>{type}</Chip> : <span className="text-muted-foreground">-</span>}
              </TableCell>
              <TableCell column="mutedMeta" className="hidden tabular-nums md:hidden @xl:table-cell">
                {hook.kind === "video" ? formatCount(hook.views) : "-"}
              </TableCell>
            </CrmTableRow>
          )
        })}
      </CrmTable>
    </div>
  )

  return frame({
    ids,
    showMiddleFor: `${project?.id ?? "all"}|${search.q ?? ""}|${filterCount}`,
    showRightFor: search.open,
    middle,
    right: {
      label: "Hook",
      showLabel: "Show the hook",
      content: openHook ? (
        <LibraryHookPanel
          key={openHook.id}
          hook={openHook}
          tags={tags}
          choices={typeChoices}
          projects={ownProjects}
          writeForId={writeFor?.id ?? null}
          ideasPrice={hookIdeasPrice}
          onChanged={(hook) => setEdits((was) => ({ ...was, [hook.id]: hook }))}
          onDeleted={(hook) => {
            setEdits((was) => ({ ...was, [hook.id]: null }))
            setSearch({ open: undefined })
          }}
        />
      ) : (
        <EmptyRecord title="Hook" icon={<QuoteIcon aria-hidden />} line="Analyse a video, or press New hook, and it opens here." hideLabel="Hide the hook" />
      ),
    },
    windows: <SaveViewDialog open={savingView} here={viewsHere} filters={currentView as SavedViewValues} onClose={() => setSavingView(false)} />,
  })
}

function TagFilterRow({
  id,
  value,
  tags,
  onChange,
}: {
  id: string
  value: string | undefined
  tags: string[]
  onChange: (tag: string | undefined) => void
}) {
  // A tag kept in a view but no longer on any hook still shows, so it can be cleared.
  const choices = value && !tags.includes(value) ? [value, ...tags] : tags
  return (
    <FilterRow id={id} label="Tag">
      <Select value={value ?? ANY} onValueChange={(next) => onChange(next === ANY ? undefined : next)}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>Any tag</SelectItem>
          {choices.map((tag) => (
            <SelectItem key={tag} value={tag}>
              {tag}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FilterRow>
  )
}

/**
 * Type in Filter (task part 7): the fixed types, then the person's own, each
 * with how many winners it has, so the types that win stand out.
 */
function TypeFilterRow({
  id,
  value,
  choices,
  winners,
  onChange,
}: {
  id: string
  value: string | undefined
  choices: HookTypeChoice[]
  winners: Map<string, number>
  onChange: (type: string | undefined) => void
}) {
  // A type kept in a view but since deleted still shows, so it can be cleared.
  const all = value && !choices.some((one) => one.id === value) ? [{ id: value, label: "A deleted type", own: true }, ...choices] : choices
  return (
    <FilterRow id={id} label="Type">
      <Select value={value ?? ANY} onValueChange={(next) => onChange(next === ANY ? undefined : next)}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>Any type</SelectItem>
          {all.map((choice) => {
            const count = winners.get(choice.id) ?? 0
            return (
              <SelectItem key={choice.id} value={choice.id}>
                {choice.label}
                <span className="text-muted-foreground tabular-nums">
                  {count} {plural(count, "winner")}
                </span>
              </SelectItem>
            )
          })}
        </SelectContent>
      </Select>
    </FilterRow>
  )
}
