import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import {
  CopyIcon,
  Loader2Icon,
  LockIcon,
  LockOpenIcon,
  PauseIcon,
  PinIcon,
  PinOffIcon,
  PlayIcon,
  PlusIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react"

import { ActionRow } from "@/components/crm/crm-record-menu"
import { DashboardCardHeader, dashboardCardHeadingClassName } from "@/components/shared/dashboard-card-header"
import { PageCover } from "@/components/shared/notes/page-cover"
import { CoverRow } from "@/components/shared/notes/page-rows"
import { PickGroup, PickRow } from "@/components/shared/notes/pick-rows"
import { SavingDocument } from "@/components/shared/notes/saving-document"
import { TabbedMenu, type TabbedMenuState } from "@/components/shared/notes/tabbed-menu"
import { SidePanelCollapseButton } from "@/components/shared/three-panels"
import { usePromoGuest, usePromoSaveStatus } from "@/components/social/guest/guest-mode"
import { NetworkIcon } from "@/components/social/network-icon"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  copyProject,
  getProjectErrorMessage,
  lockProjectDescription,
  pinProject,
  saveProject,
  saveProjectAiCap,
  type ProjectView,
} from "@/lib/api/social/projects"
import { PANEL_GUTTER } from "@/lib/layout/panel-gutter"
import { storedProjectPage } from "@/lib/social/project-description"
import { NETWORK_NAMES, NETWORKS, type Network } from "@/lib/social/networks"
import { dollarsText, parseCapDollars } from "@/lib/social/spend-cap"
import type { Side } from "@/lib/social/sides"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

import { CONTENT_PROJECT_BLOCKS, ContentProjectProvider, type ContentProjectBlocks } from "@/components/content-app/project-blocks"

import { PROJECT_APP_BLOCKS, ProjectNetworksProvider, type ProjectNetworksBlock } from "./project-networks-block"

/** Content's Content, Research and Videos blocks, then Promote (`project-blocks.tsx`). */
const PAGE_BLOCKS = [...CONTENT_PROJECT_BLOCKS, ...PROJECT_APP_BLOCKS]

/** How long typing has to stop before the name saves. */
const SAVE_AFTER_MS = 700

type Project = ProjectView["project"]

/**
 * A project's own page's left panel, in the Admin 3 panel design (Tyler,
 * 12 Nov 2026: "the project page itsel is not updated to the new design";
 * `workspace/tasks/Projects/project-page-design.md`).
 *
 * - **Header:** the collapse button, the name with Paused, and the ⋮. The arrow back to the Projects dashboard was taken out
 *   (Tyler, 12 Nov 2026: "actually just remove it"); Projects in the left
 *   menu leads back.
 * - **The ⋮** is the tabbed menu: General (Name, Cover photo, Pin, Pause
 *   this project, Lock description, New project, Duplicate, Delete project), Networks
 *   (pause or take off each one, and add the others) and, in Content, Widgets
 *   (Overview's rows and spots). The pin and the + that sat in the header
 *   live there now.
 * - **The page** is the description, written in place in the "/" editor
 *   under the project's picture, with the fixed Networks block at its top
 *   (Tyler: "Description page + Networks block"). "/" blocks can go under it.
 *   The AI is told the words alone (`projectDescriptionText`).
 *
 * A guest sent from Project works the project but never runs it: no ⋮, no Pause on a row, and no "/" list, since its blocks upload
 * and a guest can't. A guest still writes the words.
 */
