import * as React from "react"
import {
  ArchiveIcon,
  EllipsisVerticalIcon,
  FileTextIcon,
  FolderOpenIcon,
  LayersIcon,
  Loader2Icon,
  LockIcon,
  LockOpenIcon,
  MessagesSquareIcon,
  PauseIcon,
  PinIcon,
  PlayIcon,
  PlusIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react"

import { usePromoGuest, usePromoSaveStatus } from "@/components/social/guest/guest-mode"
import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { FoldingMenu, MenuAction, MenuLine, MenuSection, useOpenSections } from "@/components/shared/folding-menu"
import { ImageUpload } from "@/components/shared/image-upload"
import { PanelCard, PanelHeading } from "@/components/shared/panel-card"
import { DocumentEditor } from "@/components/shared/rich-text-editor"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  getProjectErrorMessage,
  lockProjectDescription,
  pinProject,
  saveProject,
  type ProjectView,
} from "@/lib/api/social/projects"
import { writtenPageBodyIsEmpty, type WrittenPageNode } from "@/lib/pages/written-page-body"
import { NETWORK_NAMES, NETWORKS, type Network } from "@/lib/social/networks"
import { isCommentingNetwork, type Side } from "@/lib/social/sides"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

import { Hint } from "../hint"
import { NetworkIcon } from "../network-icon"
import { ProjectBansMark } from "./project-bans-link"

/** How long typing has to stop before the name or description saves. */
const SAVE_AFTER_MS = 700

type Project = ProjectView["project"]

/**
 * The project dashboard's left column, drawn as Project's left panel is
 * (Tyler, 5 Nov 2026: "Left panel needs to use left panel standards, look at
 * project app"; `workspace/tasks/Projects/left-column-standards.md`).
 *
 * - **The header** holds the name once, then Paused and the bans mark, then
 *   the pin and the ⋮ of settings. The picture lies faintly behind it.
 * - **The body** is the description, written in place, then a card per
 *   network with its Posts and Commenting rows, then the Archive card.
 *
 * A guest sent from Project works the project but never runs it: no way back
 * to the table, no pin, no ⋮, and nothing on a card but its rows.
 */
