"use client"

import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { Loader2Icon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FieldLabel } from "@/components/ui/field-label"
import { FormDialog } from "@/components/ui/form-dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  createWorkspace,
  getWorkspaceErrorMessage,
  updateWorkspace,
  type WorkspaceItem,
} from "@/lib/api/people/workspaces"
import { iconMeta, renderShellIcon, type IconKey } from "@/lib/custom-shell"
import {
  customDomainProblem,
  subdomainProblem,
  workspaceAddress,
} from "@/lib/workspaces/addresses"
import {
  WORKSPACE_STATUSES,
  type WorkspaceStatus,
} from "@/lib/workspaces/status"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { useAsyncAction } from "@/lib/hooks/use-async-action"

/** What the picker starts on before anything is chosen. */
const defaultIcon = "briefcaseBusiness" satisfies IconKey

type WorkspaceDraft = {
  name: string
  icon: IconKey
  subdomain: string
  customDomain: string
  status: WorkspaceStatus
}

function draftFor(workspace: WorkspaceItem | null): WorkspaceDraft {
  return workspace
    ? {
        name: workspace.name,
        icon: workspace.icon,
        subdomain: workspace.subdomain,
        customDomain: workspace.customDomain,
        status: workspace.status,
      }
    : {
        name: "",
        icon: defaultIcon,
        subdomain: "",
        customDomain: "",
        status: "active",
      }
}

const STATUS_LABELS: Record<WorkspaceStatus, string> = {
  active: "Live",
  draft: "Draft — answers, but not announced",
  inactive: "Switched off — answers nothing",
}

/**
 * The one window for making or renaming a workspace.
 *
 * Both ways in — the sidebar switcher's "New workspace" and the Workspaces
 * page toolbar — open this, so the two are the same window rather than two
 * lookalikes that drift apart. It owns the typing, the save and the messages;
 * a caller only says whether it is open and, when editing, which workspace.
 */