export function ProjectPanel({
  view,
  selectedNetwork,
  selectedSide,
  onSelect,
  onAddNetwork,
  onArrangeNetworks,
  onRemoveNetwork,
  onToggleNetworkPause,
  onNewProject,
  onDeleteProject,
  onTogglePause,
  onSaved,
  content,
  contentReloadKey = 0,
  menuState,
  widgets,
}: {
  view: ProjectView
  /** The network whose panels fill the middle and right columns. */
  selectedNetwork: Network | null
  /** Which of its two rows: your own posts, or commenting on other people's. */
  selectedSide: Side
  onSelect: (network: Network, side: Side) => void
  onAddNetwork: (network: Network) => Promise<void>
  /** The Networks block's order and the networks it leaves out, from its ⋮. */
  onArrangeNetworks: (arranged: { order: Network[]; hidden: Network[] }) => Promise<void>
  onRemoveNetwork: (network: Network) => Promise<void>
  /** Pauses one network of the project, or resumes it, while the rest runs. */
  onToggleNetworkPause: (network: Network, paused: boolean) => Promise<void>
  onNewProject: () => void
  onDeleteProject: () => void
  /** Pauses the project, or resumes it when it is paused. */
  onTogglePause: () => Promise<void>
  /** Something about the project was saved, so the page should read it again. */
  onSaved: () => void
  /** What Content's Dashboard, Research and Videos blocks draw and do (`project-blocks.tsx`). */
  content: ContentProjectBlocks
  /** Changed to read the project's research and videos again. */
  contentReloadKey?: number
  /** The ⋮'s open state and tab, held by the page so a widget's Manage widgets opens it at Widgets. */
  menuState: TabbedMenuState
  /** The ⋮'s Widgets tab: Overview's rows and spots. */
  widgets: React.ReactNode
}) {
  const project = view.project
  const guest = Boolean(usePromoGuest())
  const cover = project.imageUrl || null

  const networks: ProjectNetworksBlock = {
    projectId: project.id,
    networks: project.networks,
    hidden: project.hiddenNetworks,
    paused: project.pausedNetworks,
    pausedCommenting: project.pausedCommenting,
    postCounts: view.postCounts ?? {},
    selected: content.pick.kind === "network" ? selectedNetwork : null,
    selectedSide,
    onSelect,
    onArrange: guest ? null : onArrangeNetworks,
    emptyLine: guest
      ? "This project uses no network yet."
      : "No network yet. Add one from the ⋮, under Networks, to post and comment from this project.",
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-card">
      {/* The shell's cover: a picture or the drawn sky, faint behind the header, fading into the panel. */}
      <PageCover url={cover} />
      {/* Wrapped in its own div, so the shell's table line under a header never matches this side panel's header. */}
      <div className="relative shrink-0">
        <DashboardCardHeader className={cn("@container gap-1", cover && "border-b-transparent")}>
          <SidePanelCollapseButton side="left" label="Hide the project" />
          {/* The name keeps room for a few letters at the panel's narrowest; Paused gives way first. No
              bans mark here (Tyler, 12 Nov 2026: "remove this"); the Projects dashboard's row and its
              Overview's Bans widget say how many were banned. */}
          <span className={cn("flex min-w-12 flex-1 items-center gap-2 pl-1", dashboardCardHeadingClassName)}>
            <FullNameOnHover name={project.name} />
            {project.pausedAt ? <span className="hidden shrink-0 text-xs font-normal text-muted-foreground @[14rem]:inline">Paused</span> : null}
          </span>
          {guest ? null : (
            <ProjectMenu
              key={project.id}
              project={project}
              menuState={menuState}
              widgets={widgets}
              onSaved={onSaved}
              onNewProject={onNewProject}
              onDeleteProject={onDeleteProject}
              onTogglePause={onTogglePause}
              onAddNetwork={onAddNetwork}
              onRemoveNetwork={onRemoveNetwork}
              onToggleNetworkPause={onToggleNetworkPause}
            />
          )}
        </DashboardCardHeader>
      </div>

      <ScrollArea className="relative min-h-0 flex-1">
        {/* data-side-panel-body: the shell's mark that draws the first block at Settings → Styling → Panel cards → Opacity. */}
        <div data-side-panel-body="" className={cn(PANEL_GUTTER, "grid grid-cols-[minmax(0,1fr)] pt-0")}>
          <ContentProjectProvider value={content} reloadKey={contentReloadKey}>
          <ProjectNetworksProvider value={networks}>
            <ProjectPage
              // Locking or unlocking draws it again from what was saved.
              key={`${project.id}:${project.descriptionLocked}`}
              projectId={project.id}
              page={project.descriptionPage}
              locked={project.descriptionLocked}
              guest={guest}
            />
          </ProjectNetworksProvider>
          </ContentProjectProvider>
        </div>
      </ScrollArea>
    </div>
  )
}

