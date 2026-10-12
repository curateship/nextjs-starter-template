import * as React from "react"
import { Link } from "@tanstack/react-router"
import { FolderOpenIcon, Loader2Icon, PlusIcon, Trash2Icon, XIcon } from "lucide-react"

import { AccountStatusBadge } from "@/components/social/accounts/account-status-badge"
import { useReportedSaveStatus } from "@/components/settings/use-reported-save-status"
import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { Button } from "@/components/ui/button"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  getProjectErrorMessage,
  saveProject,
  type ProjectSummary,
  type ProjectView,
} from "@/lib/api/social/projects"
import { accountPaceText } from "@/lib/social/wording"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

/** How long typing has to stop before the name or description saves. */
const SAVE_AFTER_MS = 700

/**
 * The Projects dashboard's left column: which project, what it is, and the
 * accounts that comment for it.
 *
 * The description is what the AI is told about what you make. It saves as it
 * is typed, the way every setting in the app does, with no Save button.
 *
 * The accounts are rows built by hand rather than the dashboard table, whose
 * main column forces a width a side panel does not have and clips the
 * figures. Clicking one picks who comments; it never posts. They are listed
 * best to comment from first, an order worked out on the server.
 */
export function ProjectPanel({
  projects,
  view,
  selectedAccountId,
  onSelectProject,
  onSelectAccount,
  onNewProject,
  onDeleteProject,
  onAddAccount,
  onRemoveAccount,
  onSaved,
}: {
  projects: ProjectSummary[]
  view: ProjectView
  /** The account clicked, whose comment Post sends. Null before one is clicked. */
  selectedAccountId: string | null
  onSelectProject: (projectId: string) => void
  onSelectAccount: (accountId: string) => void
  onNewProject: () => void
  onDeleteProject: () => void
  onAddAccount: (accountId: string) => Promise<void>
  onRemoveAccount: (accountId: string) => Promise<void>
  /** The name was saved, so the picker should say the new one. */
  onSaved: () => void
}) {
  const project = view.project

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* The icon is the way back to the table of every project. */}
      <DashboardCardTitleHeader
        icon={<FolderOpenIcon className="size-4" />}
        back={{ label: "All projects", to: "/admin/projects" }}
        title="Project"
        action={
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              title="New project"
              aria-label="New project"
              onClick={onNewProject}
            >
              <PlusIcon />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              title={`Delete ${project.name}`}
              aria-label={`Delete ${project.name}`}
              onClick={onDeleteProject}
            >
              <Trash2Icon />
            </Button>
          </div>
        }
      />

      <ScrollArea className="min-h-0 flex-1">
        <div className="grid gap-4 p-3">
          <div className="grid gap-2">
            <Label htmlFor="promo-project-pick">Which project</Label>
            <Select value={project.id} onValueChange={onSelectProject}>
              <SelectTrigger id="promo-project-pick" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {projects.map((one) => (
                  <SelectItem key={one.id} value={one.id}>
                    {one.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Keyed by the project, so another project's words never carry
              over into these boxes. */}
          <ProjectWords key={project.id} project={project} onSaved={onSaved} />

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
 * The name and the description, each saving 700ms after the last key, at
 * once when the box is left. A refused save keeps what was typed and says why.
 */
function ProjectWords({
  project,
  onSaved,
}: {
  project: ProjectView["project"]
  onSaved: () => void
}) {
  const [name, setName] = React.useState(project.name)
  const [description, setDescription] = React.useState(project.description)
  const [nameInvalid, setNameInvalid] = React.useState(false)
  const setSaveStatus = useReportedSaveStatus()
  const saved = React.useRef({ name: project.name, description: project.description })
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  /** What is typed and waiting for the timer, so leaving the project still saves it. */
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
        if (nameChanged && nameOk) {
          saved.current.name = next.name.trim()
          onSaved()
        }
        if (descriptionChanged) saved.current.description = next.description
        setSaveStatus("saved")
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

  return (
    <>
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
    </>
  )
}

/** The value the add picker shows while nothing is being added. */
const ADD = ""

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
  const [removing, setRemoving] = React.useState<string | null>(null)

  return (
    <div className="grid gap-2">
      <div className="grid gap-0.5">
        <p className="text-sm font-medium">Accounts</p>
        {view.accounts.length > 1 ? (
          <p className="text-xs text-muted-foreground">Best to comment from first</p>
        ) : null}
      </div>

      {view.accounts.length ? (
        <div className="grid gap-2">
          {view.accounts.map((account) => {
            const selected = account.id === selectedAccountId
            const name = account.handle ? `u/${account.handle}` : "Not signed in"
            return (
              <div
                key={account.id}
                className={cn(
                  // `min-w-0` lets the row shrink to the panel instead of its
                  // longest line pushing it under the edge.
                  "flex min-w-0 items-start gap-2 rounded-lg border p-3",
                  selected && "bg-muted"
                )}
              >
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onSelectAccount(account.id)}
                  className="grid min-w-0 flex-1 gap-1 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {/* One thing per line, because the column opens at its
                      narrowest and a name, a badge and the pace side by side
                      left room for none of them. */}
                  <span className="block truncate text-sm font-medium" title={name}>
                    {name}
                  </span>
                  <AccountStatusBadge view={account.status} />
                  <span className="block text-xs text-muted-foreground">
                    {accountPaceText(account.posting)}
                  </span>
                  {account.status.warning ? (
                    <span className="block text-xs text-amber-600 dark:text-amber-400">
                      {account.status.warning}
                    </span>
                  ) : null}
                </button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  title={`Take ${name} out of this project`}
                  aria-label={`Take ${name} out of this project`}
                  disabled={removing !== null}
                  onClick={async () => {
                    setRemoving(account.id)
                    try {
                      await onRemoveAccount(account.id)
                    } finally {
                      setRemoving(null)
                    }
                  }}
                >
                  {removing === account.id ? <Loader2Icon className="animate-spin" /> : <XIcon />}
                </Button>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          No accounts in this project yet. The posts still show, and you can
          write comments, but Post needs an account to send from.
        </p>
      )}

      {view.freeAccounts.length ? (
        <div className="grid gap-2 pt-1">
          <Label htmlFor="promo-project-add-account" className="sr-only">
            Add an account to this project
          </Label>
          <Select
            value={ADD}
            disabled={adding}
            onValueChange={async (accountId) => {
              setAdding(true)
              try {
                await onAddAccount(accountId)
              } finally {
                setAdding(false)
              }
            }}
          >
            <SelectTrigger id="promo-project-add-account" className="w-full">
              {adding ? <Loader2Icon className="size-4 animate-spin" /> : <PlusIcon className="size-4" />}
              <SelectValue placeholder="Add an account" />
            </SelectTrigger>
            <SelectContent>
              {view.freeAccounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.handle ? `u/${account.handle}` : "Not signed in"}
                  {account.profileName ? ` · ${account.profileName}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Every account is in a project. Add another on the{" "}
          <Link
            to="/admin/reddit-accounts"
            className="font-medium text-foreground underline underline-offset-2"
          >
            Reddit accounts dashboard
          </Link>
          .
        </p>
      )}
    </div>
  )
}
