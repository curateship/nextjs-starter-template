import * as React from "react"
import { BookMarkedIcon, EyeIcon, FilmIcon, LayoutTemplateIcon, QuoteIcon } from "lucide-react"

import { DashboardCardHeader, DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { DashboardTabs } from "@/components/shared/dashboard-tabs"
import { FilterPopover } from "@/components/shared/filter-popover"
import {
  SavedViewsControls,
  SaveViewDialog,
  type EditFields,
  type SavedViewsScreen,
} from "@/components/shared/saved-views"
import { SearchToggle } from "@/components/shared/search-toggle"
import { ThreePanels } from "@/components/shared/three-panels"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { CoverImage } from "@/components/viral/cover-image"
import { LibraryFormatPanel } from "@/components/viral/library-format-panel"
import { LibraryHookPanel } from "@/components/viral/library-hook-panel"
import { NewHookDropdown } from "@/components/viral/library-own-hook"
import type { SavedView } from "@/lib/api/saved-views"
import { getViralErrorMessage } from "@/lib/api/viral/viral"
import type { LibraryHook, OwnHookType, ViralFormat } from "@/lib/api/viral/viral-library"
import { plural } from "@/lib/format/plural"
import { focusRing } from "@/lib/layout/focus-ring"
import { useListSearchNavigate, useSearchBoxText } from "@/lib/nav/list-search"
import { SAVED_VIEW_ERRORS, savedViewScreen, type SavedViewValues } from "@/lib/saved-views"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"
import { creatorPlatformLabels, formatCount } from "@/lib/viral/creators"
import { hookTypeChoices, hookTypeLabel, winnersByType, type HookTypeChoice } from "@/lib/viral/hook-types"
import {
  describeLibraryView,
  filterLibraryHooks,
  LIBRARY_SAVED_VIEW_KIND,
  libraryFilters,
  type LibraryFilters,
  type LibraryTab,
} from "@/lib/viral/library"
import { segmentRoleLabels } from "@/lib/viral/viral-breakdown"
import type { WriterPrice } from "@/lib/viral/writers"

const LAYOUT_KEY = "viral-library-horizontal-1"
const PLACE_KEY = "viral-library-place"
const ANY = "any"

export type LibraryPageSearch = LibraryFilters & { tab?: LibraryTab; open?: string }

type LibraryProject = { id: string; name: string; sample: boolean }

/**
 * The Library page (`workspace/docs/library.md`, task parts 17 and 18).
 * Tyler, 4 Nov 2026: "One Library page", with Hooks and Formats tabs. Drawn
 * like the Vault page: the projects on the left, "All projects" first; the
 * hooks or the formats in the middle; the open hook or format on the right.
 * On Formats, the project picked on the left is the one Write a script
 * writes for, since formats belong to the person rather than a project.
 */
export function LibraryPage({
  hooks: loadedHooks,
  formats: loadedFormats,
  tags,
  hookTypes,
  projects,
  views,
  scriptPrice,
  hookIdeasPrice,
  search,
}: {
  hooks: LibraryHook[]
  formats: ViralFormat[]
  tags: string[]
  /** The person's own hook types, added on Settings → Hook types. */
  hookTypes: OwnHookType[]
  projects: LibraryProject[]
  views: SavedView[]
  /** What one script from a format costs, and who writes it. */
  scriptPrice: WriterPrice
  /** What one press of Write hooks like this costs, and who writes it. */
  hookIdeasPrice: WriterPrice
  search: LibraryPageSearch
}) {
  const setSearch = useListSearchNavigate()
  const tab: LibraryTab = search.tab ?? "hooks"
  const [filterOpen, setFilterOpen] = React.useState(false)
  const [savingView, setSavingView] = React.useState(false)
  const [searchText, setSearchText] = useSearchBoxText(search.q ?? "", (next) =>
    setSearch({ q: next.trim() ? next : undefined })
  )

  // A hook added, edited or deleted, or a tag or name changed, on the right
  // shows in the list at once; the next read of the page replaces these.
  const [hookEdits, setHookEdits] = React.useState<Record<string, LibraryHook | null>>({})
  const [addedHooks, setAddedHooks] = React.useState<LibraryHook[]>([])
  const [formatEdits, setFormatEdits] = React.useState<Record<string, ViralFormat | null>>({})
  const [loadedFrom, setLoadedFrom] = React.useState({ loadedHooks, loadedFormats })
  if (loadedFrom.loadedHooks !== loadedHooks || loadedFrom.loadedFormats !== loadedFormats) {
    setLoadedFrom({ loadedHooks, loadedFormats })
    setHookEdits({})
    setAddedHooks([])
    setFormatEdits({})
  }
  const hooks = React.useMemo(
    () =>
      [...addedHooks, ...loadedHooks].flatMap((hook) => {
        const edit = hookEdits[hook.id]
        return edit === null ? [] : [edit ?? hook]
      }),
    [addedHooks, hookEdits, loadedHooks]
  )
  const typeChoices = React.useMemo(() => hookTypeChoices(hookTypes), [hookTypes])
  const winners = React.useMemo(() => winnersByType(hooks), [hooks])
  const typeName = (id: string) => hookTypeLabel(id, typeChoices)
  const formats = React.useMemo(
    () =>
      loadedFormats.flatMap((format) => {
        const edit = formatEdits[format.id]
        return edit === null ? [] : [edit ?? format]
      }),
    [formatEdits, loadedFormats]
  )

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
  const shownHooks = React.useMemo(() => filterLibraryHooks(hooks, currentView), [currentView, hooks])
  const shownFormats = React.useMemo(() => {
    const words = search.q?.toLowerCase() ?? ""
    return words
      ? formats.filter((format) =>
          [format.name, format.sourceTitle ?? "", ...format.parts.map((part) => part.summary)].some((text) =>
            text.toLowerCase().includes(words)
          )
        )
      : formats
  }, [formats, search.q])

  const openHook = tab === "hooks" && search.open ? (hooks.find((hook) => hook.id === search.open) ?? null) : null
  const openFormat = tab === "formats" && search.open ? (formats.find((format) => format.id === search.open) ?? null) : null
  const ids = tab === "hooks" ? shownHooks.map((hook) => hook.id) : shownFormats.map((format) => format.id)

  // A new tab or project opens its first row, so the right panel is never
  // empty while the list has something (UI standard).
  const firstId = !(tab === "hooks" ? openHook : openFormat) ? (ids[0] ?? null) : null
  React.useEffect(() => {
    if (firstId) setSearch({ open: firstId })
  }, [firstId, setSearch])

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
    setSearch({ tab: undefined, q: filters.q, tag: filters.tag, type: filters.type, project: filters.project, open: undefined })
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

  // ------------------------------------------------------------- Panels --

  const hookCount = (id: string | null) =>
    id ? hooks.filter((hook) => hook.kind === "video" && hook.projects.some((one) => one.id === id)).length : hooks.length

  const left = (
    <>
      <DashboardCardTitleHeader
        icon={<BookMarkedIcon />}
        title="Library"
        meta={`${hooks.length} ${plural(hooks.length, "hook")} · ${formats.length} ${plural(formats.length, "format")}`}
      />
      <ScrollArea className="min-h-0 flex-1">
        <nav aria-label="Projects" className="grid gap-0.5 p-3">
          <ProjectRow
            name="All projects"
            count={tab === "hooks" ? hookCount(null) : null}
            picked={!project}
            onPick={() => setSearch({ project: undefined, open: tab === "hooks" ? undefined : search.open })}
          />
          {projects.map((one) => (
            <ProjectRow
              key={one.id}
              name={one.name}
              count={tab === "hooks" ? hookCount(one.id) : null}
              picked={project?.id === one.id}
              onPick={() => setSearch({ project: one.id, open: tab === "hooks" ? undefined : search.open })}
            />
          ))}
        </nav>
      </ScrollArea>
    </>
  )

  const toolbar = (
    <div className="flex shrink-0 items-center gap-1">
      <SearchToggle
        name="library-search"
        label={tab === "hooks" ? "Search the hooks" : "Search the formats"}
        placeholder={tab === "hooks" ? "Search hooks, titles and channels…" : "Search formats…"}
        value={searchText}
        onChange={setSearchText}
      />
      {tab === "hooks" ? (
        <>
          <FilterPopover
            count={(search.tag ? 1 : 0) + (search.type ? 1 : 0)}
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
            <TypeFilterRow
              id="library-filter-type"
              value={search.type}
              choices={typeChoices}
              winners={winners}
              onChange={(type) => setSearch({ type })}
            />
          </FilterPopover>
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
          <NewHookDropdown
            choices={typeChoices}
            tags={tags}
            onCreated={(hook) => {
              setAddedHooks((was) => [hook, ...was])
              // A new hook is nobody's project's, so it shows under All projects, with nothing filtering it out.
              setSearch({ project: undefined, q: undefined, tag: undefined, type: undefined, open: hook.id })
            }}
          />
        </>
      ) : null}
    </div>
  )

  const middle = (
    <>
      <DashboardCardHeader className="@container">
        <DashboardTabs
          value={tab}
          onValueChange={(next) => setSearch({ tab: next === "hooks" ? undefined : (next as LibraryTab), open: undefined })}
          tabs={[
            { value: "hooks", label: "Hooks", count: shownHooks.length },
            { value: "formats", label: "Formats", count: shownFormats.length },
          ]}
        />
        {toolbar}
      </DashboardCardHeader>
      <ScrollArea className="min-h-0 flex-1">
        {tab === "hooks" ? (
          !hooks.length ? (
            <Empty>Press Analyse with AI on a project's videos, and their hooks gather here. Press New hook to add one you heard.</Empty>
          ) : shownHooks.length ? (
            <HookRows hooks={shownHooks} choices={typeChoices} openId={openHook?.id ?? null} onPick={(hook) => setSearch({ open: hook.id })} />
          ) : (
            <Empty>No hook matches these filters.</Empty>
          )
        ) : !formats.length ? (
          <Empty>Press Save format under an analysis's script, and the format lands here.</Empty>
        ) : shownFormats.length ? (
          <FormatRows formats={shownFormats} openId={openFormat?.id ?? null} onPick={(format) => setSearch({ open: format.id })} />
        ) : (
          <Empty>No format matches that search.</Empty>
        )}
      </ScrollArea>
    </>
  )

  const writeFor = project && !project.sample ? project : (projects.find((one) => !one.sample) ?? null)
  const ownProjects = projects.filter((one) => !one.sample)
  let right: React.ReactNode
  if (openHook) {
    right = (
      <LibraryHookPanel
        key={openHook.id}
        hook={openHook}
        tags={tags}
        choices={typeChoices}
        projects={ownProjects}
        writeForId={writeFor?.id ?? null}
        ideasPrice={hookIdeasPrice}
        onChanged={(hook) => setHookEdits((was) => ({ ...was, [hook.id]: hook }))}
        onDeleted={(hook) => {
          setHookEdits((was) => ({ ...was, [hook.id]: null }))
          setSearch({ open: undefined })
        }}
      />
    )
  } else if (openFormat) {
    right = (
      <LibraryFormatPanel
        key={openFormat.id}
        format={openFormat}
        projects={ownProjects}
        writeForId={writeFor?.id ?? null}
        price={scriptPrice}
        onChanged={(format) => setFormatEdits((was) => ({ ...was, [format.id]: format }))}
        onDeleted={(format) => {
          setFormatEdits((was) => ({ ...was, [format.id]: null }))
          setSearch({ open: undefined })
        }}
      />
    )
  } else {
    right = (
      <>
        <DashboardCardTitleHeader icon={<EyeIcon />} title={tab === "hooks" ? "Hook" : "Format"} />
        <Empty>{tab === "hooks" ? "Click a hook to see its video and tags here." : "Click a format to write a script from it here."}</Empty>
      </>
    )
  }

  return (
    <ThreePanels
      layoutKey={LAYOUT_KEY}
      place={{ key: PLACE_KEY, search, ids }}
      showMiddleFor={`${tab}${project?.id ?? "all"}`}
      showRightFor={search.open}
      left={{ label: "Projects", showLabel: "Show the projects", content: left }}
      middle={{ label: tab === "hooks" ? "Hooks" : "Formats", content: middle }}
      right={{
        label: tab === "hooks" ? "Hook" : "Format",
        showLabel: tab === "hooks" ? "Show the hook" : "Show the format",
        content: right,
      }}
    >
      <SaveViewDialog
        open={savingView}
        here={viewsHere}
        filters={currentView as SavedViewValues}
        onClose={() => setSavingView(false)}
      />
    </ThreePanels>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-3 py-10 text-center text-sm text-muted-foreground">{children}</p>
}

function ProjectRow({
  name,
  count,
  picked,
  onPick,
}: {
  name: string
  count: number | null
  picked: boolean
  onPick: () => void
}) {
  return (
    <button
      type="button"
      aria-current={picked ? "true" : undefined}
      onClick={onPick}
      className={cn(
        "flex h-8 w-full min-w-0 items-center gap-2 rounded-md px-2 text-left text-sm outline-hidden hover:bg-muted focus-visible:bg-muted",
        picked && "bg-muted font-medium"
      )}
    >
      <span className="min-w-0 flex-1 truncate">{name}</span>
      {count !== null ? <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{count}</span> : null}
    </button>
  )
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
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-2">
      <Label htmlFor={id} className="text-muted-foreground">
        Tag
      </Label>
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
    </div>
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
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-2">
      <Label htmlFor={id} className="text-muted-foreground">
        Type
      </Label>
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
    </div>
  )
}

function HookRows({
  hooks,
  choices,
  openId,
  onPick,
}: {
  hooks: LibraryHook[]
  choices: HookTypeChoice[]
  openId: string | null
  onPick: (hook: LibraryHook) => void
}) {
  return (
    <ul aria-label="Hooks" className="grid grid-cols-[minmax(0,1fr)]">
      {hooks.map((hook) => {
        const type = hookTypeLabel(hook.typeId, choices)
        return (
          <li key={hook.id} className={cn("border-b", hook.id === openId ? "bg-muted" : "hover:bg-muted/50")}>
            <button
              type="button"
              aria-current={hook.id === openId ? "true" : undefined}
              onClick={() => onPick(hook)}
              className={cn("flex w-full min-w-0 items-start gap-3 px-3 py-3 text-left", focusRing)}
            >
              {hook.kind === "video" ? (
                <span className="aspect-[9/16] w-10 shrink-0 overflow-hidden rounded-md bg-muted">
                  <CoverImage
                    src={hook.thumbnailUrl}
                    className="size-full object-cover"
                    fallback={
                      <span className="grid size-full place-items-center">
                        <FilmIcon className="size-4 text-muted-foreground" />
                      </span>
                    }
                  />
                </span>
              ) : (
                <span className="grid size-10 shrink-0 place-items-center rounded-md bg-muted">
                  <QuoteIcon className="size-4 text-muted-foreground" aria-hidden />
                </span>
              )}
              <span className="grid min-w-0 flex-1 gap-1">
                <span className="text-sm leading-snug font-medium">"{hook.text}"</span>
                <span className="truncate text-xs text-muted-foreground tabular-nums">
                  {hook.kind === "video"
                    ? [hook.projects[0]?.name, hook.channelName || creatorPlatformLabels[hook.platform], `${formatCount(hook.views)} views`]
                        .filter(Boolean)
                        .join(" · ")
                    : "Your hook"}
                </span>
                {type || hook.tags.length ? (
                  <span className="flex flex-wrap gap-1">
                    {type ? <Badge variant="secondary">{type}</Badge> : null}
                    {hook.tags.slice(0, 3).map((tag) => (
                      <Badge key={tag} variant="outline">
                        {tag}
                      </Badge>
                    ))}
                  </span>
                ) : null}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function FormatRows({
  formats,
  openId,
  onPick,
}: {
  formats: ViralFormat[]
  openId: string | null
  onPick: (format: ViralFormat) => void
}) {
  return (
    <ul aria-label="Formats" className="grid grid-cols-[minmax(0,1fr)]">
      {formats.map((format) => (
        <li key={format.id} className={cn("border-b", format.id === openId ? "bg-muted" : "hover:bg-muted/50")}>
          <button
            type="button"
            aria-current={format.id === openId ? "true" : undefined}
            onClick={() => onPick(format)}
            className={cn("flex w-full min-w-0 items-start gap-3 px-3 py-3 text-left", focusRing)}
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-md bg-muted">
              <LayoutTemplateIcon className="size-4 text-muted-foreground" aria-hidden />
            </span>
            <span className="grid min-w-0 flex-1 gap-1">
              <span className="truncate text-sm font-medium">{format.name}</span>
              <span className="truncate text-xs text-muted-foreground">
                {format.parts.map((part) => `${segmentRoleLabels[part.role]} ${part.seconds}s`).join(" · ")}
              </span>
              {format.sourceTitle ? (
                <span className="truncate text-xs text-muted-foreground">From "{format.sourceTitle}"</span>
              ) : null}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}