/**
 * The project's page: the description in the "/" editor, with the Networks
 * block. It saves 700ms after the last letter and when it is left, with
 * Saving… and Saved in the page header, and is what the AI is told about what
 * you make, its words alone. Locked, it reads only, for everyone.
 *
 * A guest gets no "/" list and no right-click list of blocks: the blocks
 * upload pictures and read web pages, which a guest can't. "/" is not typed
 * at all on a guest's page, since the editor would read it as asking for one.
 */
function ProjectPage({ projectId, page, locked, guest }: { projectId: string; page: string; locked: boolean; guest: boolean }) {
  const setSaveStatus = usePromoSaveStatus()
  // The page as the server last gave it. Each save says it started from this,
  // and the server refuses one whose start is no longer what is stored.
  const base = React.useRef(page)
  // Saves go one after another. The editor sends one 700ms after typing
  // stops without waiting for the last; sent side by side, the second would
  // carry the start the first replaced and be refused as changed elsewhere.
  const queue = React.useRef<Promise<void>>(Promise.resolve())
  // Whether the person typed, cut, pasted or dropped anything in the page since it opened.
  const touched = React.useRef(false)
  const touch = () => {
    touched.current = true
  }
  const save = async (json: string) => {
    // A save that would take every word away is sent only after the person
    // worked in the page. Four times on 12 Nov 2026 a tab that was being left
    // sent an empty page nobody had emptied, and the cause was not found;
    // this keeps the words until someone really deletes them.
    if (!touched.current && storedProjectPage(json) === "" && storedProjectPage(base.current) !== "") return
    setSaveStatus("saving")
    dismissErrorToast()
    try {
      const saved = await saveProject({ projectId, page: json, base: base.current })
      if (saved.page !== null) base.current = saved.page
      setSaveStatus("saved")
    } catch (error) {
      setSaveStatus("idle")
      showErrorToast(getProjectErrorMessage(error))
    }
  }
  return (
    <div
      onKeyDownCapture={(event) => {
        if (guest && event.key === "/") event.preventDefault()
        else touch()
      }}
      onCutCapture={touch}
      onPasteCapture={touch}
      onDropCapture={touch}
      onContextMenuCapture={guest ? (event) => event.stopPropagation() : undefined}
    >
      <SavingDocument
        value={page}
        locked={locked}
        appBlocks={PAGE_BLOCKS}
        placeholder="Describe what you make. The AI is told this."
        onSave={(json) => {
          queue.current = queue.current.then(() => save(json))
          return queue.current
        }}
      />
    </div>
  )
}

/**
 * The project's name in the header, cut short with "…" when the column is
 * narrow. Pointing at a cut name shows all of it; a name that fits shows no
 * tooltip.
 */
function FullNameOnHover({ name }: { name: string }) {
  const ref = React.useRef<HTMLSpanElement>(null)
  const [cut, setCut] = React.useState(false)

  React.useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const measure = () => setCut(element.scrollWidth > element.clientWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [name])

  // Always the same tooltip, kept shut while the name fits, so the measured
  // name is never swapped for a new one as the column is dragged.
  return (
    <Tooltip open={cut ? undefined : false}>
      <TooltipTrigger asChild>
        <span ref={ref} className="min-w-0 truncate">
          {name}
        </span>
      </TooltipTrigger>
      <TooltipContent>{name}</TooltipContent>
    </Tooltip>
  )
}

