import * as React from "react"
import {
  FolderOpenIcon,
  Loader2Icon,
  MessagesSquareIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  SettingsIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react"

import { useReportedSaveStatus } from "@/components/settings/use-reported-save-status"
import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { ImageUpload } from "@/components/shared/image-upload"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { getProjectErrorMessage, saveProject, type ProjectView } from "@/lib/api/social/projects"
import { NETWORK_NAMES, NETWORKS, type Network } from "@/lib/social/networks"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

import { Hint } from "../hint"

/** How long typing has to stop before the name or description saves. */
const SAVE_AFTER_MS = 700

/**
 * The project dashboard's left column: the project's picture, name and
 * description, and the networks it uses. Tyler sent the design on 13 Oct
 * 2026, and the networks took the accounts' place on 14 Oct 2026, when the
 * account that comments moved to a dropdown beside Post.
 *
 * The cog opens the project's name and description, which save as they are
 * typed with no Save button, then New project, Pause and Delete. The arrow
 * goes back to the table of every project, which is where another project is
 * picked.
 */
export function ProjectPanel({
  view,
  selectedNetwork,
  onSelectNetwork,
  onAddNetwork,
  onRemoveNetwork,
  onNewProject,
  onDeleteProject,
  onTogglePause,
  onSaved,
}: {
  view: ProjectView
  /** The network whose panels fill the middle and right columns. */
  selectedNetwork: Network | null
  onSelectNetwork: (network: Network) => void
  onAddNetwork: (network: Network) => Promise<void>
  onRemoveNetwork: (network: Network) => Promise<void>
  onNewProject: () => void
  onDeleteProject: () => void
  /** Pauses the project, or resumes it when it is paused. */
  onTogglePause: () => Promise<void>
  /** The name, description or picture was saved, so the page should read it again. */
  onSaved: () => void
}) {
  const project = view.project
  const [pausing, setPausing] = React.useState(false)

  async function togglePause() {
    setPausing(true)
    try {
      await onTogglePause()
    } finally {
      setPausing(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <DashboardCardTitleHeader
        icon={<FolderOpenIcon className="size-4" />}
        back={{ label: "All projects", to: "/admin/projects" }}
        title={project.name}
        action={
          <ProjectMenu
            // Keyed by the project, so another project's words never carry
            // over into these boxes.
            key={project.id}
            project={project}
            pausing={pausing}
            onSaved={onSaved}
            onNewProject={onNewProject}
            onDeleteProject={onDeleteProject}
            onTogglePause={() => void togglePause()}
          />
        }
      />

      <ScrollArea className="min-h-0 flex-1">
        <div className="grid gap-6 p-3">
          {/* A paused project says so at the top, with the way out beside it. */}
          {project.pausedAt ? (
            <div className="grid gap-2 rounded-lg border p-3 text-sm">
              <p className="flex items-start gap-1.5">
                <PauseIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>
                  Paused. None of its accounts posts, warms up or takes readings until you
                  resume it. Searches still run.
                </span>
              </p>
              <Button
                type="button"
                variant="outline"
                className="justify-self-start"
                disabled={pausing}
                onClick={() => void togglePause()}
              >
                {pausing ? <Loader2Icon className="animate-spin" /> : <PlayIcon />}
                Resume
              </Button>
            </div>
          ) : null}

          <div className="grid gap-3">
            <ProjectPicture key={project.id} project={project} onSaved={onSaved} />
            <div className="grid gap-1.5">
              <h2 className="text-lg leading-snug font-semibold break-words">{project.name}</h2>
              <p className="text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">
                {project.description || "No description yet. The cog above holds it, and the AI is told it."}
              </p>
            </div>
          </div>

          <ProjectNetworks
            networks={project.networks}
            selected={selectedNetwork}
            onSelect={onSelectNetwork}
            onAdd={onAddNetwork}
            onRemove={onRemoveNetwork}
          />
        </div>
      </ScrollArea>
    </div>
  )
}

/**
 * The picture at the top of the column, through the shared image field. It
 * saves the moment one is picked or removed; a refused save puts the old one
 * back and says why.
 */
function ProjectPicture({ project, onSaved }: { project: ProjectView["project"]; onSaved: () => void }) {
  const [imageUrl, setImageUrl] = React.useState(project.imageUrl)
  const setSaveStatus = useReportedSaveStatus()

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
 * The cog: the name and the description, each saving 700ms after the last
 * key and at once when the box is left, then New project, Pause and Delete.
 */
function ProjectMenu({
  project,
  pausing,
  onSaved,
  onNewProject,
  onDeleteProject,
  onTogglePause,
}: {
  project: ProjectView["project"]
  pausing: boolean
  onSaved: () => void
  onNewProject: () => void
  onDeleteProject: () => void
  onTogglePause: () => void
}) {
  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState(project.name)
  const [description, setDescription] = React.useState(project.description)
  const [nameInvalid, setNameInvalid] = React.useState(false)
  const setSaveStatus = useReportedSaveStatus()
  const saved = React.useRef({ name: project.name, description: project.description })
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  /** What is typed and waiting for the timer, so shutting the box still saves it. */
  const pending = React.useRef<{ name: string; description: string } | null>(null)

  const save = React.useCallback(
    async (next: { name: string; description: string }) => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = null
      pending.current = null
      const nameChanged = next.name.trim() !== saved.current.name
      const descriptionChanged = next.description !== saved.current.description
      if (!nameChanged && !descriptionChanged) return
      // An empty name is not sent: the field is marked and the description,
      // if it changed, still saves.
      const nameOk = Boolean(next.name.trim())
      setNameInvalid(!nameOk)
      if (!nameOk && !descriptionChanged) {
        showErrorToast("Give the project a name first.")
        return
      }
      setSaveStatus("saving")
      dismissErrorToast()
      try {
        await saveProject({
          projectId: project.id,
          ...(nameChanged && nameOk ? { name: next.name.trim() } : {}),
          ...(descriptionChanged ? { description: next.description } : {}),
        })
        if (nameChanged && nameOk) saved.current.name = next.name.trim()
        if (descriptionChanged) saved.current.description = next.description
        setSaveStatus("saved")
        onSaved()
      } catch (error) {
        setSaveStatus("idle")
        showErrorToast(getProjectErrorMessage(error))
      }
    },
    [onSaved, project.id, setSaveStatus]
  )

  const later = (next: { name: string; description: string }) => {
    if (timer.current) clearTimeout(timer.current)
    pending.current = next
    timer.current = setTimeout(() => void save(next), SAVE_AFTER_MS)
  }

  // Whatever is still waiting goes when the project is left.
  React.useEffect(
    () => () => {
      if (pending.current) void save(pending.current)
    },
    [save]
  )

  /** Shuts the box, then does the thing, so a window it opens is not behind it. */
  const then = (action: () => void) => () => {
    setOpen(false)
    action()
  }

  const menuRow = "w-full justify-start gap-2.5 px-2 font-normal"

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next && pending.current) void save(pending.current)
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button type="button" size="icon" variant="ghost" aria-label="Project settings">
              <SettingsIcon />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Name, description, new project, pause and delete</TooltipContent>
      </Tooltip>
      <PopoverContent align="start" className="w-80 gap-4 p-3">
        <div className="grid gap-2">
          <Label htmlFor="promo-project-name">Name</Label>
          <Input
            id="promo-project-name"
            value={name}
            maxLength={120}
            aria-invalid={nameInvalid || undefined}
            onChange={(event) => {
              setName(event.target.value)
              later({ name: event.target.value, description })
            }}
            onBlur={() => void save({ name, description })}
            onKeyDown={(event) => {
              if (event.key === "Enter") void save({ name, description })
            }}
          />
        </div>
        <div className="grid gap-2">
          <FieldLabel
            htmlFor="promo-project-description"
            hint="What the AI is told about what you make, for when it genuinely answers a post. Leave it empty and no draft mentions a product."
          >
            Description
          </FieldLabel>
          <Textarea
            id="promo-project-description"
            value={description}
            maxLength={4_000}
            placeholder="A tool that finds Reddit threads worth answering, for people who sell to small teams."
            onChange={(event) => {
              setDescription(event.target.value)
              later({ name, description: event.target.value })
            }}
            onBlur={() => void save({ name, description })}
          />
        </div>
        <div className="grid gap-0.5">
          <Button type="button" variant="ghost" className={menuRow} onClick={then(onNewProject)}>
            <PlusIcon />
            New project
          </Button>
          <Hint label={project.pausedAt ? null : "None of its accounts posts, warms up or takes readings until you resume it"} side="right">
            <Button
              type="button"
              variant="ghost"
              className={menuRow}
              disabled={pausing}
              onClick={then(onTogglePause)}
            >
              {pausing ? <Loader2Icon className="animate-spin" /> : project.pausedAt ? <PlayIcon /> : <PauseIcon />}
              {project.pausedAt ? "Resume this project" : "Pause this project"}
            </Button>
          </Hint>
          <Button
            type="button"
            variant="ghost"
            className={cn(menuRow, "text-destructive hover:text-destructive")}
            onClick={then(onDeleteProject)}
          >
            <Trash2Icon />
            Delete project
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

/**
 * The networks the project uses, one row each, and "+ Add network" offering
 * the ones Promo has built that it does not use yet. Picking a row fills the
 * middle and right columns with that network's panels. Tyler, 14 Oct 2026:
 * "If I click on reddit then the middle and right panel will show reddit
 * panels". The X takes a network off, which the server refuses while the
 * project still holds that network's accounts or keywords.
 */
function ProjectNetworks({
  networks,
  selected,
  onSelect,
  onAdd,
  onRemove,
}: {
  networks: Network[]
  selected: Network | null
  onSelect: (network: Network) => void
  onAdd: (network: Network) => Promise<void>
  onRemove: (network: Network) => Promise<void>
}) {
  const [busy, setBusy] = React.useState<Network | null>(null)
  const addable = NETWORKS.filter((network) => !networks.includes(network))

  async function run(network: Network, action: (network: Network) => Promise<void>) {
    setBusy(network)
    try {
      await action(network)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Networks</h3>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="sm" disabled={busy !== null}>
              <PlusIcon />
              Add network
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            {addable.length ? (
              addable.map((network) => (
                <DropdownMenuItem key={network} onSelect={() => void run(network, onAdd)}>
                  {NETWORK_NAMES[network]}
                </DropdownMenuItem>
              ))
            ) : (
              <DropdownMenuLabel className="font-normal text-muted-foreground">
                This project uses every network Promo has. Instagram joins once it is built.
              </DropdownMenuLabel>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {networks.length ? (
        <div className="grid gap-1">
          {networks.map((network) => {
            const name = NETWORK_NAMES[network]
            const picked = network === selected
            return (
              <div
                key={network}
                className={cn(
                  "flex min-w-0 items-center gap-1 rounded-lg border pr-1",
                  picked && "bg-muted"
                )}
              >
                <button
                  type="button"
                  aria-pressed={picked}
                  onClick={() => onSelect(network)}
                  className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-lg px-3 text-left text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <NetworkIcon network={network} />
                  <span className="truncate">{name}</span>
                </button>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Take ${name} off this project`}
                      disabled={busy !== null}
                      onClick={() => void run(network, onRemove)}
                    >
                      {busy === network ? <Loader2Icon className="animate-spin" /> : <XIcon />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Take {name} off this project. Refused while it holds accounts or keywords.</TooltipContent>
                </Tooltip>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          This project uses no network yet. Add one and its posts and comment box open beside this column.
        </p>
      )}
    </div>
  )
}

/** A network's mark, the same size as the text beside it. */
function NetworkIcon({ network }: { network: Network }) {
  switch (network) {
    case "reddit":
      return <MessagesSquareIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
  }
}