export function ProjectPanel({
  view,
  selectedNetwork,
  selectedSide,
  keywordSlot,
  onSelect,
  onAddNetwork,
  onRemoveNetwork,
  onToggleNetworkPause,
  onToggleCommentingPause,
  onNewProject,
  onDeleteProject,
  onTogglePause,
  onSaved,
  archiveSelected,
  onSelectArchive,
}: {
  view: ProjectView
  /** The network whose panels fill the middle and right columns. */
  selectedNetwork: Network | null
  /** Which of its two rows: your own posts, or commenting on other people's. */
  selectedSide: Side
  /** Where the picked network's keywords are drawn, under its Commenting row. */
  keywordSlot: (element: HTMLDivElement | null) => void
  onSelect: (network: Network, side: Side) => void
  onAddNetwork: (network: Network) => Promise<void>
  onRemoveNetwork: (network: Network) => Promise<void>
  /** Pauses one network of the project, or resumes it, while the rest runs. */
  onToggleNetworkPause: (network: Network, paused: boolean) => Promise<void>
  /** Pauses commenting alone on one network, or resumes it; its own posts carry on. */
  onToggleCommentingPause: (network: Network, paused: boolean) => Promise<void>
  onNewProject: () => void
  onDeleteProject: () => void
  /** Pauses the project, or resumes it when it is paused. */
  onTogglePause: () => Promise<void>
  /** Something about the project was saved, so the page should read it again. */
  onSaved: () => void
  /** Whether the project's Archive fills the middle and right columns. */
  archiveSelected: boolean
  onSelectArchive: () => void
}) {
  const project = view.project
  const guest = Boolean(usePromoGuest())
  // A picture whose address no longer loads is left out rather than drawn broken.
  const [broken, setBroken] = React.useState<string | null>(null)
  const banner = project.imageUrl && project.imageUrl !== broken ? project.imageUrl : null

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {banner ? (
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-36 overflow-hidden">
          <img src={banner} alt="" className="size-full object-cover opacity-30" onError={() => setBroken(banner)} />
          {/* Fading into the column at the foot, as on Project's project page. */}
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-card/40 to-card" />
        </div>
      ) : null}
      <DashboardCardTitleHeader
        // The line goes see-through rather than away, so the header keeps its height.
        className={cn("relative", banner && "border-b-transparent")}
        icon={<FolderOpenIcon className="size-4" />}
        back={guest ? undefined : { label: "All projects", to: "/admin/projects" }}
        title={
          <span className="flex min-w-0 items-center gap-2">
            <FullNameOnHover name={project.name} />
            {project.pausedAt ? <span className="shrink-0 text-xs font-normal text-muted-foreground">Paused</span> : null}
            <ProjectBansMark projectId={project.id} count={project.bannedRecently} link={!guest} />
          </span>
        }
        action={
          guest ? null : (
            <div className="flex items-center gap-0.5">
              <PinButton project={project} onSaved={onSaved} />
              {/* Between the pin and the ⋮ (Tyler, 5 Nov 2026: "move the add network + here"). */}
              <AddNetworkMenu
                networks={project.networks}
                onAdd={onAddNetwork}
                tip="Add a network"
                trigger={(adding) => (
                  <Button type="button" variant="ghost" size="icon-sm" aria-label="Add a network" disabled={adding}>
                    {adding ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
                  </Button>
                )}
              />
              <ProjectMenu
                key={project.id}
                project={project}
                onSaved={onSaved}
                onNewProject={onNewProject}
                onDeleteProject={onDeleteProject}
                onTogglePause={onTogglePause}
              />
            </div>
          )
        }
      />

      <ScrollArea className="relative min-h-0 flex-1">
        <div className={cn("grid gap-5 p-4", banner && "pt-6")}>
          <ProjectDescription
            // Locking or unlocking draws it again from what was saved.
            key={`${project.id}:${project.descriptionLocked}`}
            projectId={project.id}
            description={project.description}
            locked={project.descriptionLocked}
          />

          <ProjectNetworks
            projectId={project.id}
            networks={project.networks}
            paused={project.pausedNetworks}
            pausedCommenting={project.pausedCommenting}
            postCounts={view.postCounts ?? {}}
            commentCounts={view.networkCounts ?? {}}
            selected={archiveSelected ? null : selectedNetwork}
            selectedSide={selectedSide}
            keywordSlot={keywordSlot}
            onSelect={onSelect}
            onAdd={guest ? null : onAddNetwork}
            onRemove={guest ? null : onRemoveNetwork}
            onTogglePause={guest ? null : onToggleNetworkPause}
            onToggleCommentingPause={guest ? null : onToggleCommentingPause}
          />

          <PanelCard
            storageId={`promo-archive-${project.id}`}
            icon={<ArchiveIcon />}
            title="Archive"
            meta={project.archiveCount ? project.archiveCount : undefined}
            openWhen={archiveSelected}
          >
            <div className="-mx-2 -mb-2 grid gap-0.5">
              <CardRow icon={<ArchiveIcon className="size-4" />} label="All items" picked={archiveSelected} onClick={onSelectArchive} />
            </div>
          </PanelCard>
        </div>
      </ScrollArea>
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
 * The pin, as Project's: filled and yellow while pinned. A pinned project
 * comes first in the Projects table, whatever the sort (Tyler, 5 Nov 2026).
 */
function PinButton({ project, onSaved }: { project: Project; onSaved: () => void }) {
  const [busy, setBusy] = React.useState(false)
  return (
    <Hint label={project.pinned ? "Pinned: first in the Projects table" : "Pin to put it first in the Projects table"}>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={project.pinned ? `Unpin ${project.name}` : `Pin ${project.name}`}
        aria-pressed={project.pinned}
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          try {
            await pinProject(project.id, !project.pinned)
            onSaved()
          } catch (error) {
            showErrorToast(getProjectErrorMessage(error))
          } finally {
            setBusy(false)
          }
        }}
      >
        {/* Filled as well as yellow, so it never relies on colour alone. */}
        <PinIcon className={cn("size-4", project.pinned && "fill-amber-400 text-amber-500")} aria-hidden />
      </Button>
    </Hint>
  )
}

