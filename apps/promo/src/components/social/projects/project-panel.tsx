import * as React from "react"
import { Link } from "@tanstack/react-router"
import {
  ChevronDownIcon,
  ChevronUpIcon,
  FolderOpenIcon,
  Loader2Icon,
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
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
import { Meter } from "@/components/ui/meter"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  getProjectErrorMessage,
  saveProject,
  type ProjectAccount,
  type ProjectView,
} from "@/lib/api/social/projects"
import { accountStatusText } from "@/lib/social/account-status"
import { accountAgeText, whenText } from "@/lib/social/wording"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

import { Hint } from "../hint"

/** How long typing has to stop before the name or description saves. */
const SAVE_AFTER_MS = 700

/**
 * The Projects dashboard's left column: the project's picture, name and
 * description, and the accounts that comment for it. Tyler sent this design
 * on 13 Oct 2026.
 *
 * The cog opens the project's name and description, which save as they are
 * typed with no Save button, then New project, Pause and Delete. The arrow
 * goes back to the table of every project, which is where another project is
 * picked.
 *
 * The accounts are cards built by hand rather than the dashboard table, whose
 * main column forces a width a side panel does not have. Clicking one picks
 * who comments; it never posts. They are listed best to comment from first,
 * an order worked out on the server.
 */