/**
 * The project's ⋮, the design's tabbed menu (Tyler, 12 Nov 2026: "Collapse,
 * back, name, bans, ⋮"), opening to the right over the middle.
 *
 * - **General:** Name and Picture as rows that open their field, each saving
 *   itself; then Pin, Pause this project, Lock description, New project and
 *   Duplicate, which opens the copy; then Delete project in red under a line.
 * - **Networks:** each network the project uses with Pause or Resume (that
 *   network alone, its posts and comments) and Take off, which the server
 *   refuses while the project still holds that network's accounts or
 *   keywords; then the networks it does not use yet, each a row to add it.
 * - **Widgets:** Overview's rows and spots, the Projects dashboard's one
 *   layout. A widget's own Manage widgets opens this tab.
 */
function ProjectMenu({
  project,
  menuState,
  widgets,
  onSaved,
  onNewProject,
  onDeleteProject,
  onTogglePause,
  onAddNetwork,
  onRemoveNetwork,
  onToggleNetworkPause,
}: {
  project: Project
  menuState: TabbedMenuState
  widgets: React.ReactNode
  onSaved: () => void
  onNewProject: () => void
  onDeleteProject: () => void
  onTogglePause: () => Promise<void>
  onAddNetwork: (network: Network) => Promise<void>
  onRemoveNetwork: (network: Network) => Promise<void>
  onToggleNetworkPause: (network: Network, paused: boolean) => Promise<void>
}) {
  const navigate = useNavigate()
  const { onOpenChange: setOpen } = menuState
  const [busy, setBusy] = React.useState<string | null>(null)
  async function run(kind: string, action: () => Promise<void>) {
    setBusy(kind)
    try {
      await action()
    } catch (error) {
      showErrorToast(getProjectErrorMessage(error))
    } finally {
      setBusy(null)
    }
  }
  /** Shuts the menu, then does the thing, so a window it opens is not behind it. */
  const then = (action: () => void) => () => {
    setOpen(false)
    action()
  }
  const addable = NETWORKS.filter((network) => !project.networks.includes(network))

  return (
    <TabbedMenu
      label="Project settings"
      align="start"
      width="20.4rem"
      open={menuState.open}
      onOpenChange={menuState.onOpenChange}
      tab={menuState.tab}
      onTabChange={menuState.onTabChange}
      tabs={[
        {
          value: "general",
          label: "General",
          content: (
            <div className="grid gap-3 p-3">
              <PickGroup title="Project">
                <PickRow label="Name" value={project.name}>
                  <ProjectNameField project={project} onSaved={onSaved} />
                </PickRow>
                <PickRow
                  label="AI spend cap"
                  value={
                    project.aiCapCents === null
                      ? "None"
                      : `${dollarsText(project.aiSpentCents)} of ${dollarsText(project.aiCapCents)}`
                  }
                >
                  <ProjectAiCapField project={project} onSaved={onSaved} />
                </PickRow>
                {/* The shell's Cover photo row, as every page's (Tyler, 12 Nov 2026: "the
                    picture is missing the 3 selection standard"): None, Sky, each
                    picture the project has had, and + to add one. */}
                <CoverRow
                  cover={{
                    url: project.imageUrl || null,
                    images: project.coverImages,
                    busy: busy !== null,
                    set: (next) =>
                      void run("cover", async () => {
                        await saveProject({ projectId: project.id, cover: { coverUrl: next.url, coverImages: next.images } })
                        onSaved()
                      }),
                  }}
                />
              </PickGroup>
              <div className="grid">
                <ActionRow
                  icon={project.pinned ? <PinOffIcon className="size-4" /> : <PinIcon className="size-4" />}
                  disabled={busy !== null}
                  onClick={() =>
                    void run("pin", async () => {
                      await pinProject(project.id, !project.pinned)
                      onSaved()
                    })
                  }
                >
                  {project.pinned ? "Unpin" : "Pin, first on the Projects dashboard"}
                </ActionRow>
                <ActionRow
                  icon={busy === "pause" ? <Loader2Icon className="size-4 animate-spin" /> : project.pausedAt ? <PlayIcon className="size-4" /> : <PauseIcon className="size-4" />}
                  disabled={busy !== null}
                  onClick={() => void run("pause", onTogglePause)}
                >
                  {project.pausedAt ? "Resume this project" : "Pause this project"}
                </ActionRow>
                <ActionRow
                  icon={project.descriptionLocked ? <LockOpenIcon className="size-4" /> : <LockIcon className="size-4" />}
                  disabled={busy !== null}
                  onClick={() =>
                    void run("lock", async () => {
                      await lockProjectDescription(project.id, !project.descriptionLocked)
                      onSaved()
                    })
                  }
                >
                  {project.descriptionLocked ? "Unlock description" : "Lock description"}
                </ActionRow>
                <ActionRow icon={<PlusIcon className="size-4" />} onClick={then(onNewProject)}>
                  New project
                </ActionRow>
                <ActionRow
                  icon={busy === "duplicate" ? <Loader2Icon className="size-4 animate-spin" /> : <CopyIcon className="size-4" />}
                  disabled={busy !== null}
                  onClick={() =>
                    void run("duplicate", async () => {
                      const { id } = await copyProject(project.id)
                      setOpen(false)
                      await navigate({ to: "/admin/projects/$projectId", params: { projectId: id } })
                    })
                  }
                >
                  Duplicate
                </ActionRow>
                <div aria-hidden className="-mx-3 my-1.5 border-t" />
                <ActionRow destructive icon={<Trash2Icon className="size-4" />} onClick={then(onDeleteProject)}>
                  Delete project
                </ActionRow>
              </div>
            </div>
          ),
        },
        {
          value: "networks",
          label: "Networks",
          content: (
            <div className="grid gap-3 p-3">
              <PickGroup title="In use">
                {project.networks.length ? (
                  project.networks.map((network) => {
                    const paused = project.pausedNetworks.includes(network)
                    const name = NETWORK_NAMES[network]
                    return (
                      <div key={network} className="flex min-h-11 items-center gap-2 px-3 py-1.5 text-sm">
                        <span className="text-muted-foreground [&_svg]:size-4">
                          <NetworkIcon network={network} />
                        </span>
                        <span className="min-w-0 flex-1 truncate">
                          {name}
                          {paused ? <span className="text-muted-foreground"> · Paused</span> : null}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={busy !== null}
                          aria-label={paused ? `Resume ${name} on this project` : `Pause ${name} on this project`}
                          onClick={() => void run(`pause:${network}`, () => onToggleNetworkPause(network, !paused))}
                        >
                          {busy === `pause:${network}` ? <Loader2Icon className="animate-spin" /> : paused ? <PlayIcon /> : <PauseIcon />}
                          {paused ? "Resume" : "Pause"}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="text-destructive hover:text-destructive"
                          disabled={busy !== null}
                          aria-label={`Take ${name} off this project`}
                          onClick={() => void run(`remove:${network}`, () => onRemoveNetwork(network))}
                        >
                          {busy === `remove:${network}` ? <Loader2Icon className="animate-spin" /> : <XIcon />}
                        </Button>
                      </div>
                    )
                  })
                ) : (
                  <p className="px-3 py-2.5 text-sm text-muted-foreground">None yet. Add one below.</p>
                )}
              </PickGroup>
              {addable.length ? (
                <PickGroup title="Add a network">
                  {addable.map((network) => (
                    <button
                      key={network}
                      type="button"
                      disabled={busy !== null}
                      className="flex min-h-11 w-full items-center gap-2 px-3 py-1.5 text-left text-sm enabled:hover:bg-muted"
                      onClick={() => void run(`add:${network}`, () => onAddNetwork(network))}
                    >
                      <span className="text-muted-foreground [&_svg]:size-4">
                        <NetworkIcon network={network} />
                      </span>
                      <span className="flex-1">{NETWORK_NAMES[network]}</span>
                      {busy === `add:${network}` ? <Loader2Icon className="size-4 animate-spin" /> : <PlusIcon className="size-4 text-muted-foreground" />}
                    </button>
                  ))}
                </PickGroup>
              ) : null}
            </div>
          ),
        },
        { value: "widgets", label: "Widgets", content: widgets },
      ]}
    />
  )
}