export function WorkspaceFormDialog({
  open,
  editing = null,
  baseDomain = "",
  onClose,
}: {
  open: boolean
  /** The workspace being renamed, or null to make a new one. */
  editing?: WorkspaceItem | null
  /**
   * The domain workspaces hang off, for showing what the address will answer
   * on. Empty on an app that serves one site, which is most of them.
   */
  baseDomain?: string
  onClose: () => void
}) {
  const router = useRouter()
  const [draft, setDraft] = React.useState<WorkspaceDraft>(() =>
    draftFor(editing)
  )
  const [run, saving] = useAsyncAction(getWorkspaceErrorMessage)
  const [nameInvalid, setNameInvalid] = React.useState(false)
  const nameInputRef = React.useRef<HTMLInputElement>(null)
  const fieldId = React.useId()
  const nameId = `${fieldId}-name`
  const iconId = `${fieldId}-icon`
  const subdomainId = `${fieldId}-subdomain`
  const domainId = `${fieldId}-domain`
  const statusId = `${fieldId}-status`

  // Opening is a fresh start: the window shows the workspace it was just
  // handed, never whatever the last one it opened for was left holding.
  const [wasOpen, setWasOpen] = React.useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) {
      setDraft(draftFor(editing))
      setNameInvalid(false)
    }
  }

  // A failure from somewhere else never expires on its own, so clear it as the
  // window opens rather than leaving a stale red toast over a fresh form.
  React.useEffect(() => {
    if (open) dismissErrorToast()
  }, [open])

  const opened = draftFor(editing)
  const dirty =
    draft.name !== opened.name ||
    draft.icon !== opened.icon ||
    draft.subdomain !== opened.subdomain ||
    draft.customDomain !== opened.customDomain ||
    draft.status !== opened.status

  // Said as it is typed, so a refusal never waits for a save. The server checks
  // the same rules again — this half is a courtesy, not the gate.
  const addressProblem = draft.subdomain.trim()
    ? subdomainProblem(draft.subdomain)
    : null
  const domainProblem = customDomainProblem(draft.customDomain)

  async function save() {
    const name = draft.name.trim()
    if (!name) {
      setNameInvalid(true)
      showErrorToast(
        "Add a workspace name — settings can't be saved without one."
      )
      return
    }

    setNameInvalid(false)
    await run(async () => {
      const address = {
        subdomain: draft.subdomain,
        customDomain: draft.customDomain,
        status: draft.status,
      }
      if (editing) {
        await updateWorkspace(editing.id, name, draft.icon, address)
      } else {
        await createWorkspace(name, draft.icon, address)
      }
      await router.invalidate()
      toast.success(editing ? "Workspace updated." : "Workspace created.")
      onClose()
    })
  }

  return (
    <FormDialog open={open} dirty={dirty} busy={saving} onClose={onClose}>
      {(requestClose) => (
        <DialogContent
          variant="admin"
          // A new workspace opens with the cursor in the Name box so you can
          // just type. Renaming an existing one keeps the window's normal
          // focus, since landing in a filled field invites a stray edit.
          onOpenAutoFocus={(event) => {
            if (editing) return
            event.preventDefault()
            nameInputRef.current?.focus()
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit workspace" : "New workspace"}
            </DialogTitle>
            <DialogDescription>
              Choose the name and icon shown in the workspace switcher.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault()
              void save()
            }}
          >
            <DialogBody>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Workspace</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                    <div className="grid gap-2">
                      <FieldLabel
                        htmlFor={iconId}
                        hint="Sits next to the name in the sidebar switcher. A favicon, once one is uploaded, shows instead."
                      >
                        Icon
                      </FieldLabel>
                      <Select
                        value={draft.icon}
                        disabled={saving}
                        onValueChange={(value) =>
                          setDraft((current) => ({
                            ...current,
                            icon: value as IconKey,
                          }))
                        }
                      >
                        <SelectTrigger id={iconId} className="w-full sm:w-fit">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(iconMeta).map(([icon, meta]) => (
                            <SelectItem key={icon} value={icon}>
                              {renderShellIcon(icon as IconKey)}
                              {meta.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2 sm:flex-1">
                      <FieldLabel
                        htmlFor={nameId}
                        hint="What this workspace is called everywhere in the app."
                      >
                        Name
                      </FieldLabel>
                      <Input
                        id={nameId}
                        ref={nameInputRef}
                        value={draft.name}
                        disabled={saving}
                        aria-invalid={nameInvalid || undefined}
                        onChange={(event) => {
                          // Drop the red ring the moment the field is answered,
                          // rather than leaving it on a field that now has a name.
                          if (event.target.value.trim()) setNameInvalid(false)
                          setDraft((current) => ({
                            ...current,
                            name: event.target.value,
                          }))
                        }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card size="sm">
                <CardHeader>
                  <CardTitle>Where it answers</CardTitle>
                  <CardDescription>
                    Only used when this deployment serves more than one site.
                    Leave it alone otherwise.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <div className="grid gap-2">
                    <FieldLabel
                      htmlFor={subdomainId}
                      hint="Lowercase letters, numbers and hyphens. This is the part in front of the base domain."
                    >
                      Address
                    </FieldLabel>
                    <Input
                      id={subdomainId}
                      value={draft.subdomain}
                      placeholder="alpha"
                      disabled={saving}
                      aria-invalid={addressProblem ? true : undefined}
                      aria-describedby={`${subdomainId}-note`}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          subdomain: event.target.value,
                        }))
                      }
                    />
                    <p
                      id={`${subdomainId}-note`}
                      className={
                        addressProblem
                          ? "text-xs text-destructive"
                          : "text-xs text-muted-foreground"
                      }
                    >
                      {addressProblem ??
                        (baseDomain
                          ? workspaceAddress(draft.subdomain, baseDomain)
                          : "No base domain is configured, so this is not reachable yet.")}
                    </p>
                  </div>

                  <div className="grid gap-2">
                    <FieldLabel
                      htmlFor={domainId}
                      hint="Optional. Point this domain at this server yourself — nothing here is checked or set up automatically."
                    >
                      Its own domain
                    </FieldLabel>
                    <Input
                      id={domainId}
                      value={draft.customDomain}
                      placeholder="joes-diner.com"
                      disabled={saving}
                      aria-invalid={domainProblem ? true : undefined}
                      aria-describedby={`${domainId}-note`}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          customDomain: event.target.value,
                        }))
                      }
                    />
                    <p
                      id={`${domainId}-note`}
                      className={
                        domainProblem
                          ? "text-xs text-destructive"
                          : "text-xs text-muted-foreground"
                      }
                    >
                      {domainProblem ?? "When set, this wins over the address above."}
                    </p>
                  </div>

                  <div className="grid gap-2">
                    <FieldLabel htmlFor={statusId}>State</FieldLabel>
                    <Select
                      value={draft.status}
                      disabled={saving}
                      onValueChange={(value) =>
                        setDraft((current) => ({
                          ...current,
                          status: value as WorkspaceStatus,
                        }))
                      }
                    >
                      <SelectTrigger id={statusId} className="w-full sm:w-fit">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {WORKSPACE_STATUSES.map((choice) => (
                          <SelectItem key={choice} value={choice}>
                            {STATUS_LABELS[choice]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>
            </DialogBody>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={requestClose}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2Icon className="size-4 animate-spin" /> : null}
                {editing ? "Save changes" : "Create workspace"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </FormDialog>
  )
}