export function ProjectPanel({
  view,
  selectedAccountId,
  onSelectAccount,
  onNewProject,
  onDeleteProject,
  onTogglePause,
  onAddAccount,
  onRemoveAccount,
  onSaved,
}: {
  view: ProjectView
  /** The account clicked, whose comment Post sends. Null before one is clicked. */
  selectedAccountId: string | null
  onSelectAccount: (accountId: string) => void
  onNewProject: () => void
  onDeleteProject: () => void
  /** Pauses the project, or resumes it when it is paused. */
  onTogglePause: () => Promise<void>
  onAddAccount: (accountId: string) => Promise<void>
  onRemoveAccount: (accountId: string) => Promise<void>
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

          <ProjectAccounts
            view={view}
            selectedAccountId={selectedAccountId}
            onSelectAccount={onSelectAccount}
            onAddAccount={onAddAccount}
            onRemoveAccount={onRemoveAccount}
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

/** Each status's dot. The status is always written beside it. */
function statusDot(account: ProjectAccount): string {
  switch (account.status.status) {
    case "ready":
    case "working":
      return "bg-emerald-500"
    case "warming_up":
      return "bg-amber-500"
    case "banned":
      return "bg-destructive"
    default:
      return "bg-muted-foreground/40"
  }
}

function ProjectAccounts({
  view,
  selectedAccountId,
  onSelectAccount,
  onAddAccount,
  onRemoveAccount,
}: {
  view: ProjectView
  selectedAccountId: string | null
  onSelectAccount: (accountId: string) => void
  onAddAccount: (accountId: string) => Promise<void>
  onRemoveAccount: (accountId: string) => Promise<void>
}) {
  const [adding, setAdding] = React.useState(false)

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <Hint label={view.accounts.length > 1 ? "Listed best to comment from first" : null}>
          <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Accounts</h3>
        </Hint>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="sm" disabled={adding}>
              {adding ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
              Add account
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            {view.freeAccounts.length ? (
              view.freeAccounts.map((account) => (
                <DropdownMenuItem
                  key={account.id}
                  onSelect={async () => {
                    setAdding(true)
                    try {
                      await onAddAccount(account.id)
                    } finally {
                      setAdding(false)
                    }
                  }}
                >
                  <span className="truncate">
                    {account.handle ? `u/${account.handle}` : "Not signed in"}
                    {account.profileName ? ` · ${account.profileName}` : ""}
                  </span>
                </DropdownMenuItem>
              ))
            ) : (
              <>
                <DropdownMenuLabel className="font-normal text-muted-foreground">
                  Every account is in a project.
                </DropdownMenuLabel>
                <DropdownMenuItem asChild>
                  <Link to="/admin/reddit-accounts">Add one on the Reddit accounts dashboard</Link>
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {view.accounts.length ? (
        <div className="grid gap-2">
          {view.accounts.map((account) => (
            <AccountCard
              key={account.id}
              account={account}
              selected={account.id === selectedAccountId}
              onSelect={() => onSelectAccount(account.id)}
              onRemove={() => onRemoveAccount(account.id)}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          No accounts in this project yet. The posts still show, and you can
          write comments, but Post needs an account to send from.
        </p>
      )}
    </div>
  )
}

/**
 * One account: a dot and its name, its status, and today's comments. A young
 * account's comments fill a bar up to its daily limit; an older account has
 * no daily limit, so it shows the count alone. The status opens the card to
 * the account's limit, sleep, karma, age and last comment, with Open on
 * Reddit and the way out of the project. Tyler sent this design on 13 Oct
 * 2026.
 */
function AccountCard({
  account,
  selected,
  onSelect,
  onRemove,
}: {
  account: ProjectAccount
  selected: boolean
  onSelect: () => void
  onRemove: () => Promise<void>
}) {
  const [open, setOpen] = React.useState(false)
  const [removing, setRemoving] = React.useState(false)
  const name = account.handle ? `u/${account.handle}` : "Not signed in"
  const posting = account.posting
  const status = posting.paused ? "Paused" : accountStatusText(account.status)
  const cap = posting.young ? posting.youngPerDay : null

  async function remove() {
    setRemoving(true)
    try {
      await onRemove()
    } finally {
      setRemoving(false)
    }
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="min-w-0 overflow-hidden rounded-lg border">
      <div className={cn("grid min-w-0 gap-2 p-3", selected && "bg-muted")}>
        <div className="flex min-w-0 items-center gap-2">
          <Hint label={`Comment as ${name}`}>
            <button
              type="button"
              aria-pressed={selected}
              onClick={onSelect}
              className="flex min-w-0 flex-1 items-center gap-2 rounded-sm text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <span className={cn("size-2 shrink-0 rounded-full", statusDot(account))} aria-hidden="true" />
              <span className="truncate text-sm font-medium">{name}</span>
            </button>
          </Hint>
          <CollapsibleTrigger
            aria-label={`${name}: ${status}. ${open ? "Hide" : "Show"} more about it`}
            className="flex shrink-0 items-center gap-1 rounded-sm text-xs whitespace-nowrap text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {status}
            {open ? (
              <ChevronUpIcon className="size-3.5" aria-hidden="true" />
            ) : (
              <ChevronDownIcon className="size-3.5" aria-hidden="true" />
            )}
          </CollapsibleTrigger>
        </div>
        <div className="flex items-center gap-3 pl-4">
          {cap ? (
            <Meter
              value={posting.lastDay}
              max={cap}
              size="sm"
              label={`${name}'s comments today`}
              valueText={`${posting.lastDay} of ${cap}`}
              // A track that still shows on a chosen card, whose ground is the muted tone.
              className="flex-1 bg-muted-foreground/15"
            />
          ) : (
            <span className="flex-1" />
          )}
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {cap ? `${posting.lastDay} of ${cap}` : `${posting.lastDay} today`}
          </span>
        </div>
      </div>

      <CollapsibleContent className="grid gap-3 border-t p-3">
        <dl className="grid gap-1.5 text-sm">
          {accountFacts(account).map((fact) => (
            <div key={fact.label} className="flex min-w-0 items-baseline justify-between gap-3">
              <dt className="shrink-0 text-muted-foreground">{fact.label}</dt>
              <dd className="min-w-0 text-right break-words">
                {fact.value}
              </dd>
            </div>
          ))}
        </dl>
        {account.status.warning ? (
          <p className="text-xs text-amber-600 dark:text-amber-400">{account.status.warning}</p>
        ) : null}
        <div className="flex gap-2">
          {account.handle ? (
            <Button asChild type="button" variant="outline" className="flex-1">
              <a href={`https://www.reddit.com/user/${encodeURIComponent(account.handle)}`} target="_blank" rel="noreferrer">
                Open on Reddit
              </a>
            </Button>
          ) : (
            <span className="flex-1 self-center text-xs text-muted-foreground">
              Never seen signed in, so there is no Reddit page to open.
            </span>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={`Take ${name} out of this project`}
                disabled={removing}
                onClick={() => void remove()}
              >
                {removing ? <Loader2Icon className="animate-spin" /> : <XIcon />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Take out of this project. Its comments and settings stay.</TooltipContent>
          </Tooltip>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

/** The rows an opened card lists, each in the words a person would say. */
function accountFacts(account: ProjectAccount): Array<{ label: string; value: string }> {
  const posting = account.posting
  const sleep =
    posting.awake || !posting.nextWakeAt
      ? { label: "Awake", value: "Now" }
      : { label: "Asleep until", value: capitalise(whenText(new Date(posting.nextWakeAt))) }
  return [
    {
      label: "Daily limit",
      value: posting.young ? `${posting.youngPerDay} comments` : "No limit",
    },
    sleep,
    { label: "Karma", value: account.karma === null ? "Not read yet" : account.karma.toLocaleString() },
    {
      label: "Account age",
      value: account.redditCreatedAt ? capitalise(accountAgeText(new Date(account.redditCreatedAt))) : "Not read yet",
    },
    {
      label: "Last comment",
      value: account.lastPostedAt ? capitalise(whenText(new Date(account.lastPostedAt))) : "None yet",
    },
  ]
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}