/**
 * The project's ⋮, the shell's one dropdown look, as Project's settings menu:
 * Name and Picture as folding rows, each saving itself, then a line, then New
 * project, Pause or Resume, Lock description, and Delete in red last. It
 * opens to the right, over the middle column.
 */
function ProjectMenu({
  project,
  onSaved,
  onNewProject,
  onDeleteProject,
  onTogglePause,
}: {
  project: Project
  onSaved: () => void
  onNewProject: () => void
  onDeleteProject: () => void
  onTogglePause: () => Promise<void>
}) {
  const [open, setOpen] = React.useState(false)
  const [shown, toggle] = useOpenSections<"name" | "picture">()
  const [busy, setBusy] = React.useState<"pause" | "lock" | null>(null)

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

  async function run(kind: "pause" | "lock", action: () => Promise<void>) {
    setBusy(kind)
    try {
      await action()
    } finally {
      setBusy(null)
    }
  }

  return (
    <FoldingMenu
      label="Project settings"
      align="start"
      open={open}
      onOpenChange={change}
      // The small size, as the pin beside it, so the name keeps the room.
      trigger={
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Project settings">
          {busy ? <Loader2Icon className="animate-spin" /> : <EllipsisVerticalIcon />}
        </Button>
      }
    >
      <MenuSection label="Name" value={project.name} open={shown.has("name")} onToggle={() => toggle("name")}>
        <ProjectNameField project={project} onSaved={onSaved} />
      </MenuSection>
      <MenuSection label="Picture" value={project.imageUrl ? "Added" : "None"} open={shown.has("picture")} onToggle={() => toggle("picture")}>
        <ProjectPictureField project={project} onSaved={onSaved} />
      </MenuSection>
      <MenuLine />
      <MenuAction icon={<PlusIcon className="size-4" />} onClick={then(onNewProject)}>
        New project
      </MenuAction>
      <MenuAction
        icon={busy === "pause" ? <Loader2Icon className="size-4 animate-spin" /> : project.pausedAt ? <PlayIcon className="size-4" /> : <PauseIcon className="size-4" />}
        disabled={busy !== null}
        onClick={() => void run("pause", onTogglePause)}
      >
        {project.pausedAt ? "Resume this project" : "Pause this project"}
      </MenuAction>
      <MenuAction
        icon={project.descriptionLocked ? <LockOpenIcon className="size-4" /> : <LockIcon className="size-4" />}
        disabled={busy !== null}
        onClick={() =>
          void run("lock", async () => {
            try {
              await lockProjectDescription(project.id, !project.descriptionLocked)
              onSaved()
            } catch (error) {
              showErrorToast(getProjectErrorMessage(error))
            }
          })
        }
      >
        {project.descriptionLocked ? "Unlock description" : "Lock description"}
      </MenuAction>
      <MenuAction icon={<Trash2Icon className="size-4" />} destructive onClick={then(onDeleteProject)}>
        Delete project
      </MenuAction>
    </FoldingMenu>
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

/**
 * The picture, through the shared image field. It saves the moment one is
 * picked or removed; a refused save puts the old one back and says why. It
 * lies behind the header, so no picture means no banner.
 */
function ProjectPictureField({ project, onSaved }: { project: Project; onSaved: () => void }) {
  const [imageUrl, setImageUrl] = React.useState(project.imageUrl)
  const setSaveStatus = usePromoSaveStatus()

  return (
    <ImageUpload
      label="Project picture"
      showLabel={false}
      value={imageUrl}
      aspect="video"
      fit="cover"
      emptyLabel="Add a picture"
      onChange={async (next) => {
        const before = imageUrl
        setImageUrl(next)
        setSaveStatus("saving")
        dismissErrorToast()
        try {
          await saveProject({ projectId: project.id, imageUrl: next })
          setSaveStatus("saved")
          onSaved()
        } catch (error) {
          setImageUrl(before)
          setSaveStatus("idle")
          showErrorToast(getProjectErrorMessage(error))
        }
      }}
    />
  )
}

/**
 * The description at the top of the body, written in place in the shared
 * editor as Project's page notes are, and what the AI is told about what you
 * make. It saves 700ms after the last letter and when it is left, with
 * Saving… and Saved in the page header. A guest from Project writes in it
 * too. Locked, it reads only for everyone, and an empty one shows nothing.
 * While it is open it is never drawn again from what was saved, so a late
 * save can't take back what was just written.
 */
function ProjectDescription({
  projectId,
  description,
  locked,
}: {
  projectId: string
  description: WrittenPageNode
  locked: boolean
}) {
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
    saveProject({ projectId, description: next })
      .then(() => setSaveStatus("saved"))
      .catch((error: unknown) => {
        // Kept to try again with the next letter or when the column is left.
        draft.current ??= next
        setSaveStatus("idle")
        showErrorToast(getProjectErrorMessage(error))
      })
  }, [projectId, setSaveStatus])

  // Leaving the project saves what was typed.
  React.useEffect(() => flush, [flush])

  if (locked && writtenPageBodyIsEmpty(start)) return null

  return (
    <div
      className={cn(
        // A plain writing area, no box: the column around it is the page.
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
        disabled={locked}
        placeholder="Describe what you make. The AI is told this."
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
 * The networks the project uses, one card each, and a + beside the heading
 * offering the ones it does not use yet. Tyler, 5 Nov 2026: "Make each network
 * have its own card and inside that cade have 2 rows, one for posts and one
 * for commenting", then "cards should be collapsible" and "use ui standard
 * card".
 *
 * - **Posts** opens your own posts on it, with how many need you: failed ones
 *   and drafts not sent yet.
 * - **Commenting** opens the posts its keywords found and what you sent under
 *   them, with how many wait to be answered, and a Pause of its own that holds
 *   back only the comments. Picked, its keywords are listed under it.
 *   Instagram and TikTok answer comments under your own posts, so they have
 *   no Commenting row.
 */
function ProjectNetworks({
  projectId,
  networks,
  paused,
  pausedCommenting,
  postCounts,
  commentCounts,
  selected,
  selectedSide,
  keywordSlot,
  onSelect,
  onAdd,
  onRemove,
  onTogglePause,
  onToggleCommentingPause,
}: {
  projectId: string
  networks: Network[]
  /** The networks paused on their own. */
  paused: Network[]
  /** The networks whose commenting alone is paused. */
  pausedCommenting: Network[]
  postCounts: Partial<Record<Network, number>>
  commentCounts: Partial<Record<Network, number>>
  selected: Network | null
  selectedSide: Side
  keywordSlot: (element: HTMLDivElement | null) => void
  onSelect: (network: Network, side: Side) => void
  /** Null for a guest, who uses the networks the project has. */
  onAdd: ((network: Network) => Promise<void>) | null
  onRemove: ((network: Network) => Promise<void>) | null
  onTogglePause: ((network: Network, paused: boolean) => Promise<void>) | null
  onToggleCommentingPause: ((network: Network, paused: boolean) => Promise<void>) | null
}) {
  const [busy, setBusy] = React.useState<string | null>(null)

  async function run(key: string, action: () => Promise<void>) {
    setBusy(key)
    try {
      await action()
    } finally {
      setBusy(null)
    }
  }

  if (!networks.length) {
    return (
      <div className="grid justify-items-center gap-3 rounded-lg border border-dashed px-4 py-6 text-center">
        <LayersIcon className="size-5 text-muted-foreground" aria-hidden />
        <p className="text-sm text-muted-foreground">
          {onAdd ? "Add a network to post and comment from this project" : "This project uses no network yet."}
        </p>
        {onAdd ? (
          <AddNetworkMenu
            networks={networks}
            onAdd={onAdd}
            trigger={(adding) => (
              <Button type="button" variant="outline" size="sm" disabled={adding}>
                {adding ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
                Add network
              </Button>
            )}
          />
        ) : null}
      </div>
    )
  }

  return (
    <div className="grid gap-2">
      <PanelHeading>Networks</PanelHeading>

      {networks.map((network) => {
        const name = NETWORK_NAMES[network]
        const isPaused = paused.includes(network)
        const commentingPaused = pausedCommenting.includes(network)
        const comments = isCommentingNetwork(network)
        const posts = postCounts[network] ?? 0
        const waiting = comments ? (commentCounts[network] ?? 0) : 0
        const pickedCommenting = network === selected && selectedSide === "commenting"
        return (
          <NetworkCard
            key={network}
            projectId={projectId}
            network={network}
            paused={isPaused}
            waiting={posts + waiting}
            picked={network === selected}
            busy={busy}
            onTogglePause={onTogglePause ? () => void run(`pause:${network}`, () => onTogglePause(network, !isPaused)) : null}
            onRemove={onRemove ? () => void run(`remove:${network}`, () => onRemove(network)) : null}
          >
            <CardRow
              icon={<FileTextIcon className="size-4" />}
              label="Posts"
              picked={network === selected && selectedSide === "posts"}
              count={posts ? { n: posts, words: "need you" } : null}
              onClick={() => onSelect(network, "posts")}
            />
            {comments ? (
              <CardRow
                icon={<MessagesSquareIcon className="size-4" />}
                label="Commenting"
                picked={pickedCommenting}
                count={waiting ? { n: waiting, words: "to answer" } : null}
                note={commentingPaused ? "Paused" : null}
                onClick={() => onSelect(network, "commenting")}
                actionShown={busy === `comments:${network}`}
                action={
                  onToggleCommentingPause ? (
                    <Hint
                      label={
                        commentingPaused
                          ? `Resume commenting on ${name}`
                          : `Pause commenting on ${name} alone. Comments wait; your own posts still go out.`
                      }
                    >
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={commentingPaused ? `Resume commenting on ${name}` : `Pause commenting on ${name}`}
                        disabled={busy !== null}
                        onClick={() => void run(`comments:${network}`, () => onToggleCommentingPause(network, !commentingPaused))}
                      >
                        {busy === `comments:${network}` ? <Loader2Icon className="animate-spin" /> : commentingPaused ? <PlayIcon /> : <PauseIcon />}
                      </Button>
                    </Hint>
                  ) : null
                }
              />
            ) : null}
            {/* The picked network's keywords, drawn here by its Commenting
                header (`KeywordPicker`), heading and all. */}
            {pickedCommenting ? <div ref={keywordSlot} className="px-2 pt-2 pb-1 empty:hidden" /> : null}
          </NetworkCard>
        )
      })}
    </div>
  )
}

/** The networks the project does not use yet, in the shared dropdown look. */
function AddNetworkMenu({
  networks,
  onAdd,
  trigger,
  tip = null,
}: {
  networks: Network[]
  onAdd: (network: Network) => Promise<void>
  /** The button that opens it, told while a network is being added. */
  trigger: (adding: boolean) => React.ReactElement
  /** Said on hover, for a + that has no words of its own. */
  tip?: string | null
}) {
  const [open, setOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  async function add(network: Network) {
    setOpen(false)
    setBusy(true)
    try {
      await onAdd(network)
    } finally {
      setBusy(false)
    }
  }
  const addable = NETWORKS.filter((network) => !networks.includes(network))
  const menu = (
    <FoldingMenu label="Add a network" align="start" fit open={open} onOpenChange={setOpen} trigger={trigger(busy)}>
      {addable.length ? (
        addable.map((network) => (
          <MenuAction
            key={network}
            icon={<NetworkIcon network={network} />}
            disabled={busy}
            onClick={() => void add(network)}
          >
            {NETWORK_NAMES[network]}
          </MenuAction>
        ))
      ) : (
        <p className="px-2.5 py-1.5 text-muted-foreground">This project uses every network Promo has.</p>
      )}
    </FoldingMenu>
  )
  // The tooltip hangs on a wrapper, because the menu's own trigger is the
  // button, and it stays mounted, shut while the menu is open, so opening the
  // menu never draws its button again.
  return tip ? (
    <Tooltip open={open ? false : undefined}>
      <TooltipTrigger asChild>
        <span className="inline-flex">{menu}</span>
      </TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  ) : (
    menu
  )
}

/**
 * A network's card: the UI standard's `PanelCard`, with the network's mark,
 * folding to its title and remembering open or shut for each project in
 * this browser. Folded or open, its title counts what waits on both rows, as
 * "Reddit · 2". The picked network's card opens by itself. Its ⋮ holds Pause
 * and Take off, showing while the card is pointed at.
 */
function NetworkCard({
  projectId,
  network,
  paused,
  waiting,
  picked,
  busy,
  onTogglePause,
  onRemove,
  children,
}: {
  projectId: string
  network: Network
  paused: boolean
  /** Posts that need you and posts to answer, added together. */
  waiting: number
  picked: boolean
  busy: string | null
  /** Null for a guest, who has no ⋮. */
  onTogglePause: (() => void) | null
  onRemove: (() => void) | null
  children: React.ReactNode
}) {
  const [menuOpen, setMenuOpen] = React.useState(false)
  const name = NETWORK_NAMES[network]
  const working = busy === `pause:${network}` || busy === `remove:${network}`
  return (
    <PanelCard
      storageId={`promo-network-${projectId}-${network}`}
      icon={<NetworkIcon network={network} />}
      title={name}
      meta={waiting ? waiting : undefined}
      after={paused ? <span className="text-xs font-normal text-muted-foreground">Paused</span> : null}
      openWhen={picked}
      actionOpen={menuOpen || working}
      action={
        onTogglePause && onRemove ? (
          <FoldingMenu
            label={`More for ${name}`}
            align="start"
            fit
            open={menuOpen}
            onOpenChange={setMenuOpen}
            trigger={
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`More for ${name}`} disabled={busy !== null}>
                {working ? <Loader2Icon className="animate-spin" /> : <EllipsisVerticalIcon />}
              </Button>
            }
          >
            <MenuAction
              icon={paused ? <PlayIcon className="size-4" /> : <PauseIcon className="size-4" />}
              onClick={() => {
                setMenuOpen(false)
                onTogglePause()
              }}
            >
              {paused ? `Resume ${name} on this project` : `Pause ${name} on this project`}
            </MenuAction>
            <MenuLine />
            <MenuAction
              icon={<XIcon className="size-4" />}
              destructive
              onClick={() => {
                setMenuOpen(false)
                onRemove()
              }}
            >
              Take {name} off this project
            </MenuAction>
          </FoldingMenu>
        ) : undefined
      }
    >
      <div className="-mx-2 -mb-2 grid gap-0.5">{children}</div>
    </PanelCard>
  )
}

/** One row of a card: Posts, Commenting or the Archive's items, with what waits in words and its own button. */
function CardRow({
  icon,
  label,
  picked,
  count = null,
  note = null,
  action = null,
  actionShown = false,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  picked: boolean
  /**
   * What waits: "2 need you", "2 to answer". The words show when the row has
   * room for them beside its name; at the column's narrowest, the number alone.
   */
  count?: { n: number; words: string } | null
  note?: string | null
  action?: React.ReactNode
  /** Keeps the button in view, while its press is working. */
  actionShown?: boolean
  onClick: () => void
}) {
  return (
    <div className={cn("group/row @container/row flex min-h-8 min-w-0 items-center gap-1 rounded-md pr-1", picked ? "bg-background shadow-xs" : "hover:bg-background/60")}>
      <button
        type="button"
        aria-pressed={picked}
        onClick={onClick}
        className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <span className="text-muted-foreground">{icon}</span>
        <span className={cn("truncate", picked && "font-medium")}>{label}</span>
        {note ? <span className="shrink-0 text-xs text-muted-foreground">{note}</span> : null}
        {count ? (
          <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums" aria-label={`${count.n} ${count.words}`}>
            {count.n}
            <span className="hidden @[15rem]/row:inline"> {count.words}</span>
          </span>
        ) : null}
      </button>
      {/* Its own button shows while the row is pointed at or focused, as a
          card's do, and takes no room until then; always on a phone. */}
      {action ? (
        <span className={cn("shrink-0", actionShown ? "flex" : "hidden group-hover/row:flex group-has-[:focus-visible]/row:flex [@media(hover:none)]:flex")}>
          {action}
        </span>
      ) : null}
    </div>
  )
}