/**
 * AI spend cap: the most the project's AI may cost in a calendar month, in
 * dollars, saving itself like the name. Empty is no cap. Once this month's
 * spend reaches it, every AI button for the project is refused with why.
 */
function ProjectAiCapField({ project, onSaved }: { project: Project; onSaved: () => void }) {
  const shown = project.aiCapCents === null ? "" : String(project.aiCapCents / 100)
  const [typed, setTyped] = React.useState(shown)
  const [invalid, setInvalid] = React.useState(false)
  const setSaveStatus = usePromoSaveStatus()
  const saved = React.useRef(project.aiCapCents)
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const id = React.useId()

  const save = React.useCallback(
    async (next: string) => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = null
      const parsed = parseCapDollars(next)
      if ("error" in parsed) {
        setInvalid(true)
        showErrorToast(parsed.error)
        return
      }
      setInvalid(false)
      if (parsed.cents === saved.current) return
      setSaveStatus("saving")
      dismissErrorToast()
      try {
        await saveProjectAiCap(project.id, parsed.cents)
        saved.current = parsed.cents
        setSaveStatus("saved")
        onSaved()
      } catch (error) {
        setSaveStatus("idle")
        showErrorToast(getProjectErrorMessage(error))
      }
    },
    [onSaved, project.id, setSaveStatus]
  )

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>Dollars a month</Label>
      <Input
        id={id}
        inputMode="decimal"
        placeholder="No cap"
        value={typed}
        aria-invalid={invalid || undefined}
        aria-describedby={`${id}-spent`}
        onChange={(event) => {
          const next = event.target.value
          setTyped(next)
          if (timer.current) clearTimeout(timer.current)
          timer.current = setTimeout(() => void save(next), SAVE_AFTER_MS)
        }}
        onBlur={() => void save(typed)}
        onKeyDown={(event) => {
          if (event.key === "Enter") void save(typed)
        }}
      />
      <p id={`${id}-spent`} className="text-xs text-muted-foreground">
        {dollarsText(project.aiSpentCents)} spent this month. Leave it empty for no cap.
      </p>
    </div>
  )
}

/** The name, saving 700ms after the last key, on Enter, and at once when the box is left. */
function ProjectNameField({ project, onSaved }: { project: Project; onSaved: () => void }) {
  const [name, setName] = React.useState(project.name)
  const [invalid, setInvalid] = React.useState(false)
  const setSaveStatus = usePromoSaveStatus()
  const saved = React.useRef(project.name)
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const save = React.useCallback(
    async (next: string) => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = null
      const trimmed = next.trim()
      if (trimmed === saved.current) return
      setInvalid(!trimmed)
      if (!trimmed) {
        showErrorToast("Give the project a name first.")
        return
      }
      setSaveStatus("saving")
      dismissErrorToast()
      try {
        await saveProject({ projectId: project.id, name: trimmed })
        saved.current = trimmed
        setSaveStatus("saved")
        onSaved()
      } catch (error) {
        setSaveStatus("idle")
        showErrorToast(getProjectErrorMessage(error))
      }
    },
    [onSaved, project.id, setSaveStatus]
  )

  return (
    <Input
      aria-label="Project name"
      value={name}
      maxLength={120}
      aria-invalid={invalid || undefined}
      onChange={(event) => {
        const next = event.target.value
        setName(next)
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => void save(next), SAVE_AFTER_MS)
      }}
      onBlur={() => void save(name)}
      onKeyDown={(event) => {
        if (event.key === "Enter") void save(name)
      }}
    />
  )
}
